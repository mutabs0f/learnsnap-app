import pRetry from "p-retry";
import logger from "../logger.js";
import { smartOptimizeImages } from "../image-optimizer.js";
import { aiLimit, RETRY_OPTIONS, EVIDENCE_FAIL_THRESHOLD, MIN_ACCEPTABLE_QUESTIONS } from "./constants.js";
import { generateWithGeminiExtended } from "./providers/gemini.js";
import { generateWithClaudeExtended, generateWithClaudeFallback } from "./providers/anthropic.js";
import { regenerateWeakQuestionsWithOpenAI } from "./providers/openai.js";
import {
  quickEvidenceCheck,
  validateGroundingConsensusTextOnly,
  combineVerdicts,
  shouldTriggerVisionSpotCheck,
  conditionalVisionSpotCheck,
  validateAnswersWithConsensus,
  validateAnswersWithSingleModel,
} from "./validators.js";
import type { QuizContent, ExtendedQuizContent } from "./types.js";
import { RecaptureRequiredError } from "./types.js";

export interface GenerationOptions {
  optimizeImages?: boolean;
  optimizationLevel?: 'standard' | 'high-quality' | 'max-quality';
}

export async function generateQuestionsFromImages(
  images: string[],
  options: GenerationOptions = {
    optimizeImages: true,
    optimizationLevel: 'standard'
  }
): Promise<QuizContent> {
  const startTime = Date.now();
  
  logger.info(`Starting quiz generation from ${images.length} images`);
  
  let processedImages = images;
  
  if (options.optimizeImages) {
    try {
      logger.info('Optimizing images before processing', {
        count: images.length,
        level: options.optimizationLevel
      });
      
      processedImages = await smartOptimizeImages(
        images, 
        options.optimizationLevel || 'standard'
      );
      
      logger.info('Images optimized successfully', {
        count: processedImages.length
      });
    } catch (error) {
      logger.error('Image optimization failed, using original images', {
        error: (error as Error).message
      });
      processedImages = images;
    }
  } else {
    logger.info('Image optimization disabled, using original images');
  }
  
  let extendedContent: ExtendedQuizContent;
  try {
    extendedContent = await pRetry(
      () => aiLimit(() => generateWithGeminiExtended(processedImages)),
      { ...RETRY_OPTIONS, retries: 2 }
    );
    logger.info("Gemini primary generation succeeded");
  } catch (geminiError) {
    logger.warn("Gemini primary failed, falling back to Claude", { error: (geminiError as Error).message });
    extendedContent = await pRetry(
      () => aiLimit(() => generateWithClaudeExtended(processedImages)),
      RETRY_OPTIONS
    );
  }
  
  logger.info(`AI generated lesson "${extendedContent.lesson.title}" with ${extendedContent.questions.length} questions`, {
    duration: Date.now() - startTime,
    extractedTextLength: extendedContent.extractedText.join("").length,
  });
  
  if (extendedContent.extractedText.some(t => t === "UNCLEAR" || t.length < 20)) {
    logger.warn("Image quality too low - unclear text detected");
    throw new RecaptureRequiredError();
  }
  
  const evidenceCheckResult = quickEvidenceCheck(extendedContent.extractedText, extendedContent.questionEvidence);
  logger.info("Evidence micro-check completed", evidenceCheckResult);
  
  if (evidenceCheckResult.failRate > EVIDENCE_FAIL_THRESHOLD) {
    logger.warn(`Evidence check failed: ${(evidenceCheckResult.failRate * 100).toFixed(0)}% questions have no grounding`);
    throw new RecaptureRequiredError();
  }
  
  const verdicts = await validateGroundingConsensusTextOnly(extendedContent);
  const combinedVerdict = combineVerdicts(verdicts);
  
  logger.info("Grounding validation completed", {
    overallConfidence: combinedVerdict.overallConfidence,
    recommendedAction: combinedVerdict.recommendedAction,
    weakQuestions: combinedVerdict.weakQuestions.length,
  });
  
  let content: QuizContent = {
    lesson: extendedContent.lesson,
    questions: extendedContent.questions,
  };
  
  if (combinedVerdict.recommendedAction === "REFUSE") {
    logger.warn("Validators recommend REFUSE");
    throw new RecaptureRequiredError();
  }
  
  const isLargeBatch = images.length > 5;
  
  if (combinedVerdict.recommendedAction === "FULL_RETRY" && !isLargeBatch) {
    logger.info("Full retry with Claude fallback");
    content = await pRetry(
      () => aiLimit(() => generateWithClaudeFallback(images)),
      { ...RETRY_OPTIONS, retries: 1 }
    );
  } else if (combinedVerdict.recommendedAction === "PARTIAL_REGENERATE" && combinedVerdict.weakQuestions.length > 0) {
    const maxWeakToRegenerate = isLargeBatch ? 2 : combinedVerdict.weakQuestions.length;
    const weakToRegenerate = combinedVerdict.weakQuestions.slice(0, maxWeakToRegenerate);
    
    if (isLargeBatch && combinedVerdict.weakQuestions.length > 2) {
      logger.info(`Large batch: limiting regeneration from ${combinedVerdict.weakQuestions.length} to ${maxWeakToRegenerate} questions`);
    }
    
    logger.info(`Regenerating ${weakToRegenerate.length} weak questions`);
    content = await regenerateWeakQuestionsWithOpenAI(content, weakToRegenerate, extendedContent.extractedText);
  }
  
  const warnings: string[] = [];
  
  if (shouldTriggerVisionSpotCheck(combinedVerdict)) {
    logger.info("Triggering adaptive vision spot-check");
    const spotCheckResult = await conditionalVisionSpotCheck(images, extendedContent.extractedText, combinedVerdict);
    
    if (!spotCheckResult.passed) {
      logger.warn("Vision spot-check failed");
      throw new RecaptureRequiredError();
    }
    
    if (spotCheckResult.failedPages.length > 0) {
      const pagesText = spotCheckResult.failedPages.join("، ");
      warnings.push(`تنبيه: الصفحات التالية قد لا تكون مغطاة بالكامل في الاختبار: ${pagesText}`);
    }
    
    if (spotCheckResult.skippedLargeBatch) {
      warnings.push(`ملاحظة: تم رفع ${images.length} صفحات - قد لا يغطي الاختبار جميع المحتوى`);
    }
  } else if (images.length > 5) {
    warnings.push(`ملاحظة: تم رفع ${images.length} صفحات - تأكد من مراجعة جميع المحتوى`);
  }
  
  if (isLargeBatch) {
    logger.info(`Skipping 3-model consensus for large batch (${images.length} images) - using single model validation`);
    content = await validateAnswersWithSingleModel(content);
  } else {
    logger.info("Validating answers with 3-model consensus...");
    content = await validateAnswersWithConsensus(content);
  }
  
  if (content.questions.length < MIN_ACCEPTABLE_QUESTIONS) {
    logger.warn(`Only ${content.questions.length} questions after all validation - trying to recover`);
    if (extendedContent.questions.length >= MIN_ACCEPTABLE_QUESTIONS) {
      logger.info(`Recovering: using ${extendedContent.questions.length} original questions instead`);
      content.questions = extendedContent.questions.slice(0, 20);
      warnings.push(`تم استخدام الأسئلة الأصلية بسبب صرامة التحقق`);
    } else {
      throw new RecaptureRequiredError("لم نتمكن من توليد أسئلة كافية. حاول بصور أوضح.");
    }
  }
  
  if (warnings.length > 0) {
    content.warnings = warnings;
  }
  
  logger.info(`Quiz generation complete`, {
    lessonTitle: content.lesson.title,
    questionCount: content.questions.length,
    warnings: warnings.length,
    totalDuration: Date.now() - startTime,
  });
  
  return content;
}

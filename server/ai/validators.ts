import pRetry from "p-retry";
import logger from "../logger.js";
import { aiLimit, RETRY_OPTIONS, CONFIDENCE_THRESHOLD, WEAK_QUESTIONS_THRESHOLD } from "./constants.js";
import { getGroundingValidationPrompt } from "./prompts.js";
import { getOpenAIValidation } from "./providers/openai.js";
import { getClaudeValidation } from "./providers/anthropic.js";
import { getGeminiAnswers, verifyPageWithVision } from "./providers/gemini.js";
import { getOpenAIAnswers } from "./providers/openai.js";
import { getAnthropicAnswers } from "./providers/anthropic.js";
import type { 
  ValidationVerdict, 
  ExtendedQuizContent, 
  QuizContent, 
  EvidenceCheckResult,
  SpotCheckResult,
  QuestionEvidence 
} from "./types.js";
import type { Question } from "../../shared/schema.js";

export function quickEvidenceCheck(extractedText: string[], evidence: QuestionEvidence[]): EvidenceCheckResult {
  const fullText = extractedText.join(" ").toLowerCase();
  let passed = 0;
  let failed = 0;
  
  for (const ev of evidence) {
    if (!ev.sourceText || ev.sourceText.length < 3) {
      failed++;
      continue;
    }
    
    const sourceWords = ev.sourceText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const matchedWords = sourceWords.filter(word => fullText.includes(word));
    const matchRatio = sourceWords.length > 0 ? matchedWords.length / sourceWords.length : 0;
    
    if (matchRatio >= 0.5) {
      passed++;
    } else {
      failed++;
    }
  }
  
  const total = passed + failed;
  return {
    failRate: total > 0 ? failed / total : 1,
    passed,
    failed,
  };
}

export async function validateGroundingConsensusTextOnly(content: ExtendedQuizContent): Promise<ValidationVerdict[]> {
  const questionsWithEvidence = content.questions.map((q, i) => {
    const ev = content.questionEvidence[i] || { sourceText: "غير متوفر", confidence: 0 };
    return `${i + 1}. ${q.question}\n   الدليل: "${ev.sourceText}" (ثقة: ${ev.confidence})`;
  }).join("\n");

  const validationPrompt = getGroundingValidationPrompt(
    content.extractedText,
    content.lesson.title,
    content.lesson.summary,
    questionsWithEvidence
  );

  const [openaiVerdict, claudeVerdict] = await Promise.all([
    pRetry(() => aiLimit(() => getOpenAIValidation(validationPrompt)), { ...RETRY_OPTIONS, retries: 1 }),
    pRetry(() => aiLimit(() => getClaudeValidation(validationPrompt)), { ...RETRY_OPTIONS, retries: 1 }),
  ]);
  
  return [openaiVerdict, claudeVerdict].filter((v): v is ValidationVerdict => v !== null);
}

export function combineVerdicts(verdicts: ValidationVerdict[]): ValidationVerdict {
  if (verdicts.length === 0) {
    return { overallConfidence: 0.7, weakQuestions: [], issues: [], recommendedAction: "ACCEPT" };
  }
  
  const avgConfidence = verdicts.reduce((sum, v) => sum + v.overallConfidence, 0) / verdicts.length;
  
  const weakQuestionsSet = new Set<number>();
  verdicts.forEach(v => v.weakQuestions.forEach(q => weakQuestionsSet.add(q)));
  
  const allIssues = verdicts.flatMap(v => v.issues);
  
  const actionPriority = { "REFUSE": 4, "FULL_RETRY": 3, "PARTIAL_REGENERATE": 2, "ACCEPT": 1 };
  let worstAction: ValidationVerdict["recommendedAction"] = "ACCEPT";
  for (const v of verdicts) {
    if (actionPriority[v.recommendedAction] > actionPriority[worstAction]) {
      worstAction = v.recommendedAction;
    }
  }
  
  return {
    overallConfidence: avgConfidence,
    weakQuestions: Array.from(weakQuestionsSet),
    issues: allIssues,
    recommendedAction: worstAction,
  };
}

export function shouldTriggerVisionSpotCheck(verdict: ValidationVerdict): boolean {
  if (verdict.overallConfidence < CONFIDENCE_THRESHOLD) return true;
  if (verdict.weakQuestions.length / 20 > WEAK_QUESTIONS_THRESHOLD) return true;
  if (verdict.issues.some(i => i.type === "OCR_SUSPECTED" || i.type === "CONTENT_DRIFT")) return true;
  return false;
}

export async function conditionalVisionSpotCheck(
  images: string[], 
  extractedText: string[], 
  verdict: ValidationVerdict
): Promise<SpotCheckResult> {
  if (images.length > 5) {
    logger.info(`Skipping vision spot-check for large batch (${images.length} images)`);
    return { passed: true, failedPages: [], skippedLargeBatch: true };
  }
  
  const pagesToCheck = images.slice(0, 2).map((_, i) => i);
  
  logger.info(`Vision spot-check on ${pagesToCheck.length} pages: ${pagesToCheck.join(", ")}`);
  
  let passedCount = 0;
  let checkedCount = 0;
  const failedPages: number[] = [];
  
  for (const pageIdx of pagesToCheck) {
    const image = images[pageIdx];
    const expectedText = extractedText[pageIdx] || "";
    
    if (expectedText.length < 20) {
      passedCount++;
      continue;
    }
    
    checkedCount++;
    const verified = await verifyPageWithVision(image, expectedText);
    if (verified) {
      passedCount++;
    } else {
      logger.warn(`Vision spot-check failed for page ${pageIdx}`);
      failedPages.push(pageIdx + 1);
    }
  }
  
  const passRate = checkedCount > 0 ? passedCount / checkedCount : 1;
  const passed = passRate >= 0.5;
  
  logger.info(`Vision spot-check result: ${passedCount}/${checkedCount} passed (${Math.round(passRate * 100)}%), overall: ${passed ? 'PASS' : 'FAIL'}`);
  
  return { passed, failedPages, skippedLargeBatch: false };
}

export async function validateAnswersWithConsensus(content: QuizContent): Promise<QuizContent> {
  const mcqQuestions = content.questions.filter((q): q is Question & { type: "multiple_choice"; options: string[]; correct: "A" | "B" | "C" | "D" } => 
    q.type === "multiple_choice" || (!("type" in q) && "options" in q)
  );
  
  if (mcqQuestions.length === 0) {
    logger.info("No MCQ questions to validate");
    return content;
  }
  
  const questionsText = mcqQuestions.map((q, i) => {
    return `السؤال ${i + 1}: ${q.question}
الخيارات:
A: ${q.options[0]}
B: ${q.options[1]}
C: ${q.options[2]}
D: ${q.options[3]}`;
  }).join("\n\n");

  logger.info("Getting answers from all AI models for MCQ validation...");
  
  const [geminiAnswers, openaiAnswers, anthropicAnswers] = await Promise.all([
    pRetry(() => aiLimit(() => getGeminiAnswers(questionsText)), { ...RETRY_OPTIONS, retries: 2 }),
    pRetry(() => aiLimit(() => getOpenAIAnswers(questionsText)), { ...RETRY_OPTIONS, retries: 2 }),
    pRetry(() => aiLimit(() => getAnthropicAnswers(questionsText)), { ...RETRY_OPTIONS, retries: 2 }),
  ]);
  
  logger.debug("AI validation answers", {
    gemini: geminiAnswers,
    openai: openaiAnswers,
    anthropic: anthropicAnswers,
  });
  
  let mcqIndex = 0;
  
  const validatedQuestions: Question[] = content.questions.map((q) => {
    if (q.type !== "multiple_choice") {
      return q;
    }
    
    const i = mcqIndex++;
    const votes = [
      geminiAnswers[i] || "X",
      openaiAnswers[i] || "X", 
      anthropicAnswers[i] || "X"
    ];
    
    const voteCounts: Record<string, number> = {};
    votes.forEach(v => {
      if (v && ["A", "B", "C", "D"].includes(v)) {
        voteCounts[v] = (voteCounts[v] || 0) + 1;
      }
    });
    
    let correctAnswer = (q as Question & { correct: string }).correct;
    for (const [answer, count] of Object.entries(voteCounts)) {
      if (count >= 2) {
        correctAnswer = answer as "A" | "B" | "C" | "D";
        break;
      }
    }
    
    if (!Object.values(voteCounts).some(c => c >= 2) && geminiAnswers[i]) {
      correctAnswer = geminiAnswers[i] as "A" | "B" | "C" | "D";
    }
    
    logger.debug(`MCQ Q${i + 1} votes`, { 
      votes: { gemini: votes[0], openai: votes[1], anthropic: votes[2] },
      final: correctAnswer 
    });
    
    return {
      ...q,
      correct: correctAnswer,
    } as Question;
  });
  
  return {
    lesson: content.lesson,
    questions: validatedQuestions,
  };
}

export async function validateAnswersWithSingleModel(content: QuizContent): Promise<QuizContent> {
  const mcqQuestions = content.questions.filter((q): q is Question & { type: "multiple_choice"; options: string[]; correct: "A" | "B" | "C" | "D" } => 
    q.type === "multiple_choice" || (!("type" in q) && "options" in q)
  );
  
  if (mcqQuestions.length === 0) {
    logger.info("No MCQ questions to validate");
    return content;
  }
  
  const questionsText = mcqQuestions.map((q, i) => {
    return `السؤال ${i + 1}: ${q.question}
الخيارات:
A: ${q.options[0]}
B: ${q.options[1]}
C: ${q.options[2]}
D: ${q.options[3]}`;
  }).join("\n\n");

  logger.info("Validating answers with Gemini (fast mode for large batch)...");
  
  const geminiAnswers = await pRetry(
    () => aiLimit(() => getGeminiAnswers(questionsText)), 
    { ...RETRY_OPTIONS, retries: 2 }
  );
  
  let mcqIndex = 0;
  
  const validatedQuestions: Question[] = content.questions.map((q) => {
    if (q.type !== "multiple_choice") {
      return q;
    }
    
    const i = mcqIndex++;
    const geminiAnswer = geminiAnswers[i];
    
    const correctAnswer = (geminiAnswer && ["A", "B", "C", "D"].includes(geminiAnswer))
      ? geminiAnswer as "A" | "B" | "C" | "D"
      : (q as Question & { correct: string }).correct;
    
    return {
      ...q,
      correct: correctAnswer,
    } as Question;
  });
  
  return {
    lesson: content.lesson,
    questions: validatedQuestions,
  };
}

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import pRetry from "p-retry";
import pLimit from "p-limit";
import type { Question, Lesson } from "../shared/schema.js";
import logger from "./logger.js";

// AI clients (lazy initialization)
let geminiClient: GoogleGenAI | null = null;
let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

// Concurrency limit for AI requests
const aiLimit = pLimit(5); // Max 5 simultaneous AI calls

// Reliability constants
const EVIDENCE_FAIL_THRESHOLD = 0.3; // 30% fail = recapture required
const CONFIDENCE_THRESHOLD = 0.65; // Below this triggers vision spot-check
const WEAK_QUESTIONS_THRESHOLD = 0.2; // 20% weak questions triggers spot-check

// Custom error for recapture
export class RecaptureRequiredError extends Error {
  code = "RECAPTURE_REQUIRED";
  constructor(message: string = "الصور غير واضحة أو الصفحة ناقصة. صوّر الصفحة كاملة بإضاءة أفضل.") {
    super(message);
    this.name = "RecaptureRequiredError";
  }
}

// Evidence interface for grounding
interface QuestionEvidence {
  sourceText: string;
  pageIndex: number;
  confidence: number;
}

// Extended quiz content with extraction data (not stored in DB)
interface ExtendedQuizContent {
  lesson: Lesson;
  questions: Question[];
  extractedText: string[];
  questionEvidence: QuestionEvidence[];
}

// Validation verdict from LLM validators
interface ValidationVerdict {
  overallConfidence: number;
  weakQuestions: number[];
  issues: { type: string; severity: string; questionIndex: number; reason: string }[];
  recommendedAction: "ACCEPT" | "PARTIAL_REGENERATE" | "FULL_RETRY" | "REFUSE";
}

// Retry configuration
const RETRY_OPTIONS = {
  retries: 3,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 10000,
  onFailedAttempt: (error: any) => {
    logger.warn(`AI call failed - attempt ${error.attemptNumber}`, {
      retriesLeft: error.retriesLeft,
      error: error.message,
    });
  },
};

function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY");
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY");
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

const GENERATION_PROMPT = `أنت معلم معتمد ومتخصص في التربية والتعليم.

## مهم جداً - استخراج النص:
1. استخرج النص الكامل من كل صورة بدقة
2. إذا كانت الصورة غير واضحة أو مقصوصة أو لا تحتوي نص كافي: ارجع "extractedText": ["UNCLEAR"] ولا تخترع محتوى
3. لكل سؤال، حدد النص المصدر من الصورة الذي بنيت عليه السؤال

## قواعد الأسئلة المهمة جداً:

### 1. الخيارات بدون أحرف ترقيم:
❌ خطأ: ["A. apple", "B. banana", "C. orange"]
✅ صحيح: ["apple", "banana", "orange", "grape"]
- لا تضع A. أو B. أو أي حرف قبل الخيار - النظام يضيفها تلقائياً

### 2. أسئلة الفهم وليس الحفظ:
❌ خطأ: "My birthday is on ___ of September" (حفظ تاريخ)
✅ صحيح: "Which word is a verb?" (فهم القواعد)
- اختبر المفاهيم والقواعد (Grammar, concepts)
- لا تختبر معلومات شخصية أو تواريخ محددة من النص

### 3. للمحتوى الإنجليزي:
- الشرح: إنجليزي مختصر (جملة أو جملتين فقط)
- الأسئلة والخيارات: إنجليزي فقط
- لا ترجمة عربية للشرح

### 4. للمحتوى العربي:
- الشرح بالعربي الفصيح المختصر
- جمل قصيرة واضحة

## تنسيق الشرح (مهم جداً):
- اجعل كل شرح مختصراً (3-4 جمل كحد أقصى)
- لا تكرر نفس المعلومة بلغتين
- استخدم أمثلة قصيرة ومباشرة

## أنواع الأسئلة:
- multiple_choice: 8 أسئلة (4 خيارات لكل سؤال)
- true_false: 6 أسئلة  
- fill_blank: 4 أسئلة (كلمة واحدة فقط)
- matching: 2 سؤال (3 أزواج)

أرجع JSON فقط:
{
  "extractedText": ["النص المستخرج من الصفحة 1", "النص من الصفحة 2"],
  "lesson": {
    "title": "عنوان قصير وجذاب",
    "summary": "ملخص مختصر",
    "keyPoints": ["نقطة 1", "نقطة 2", "نقطة 3"],
    "targetAge": 9,
    "steps": [
      {
        "type": "explanation",
        "content": "شرح مختصر وواضح (3-4 جمل فقط)"
      },
      {
        "type": "example",
        "content": "مثال عملي قصير"
      },
      {
        "type": "practice",
        "content": "تدريب!",
        "question": "سؤال تدريبي",
        "options": ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],
        "correctAnswer": "A",
        "hint": "تلميح"
      }
    ]
  },
  "questions": [
    {
      "type": "multiple_choice",
      "question": "Which word is a noun?",
      "options": ["run", "happy", "dog", "quickly"],
      "correct": "C",
      "explanation": "Dog is a noun (naming word)",
      "evidence": {"sourceText": "نص من الصورة يثبت السؤال", "pageIndex": 0, "confidence": 0.9}
    },
    {
      "type": "true_false",
      "question": "Verbs describe actions",
      "correct": true,
      "explanation": "Yes, verbs are action words",
      "evidence": {"sourceText": "نص مصدر", "pageIndex": 0, "confidence": 0.85}
    },
    {
      "type": "fill_blank",
      "question": "She ___ to school every day. (go/goes)",
      "correct": "goes",
      "hint": "Use present simple for she/he",
      "explanation": "We use 'goes' with she/he/it",
      "evidence": {"sourceText": "نص مصدر", "pageIndex": 0, "confidence": 0.9}
    },
    {
      "type": "matching",
      "question": "Match the word to its type:",
      "pairs": [
        {"left": "run", "right": "verb"},
        {"left": "cat", "right": "noun"},
        {"left": "happy", "right": "adjective"}
      ],
      "explanation": "Words have different types based on their function",
      "evidence": {"sourceText": "نص مصدر", "pageIndex": 0, "confidence": 0.9}
    }
  ]
}`;

const ANSWER_VALIDATION_PROMPT = `أنت مدقق رياضي ولغوي. مهمتك تحديد الإجابة الصحيحة لكل سؤال.

لكل سؤال:
1. اقرأ السؤال بعناية
2. حل السؤال بنفسك
3. حدد أي خيار (A, B, C, D) يحتوي على الإجابة الصحيحة

مهم جداً:
- A = الخيار الأول
- B = الخيار الثاني  
- C = الخيار الثالث
- D = الخيار الرابع

أرجع JSON فقط بهذا الشكل:
{
  "answers": ["A", "B", "C", "D", "A", "B", "C", "D"]
}

حيث كل عنصر هو الإجابة الصحيحة للسؤال المقابل.`;

function extractBase64(dataUrl: string): { data: string; mimeType: string } {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid data URL format");
  }
  return { mimeType: matches[1], data: matches[2] };
}

export interface QuizContent {
  lesson: Lesson;
  questions: Question[];
}

export async function generateQuestionsFromImages(images: string[]): Promise<QuizContent> {
  const startTime = Date.now();
  
  logger.info(`Starting quiz generation from ${images.length} images`);
  
  // Step 1: Generate initial content with Gemini (with retry) - now returns extended content
  let extendedContent = await pRetry(
    () => aiLimit(() => generateWithGeminiExtended(images)),
    RETRY_OPTIONS
  );
  
  logger.info(`Gemini generated lesson "${extendedContent.lesson.title}" with ${extendedContent.questions.length} questions`, {
    duration: Date.now() - startTime,
    extractedTextLength: extendedContent.extractedText.join("").length,
  });
  
  // Step 2: Check for unclear images (REFUSE early)
  if (extendedContent.extractedText.some(t => t === "UNCLEAR" || t.length < 20)) {
    logger.warn("Image quality too low - unclear text detected");
    throw new RecaptureRequiredError();
  }
  
  // Step 3: Quick evidence micro-check (no LLM cost)
  const evidenceCheckResult = quickEvidenceCheck(extendedContent.extractedText, extendedContent.questionEvidence);
  logger.info("Evidence micro-check completed", evidenceCheckResult);
  
  if (evidenceCheckResult.failRate > EVIDENCE_FAIL_THRESHOLD) {
    logger.warn(`Evidence check failed: ${(evidenceCheckResult.failRate * 100).toFixed(0)}% questions have no grounding`);
    throw new RecaptureRequiredError();
  }
  
  // Step 4: Parallel text validation with OpenAI and Claude (no images - cheaper)
  const verdicts = await validateGroundingConsensusTextOnly(extendedContent);
  const combinedVerdict = combineVerdicts(verdicts);
  
  logger.info("Grounding validation completed", {
    overallConfidence: combinedVerdict.overallConfidence,
    recommendedAction: combinedVerdict.recommendedAction,
    weakQuestions: combinedVerdict.weakQuestions.length,
  });
  
  // Step 5: Handle remediation based on verdict
  let content: QuizContent = {
    lesson: extendedContent.lesson,
    questions: extendedContent.questions,
  };
  
  if (combinedVerdict.recommendedAction === "REFUSE") {
    logger.warn("Validators recommend REFUSE");
    throw new RecaptureRequiredError();
  }
  
  if (combinedVerdict.recommendedAction === "FULL_RETRY") {
    logger.info("Full retry with Claude fallback");
    content = await pRetry(
      () => aiLimit(() => generateWithClaudeFallback(images)),
      { ...RETRY_OPTIONS, retries: 1 }
    );
  } else if (combinedVerdict.recommendedAction === "PARTIAL_REGENERATE" && combinedVerdict.weakQuestions.length > 0) {
    logger.info(`Regenerating ${combinedVerdict.weakQuestions.length} weak questions`);
    content = await regenerateWeakQuestions(content, combinedVerdict.weakQuestions, extendedContent.extractedText);
  }
  
  // Step 6: Conditional vision spot-check (only when confidence is low)
  if (shouldTriggerVisionSpotCheck(combinedVerdict)) {
    logger.info("Triggering adaptive vision spot-check");
    const spotCheckPassed = await conditionalVisionSpotCheck(images, extendedContent.extractedText, combinedVerdict);
    if (!spotCheckPassed) {
      logger.warn("Vision spot-check failed");
      throw new RecaptureRequiredError();
    }
  }
  
  // Step 7: Validate MCQ answers with 3-model consensus
  logger.info("Validating answers with 3-model consensus...");
  content = await validateAnswersWithConsensus(content);
  
  logger.info(`Quiz generation complete`, {
    lessonTitle: content.lesson.title,
    questionCount: content.questions.length,
    totalDuration: Date.now() - startTime,
  });
  
  return content;
}

// ============== RELIABILITY FUNCTIONS ==============

// Quick evidence check - no LLM, just string matching
function quickEvidenceCheck(extractedText: string[], evidence: QuestionEvidence[]): { failRate: number; passed: number; failed: number } {
  const fullText = extractedText.join(" ").toLowerCase();
  let passed = 0;
  let failed = 0;
  
  for (const ev of evidence) {
    if (!ev.sourceText || ev.sourceText.length < 3) {
      failed++;
      continue;
    }
    
    // Check if source text appears in extracted text (fuzzy - allow minor OCR differences)
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

// Text-only validation with OpenAI and Claude (no images = cheaper)
async function validateGroundingConsensusTextOnly(content: ExtendedQuizContent): Promise<ValidationVerdict[]> {
  const validationPrompt = `أنت مدقق جودة للمحتوى التعليمي. تحقق أن الأسئلة مبنية على النص المستخرج وليست مخترعة.

النص المستخرج من الصور:
${content.extractedText.map((t, i) => `[صفحة ${i + 1}]: ${t.substring(0, 500)}...`).join("\n")}

الدرس:
العنوان: ${content.lesson.title}
الملخص: ${content.lesson.summary}

الأسئلة مع الأدلة:
${content.questions.map((q, i) => {
  const ev = content.questionEvidence[i] || { sourceText: "غير متوفر", confidence: 0 };
  return `${i + 1}. ${q.question}\n   الدليل: "${ev.sourceText}" (ثقة: ${ev.confidence})`;
}).join("\n")}

قيّم وارجع JSON:
{
  "overallConfidence": 0.0-1.0,
  "weakQuestions": [أرقام الأسئلة الضعيفة],
  "issues": [{"type": "OCR_SUSPECTED|CONTENT_DRIFT|HALLUCINATION", "severity": "low|medium|high", "questionIndex": رقم, "reason": "السبب"}],
  "recommendedAction": "ACCEPT|PARTIAL_REGENERATE|FULL_RETRY|REFUSE"
}`;

  const [openaiVerdict, claudeVerdict] = await Promise.all([
    pRetry(() => aiLimit(() => getOpenAIValidation(validationPrompt)), { ...RETRY_OPTIONS, retries: 1 }),
    pRetry(() => aiLimit(() => getClaudeValidation(validationPrompt)), { ...RETRY_OPTIONS, retries: 1 }),
  ]);
  
  return [openaiVerdict, claudeVerdict].filter((v): v is ValidationVerdict => v !== null);
}

async function getOpenAIValidation(prompt: string): Promise<ValidationVerdict | null> {
  try {
    const client = getOpenAI();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
    });
    return parseValidationVerdict(response.choices[0]?.message?.content || "");
  } catch (error) {
    logger.error("OpenAI validation failed", { error: (error as Error).message });
    return null;
  }
}

async function getClaudeValidation(prompt: string): Promise<ValidationVerdict | null> {
  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return parseValidationVerdict(text);
  } catch (error) {
    logger.error("Claude validation failed", { error: (error as Error).message });
    return null;
  }
}

function parseValidationVerdict(text: string): ValidationVerdict | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      overallConfidence: parsed.overallConfidence || 0.5,
      weakQuestions: parsed.weakQuestions || [],
      issues: parsed.issues || [],
      recommendedAction: parsed.recommendedAction || "ACCEPT",
    };
  } catch {
    return null;
  }
}

function combineVerdicts(verdicts: ValidationVerdict[]): ValidationVerdict {
  if (verdicts.length === 0) {
    return { overallConfidence: 0.7, weakQuestions: [], issues: [], recommendedAction: "ACCEPT" };
  }
  
  // Average confidence
  const avgConfidence = verdicts.reduce((sum, v) => sum + v.overallConfidence, 0) / verdicts.length;
  
  // Union of weak questions
  const weakQuestionsSet = new Set<number>();
  verdicts.forEach(v => v.weakQuestions.forEach(q => weakQuestionsSet.add(q)));
  
  // Collect all issues
  const allIssues = verdicts.flatMap(v => v.issues);
  
  // Most conservative action
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

function shouldTriggerVisionSpotCheck(verdict: ValidationVerdict): boolean {
  if (verdict.overallConfidence < CONFIDENCE_THRESHOLD) return true;
  if (verdict.weakQuestions.length / 20 > WEAK_QUESTIONS_THRESHOLD) return true;
  if (verdict.issues.some(i => i.type === "OCR_SUSPECTED" || i.type === "CONTENT_DRIFT")) return true;
  return false;
}

// Adaptive vision spot-check
async function conditionalVisionSpotCheck(images: string[], extractedText: string[], verdict: ValidationVerdict): Promise<boolean> {
  // Determine which pages to check
  let pagesToCheck: number[] = [];
  
  if (images.length <= 5) {
    pagesToCheck = images.map((_, i) => i);
  } else if (images.length <= 10) {
    // Check 3 pages: first + 2 random
    pagesToCheck = [0];
    const remaining = images.slice(1).map((_, i) => i + 1);
    for (let i = 0; i < 2 && remaining.length > 0; i++) {
      const idx = Math.floor(Math.random() * remaining.length);
      pagesToCheck.push(remaining.splice(idx, 1)[0]);
    }
  } else {
    // Check 2 pages: first + one referenced by weak question
    pagesToCheck = [0];
    if (verdict.weakQuestions.length > 0) {
      const weakIdx = verdict.weakQuestions[0] % images.length;
      if (!pagesToCheck.includes(weakIdx)) pagesToCheck.push(weakIdx);
    } else {
      pagesToCheck.push(Math.floor(images.length / 2));
    }
  }
  
  logger.info(`Vision spot-check on ${pagesToCheck.length} pages: ${pagesToCheck.join(", ")}`);
  
  // Check each selected page
  for (const pageIdx of pagesToCheck) {
    const image = images[pageIdx];
    const expectedText = extractedText[pageIdx] || "";
    
    if (expectedText.length < 20) continue;
    
    const verified = await verifyPageWithVision(image, expectedText);
    if (!verified) {
      logger.warn(`Vision spot-check failed for page ${pageIdx}`);
      return false;
    }
  }
  
  return true;
}

async function verifyPageWithVision(image: string, expectedText: string): Promise<boolean> {
  try {
    const ai = getGemini();
    const { data, mimeType } = extractBase64(image);
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data } },
          { text: `تحقق: هل النص التالي موجود فعلاً في هذه الصورة؟ ارجع JSON: {"verified": true/false, "reason": "السبب"}

النص للتحقق (جزء منه):
"${expectedText.substring(0, 200)}"` }
        ]
      }]
    });
    
    const text = response.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const result = JSON.parse(match[0]);
      return result.verified === true;
    }
    return true; // Assume OK if parsing fails
  } catch (error) {
    logger.error("Vision verification failed", { error: (error as Error).message });
    return true; // Don't block on vision errors
  }
}

// Regenerate only weak questions
async function regenerateWeakQuestions(content: QuizContent, weakIndices: number[], extractedText: string[]): Promise<QuizContent> {
  const weakQuestions = weakIndices.map(i => content.questions[i]).filter(Boolean);
  if (weakQuestions.length === 0) return content;
  
  const prompt = `أعد صياغة هذه الأسئلة بناءً على النص المستخرج:

النص المصدر:
${extractedText.join("\n").substring(0, 2000)}

الأسئلة التي تحتاج إعادة صياغة:
${weakQuestions.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}

ارجع الأسئلة المعدلة بنفس الصيغة JSON مع evidence.`;

  try {
    const client = getOpenAI();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    });
    
    const text = response.choices[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const newQuestions = parsed.questions || [];
      
      // Replace weak questions
      const updatedQuestions = [...content.questions];
      weakIndices.forEach((origIdx, newIdx) => {
        if (newQuestions[newIdx]) {
          updatedQuestions[origIdx] = newQuestions[newIdx];
        }
      });
      
      return { ...content, questions: updatedQuestions };
    }
  } catch (error) {
    logger.error("Weak question regeneration failed", { error: (error as Error).message });
  }
  
  return content;
}

// Claude fallback generator
async function generateWithClaudeFallback(images: string[]): Promise<QuizContent> {
  const anthropic = getAnthropic();
  
  const imageContents = images.map(img => {
    const { data, mimeType } = extractBase64(img);
    return {
      type: "image" as const,
      source: { type: "base64" as const, media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data }
    };
  });
  
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: [
        ...imageContents,
        { type: "text", text: GENERATION_PROMPT + "\n\nحلل الصور وأنشئ الدرس والأسئلة." }
      ]
    }]
  });
  
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return parseContentJSON(text);
}

// Extended Gemini generator with extractedText and evidence
async function generateWithGeminiExtended(images: string[]): Promise<ExtendedQuizContent> {
  const ai = getGemini();
  
  const parts: any[] = [];
  for (let i = 0; i < images.length; i++) {
    const { data, mimeType } = extractBase64(images[i]);
    parts.push({ inlineData: { mimeType, data } });
  }
  
  const totalQuestions = 20;
  const multiImagePrompt = images.length > 1 
    ? `\n\nهذه ${images.length} صفحات من نفس الكتاب/المادة.
1. استخرج النص من كل صفحة في "extractedText"
2. أنشئ ملخص شامل للدرس
3. أنشئ ${totalQuestions} سؤال متنوع مع evidence لكل سؤال`
    : "\n\nاستخرج النص في extractedText وأنشئ 20 سؤال مع evidence.";
  
  parts.push({ text: GENERATION_PROMPT + multiImagePrompt });
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
  });
  
  const text = response.text || "";
  return parseExtendedContentJSON(text);
}

function parseExtendedContentJSON(text: string): ExtendedQuizContent {
  const base = parseContentJSON(text);
  
  // Extract extractedText and evidence from parsed JSON
  let extractedText: string[] = [];
  let questionEvidence: QuestionEvidence[] = [];
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      extractedText = parsed.extractedText || [""];
      questionEvidence = (parsed.questions || []).map((q: any) => q.evidence || { sourceText: "", pageIndex: 0, confidence: 0 });
    }
  } catch {
    // Use defaults
  }
  
  return {
    ...base,
    extractedText: extractedText.length > 0 ? extractedText : [""],
    questionEvidence,
  };
}

async function generateWithGemini(images: string[]): Promise<QuizContent> {
  const ai = getGemini();
  
  // Build parts array with all images
  const parts: any[] = [];
  
  for (let i = 0; i < images.length; i++) {
    const { data, mimeType } = extractBase64(images[i]);
    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: data,
      },
    });
  }
  
  // Always generate 20 questions regardless of image count
  const totalQuestions = 20;
  
  const multiImagePrompt = images.length > 1 
    ? `

هذه ${images.length} صفحات من نفس الكتاب/المادة.
1. افهم المادة العلمية كاملة من جميع الصفحات
2. أنشئ ملخص شامل للدرس يغطي جميع الصفحات
3. أنشئ ${totalQuestions} سؤال متنوع (اختيار من متعدد، صح/خطأ، أكمل الفراغ، وصّل)
4. اختر الأسئلة الأكثر أهمية لاختبار فهم الطالب للمادة`
    : "\n\nحلل هذه الصورة وأنشئ ملخص الدرس و20 سؤال متنوع (8 اختيار من متعدد، 6 صح/خطأ، 4 أكمل الفراغ، 2 وصّل).";
  
  parts.push({
    text: GENERATION_PROMPT + multiImagePrompt,
  });
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: parts,
      },
    ],
  });
  
  const text = response.text || "";
  return parseContentJSON(text);
}

async function validateAnswersWithConsensus(content: QuizContent): Promise<QuizContent> {
  // Filter only MCQ questions for validation
  const mcqQuestions = content.questions.filter((q): q is Question & { type: "multiple_choice"; options: string[]; correct: "A" | "B" | "C" | "D" } => 
    q.type === "multiple_choice" || (!("type" in q) && "options" in q)
  );
  
  if (mcqQuestions.length === 0) {
    logger.info("No MCQ questions to validate");
    return content;
  }
  
  // Format MCQ questions for validation
  const questionsText = mcqQuestions.map((q, i) => {
    return `السؤال ${i + 1}: ${q.question}
الخيارات:
A: ${q.options[0]}
B: ${q.options[1]}
C: ${q.options[2]}
D: ${q.options[3]}`;
  }).join("\n\n");

  // Get answers from all 3 models in parallel with retry and concurrency control
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
  
  // Build a map of validated MCQ answers
  let mcqIndex = 0;
  
  // For each question, use majority vote for MCQs only
  const validatedQuestions = content.questions.map((q) => {
    // Skip non-MCQ questions (only validate multiple_choice type)
    if (q.type !== "multiple_choice") {
      return q;
    }
    
    const i = mcqIndex++;
    const votes = [
      geminiAnswers[i] || "X",
      openaiAnswers[i] || "X", 
      anthropicAnswers[i] || "X"
    ];
    
    // Count votes
    const voteCounts: Record<string, number> = {};
    votes.forEach(v => {
      if (v && ["A", "B", "C", "D"].includes(v)) {
        voteCounts[v] = (voteCounts[v] || 0) + 1;
      }
    });
    
    // Find majority answer (at least 2 models agree)
    let correctAnswer = (q as any).correct;
    for (const [answer, count] of Object.entries(voteCounts)) {
      if (count >= 2) {
        correctAnswer = answer as "A" | "B" | "C" | "D";
        break;
      }
    }
    
    // If no majority, use Gemini's answer (most reliable for Arabic content)
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
    };
  });
  
  return {
    lesson: content.lesson,
    questions: validatedQuestions,
  };
}

async function getGeminiAnswers(questionsText: string): Promise<string[]> {
  try {
    const ai = getGemini();
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${ANSWER_VALIDATION_PROMPT}\n\nالأسئلة:\n${questionsText}`,
            },
          ],
        },
      ],
    });
    
    const text = response.text || "";
    return parseAnswersJSON(text);
  } catch (error) {
    logger.error("Gemini answer validation failed", { error: (error as Error).message });
    return [];
  }
}

async function getOpenAIAnswers(questionsText: string): Promise<string[]> {
  try {
    const client = getOpenAI();
    
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: ANSWER_VALIDATION_PROMPT,
        },
        {
          role: "user",
          content: `الأسئلة:\n${questionsText}`,
        },
      ],
      max_tokens: 500,
    });
    
    const text = response.choices[0]?.message?.content || "";
    return parseAnswersJSON(text);
  } catch (error) {
    logger.error("OpenAI answer validation failed", { error: (error as Error).message });
    return [];
  }
}

async function getAnthropicAnswers(questionsText: string): Promise<string[]> {
  try {
    const anthropic = getAnthropic();
    
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `${ANSWER_VALIDATION_PROMPT}\n\nالأسئلة:\n${questionsText}`,
        },
      ],
    });
    
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return parseAnswersJSON(text);
  } catch (error) {
    logger.error("Anthropic answer validation failed", { error: (error as Error).message });
    return [];
  }
}

function parseAnswersJSON(text: string): string[] {
  try {
    let cleanText = text.trim();
    
    const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleanText = codeBlockMatch[1].trim();
    }
    
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Try to extract just the answers array
      const arrayMatch = cleanText.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]).map((a: string) => a?.toUpperCase());
      }
      return [];
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.answers && Array.isArray(parsed.answers)) {
      return parsed.answers.map((a: string) => a?.toUpperCase());
    }
    
    return [];
  } catch (e) {
    logger.error("Failed to parse answers JSON", { error: (e as Error).message, textPreview: text.substring(0, 200) });
    return [];
  }
}

function parseContentJSON(text: string): QuizContent {
  let cleanText = text.trim();
  
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1].trim();
  }
  
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error("No JSON found in AI response", { textPreview: text.substring(0, 500) });
    throw new Error("No JSON found in response");
  }
  
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    logger.error("JSON parse error", { error: (e as Error).message, textPreview: jsonMatch[0].substring(0, 500) });
    throw new Error("Failed to parse JSON response");
  }
  
  // Parse lesson with interactive steps
  const lesson: Lesson = {
    title: parsed.lesson?.title || "الدرس",
    summary: parsed.lesson?.summary || "",
    keyPoints: parsed.lesson?.keyPoints || [],
    targetAge: parsed.lesson?.targetAge || 9,
    steps: parsed.lesson?.steps || [],
    // NEW in v2.7.0: Evidence tracking
    extractedText: parsed.extractedText || parsed.lesson?.extractedText || [],
    confidence: parsed.lesson?.confidence || 0.7,
  };
  
  // NEW in v2.7.0: Validate evidence exists
  if (!lesson.extractedText || lesson.extractedText.length === 0) {
    logger.warn("Generation missing extractedText - adding placeholder");
    lesson.extractedText = ["Text extraction not available"];
  }
  
  if (typeof lesson.confidence !== 'number') {
    logger.warn("Generation missing confidence - setting to 0.7");
    lesson.confidence = 0.7;
  }
  
  logger.info("Lesson confidence", { confidence: lesson.confidence, extractedTextCount: lesson.extractedText?.length });
  
  // Parse questions - handle multiple types
  const questions = parsed.questions || [];
  
  if (!Array.isArray(questions) || questions.length === 0) {
    logger.error("Invalid questions format in AI response", { parsed });
    throw new Error("Invalid questions format");
  }
  
  const parsedQuestions: Question[] = questions.map((q: any, i: number) => {
    if (!q.question) {
      logger.error(`Invalid question at index ${i}`, { question: q });
      throw new Error(`Invalid question format at index ${i}`);
    }
    
    const type = q.type || "multiple_choice";
    const base = {
      question: q.question,
      explanation: q.explanation || undefined,
      diagram: q.diagram || undefined,
    };
    
    // Parse evidence if present (v2.7.0)
    const evidence = q.evidence ? {
      text: q.evidence.sourceText || q.evidence.text || "",
      page: q.evidence.pageIndex ?? q.evidence.page ?? 0,
      confidence: q.evidence.confidence || 0.5
    } : undefined;
    
    switch (type) {
      case "true_false":
        return {
          ...base,
          type: "true_false" as const,
          correct: typeof q.correct === "boolean" ? q.correct : q.correct === "true",
          evidence,
        };
      
      case "fill_blank":
        return {
          ...base,
          type: "fill_blank" as const,
          correct: String(q.correct),
          hint: q.hint || undefined,
          evidence,
        };
      
      case "matching":
        return {
          ...base,
          type: "matching" as const,
          pairs: q.pairs || [],
          evidence,
        };
      
      case "multiple_choice":
      default:
        if (!q.options) {
          logger.error(`MCQ missing options at index ${i}`, { question: q });
          throw new Error(`MCQ missing options at index ${i}`);
        }
        return {
          ...base,
          type: "multiple_choice" as const,
          options: q.options.slice(0, 4),
          correct: q.correct?.toString().toUpperCase() as "A" | "B" | "C" | "D",
          evidence,
        };
    }
  });
  
  // NEW in v2.7.0: Validate questions have evidence (at least for first 3)
  let evidenceCount = 0;
  for (const q of parsedQuestions.slice(0, 5)) {
    const qEvidence = (q as any).evidence;
    if (qEvidence && qEvidence.text && qEvidence.confidence > 0.5) {
      evidenceCount++;
    }
  }
  
  if (evidenceCount < 2) {
    logger.warn("Low evidence quality", { evidenceCount, totalChecked: Math.min(5, parsedQuestions.length) });
  } else {
    logger.info("Evidence quality check passed", { evidenceCount });
  
  }
  
  return { lesson, questions: parsedQuestions };
}

export function calculateScores(questions: Question[], answers: string[]): { score: number; total: number } {
  let score = 0;
  questions.forEach((q, i) => {
    const answer = answers[i];
    
    switch (q.type) {
      case "true_false":
        // Compare boolean answers
        const userBool = answer === "true" || answer === "صح";
        if (userBool === q.correct) score++;
        break;
        
      case "fill_blank":
        // Normalize and compare text
        const userText = answer?.toString().trim().toLowerCase();
        const correctText = q.correct?.toString().trim().toLowerCase();
        if (userText === correctText) score++;
        break;
        
      case "matching":
        // Matching is always considered correct if answered (UI handles validation)
        if (answer === "correct") score++;
        break;
        
      case "multiple_choice":
      default:
        // Compare MCQ letters
        if (answer === (q as any).correct) score++;
        break;
    }
  });
  return { score, total: questions.length };
}

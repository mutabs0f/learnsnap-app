import type { Question, Lesson } from "../../shared/schema.js";

export interface QuestionEvidence {
  sourceText: string;
  pageIndex: number;
  confidence: number;
}

export interface ExtendedQuizContent {
  lesson: Lesson;
  questions: Question[];
  extractedText: string[];
  questionEvidence: QuestionEvidence[];
}

export interface ValidationVerdict {
  overallConfidence: number;
  weakQuestions: number[];
  issues: ValidationIssue[];
  recommendedAction: "ACCEPT" | "PARTIAL_REGENERATE" | "FULL_RETRY" | "REFUSE";
}

export interface ValidationIssue {
  type: string;
  severity: string;
  questionIndex: number;
  reason: string;
}

export interface QuizContent {
  lesson: Lesson;
  questions: Question[];
  warnings?: string[];
}

export interface ImageData {
  data: string;
  mimeType: string;
}

export interface SpotCheckResult {
  passed: boolean;
  failedPages: number[];
  skippedLargeBatch: boolean;
}

export interface EvidenceCheckResult {
  failRate: number;
  passed: number;
  failed: number;
}

export class RecaptureRequiredError extends Error {
  code = "RECAPTURE_REQUIRED";
  constructor(message: string = "الصور غير واضحة أو الصفحة ناقصة. صوّر الصفحة كاملة بإضاءة أفضل.") {
    super(message);
    this.name = "RecaptureRequiredError";
  }
}

export class ValidationUnavailableError extends Error {
  code = "VALIDATION_UNAVAILABLE";
  httpStatus = 503;
  constructor(message: string = "خدمة التحقق غير متوفرة حالياً. حاول مرة أخرى.") {
    super(message);
    this.name = "ValidationUnavailableError";
  }
}

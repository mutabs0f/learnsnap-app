export { generateQuestionsFromImages } from "./generator.js";
export type { GenerationOptions } from "./generator.js";

export { calculateScores } from "./scoring.js";

export {
  RecaptureRequiredError,
  ValidationUnavailableError,
} from "./types.js";
export type {
  QuizContent,
  QuestionEvidence,
  ExtendedQuizContent,
  ValidationVerdict,
  ValidationIssue,
  ImageData,
  SpotCheckResult,
  EvidenceCheckResult,
} from "./types.js";

export { getGemini, getOpenAI, getAnthropic } from "./clients.js";

export {
  generateWithGemini,
  generateWithGeminiExtended,
  generateWithClaudeFallback,
  generateWithClaudeExtended,
} from "./providers/index.js";

export {
  quickEvidenceCheck,
  validateGroundingConsensusTextOnly,
  combineVerdicts,
  validateAnswersWithConsensus,
  validateAnswersWithSingleModel,
} from "./validators.js";

export { GENERATION_PROMPT, ANSWER_VALIDATION_PROMPT } from "./prompts.js";
export { sanitizeDiagram, extractBase64 } from "./utils.js";
export { parseContentJSON, parseExtendedContentJSON, parseAnswersJSON } from "./parsers.js";

export {
  getCircuitBreaker,
  getAllCircuitStats,
  resetAllCircuits,
  CircuitOpenError,
} from "./circuit-breaker.js";

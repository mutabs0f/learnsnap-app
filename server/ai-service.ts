/**
 * AI Service - Main Entry Point
 * 
 * This file re-exports all AI functionality from the modular structure.
 * The AI logic has been refactored into smaller modules under server/ai/
 * 
 * Structure:
 * - server/ai/types.ts - Type definitions
 * - server/ai/prompts.ts - AI prompts
 * - server/ai/clients.ts - AI client initialization
 * - server/ai/constants.ts - Configuration constants
 * - server/ai/utils.ts - Utility functions
 * - server/ai/parsers.ts - JSON parsing functions
 * - server/ai/validators.ts - Validation functions
 * - server/ai/generator.ts - Main quiz generation
 * - server/ai/scoring.ts - Score calculation
 * - server/ai/providers/ - Provider-specific implementations
 */

export {
  generateQuestionsFromImages,
  calculateScores,
  RecaptureRequiredError,
  ValidationUnavailableError,
  getGemini,
  getOpenAI,
  getAnthropic,
} from "./ai/index.js";

export type {
  QuizContent,
  QuestionEvidence,
  ExtendedQuizContent,
  ValidationVerdict,
  ValidationIssue,
  GenerationOptions,
} from "./ai/index.js";

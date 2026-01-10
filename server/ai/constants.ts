import pLimit from "p-limit";
import type { Options } from "p-retry";
import logger from "../logger.js";

export const aiLimit = pLimit(5);

export const EVIDENCE_FAIL_THRESHOLD = 0.6;
export const CONFIDENCE_THRESHOLD = 0.45;
export const WEAK_QUESTIONS_THRESHOLD = 0.4;
export const MIN_ACCEPTABLE_QUESTIONS = 5;

export const RETRY_OPTIONS: Options = {
  retries: 3,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 10000,
  onFailedAttempt: (context) => {
    const errorMessage = context.error instanceof Error ? context.error.message : String(context.error);
    logger.warn(`AI call failed - attempt ${context.attemptNumber}`, {
      retriesLeft: context.retriesLeft,
      error: errorMessage,
    });
  },
};

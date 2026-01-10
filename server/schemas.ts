import { z } from "zod";

// [GO-2] Zod Schema Validation for LLM outputs

// Validation verdict schema from validators (OpenAI/Claude)
export const ValidationVerdictSchema = z.object({
  overallConfidence: z.number().min(0).max(1),
  weakQuestions: z.array(z.number()).default([]),
  issues: z.array(z.object({
    type: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    questionIndex: z.number(),
    reason: z.string(),
  })).default([]),
  recommendedAction: z.enum(["ACCEPT", "PARTIAL_REGENERATE", "FULL_RETRY", "REFUSE"]),
});

export type ValidatedVerdict = z.infer<typeof ValidationVerdictSchema>;

// Question schema for quiz output
const BaseQuestionSchema = z.object({
  question: z.string().min(1, "Question text required"),
  explanation: z.string().optional(),
});

const MCQQuestionSchema = BaseQuestionSchema.extend({
  type: z.literal("mcq"),
  options: z.array(z.string()).min(2, "MCQ needs at least 2 options"),
  correct: z.string().min(1, "Correct answer required"),
});

const TrueFalseQuestionSchema = BaseQuestionSchema.extend({
  type: z.literal("truefalse"),
  correct: z.string().refine(
    (val) => ["صح", "خطأ", "true", "false"].includes(val.toLowerCase()),
    "Must be صح/خطأ or true/false"
  ),
});

const FillBlankQuestionSchema = BaseQuestionSchema.extend({
  type: z.literal("fillblank"),
  correct: z.string().min(1, "Fill blank answer required"),
});

const MatchingQuestionSchema = BaseQuestionSchema.extend({
  type: z.literal("matching"),
  pairs: z.array(z.object({
    left: z.string(),
    right: z.string(),
  })).min(2, "Matching needs at least 2 pairs"),
});

export const QuestionSchema = z.discriminatedUnion("type", [
  MCQQuestionSchema,
  TrueFalseQuestionSchema,
  FillBlankQuestionSchema,
  MatchingQuestionSchema,
]);

export type ValidatedQuestion = z.infer<typeof QuestionSchema>;

// Lesson schema
export const LessonSchema = z.object({
  title: z.string().min(1, "Lesson title required"),
  summary: z.string().min(1, "Lesson summary required"),
  keyPoints: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.8),
});

export type ValidatedLesson = z.infer<typeof LessonSchema>;

// Full quiz content schema
export const QuizContentSchema = z.object({
  lesson: LessonSchema,
  questions: z.array(QuestionSchema).min(1, "At least 1 question required"),
});

export type ValidatedQuizContent = z.infer<typeof QuizContentSchema>;

// Helper function to validate with schema and return result
export function safeParseWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { 
    success: false, 
    error: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
  };
}

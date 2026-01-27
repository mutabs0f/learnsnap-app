/**
 * Quiz Type Definitions (L6 Compliance)
 * 
 * Eliminates 'any' types for quiz-related data structures.
 * @version 3.4.1
 */

export type QuestionType = 'multiple_choice' | 'true_false' | 'fill_blank' | 'matching';

export interface MatchingPair {
  left: string;
  right: string;
}

export interface Question {
  id?: string;
  type?: QuestionType;
  question: string;
  options?: string[];
  correct: string | boolean;
  pairs?: MatchingPair[];
  diagram?: string;
  explanation?: string;
}

export interface LessonStep {
  type: 'explanation' | 'example' | 'tip';
  content: string;
}

export interface LessonContent {
  title?: string;
  summary?: string;
  keyPoints?: string[];
  steps?: LessonStep[];
}

export type QuizStatus = 'pending' | 'processing' | 'completed' | 'error' | 'timeout' | 'service_error';

export interface QuizSession {
  id: string;
  status: QuizStatus;
  questions: Question[];
  lesson?: LessonContent;
  progress?: number;
  progressMessage?: string;
  score?: number;
  totalQuestions?: number;
  correctAnswers?: number;
  createdAt?: string;
  expiresAt?: string;
}

export interface MatchingPairAnswer {
  left: string;
  right: string;
}

export interface QuizResult {
  sessionId: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  questions: Question[];
  userAnswers: string[];
  completedAt: string;
}

export interface ReportReason {
  value: string;
  label: string;
}

export const REPORT_REASONS: ReportReason[] = [
  { value: 'unclear', label: 'السؤال غير واضح' },
  { value: 'wrong_answer', label: 'الإجابة الصحيحة خاطئة' },
  { value: 'duplicate', label: 'السؤال مكرر' },
  { value: 'inappropriate', label: 'محتوى غير مناسب' },
  { value: 'other', label: 'سبب آخر' },
];

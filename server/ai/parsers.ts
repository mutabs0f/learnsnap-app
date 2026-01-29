import logger from "../logger.js";
import type { Lesson, Question } from "../../shared/schema.js";
import type { QuizContent, ExtendedQuizContent, QuestionEvidence, ValidationVerdict } from "./types.js";
import { sanitizeDiagram } from "./utils.js";

export function parseAnswersJSON(text: string): string[] {
  try {
    let cleanText = text.trim();
    
    const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleanText = codeBlockMatch[1].trim();
    }
    
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
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

export function parseValidationVerdict(text: string): ValidationVerdict | null {
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

export function parseContentJSON(text: string): QuizContent {
  let cleanText = text.trim();
  
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1].trim();
  } else {
    const openCodeBlockMatch = cleanText.match(/```(?:json)?\s*\n([\s\S]*)/);
    if (openCodeBlockMatch) {
      cleanText = openCodeBlockMatch[1].trim();
      logger.info("Extracted JSON from open code block (no closing backticks)");
    }
  }
  
  cleanText = cleanText.replace(/```$/g, '').trim();
  
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error("No JSON found in AI response", { 
      textPreview: text.substring(0, 500),
      cleanTextPreview: cleanText.substring(0, 500)
    });
    throw new Error("No JSON found in response");
  }
  
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    logger.error("JSON parse error", { error: (e as Error).message, textPreview: jsonMatch[0].substring(0, 500) });
    throw new Error("Failed to parse JSON response");
  }
  
  const lesson: Lesson = {
    title: parsed.lesson?.title || "الدرس",
    summary: parsed.lesson?.summary || "",
    keyPoints: parsed.lesson?.keyPoints || [],
    targetAge: parsed.lesson?.targetAge || 9,
    steps: parsed.lesson?.steps || [],
    extractedText: parsed.extractedText || parsed.lesson?.extractedText || [],
    confidence: parsed.lesson?.confidence || 0.7,
  };
  
  if (!lesson.extractedText || lesson.extractedText.length === 0) {
    logger.warn("Generation missing extractedText - adding placeholder");
    lesson.extractedText = ["Text extraction not available"];
  }
  
  if (typeof lesson.confidence !== 'number') {
    logger.warn("Generation missing confidence - setting to 0.7");
    lesson.confidence = 0.7;
  }
  
  logger.info("Lesson confidence", { confidence: lesson.confidence, extractedTextCount: lesson.extractedText?.length });
  
  const questions = parsed.questions || [];
  
  if (!Array.isArray(questions) || questions.length === 0) {
    logger.error("Invalid questions format in AI response", { parsed });
    throw new Error("Invalid questions format");
  }
  
  const parsedQuestions: Question[] = questions
    .filter((q: Record<string, unknown>, i: number) => {
      if (!q.question || (typeof q.question === 'string' && q.question.trim() === '')) {
        logger.warn(`Skipping empty question at index ${i}`);
        return false;
      }
      
      const type = (q.type as string) || "multiple_choice";
      if (type === "multiple_choice" || !q.type) {
        if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
          logger.warn(`Skipping MCQ with invalid options at index ${i}`, { options: q.options });
          return false;
        }
        const validOptions = (q.options as string[]).filter((opt: string) => opt && typeof opt === 'string' && opt.trim() !== '');
        if (validOptions.length < 2) {
          logger.warn(`Skipping MCQ with empty options at index ${i}`, { validCount: validOptions.length });
          return false;
        }
        const correct = (q.correct as string)?.toString().toUpperCase();
        if (!correct || !['A', 'B', 'C', 'D'].includes(correct)) {
          logger.warn(`Skipping MCQ with invalid correct answer at index ${i}`, { correct: q.correct });
          return false;
        }
      }
      
      if (type === "true_false") {
        if (q.correct === undefined || q.correct === null) {
          logger.warn(`Skipping true/false with no answer at index ${i}`);
          return false;
        }
      }
      
      return true;
    })
    .map((q: Record<string, unknown>) => {
      const type = (q.type as string) || "multiple_choice";
      const base = {
        question: (q.question as string).trim(),
        explanation: q.explanation as string | undefined,
        diagram: sanitizeDiagram(q.diagram as string | undefined),
      };
      
      const rawEvidence = q.evidence as { sourceText?: string; text?: string; pageIndex?: number; page?: number; confidence?: number } | undefined;
      const evidence = rawEvidence ? {
        text: rawEvidence.sourceText || rawEvidence.text || "",
        page: rawEvidence.pageIndex ?? rawEvidence.page ?? 0,
        confidence: rawEvidence.confidence || 0.5
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
            hint: q.hint as string | undefined,
            evidence,
          };
        
        case "matching":
          return {
            ...base,
            type: "matching" as const,
            pairs: q.pairs as { left: string; right: string }[] || [],
            evidence,
          };
        
        case "multiple_choice":
        default:
          if (!q.options) {
            throw new Error(`MCQ missing options`);
          }
          return {
            ...base,
            type: "multiple_choice" as const,
            options: (q.options as string[]).slice(0, 4),
            correct: (q.correct as string)?.toString().toUpperCase() as "A" | "B" | "C" | "D",
            evidence,
          };
      }
    });
  
  let evidenceCount = 0;
  for (const q of parsedQuestions.slice(0, 5)) {
    const qEvidence = (q as Question & { evidence?: { text: string; confidence: number } }).evidence;
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

export function parseExtendedContentJSON(text: string): ExtendedQuizContent {
  const base = parseContentJSON(text);
  
  let extractedText: string[] = [];
  let questionEvidence: QuestionEvidence[] = [];
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      extractedText = parsed.extractedText || [""];
      questionEvidence = (parsed.questions || []).map((q: { evidence?: QuestionEvidence }) => 
        q.evidence || { sourceText: "", pageIndex: 0, confidence: 0 }
      );
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

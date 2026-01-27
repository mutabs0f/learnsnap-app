import { getOpenAI } from "../clients.js";
import { ANSWER_VALIDATION_PROMPT } from "../prompts.js";
import { parseAnswersJSON, parseValidationVerdict } from "../parsers.js";
import logger from "../../logger.js";
import type { ValidationVerdict, QuizContent, QuestionEvidence } from "../types.js";

export async function getOpenAIAnswers(questionsText: string): Promise<string[]> {
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

export async function getOpenAIValidation(prompt: string): Promise<ValidationVerdict | null> {
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

export async function regenerateWeakQuestionsWithOpenAI(
  content: QuizContent, 
  weakIndices: number[], 
  extractedText: string[]
): Promise<QuizContent> {
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

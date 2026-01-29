import { getAnthropic } from "../clients.js";
import { GENERATION_PROMPT, ANSWER_VALIDATION_PROMPT } from "../prompts.js";
import { extractBase64 } from "../utils.js";
import { parseContentJSON, parseExtendedContentJSON, parseAnswersJSON, parseValidationVerdict } from "../parsers.js";
import logger from "../../logger.js";
import type { QuizContent, ExtendedQuizContent, ValidationVerdict } from "../types.js";

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

interface ImageContent {
  type: "image";
  source: { type: "base64"; media_type: ImageMediaType; data: string };
}

export async function generateWithClaudeFallback(images: string[]): Promise<QuizContent> {
  const anthropic = getAnthropic();
  
  const imageContents: ImageContent[] = images.map(img => {
    const { data, mimeType } = extractBase64(img);
    return {
      type: "image" as const,
      source: { type: "base64" as const, media_type: mimeType as ImageMediaType, data }
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

export async function generateWithClaudeExtended(images: string[]): Promise<ExtendedQuizContent> {
  const anthropic = getAnthropic();
  
  const imageContents: ImageContent[] = images.map(img => {
    const { data, mimeType } = extractBase64(img);
    return {
      type: "image" as const,
      source: { type: "base64" as const, media_type: mimeType as ImageMediaType, data }
    };
  });
  
  const totalQuestions = 20;
  const multiImagePrompt = images.length > 1 
    ? `\n\nهذه ${images.length} صفحات من نفس الكتاب/المادة.
1. استخرج النص من كل صفحة في "extractedText"
2. أنشئ ملخص شامل للدرس
3. أنشئ ${totalQuestions} سؤال متنوع مع evidence لكل سؤال`
    : "\n\nاستخرج النص في extractedText وأنشئ 20 سؤال مع evidence.";
  
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    messages: [{
      role: "user",
      content: [
        ...imageContents,
        { type: "text", text: GENERATION_PROMPT + multiImagePrompt }
      ]
    }]
  });
  
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return parseExtendedContentJSON(text);
}

export async function getAnthropicAnswers(questionsText: string): Promise<string[]> {
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

export async function getClaudeValidation(prompt: string): Promise<ValidationVerdict | null> {
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

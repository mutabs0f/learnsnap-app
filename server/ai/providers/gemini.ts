import { getGemini } from "../clients.js";
import { GENERATION_PROMPT, ANSWER_VALIDATION_PROMPT } from "../prompts.js";
import { extractBase64 } from "../utils.js";
import { parseContentJSON, parseExtendedContentJSON, parseAnswersJSON } from "../parsers.js";
import logger from "../../logger.js";
import type { QuizContent, ExtendedQuizContent } from "../types.js";

interface GeminiPart {
  inlineData?: { mimeType: string; data: string };
  text?: string;
}

export async function generateWithGemini(images: string[]): Promise<QuizContent> {
  const ai = getGemini();
  
  const parts: GeminiPart[] = [];
  
  for (let i = 0; i < images.length; i++) {
    const { data, mimeType } = extractBase64(images[i]);
    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: data,
      },
    });
  }
  
  const totalQuestions = 20;
  
  const multiImagePrompt = images.length > 1 
    ? `

هذه ${images.length} صفحات من نفس الكتاب/المادة.
1. افهم المادة العلمية كاملة من جميع الصفحات
2. أنشئ ملخص شامل للدرس يغطي جميع الصفحات
3. أنشئ ${totalQuestions} سؤال (17 اختيار من متعدد، 3 صح/خطأ)
4. اختر الأسئلة الأكثر أهمية لاختبار فهم الطالب للمادة`
    : "\n\nحلل هذه الصورة وأنشئ ملخص الدرس و20 سؤال (17 اختيار من متعدد، 3 صح/خطأ).";
  
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

export async function generateWithGeminiExtended(images: string[]): Promise<ExtendedQuizContent> {
  const ai = getGemini();
  
  const parts: GeminiPart[] = [];
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

export async function getGeminiAnswers(questionsText: string): Promise<string[]> {
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

export async function verifyPageWithVision(image: string, expectedText: string): Promise<boolean> {
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
    return true;
  } catch (error) {
    logger.error("Vision verification failed", { error: (error as Error).message });
    return true;
  }
}

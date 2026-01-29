/**
 * LearnSnap AI Support Agent
 * Pure LLM-driven responses with RAG knowledge boundaries
 * Multi-provider fallback: Gemini → OpenAI → Anthropic
 * @version 5.0.0
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./knowledge";
import logger from "../../logger";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

interface AgentResponse {
  message: string;
  escalate: boolean;
  category?: string;
}

interface ConversationMessage {
  role: string;
  content: string;
}

// Keywords that indicate escalation is needed
const ESCALATION_KEYWORDS = [
  'سأحول', 'سأحولك', 'الدعم المتخصص', 'الدعم البشري', 'فريق الدعم',
  'سيتواصلون معك', 'تحويلك', 'خطأ تقني', 'مشكلة دفع', 'استرجاع'
];

function detectEscalation(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return ESCALATION_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

function detectCategory(message: string): string {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('ريال') || lowerMessage.includes('سعر') || lowerMessage.includes('باقة')) {
    return 'pricing';
  }
  if (lowerMessage.includes('دفع') || lowerMessage.includes('فلوس') || lowerMessage.includes('مدى') || lowerMessage.includes('فيزا')) {
    return 'payment';
  }
  if (lowerMessage.includes('حساب') || lowerMessage.includes('تسجيل') || lowerMessage.includes('كلمة السر')) {
    return 'account';
  }
  if (lowerMessage.includes('خطأ') || lowerMessage.includes('مشكلة') || lowerMessage.includes('ما يشتغل')) {
    return 'technical';
  }
  return 'general';
}

function parseResponse(text: string): AgentResponse | null {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return {
          message: parsed.message.trim(),
          escalate: Boolean(parsed.escalate) || detectEscalation(parsed.message),
          category: parsed.category || detectCategory(parsed.message)
        };
      }
    } catch {
      // JSON parse failed, fall through
    }
  }
  
  // If no valid JSON, treat the whole text as the message with smart detection
  const cleanText = text.trim();
  if (cleanText && cleanText.length > 3 && !cleanText.startsWith('{')) {
    return { 
      message: cleanText.substring(0, 800), 
      escalate: detectEscalation(cleanText),
      category: detectCategory(cleanText)
    };
  }
  
  return null;
}

function buildConversation(userMessage: string, history: ConversationMessage[]): string {
  // Build a natural conversation context
  let conversation = "";
  
  if (history.length > 0) {
    conversation += "المحادثة السابقة:\n";
    for (const msg of history.slice(-6)) {
      const role = msg.role === 'user' ? 'المستخدم' : 'أنت';
      conversation += `${role}: ${msg.content}\n`;
    }
    conversation += "\n";
  }
  
  conversation += `المستخدم الآن: ${userMessage}`;
  
  return conversation;
}

async function tryGemini(systemPrompt: string, conversation: string): Promise<AgentResponse | null> {
  if (!genAI) return null;
  
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: { 
        temperature: 0.7,  // Higher for more natural responses
        maxOutputTokens: 800 
      },
      systemInstruction: systemPrompt
    });
    
    const result = await model.generateContent(conversation);
    const text = result.response.text().trim();
    logger.debug("Gemini response", { text: text.substring(0, 300) });
    
    return parseResponse(text);
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("429") || msg.includes("quota") || msg.includes("RATE")) {
      logger.warn("Gemini rate limited, trying fallback");
      return null;
    }
    logger.error("Gemini error", { error: msg });
    throw error;
  }
}

async function tryOpenAI(systemPrompt: string, conversation: string): Promise<AgentResponse | null> {
  if (!openai) return null;
  
  try {
    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: conversation }
      ],
      temperature: 0.7,
      max_tokens: 800
    });
    
    const text = result.choices[0]?.message?.content?.trim() || "";
    logger.debug("OpenAI response", { text: text.substring(0, 300) });
    
    return parseResponse(text);
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("429") || msg.includes("rate")) {
      logger.warn("OpenAI rate limited, trying fallback");
      return null;
    }
    logger.error("OpenAI error", { error: msg });
    throw error;
  }
}

async function tryAnthropic(systemPrompt: string, conversation: string): Promise<AgentResponse | null> {
  if (!anthropic) return null;
  
  try {
    const result = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: conversation }]
    });
    
    const text = (result.content[0] as { text: string }).text?.trim() || "";
    logger.debug("Anthropic response", { text: text.substring(0, 300) });
    
    return parseResponse(text);
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("429") || msg.includes("rate")) {
      logger.warn("Anthropic rate limited");
      return null;
    }
    logger.error("Anthropic error", { error: msg });
    throw error;
  }
}

export async function getSupportResponse(
  userMessage: string,
  conversationHistory: ConversationMessage[] = []
): Promise<AgentResponse> {
  
  const hasAnyProvider = genAI || openai || anthropic;
  
  if (!hasAnyProvider) {
    logger.warn("Support agent: No AI provider configured");
    return {
      message: "عذراً، حدث خطأ تقني. سأحولك للدعم المتخصص.",
      escalate: true,
      category: "error"
    };
  }

  const conversation = buildConversation(userMessage, conversationHistory);

  try {
    // Try providers in order: Gemini → OpenAI → Anthropic
    let response = await tryGemini(SYSTEM_PROMPT, conversation);
    if (response) {
      logger.info("Support agent used Gemini successfully");
      return response;
    }
    
    response = await tryOpenAI(SYSTEM_PROMPT, conversation);
    if (response) {
      logger.info("Support agent used OpenAI fallback");
      return response;
    }
    
    response = await tryAnthropic(SYSTEM_PROMPT, conversation);
    if (response) {
      logger.info("Support agent used Anthropic fallback");
      return response;
    }
    
    // All providers failed or rate limited
    logger.warn("All AI providers failed or rate limited");
    return {
      message: "الخدمة مشغولة حالياً. يرجى المحاولة بعد لحظات.",
      escalate: false,
      category: "rate_limited"
    };
    
  } catch (error) {
    logger.error("Support agent error", { error: (error as Error).message });
    return {
      message: "عذراً، حدث خطأ. سأحولك للدعم المتخصص.",
      escalate: true,
      category: "error"
    };
  }
}

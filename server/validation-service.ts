import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { Question, Lesson } from "../shared/schema.js";
import logger from "./logger.js";
import pRetry from "p-retry";

// Validation types
export interface ValidationVerdict {
  decision: "PASS" | "WARN" | "FAIL";
  confidence: number;
  checks: {
    evidenceQuality: { passed: boolean; score: number; issue?: string };
    contentCoherence: { passed: boolean; score: number; issue?: string };
    groundingStrength: { passed: boolean; score: number; issue?: string };
  };
  weakQuestions: number[];
  recommendation: "ACCEPT" | "PARTIAL_REGENERATE" | "FULL_RETRY" | "REQUEST_RECAPTURE";
  reasoning: string;
}

export interface ValidationResult {
  decision: "ACCEPT" | "RETRY" | "RECAPTURE";
  confidence: number;
  verdicts: ValidationVerdict[];
  weakQuestions: number[];
  reasoning: string;
}

// Lazy initialization
let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// Validation thresholds
const THRESHOLDS = {
  PASS: { minConfidence: 0.75, maxWeakQuestions: 2 },
  WARN: { minConfidence: 0.6, maxWeakQuestions: 4 },
  FAIL: { minConfidence: 0.5, maxWeakQuestions: 6 },
};

export class ValidationService {
  
  async validateContent(
    lesson: Lesson,
    questions: Question[]
  ): Promise<ValidationResult> {
    
    logger.info("Starting content validation", {
      questionCount: questions.length,
      hasExtractedText: !!lesson.extractedText,
      lessonConfidence: lesson.confidence
    });
    
    // Skip validation if no extractedText (backward compatibility)
    if (!lesson.extractedText || lesson.extractedText.length === 0) {
      logger.warn("No extractedText - skipping validation");
      return {
        decision: "ACCEPT",
        confidence: lesson.confidence || 0.7,
        verdicts: [],
        weakQuestions: [],
        reasoning: "No extracted text available - accepting with caution"
      };
    }
    
    // Run both validators in parallel
    const [v1, v2] = await Promise.all([
      pRetry(() => this.validateWithGPT4oMini(lesson, questions), { retries: 2 }),
      pRetry(() => this.validateWithClaudeHaiku(lesson, questions), { retries: 2 }),
    ]);
    
    return this.makeDecision([v1, v2]);
  }
  
  private async validateWithGPT4oMini(
    lesson: Lesson,
    questions: Question[]
  ): Promise<ValidationVerdict> {
    
    const prompt = this.buildValidationPrompt(lesson, questions);
    
    try {
      const openai = getOpenAI();
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a grounding validator. Check if questions are supported by source text."
          },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });
      
      const result = JSON.parse(response.choices[0].message.content || "{}");
      logger.debug("GPT-4o-mini validation result", { result });
      
      return this.parseVerdict(result, "gpt-4o-mini");
      
    } catch (error) {
      logger.error("GPT-4o-mini validation failed", { error });
      return {
        decision: "WARN",
        confidence: 0.5,
        checks: {
          evidenceQuality: { passed: false, score: 0.5, issue: "Validation failed" },
          contentCoherence: { passed: false, score: 0.5 },
          groundingStrength: { passed: false, score: 0.5 },
        },
        weakQuestions: [],
        recommendation: "ACCEPT",
        reasoning: "Validator error - accepting with low confidence"
      };
    }
  }
  
  private async validateWithClaudeHaiku(
    lesson: Lesson,
    questions: Question[]
  ): Promise<ValidationVerdict> {
    
    const prompt = this.buildValidationPrompt(lesson, questions);
    
    try {
      const anthropic = getAnthropic();
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });
      
      const text = response.content[0].type === "text" 
        ? response.content[0].text 
        : "{}";
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      
      logger.debug("Claude Haiku validation result", { result });
      
      return this.parseVerdict(result, "claude-haiku");
      
    } catch (error) {
      logger.error("Claude Haiku validation failed", { error });
      return {
        decision: "WARN",
        confidence: 0.5,
        checks: {
          evidenceQuality: { passed: false, score: 0.5, issue: "Validation failed" },
          contentCoherence: { passed: false, score: 0.5 },
          groundingStrength: { passed: false, score: 0.5 },
        },
        weakQuestions: [],
        recommendation: "ACCEPT",
        reasoning: "Validator error - accepting with low confidence"
      };
    }
  }
  
  private buildValidationPrompt(lesson: Lesson, questions: Question[]): string {
    const sampleQuestions = questions.slice(0, 3).map((q, i) => {
      const evidence = (q as any).evidence;
      return {
        id: i,
        question: q.question,
        evidence: evidence || { text: "NO EVIDENCE", confidence: 0 }
      };
    });
    
    return `
You are a grounding validator. Your job is to check if generated questions are properly grounded in source material.

SOURCE TEXT (from ${lesson.extractedText?.length || 0} pages):
${lesson.extractedText?.slice(0, 3).join('\n---PAGE BREAK---\n') || "No text"}

QUESTIONS TO VALIDATE (first 3 of ${questions.length}):
${JSON.stringify(sampleQuestions, null, 2)}

VALIDATION TASK:
1. Does each question's evidence.text actually appear in the SOURCE TEXT?
2. Is the question logically derivable from that evidence?
3. Does the evidence support the answer?

Return JSON:
{
  "overallConfidence": 0.0-1.0,
  "checks": {
    "evidenceQuality": { "passed": true/false, "score": 0.0-1.0, "issue": "optional" },
    "contentCoherence": { "passed": true/false, "score": 0.0-1.0 },
    "groundingStrength": { "passed": true/false, "score": 0.0-1.0 }
  },
  "weakQuestions": [0, 2],
  "recommendation": "ACCEPT" | "PARTIAL_REGENERATE" | "FULL_RETRY" | "REQUEST_RECAPTURE",
  "reasoning": "Brief explanation"
}
`;
  }
  
  private parseVerdict(result: any, model: string): ValidationVerdict {
    const confidence = result.overallConfidence || 0.5;
    const checks = result.checks || {};
    const weakQuestions = result.weakQuestions || [];
    
    let decision: "PASS" | "WARN" | "FAIL" = "WARN";
    if (confidence >= THRESHOLDS.PASS.minConfidence && weakQuestions.length <= THRESHOLDS.PASS.maxWeakQuestions) {
      decision = "PASS";
    } else if (confidence < THRESHOLDS.FAIL.minConfidence || weakQuestions.length > THRESHOLDS.FAIL.maxWeakQuestions) {
      decision = "FAIL";
    }
    
    return {
      decision,
      confidence,
      checks: {
        evidenceQuality: checks.evidenceQuality || { passed: false, score: 0.5 },
        contentCoherence: checks.contentCoherence || { passed: false, score: 0.5 },
        groundingStrength: checks.groundingStrength || { passed: false, score: 0.5 },
      },
      weakQuestions,
      recommendation: result.recommendation || "ACCEPT",
      reasoning: result.reasoning || `${model} validation`
    };
  }
  
  private makeDecision(verdicts: ValidationVerdict[]): ValidationResult {
    const avgConfidence = verdicts.reduce((sum, v) => sum + v.confidence, 0) / verdicts.length;
    
    const passCount = verdicts.filter(v => v.decision === "PASS").length;
    const failCount = verdicts.filter(v => v.decision === "FAIL").length;
    
    const allWeakQuestions = new Set<number>();
    verdicts.forEach(v => v.weakQuestions.forEach(q => allWeakQuestions.add(q)));
    
    let decision: "ACCEPT" | "RETRY" | "RECAPTURE" = "ACCEPT";
    let reasoning = "";
    
    if (passCount >= 2) {
      decision = "ACCEPT";
      reasoning = "Both validators passed";
    } else if (failCount >= 2) {
      if (avgConfidence < 0.4) {
        decision = "RECAPTURE";
        reasoning = "Both validators failed with low confidence - images may be unclear";
      } else {
        decision = "RETRY";
        reasoning = "Both validators failed - attempting regeneration";
      }
    } else {
      if (avgConfidence >= 0.65) {
        decision = "ACCEPT";
        reasoning = "Mixed results but acceptable confidence";
      } else if (avgConfidence >= 0.5) {
        decision = "RETRY";
        reasoning = "Mixed results with moderate confidence - will retry";
      } else {
        decision = "RECAPTURE";
        reasoning = "Low confidence - images may need recapture";
      }
    }
    
    logger.info("Validation decision", { 
      decision, 
      avgConfidence, 
      passCount, 
      failCount,
      weakQuestions: Array.from(allWeakQuestions)
    });
    
    return {
      decision,
      confidence: avgConfidence,
      verdicts,
      weakQuestions: Array.from(allWeakQuestions),
      reasoning
    };
  }
}

export const validationService = new ValidationService();

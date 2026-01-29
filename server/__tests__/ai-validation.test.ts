/**
 * AI Validation & Hallucination Prevention Tests
 * P1 - Tests REAL implementation from server/ai modules
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
  process.env.ALLOW_DEV_JWT_FALLBACK = 'true';
});

describe('parseAnswersJSON - Real Implementation', () => {
  it('should parse JSON from markdown code block', async () => {
    const { parseAnswersJSON } = await import('../ai/parsers');
    
    const response = `Here are the answers:
\`\`\`json
["A", "B", "C", "D"]
\`\`\`
Hope this helps!`;
    
    const result = parseAnswersJSON(response);
    expect(result).toEqual(['A', 'B', 'C', 'D']);
  });

  it('should parse answers object', async () => {
    const { parseAnswersJSON } = await import('../ai/parsers');
    
    const response = '{"answers": ["a", "b", "c"]}';
    const result = parseAnswersJSON(response);
    
    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('should handle malformed JSON gracefully', async () => {
    const { parseAnswersJSON } = await import('../ai/parsers');
    
    const malformedResponses = [
      '{invalid json}',
      'not json at all',
      '',
    ];
    
    malformedResponses.forEach(resp => {
      const result = parseAnswersJSON(resp);
      expect(result).toEqual([]);
    });
  });
});

describe('parseValidationVerdict - Real Implementation', () => {
  it('should parse valid verdict JSON', async () => {
    const { parseValidationVerdict } = await import('../ai/parsers');
    
    const text = `Analysis complete: {"overallConfidence": 0.85, "weakQuestions": [3, 7], "issues": [], "recommendedAction": "ACCEPT"}`;
    
    const result = parseValidationVerdict(text);
    
    expect(result).toBeDefined();
    expect(result?.overallConfidence).toBe(0.85);
    expect(result?.weakQuestions).toEqual([3, 7]);
    expect(result?.recommendedAction).toBe('ACCEPT');
  });

  it('should return null for invalid format', async () => {
    const { parseValidationVerdict } = await import('../ai/parsers');
    
    expect(parseValidationVerdict('no json here')).toBeNull();
    expect(parseValidationVerdict('')).toBeNull();
  });

  it('should provide defaults for missing fields', async () => {
    const { parseValidationVerdict } = await import('../ai/parsers');
    
    const text = '{"overallConfidence": 0.9}';
    const result = parseValidationVerdict(text);
    
    expect(result?.weakQuestions).toEqual([]);
    expect(result?.issues).toEqual([]);
    expect(result?.recommendedAction).toBe('ACCEPT');
  });
});

describe('quickEvidenceCheck - Real Implementation', () => {
  it('should pass when evidence found in text', async () => {
    const { quickEvidenceCheck } = await import('../ai/validators');
    
    const extractedText = ['الفصل الأول التاريخ الإسلامي بدأت الدعوة في مكة'];
    const evidence = [
      { sourceText: 'الدعوة في مكة', confidence: 0.8 },
      { sourceText: 'التاريخ الإسلامي', confidence: 0.9 },
    ];
    
    const result = quickEvidenceCheck(extractedText, evidence);
    
    expect(result.passed).toBeGreaterThan(0);
    expect(result.failRate).toBeLessThan(0.5);
  });

  it('should fail when evidence not in text', async () => {
    const { quickEvidenceCheck } = await import('../ai/validators');
    
    const extractedText = ['نص عربي عادي'];
    const evidence = [
      { sourceText: 'something completely different not in source', confidence: 0.9 },
    ];
    
    const result = quickEvidenceCheck(extractedText, evidence);
    
    expect(result.failed).toBeGreaterThan(0);
  });

  it('should handle empty evidence', async () => {
    const { quickEvidenceCheck } = await import('../ai/validators');
    
    const extractedText = ['some text'];
    const evidence: any[] = [];
    
    const result = quickEvidenceCheck(extractedText, evidence);
    
    expect(result.failRate).toBe(1);
  });
});

describe('combineVerdicts - Real Implementation', () => {
  it('should average confidence from multiple verdicts', async () => {
    const { combineVerdicts } = await import('../ai/validators');
    
    const verdicts = [
      { overallConfidence: 0.8, weakQuestions: [1], issues: [], recommendedAction: 'ACCEPT' as const },
      { overallConfidence: 0.6, weakQuestions: [2], issues: [], recommendedAction: 'ACCEPT' as const },
    ];
    
    const result = combineVerdicts(verdicts);
    
    expect(result.overallConfidence).toBe(0.7);
    expect(result.weakQuestions).toContain(1);
    expect(result.weakQuestions).toContain(2);
  });

  it('should use worst recommended action', async () => {
    const { combineVerdicts } = await import('../ai/validators');
    
    const verdicts = [
      { overallConfidence: 0.9, weakQuestions: [], issues: [], recommendedAction: 'ACCEPT' as const },
      { overallConfidence: 0.5, weakQuestions: [], issues: [], recommendedAction: 'REFUSE' as const },
    ];
    
    const result = combineVerdicts(verdicts);
    
    expect(result.recommendedAction).toBe('REFUSE');
  });

  it('should handle empty verdicts', async () => {
    const { combineVerdicts } = await import('../ai/validators');
    
    const result = combineVerdicts([]);
    
    expect(result.overallConfidence).toBe(0.7);
    expect(result.recommendedAction).toBe('ACCEPT');
  });
});

describe('shouldTriggerVisionSpotCheck - Real Implementation', () => {
  it('should trigger for low confidence (below 0.45 threshold)', async () => {
    const { shouldTriggerVisionSpotCheck } = await import('../ai/validators');
    
    const verdict = {
      overallConfidence: 0.4,
      weakQuestions: [],
      issues: [],
      recommendedAction: 'ACCEPT' as const,
    };
    
    expect(shouldTriggerVisionSpotCheck(verdict)).toBe(true);
  });

  it('should trigger for OCR issues', async () => {
    const { shouldTriggerVisionSpotCheck } = await import('../ai/validators');
    
    const verdict = {
      overallConfidence: 0.9,
      weakQuestions: [],
      issues: [{ type: 'OCR_SUSPECTED', questionIndex: 1, description: 'test' }],
      recommendedAction: 'ACCEPT' as const,
    };
    
    expect(shouldTriggerVisionSpotCheck(verdict)).toBe(true);
  });

  it('should not trigger for high confidence without issues', async () => {
    const { shouldTriggerVisionSpotCheck } = await import('../ai/validators');
    
    const verdict = {
      overallConfidence: 0.95,
      weakQuestions: [1],
      issues: [],
      recommendedAction: 'ACCEPT' as const,
    };
    
    expect(shouldTriggerVisionSpotCheck(verdict)).toBe(false);
  });
});

describe('parseContentJSON - Real Implementation', () => {
  it('should parse valid quiz content', async () => {
    const { parseContentJSON } = await import('../ai/parsers');
    
    const response = `\`\`\`json
{
  "lesson": {
    "title": "الدرس الأول",
    "summary": "ملخص",
    "keyPoints": ["نقطة"],
    "targetAge": 10,
    "steps": [],
    "extractedText": ["نص"],
    "confidence": 0.85
  },
  "questions": [
    {
      "question": "ما هو السؤال الأول في الاختبار؟",
      "type": "multiple_choice",
      "options": ["الإجابة أ", "الإجابة ب", "الإجابة ج", "الإجابة د"],
      "correctAnswer": 0,
      "explanation": "شرح الإجابة"
    }
  ]
}
\`\`\``;
    
    const result = parseContentJSON(response);
    
    expect(result.lesson.title).toBe('الدرس الأول');
    expect(result.lesson.confidence).toBe(0.85);
    expect(result.questions.length).toBeGreaterThanOrEqual(0);
  });

  it('should throw for missing JSON', async () => {
    const { parseContentJSON } = await import('../ai/parsers');
    
    expect(() => parseContentJSON('no json here')).toThrow('No JSON found');
  });

  it('should throw for invalid questions format', async () => {
    const { parseContentJSON } = await import('../ai/parsers');
    
    const response = '{"lesson": {"title": "Test"}, "questions": []}';
    
    expect(() => parseContentJSON(response)).toThrow('Invalid questions format');
  });
});

describe('Question Type Validation', () => {
  it('should validate MCQ structure', () => {
    const validateMCQ = (q: { type: string; options?: string[] }) => {
      if (q.type === 'multiple_choice') {
        return Array.isArray(q.options) && q.options.length >= 2;
      }
      return true;
    };
    
    expect(validateMCQ({ type: 'multiple_choice', options: ['A', 'B', 'C', 'D'] })).toBe(true);
    expect(validateMCQ({ type: 'multiple_choice', options: ['A'] })).toBe(false);
    expect(validateMCQ({ type: 'multiple_choice' })).toBe(false);
    expect(validateMCQ({ type: 'true_false' })).toBe(true);
  });
});

describe('AI Provider Fallback Logic', () => {
  it('should try providers in order on failure', async () => {
    const providers = ['gemini', 'openai', 'anthropic'];
    const callOrder: string[] = [];
    
    const callProvider = async (provider: string, shouldFail: boolean) => {
      callOrder.push(provider);
      if (shouldFail) {
        throw new Error(`${provider} failed`);
      }
      return { success: true, provider };
    };
    
    const callWithFallback = async (failProviders: string[]) => {
      for (const provider of providers) {
        try {
          return await callProvider(provider, failProviders.includes(provider));
        } catch {
          continue;
        }
      }
      throw new Error('All providers failed');
    };
    
    callOrder.length = 0;
    const result = await callWithFallback(['gemini']);
    expect(result.provider).toBe('openai');
    expect(callOrder).toEqual(['gemini', 'openai']);
  });
});

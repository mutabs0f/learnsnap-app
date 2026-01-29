/**
 * Subject Detection System
 * Automatically detects if content is English language material
 * or other subjects (Science, Math, Social Studies, etc.)
 */

export interface DetectionResult {
  subject: 'english' | 'math' | 'science' | 'social_studies' | 'arabic' | 'islamic' | 'other';
  confidence: number;
  indicators: string[];
  recommendedPrompt: 'english_skills' | 'general_subjects';
}

export function detectSubject(content: string): DetectionResult {
  const indicators: string[] = [];
  let englishScore = 0;
  let mathScore = 0;
  let scienceScore = 0;
  
  // ENGLISH DETECTION PATTERNS
  const englishPatterns = {
    grammar_explicit: { pattern: /\b(grammar|قواعد)\b/i, weight: 3 },
    tense_markers: { pattern: /\b(present|past|future)\s*(simple|continuous|perfect)?\s*(tense)?\b/i, weight: 3 },
    vocabulary_explicit: { pattern: /\b(vocabulary|مفردات|word bank)\b/i, weight: 3 },
    verb_forms: { pattern: /\b(do|does|did)\s*\/\s*(do|does|did)\b/i, weight: 2 },
    pronoun_exercises: { pattern: /\b(mine|yours|his|hers|theirs)\b.*\b(mine|yours|his|hers|theirs)\b/i, weight: 2 },
    grammar_exercises: { pattern: /\b(fill in|complete|choose the correct|circle)\b/i, weight: 2 },
    true_false: { pattern: /\b(true|false)\b.*\b(true|false)\b/i, weight: 2 },
    fill_blank: { pattern: /_{2,}|\.{3,}|\(\s*\)/g, weight: 1 },
    adjective_lists: { pattern: /\b(strong|weak|kind|chatty|shy|lazy|helpful)\b/gi, weight: 1 }
  };
  
  for (const [name, config] of Object.entries(englishPatterns)) {
    if (config.pattern.test(content)) {
      englishScore += config.weight;
      indicators.push(`english:${name}`);
    }
  }
  
  // MATH DETECTION PATTERNS
  const mathPatterns = {
    equations: { pattern: /[=+\-×÷√∑∏∫]/, weight: 2 },
    numbers_heavy: { pattern: /\d+\s*[+\-×÷=]\s*\d+/, weight: 2 },
    math_terms_ar: { pattern: /\b(معادلة|جمع|طرح|ضرب|قسمة|كسر|نسبة|مساحة|محيط)\b/i, weight: 3 },
    geometry: { pattern: /\b(مثلث|مربع|دائرة|مستطيل|زاوية)\b/i, weight: 2 }
  };
  
  for (const [name, config] of Object.entries(mathPatterns)) {
    if (config.pattern.test(content)) {
      mathScore += config.weight;
      indicators.push(`math:${name}`);
    }
  }
  
  // SCIENCE DETECTION PATTERNS
  const sciencePatterns = {
    physics: { pattern: /\b(قوة|طاقة|حركة|سرعة|تسارع|كتلة|وزن|احتكاك)\b/i, weight: 2 },
    chemistry: { pattern: /\b(ذرة|جزيء|عنصر|مركب|تفاعل|حمض|قاعدة)\b/i, weight: 2 },
    biology: { pattern: /\b(خلية|نبات|حيوان|جهاز|عضو|تنفس|هضم)\b/i, weight: 2 }
  };
  
  for (const [name, config] of Object.entries(sciencePatterns)) {
    if (config.pattern.test(content)) {
      scienceScore += config.weight;
      indicators.push(`science:${name}`);
    }
  }
  
  // DETERMINE SUBJECT
  const scores = {
    english: englishScore,
    math: mathScore,
    science: scienceScore
  };
  
  const maxScore = Math.max(...Object.values(scores));
  
  // English takes priority if score >= 4
  if (englishScore >= 4) {
    return {
      subject: 'english',
      confidence: Math.min(englishScore / 12, 1),
      indicators,
      recommendedPrompt: 'english_skills'
    };
  }
  
  // Determine other subjects
  let detectedSubject: DetectionResult['subject'] = 'other';
  
  if (mathScore >= 4) detectedSubject = 'math';
  else if (scienceScore >= 4) detectedSubject = 'science';
  
  return {
    subject: detectedSubject,
    confidence: Math.min(maxScore / 8, 1),
    indicators,
    recommendedPrompt: 'general_subjects'
  };
}

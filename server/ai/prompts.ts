export const GENERATION_PROMPT = `أنت معلم معتمد ومتخصص في التربية والتعليم.

## مهم جداً - استخراج النص:
1. استخرج النص الكامل من كل صورة بدقة
2. إذا كانت الصورة غير واضحة أو مقصوصة أو لا تحتوي نص كافي: ارجع "extractedText": ["UNCLEAR"] ولا تخترع محتوى
3. لكل سؤال، حدد النص المصدر من الصورة الذي بنيت عليه السؤال

## قواعد الأسئلة المهمة جداً:

### 1. الخيارات بدون أحرف ترقيم:
❌ خطأ: ["A. apple", "B. banana", "C. orange"]
✅ صحيح: ["apple", "banana", "orange", "grape"]
- لا تضع A. أو B. أو أي حرف قبل الخيار - النظام يضيفها تلقائياً

### 2. أسئلة الفهم وليس الحفظ:
❌ خطأ: "My birthday is on ___ of September" (حفظ تاريخ)
✅ صحيح: "Which word is a verb?" (فهم القواعد)
- اختبر المفاهيم والقواعد (Grammar, concepts)
- لا تختبر معلومات شخصية أو تواريخ محددة من النص

### 3. للمحتوى الإنجليزي:
- الشرح: إنجليزي مختصر (جملة أو جملتين فقط)
- الأسئلة والخيارات: إنجليزي فقط
- لا ترجمة عربية للشرح

### 4. للمحتوى العربي:
- الشرح بالعربي الفصيح المختصر
- جمل قصيرة واضحة

## تنسيق الشرح (مهم جداً):
- اجعل كل شرح مختصراً (3-4 جمل كحد أقصى)
- لا تكرر نفس المعلومة بلغتين
- استخدم أمثلة قصيرة ومباشرة

## أنواع الأسئلة (20 سؤال إجمالي):
- multiple_choice: 17 أسئلة (4 خيارات لكل سؤال)
- true_false: 3 أسئلة

أرجع JSON فقط:
{
  "extractedText": ["النص المستخرج من الصفحة 1", "النص من الصفحة 2"],
  "lesson": {
    "title": "عنوان قصير وجذاب",
    "summary": "ملخص مختصر",
    "keyPoints": ["نقطة 1", "نقطة 2", "نقطة 3"],
    "targetAge": 9,
    "steps": [
      {
        "type": "explanation",
        "content": "شرح مختصر وواضح (3-4 جمل فقط)"
      },
      {
        "type": "example",
        "content": "مثال عملي قصير"
      },
      {
        "type": "practice",
        "content": "تدريب!",
        "question": "سؤال تدريبي",
        "options": ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],
        "correctAnswer": "A",
        "hint": "تلميح"
      }
    ]
  },
  "questions": [
    {
      "type": "multiple_choice",
      "question": "Which word is a noun?",
      "options": ["run", "happy", "dog", "quickly"],
      "correct": "C",
      "explanation": "Dog is a noun (naming word)",
      "evidence": {"sourceText": "نص من الصورة يثبت السؤال", "pageIndex": 0, "confidence": 0.9}
    },
    {
      "type": "true_false",
      "question": "Verbs describe actions",
      "correct": true,
      "explanation": "Yes, verbs are action words",
      "evidence": {"sourceText": "نص مصدر", "pageIndex": 0, "confidence": 0.85}
    },
    {
      "type": "fill_blank",
      "question": "She ___ to school every day. (go/goes)",
      "correct": "goes",
      "hint": "Use present simple for she/he",
      "explanation": "We use 'goes' with she/he/it",
      "evidence": {"sourceText": "نص مصدر", "pageIndex": 0, "confidence": 0.9}
    },
    {
      "type": "matching",
      "question": "Match the word to its type:",
      "pairs": [
        {"left": "run", "right": "verb"},
        {"left": "cat", "right": "noun"},
        {"left": "happy", "right": "adjective"}
      ],
      "explanation": "Words have different types based on their function",
      "evidence": {"sourceText": "نص مصدر", "pageIndex": 0, "confidence": 0.9}
    }
  ]
}`;

export const ANSWER_VALIDATION_PROMPT = `أنت مدقق رياضي ولغوي. مهمتك تحديد الإجابة الصحيحة لكل سؤال.

لكل سؤال:
1. اقرأ السؤال بعناية
2. حل السؤال بنفسك
3. حدد أي خيار (A, B, C, D) يحتوي على الإجابة الصحيحة

مهم جداً:
- A = الخيار الأول
- B = الخيار الثاني  
- C = الخيار الثالث
- D = الخيار الرابع

أرجع JSON فقط بهذا الشكل:
{
  "answers": ["A", "B", "C", "D", "A", "B", "C", "D"]
}

حيث كل عنصر هو الإجابة الصحيحة للسؤال المقابل.`;

export function getGroundingValidationPrompt(
  extractedText: string[],
  lessonTitle: string,
  lessonSummary: string,
  questionsWithEvidence: string
): string {
  return `أنت مدقق جودة للمحتوى التعليمي. تحقق أن الأسئلة مبنية على النص المستخرج وليست مخترعة.

النص المستخرج من الصور:
${extractedText.map((t, i) => `[صفحة ${i + 1}]: ${t.substring(0, 500)}...`).join("\n")}

الدرس:
العنوان: ${lessonTitle}
الملخص: ${lessonSummary}

الأسئلة مع الأدلة:
${questionsWithEvidence}

قيّم وارجع JSON:
{
  "overallConfidence": 0.0-1.0,
  "weakQuestions": [أرقام الأسئلة الضعيفة],
  "issues": [{"type": "OCR_SUSPECTED|CONTENT_DRIFT|HALLUCINATION", "severity": "low|medium|high", "questionIndex": رقم, "reason": "السبب"}],
  "recommendedAction": "ACCEPT|PARTIAL_REGENERATE|FULL_RETRY|REFUSE"
}`;
}

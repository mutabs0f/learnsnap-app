# LearnSnap - التوثيق التقني الكامل

## معلومات المشروع

| البند | القيمة |
|-------|--------|
| الاسم | LearnSnap |
| الوصف | تطبيق توليد اختبارات من صور الكتب بالذكاء الاصطناعي |
| اللغة الأساسية | العربية (RTL) |
| الإصدار الحالي | v4.8 |
| تاريخ آخر تحديث | يناير 2026 |

---

## 1. البنية التقنية

### 1.1 الواجهة الأمامية (Frontend)

```
التقنيات:
- React 18 + TypeScript
- Vite (bundler)
- Tailwind CSS + shadcn/ui
- Wouter (routing)
- TanStack Query (data fetching)
- React Hook Form + Zod (forms)
```

**الملفات الرئيسية:**

| الملف | الوظيفة |
|-------|---------|
| `client/src/App.tsx` | نقطة الدخول الرئيسية |
| `client/src/pages/landing.tsx` | الصفحة الرئيسية |
| `client/src/pages/auth.tsx` | تسجيل الدخول/التسجيل |
| `client/src/pages/upload.tsx` | رفع صور الكتاب |
| `client/src/pages/quiz.tsx` | عرض الاختبار التفاعلي |
| `client/src/lib/queryClient.ts` | إعدادات API |

### 1.2 الخادم (Backend)

```
التقنيات:
- Express.js + TypeScript
- Drizzle ORM
- PostgreSQL (Neon)
- Passport.js (auth)
- Winston (logging)
```

**الملفات الرئيسية:**

| الملف | الوظيفة |
|-------|---------|
| `server/index.ts` | نقطة البداية + إعدادات Express |
| `server/routes.ts` | نقاط API للاختبارات |
| `server/ai-service.ts` | توليد الأسئلة بالذكاء الاصطناعي |
| `server/storage.ts` | عمليات قاعدة البيانات |
| `server/auth-routes.ts` | نقاط المصادقة |
| `server/image-optimizer.ts` | ضغط وتحسين الصور |

### 1.3 قاعدة البيانات

```sql
-- الجداول الرئيسية
users              -- المستخدمين
quiz_sessions      -- جلسات الاختبارات
page_credits       -- رصيد الصفحات
transactions       -- المعاملات المالية
webhook_events     -- أحداث Webhook
email_verification_tokens  -- رموز التحقق
user_sessions      -- جلسات المستخدمين
```

---

## 2. نظام توليد الأسئلة (ai-service.ts)

### 2.1 الثوابت الرئيسية

```typescript
// تم تخفيف هذه القيم لزيادة نسبة النجاح
const EVIDENCE_FAIL_THRESHOLD = 0.6;      // 60% (كان 30%)
const CONFIDENCE_THRESHOLD = 0.45;        // 45% (كان 65%)
const WEAK_QUESTIONS_THRESHOLD = 0.4;     // 40% (كان 20%)
const MIN_ACCEPTABLE_QUESTIONS = 5;       // الحد الأدنى المقبول
```

### 2.2 المراحل الست للتحقق

#### المرحلة 1: تحسين الصور
```typescript
// server/image-optimizer.ts
smartOptimizeImages(images, 'standard')
```
- ضغط الصور للحجم المثالي (< 200KB)
- تقليل الأبعاد (max 1200px)
- تحسين الجودة للقراءة

#### المرحلة 2: استخراج النص وتوليد الأسئلة
```typescript
// Gemini 1.5 Flash Vision
generateWithGeminiExtended(processedImages)
```
- قراءة النص العربي من الصور
- توليد 20 سؤال متنوع
- ربط كل سؤال بالنص المصدر (evidence)

#### المرحلة 3: فحص الأدلة السريع
```typescript
quickEvidenceCheck(extractedText, questionEvidence)
```
- التحقق من وجود النص المصدر لكل سؤال
- حساب نسبة الفشل
- الفشل إذا تجاوزت 60%

#### المرحلة 4: التحقق المزدوج (نصي)
```typescript
validateGroundingConsensusTextOnly(extendedContent)
```
- OpenAI GPT-4o-mini
- Claude 3 Haiku
- تحديد الأسئلة الضعيفة

#### المرحلة 5: فحص الرؤية الانتقائي
```typescript
conditionalVisionSpotCheck(images, extractedText, verdict)
```
- يعمل فقط عند انخفاض الثقة
- تحقق بصري إضافي

#### المرحلة 6: التحقق من الإجابات
```typescript
validateAnswersWithConsensus(content)
```
- توافق 3 نماذج على الإجابة الصحيحة
- تصحيح الإجابات الخاطئة

### 2.3 نظام الاسترجاع (جديد)

```typescript
// إذا بقي أقل من 5 أسئلة بعد الفلترة
if (content.questions.length < MIN_ACCEPTABLE_QUESTIONS) {
  // استخدام الأسئلة الأصلية بدلاً من الفشل
  if (extendedContent.questions.length >= MIN_ACCEPTABLE_QUESTIONS) {
    content.questions = extendedContent.questions.slice(0, 20);
  }
}
```

---

## 3. نظام المصادقة

### 3.1 Email/Password
```typescript
// server/auth-routes.ts
POST /api/auth/register  // تسجيل جديد
POST /api/auth/login     // تسجيل دخول
POST /api/auth/logout    // تسجيل خروج
```

### 3.2 Google OAuth
```typescript
GET /api/auth/google          // بدء OAuth
GET /api/auth/google/callback // معالجة الرد
```

### 3.3 إدارة الجلسات
- مدة الجلسة: 30 يوم
- تخزين في قاعدة البيانات (user_sessions)
- JWT tokens للتحقق

---

## 4. نظام الدفع (LemonSqueezy)

### 4.1 الإعدادات
```typescript
// server/lemonsqueezy-routes.ts
const PACKAGES = {
  '5_pages': { pages: 5, price: 5 },
  '15_pages': { pages: 15, price: 12 },
  '30_pages': { pages: 30, price: 20 },
};
```

### 4.2 نقاط API
```typescript
POST /api/payment/create-checkout  // إنشاء رابط دفع
POST /api/webhooks/lemonsqueezy    // معالجة Webhook
```

### 4.3 نظام الرصيد
```typescript
// Early Adopter: أول 30 مستخدم = 50 صفحة مجاناً
// البقية: 2 صفحة مجاناً
const EARLY_ADOPTER_LIMIT = 30;
const EARLY_ADOPTER_FREE_PAGES = 50;
const DEFAULT_FREE_PAGES = 2;
```

---

## 5. الأمان

### 5.1 حماية API
```typescript
// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100 // 100 طلب
});

// CSRF Protection
app.use(csrf());

// Helmet Security Headers
app.use(helmet());
```

### 5.2 التحقق من الإدخال
```typescript
// Zod Schemas
const createQuizSchema = z.object({
  images: z.array(z.string()).min(1).max(20),
  deviceId: z.string(),
});
```

---

## 6. التسجيل والمراقبة

### 6.1 Winston Logger
```typescript
// server/logger.ts
logger.info('Quiz generation complete', {
  lessonTitle: content.lesson.title,
  questionCount: content.questions.length,
  duration: Date.now() - startTime,
});
```

### 6.2 مستويات السجلات
```
error   - أخطاء حرجة
warn    - تحذيرات
info    - معلومات عامة
debug   - تفاصيل للتطوير
```

---

## 7. النشر على Railway

### 7.1 ملف railway.json
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 300
  }
}
```

### 7.2 المتغيرات المطلوبة
```
DATABASE_URL          # PostgreSQL connection
GEMINI_API_KEY        # Google AI
OPENAI_API_KEY        # OpenAI
ANTHROPIC_API_KEY     # Anthropic Claude
SESSION_SECRET        # Session encryption
ADMIN_PASSWORD        # Admin panel
LEMONSQUEEZY_API_KEY  # Payments
```

---

## 8. المشاكل الشائعة والحلول

### 8.1 "فشل تحليل الصورة"
**السبب:** الفلاتر صارمة جداً وتحذف أسئلة كثيرة
**الحل:** تم تخفيف الثوابت في v4.8

### 8.2 أقل من 20 سؤال
**السبب:** الفلترة العدوانية
**الحل:** نظام الاسترجاع يستخدم الأسئلة الأصلية

### 8.3 Timeout على صور كثيرة
**السبب:** الحد الزمني قصير
**الحل:** زيادة timeout إلى 10 دقائق

### 8.4 الرصيد لا يظهر
**السبب:** Credits على deviceId مختلف
**الحل:** sync-credits endpoint ينقل الرصيد

---

## 9. الاختبار

### 9.1 اختبار الصحة
```bash
curl https://your-app.railway.app/api/health
```

### 9.2 اختبار الاختبارات
1. رفع صورتين واضحتين
2. انتظار التحميل
3. التحقق من 20 سؤال

---

## 10. سجل التغييرات

### v4.8 (يناير 2026)
- تخفيف صرامة الفلاتر
- إضافة نظام الاسترجاع
- قبول الاختبارات بـ 5+ أسئلة

### v2.8.1 (ديسمبر 2025)
- 6 مراحل تحقق كاملة
- استقرار النظام

### v5.0 (ديسمبر 2025)
- FAST_QUIZ (ملغى)
- مشاكل في عدد الأسئلة

---

## 11. جهات الاتصال

للدعم التقني أو الاستفسارات، تواصل مع فريق التطوير.

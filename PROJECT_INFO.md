# LearnSnap - تطبيق توليد الاختبارات من صور الكتب

## نظرة عامة

LearnSnap هو تطبيق ويب عربي متخصص في تحويل صفحات الكتب المدرسية إلى اختبارات تفاعلية باستخدام الذكاء الاصطناعي. يدعم التطبيق رفع حتى 20 صفحة في المرة الواحدة وينتج 20 سؤالاً متنوعاً.

---

## التقنيات المستخدمة

### Frontend (الواجهة الأمامية)
| التقنية | الإصدار | الغرض |
|---------|---------|-------|
| React | 18.x | إطار العمل الأساسي |
| Vite | 5.x | أداة البناء والتطوير |
| TypeScript | 5.x | لغة البرمجة |
| Tailwind CSS | 3.x | تنسيق الواجهة |
| shadcn/ui | - | مكونات UI جاهزة |
| TanStack Query | 5.x | إدارة حالة الخادم |
| Wouter | - | التوجيه (Routing) |
| Framer Motion | - | الحركات والانتقالات |

### Backend (الخادم)
| التقنية | الإصدار | الغرض |
|---------|---------|-------|
| Node.js | 20.x | بيئة التشغيل |
| Express.js | 4.x | إطار عمل الخادم |
| TypeScript | 5.x | لغة البرمجة |
| Drizzle ORM | - | التعامل مع قاعدة البيانات |
| Zod | - | التحقق من البيانات |
| Passport.js | - | المصادقة |
| Winston | - | التسجيل (Logging) |

### Database (قاعدة البيانات)
| التقنية | الغرض |
|---------|-------|
| PostgreSQL | قاعدة البيانات الرئيسية |
| Neon | استضافة PostgreSQL سحابية |

### AI Services (خدمات الذكاء الاصطناعي)
| الخدمة | النموذج | الغرض |
|--------|---------|-------|
| Google Gemini | gemini-2.0-flash-exp | توليد الأسئلة (أساسي) |
| OpenAI | gpt-4o-mini | التحقق من الأسئلة |
| Anthropic Claude | claude-3-haiku | التحقق الإضافي |

### Payment (نظام الدفع)
| الخدمة | الغرض |
|--------|-------|
| Paylink | بوابة الدفع السعودية |
| طرق الدفع | mada, Visa, Mastercard, Apple Pay, STC Pay |

### Deployment (النشر)
| الخدمة | الغرض |
|--------|-------|
| Railway | استضافة التطبيق |
| GitHub | إدارة الكود المصدري |
| GitHub Actions | CI/CD |

---

## هيكل المشروع

```
LearnSnap/
├── client/                 # الواجهة الأمامية
│   ├── src/
│   │   ├── components/     # مكونات React
│   │   ├── pages/          # صفحات التطبيق
│   │   ├── hooks/          # Custom hooks
│   │   └── lib/            # مكتبات مساعدة
│   └── public/             # ملفات ثابتة
├── server/                 # الخادم
│   ├── index.ts            # نقطة الدخول
│   ├── routes.ts           # مسارات API
│   ├── auth-routes.ts      # مسارات المصادقة
│   ├── paylink-routes.ts   # مسارات الدفع
│   ├── ai-service.ts       # خدمة الذكاء الاصطناعي
│   ├── storage.ts          # واجهة التخزين
│   └── prompts/            # نصوص AI
├── shared/                 # كود مشترك
│   └── schema.ts           # مخطط قاعدة البيانات
├── script/                 # سكربتات
│   └── database-migration-v3.sql
└── e2e/                    # اختبارات E2E
```

---

## الميزات الرئيسية

### 1. توليد الاختبارات
- رفع حتى 20 صفحة من الكتاب
- توليد 20 سؤالاً (17 اختيار متعدد + 3 صح/خطأ)
- نظام تحقق 6 طبقات لمنع الهلوسة

### 2. المصادقة
- تسجيل بالبريد الإلكتروني
- تسجيل بحساب Google
- التحقق من البريد الإلكتروني
- جلسات تستمر 30 يوماً

### 3. نظام الأرصدة
- صفحات مجانية للمستخدمين الجدد
- 50 صفحة للمستخدمين الأوائل (Early Adopters)
- 2 صفحة للمستخدمين العاديين

### 4. نظام الدفع
- باقات متعددة (5, 15, 50, 100 صفحة)
- بوابة Paylink السعودية
- دعم Apple Pay, mada, Visa, Mastercard, STC Pay

---

## جداول قاعدة البيانات

| الجدول | الغرض |
|--------|-------|
| `users` | بيانات المستخدمين |
| `user_sessions` | جلسات المستخدمين |
| `email_verification_tokens` | رموز التحقق من البريد |
| `page_credits` | أرصدة الصفحات |
| `pending_payments` | الدفعات المعلقة |
| `transactions` | سجل المعاملات |
| `quiz_sessions` | جلسات الاختبارات |
| `webhook_events` | أحداث Webhook |

---

## المتغيرات البيئية المطلوبة

```env
# Database
DATABASE_URL=postgresql://...
NEON_DATABASE_URL=postgresql://...

# AI Services
GEMINI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...

# Authentication
SESSION_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Payment (Paylink)
PAYLINK_APP_ID=...
PAYLINK_SECRET_KEY=...
PAYLINK_ENVIRONMENT=production

# Email
RESEND_API_KEY=...

# Security
ENCRYPTION_KEY=...

# Optional
SENTRY_DSN=...
```

---

## الإصدار الحالي

**v2.9.1** - إصلاح التحقق من الدفع

### سجل التغييرات:
- v2.9.1: إصلاح مشكلة عدم إضافة الصفحات بعد الدفع
- v2.9.0: إضافة جدول pending_payments
- v4.7: إصلاحات الإنتاج الحرجة
- v4.6: مزامنة الأرصدة
- v4.5: إصلاح الأرصدة بعد تسجيل الدخول

---

## النشر على Railway

1. ارفع الكود إلى GitHub
2. اربط المستودع بـ Railway
3. أضف المتغيرات البيئية
4. Railway سينشر تلقائياً

---

## الاختبار

```bash
# اختبارات E2E
npm run test:e2e

# اختبارات الوحدات
npm run test
```

---

## الدعم

للمساعدة التقنية، تواصل عبر:
- البريد الإلكتروني: basem760@gmail.com

---

## الترخيص

جميع الحقوق محفوظة © 2025-2026 LearnSnap

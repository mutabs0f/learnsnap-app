# Product Requirements Document (PRD)

> **Product**: LearnSnap  
> **Version**: 2.9.26  
> **Last Updated**: January 8, 2026

## Problem Statement

Arabic students struggle to create effective study quizzes from their textbooks. Manual quiz creation is time-consuming, and existing tools don't support Arabic language well or understand Arabic educational content.

## Target Users

1. **Primary**: Arabic-speaking students (ages 12-25) studying from Arabic textbooks
2. **Secondary**: Parents helping children study
3. **Tertiary**: Teachers creating quick assessment materials

## Solution

LearnSnap converts photos of textbook pages into interactive Arabic quizzes using AI. Users upload up to 20 pages, and the system generates 20 diverse questions (multiple choice, true/false, fill-in-blank, matching).

## MVP Scope

### In Scope

1. **Guest Access**: 2 free quiz pages without registration
2. **User Registration**: Email/password and Google OAuth
3. **Credits System**: Pay-per-page model for quiz generation
4. **Quiz Generation**: AI-powered question generation from uploaded images
5. **Question Types**: 
   - Multiple Choice (اختر الإجابة الصحيحة)
   - True/False (صح أو خطأ)
   - Fill in the Blank (أكمل الفراغ)
   - Matching (وصّل)
6. **Mobile-First UI**: RTL Arabic interface with gamification elements
7. **Payment Integration**: Paylink gateway (mada, Visa, Mastercard, Apple Pay, STC Pay)

### Non-Goals / Out of Scope

- PDF upload (images only)
- Multi-language support beyond Arabic
- Collaborative study features
- Mobile native apps (web-only)
- Subscription model (pay-per-use only)
- Teacher/classroom management features
- Offline mode
- Quiz sharing between users
- Custom quiz templates
- Analytics dashboard for users

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Quiz Completion Rate | >70% | Quizzes started vs. completed |
| Question Accuracy | >85% | Questions correctly grounded in source text |
| Guest-to-Paid Conversion | >10% | Guests who purchase credits |
| Early Adopter Signup | 30 users | First 30 users with bonus pages |

## Key User Flows

### Flow 1: Guest Quiz

```
1. User lands on homepage
2. User uploads 1-2 textbook pages
3. System generates quiz (charges 1-2 free pages)
4. User completes quiz, sees results
5. Prompt to register for more pages
```

### Flow 2: Registration

```
1. User clicks "Sign Up"
2. Chooses: Email/Password OR Google OAuth
3. Email users: Receive verification email, click link
4. Google users: OAuth flow, auto-verified
5. If early adopter (first 30): Get 50 bonus pages
6. Else: Get 2 free pages
7. Guest credits (excess above 2) transferred to user account
```

### Flow 3: Credits Sync (Login on Different Device)

```
1. User logs in on new device
2. System checks guest credits on this device
3. Any excess credits (above 2 free) transferred to user_<id>
4. User sees their total credits balance
```

### Flow 4: Purchase Credits

```
1. User clicks "Buy Pages"
2. Selects package (e.g., 10 pages for X SAR)
3. Redirected to Paylink checkout
4. Completes payment
5. Webhook/verify confirms payment
6. Credits added to user_<id> (or deviceId for guests)
```

### Flow 5: Generate Quiz

```
1. User uploads 1-20 textbook pages
2. System validates images, counts pages
3. Checks if user has enough credits
4. If yes: Deduct credits, start AI generation
5. AI extracts text, generates 20 questions
6. 6-layer validation ensures accuracy
7. User sees quiz, completes it
8. Confetti on correct answers, XP awarded
```

## Technical Constraints

1. **AI Providers**: Gemini Flash (primary), GPT-4o mini (fallback), Claude Sonnet (final fallback)
2. **Max Images**: 20 pages per quiz
3. **Questions Generated**: 20 per quiz
4. **Session Expiry**: 24 hours
5. **User Session**: 30 days
6. **Rate Limits**: Implemented on auth and quiz endpoints

## Open Questions

1. Should we add PDF support in future versions?
2. What's the optimal pricing for page packages?
3. Should we implement teacher accounts separately?

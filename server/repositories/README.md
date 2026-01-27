# Repository Pattern - Incremental Adoption

## Overview
This directory contains modular repository implementations extracted from `storage.ts`.
These repositories are for **incremental adoption** - they provide a cleaner architecture
that can be adopted gradually without breaking existing code.

## Current Status
- **storage.ts** remains the primary implementation used by all routes
- Repositories here are **reference implementations** for future refactoring
- Routes should continue using `storage.*` methods for now

## Migration Strategy
1. Keep storage.ts as-is for stability
2. Gradually adopt repositories for new features
3. Eventually deprecate storage.ts in favor of repositories

## Repository Files
- `base.repository.ts` - Base interface and health check
- `user.repository.ts` - Users, sessions, verification tokens
- `quiz.repository.ts` - Quiz sessions, question reports
- `credits.repository.ts` - Page credits (simplified, use storage.ts for full logic)
- `payment.repository.ts` - Transactions, webhooks, pending payments

## Important Notes
- `credits.repository.ts` is a simplified version
- Full credit-owner logic (user_<ID> vs deviceId) remains in storage.ts
- Early adopter bonus logic also remains in storage.ts
- Do NOT replace storage.ts calls until repositories are fully validated

## Usage (Future)
```typescript
import { userRepository, quizRepository } from './repositories';

// Use repository methods
const user = await userRepository.getUserByEmail('test@example.com');
const session = await quizRepository.createQuizSession(data);
```

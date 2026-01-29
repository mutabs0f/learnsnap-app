# Contributing to LearnSnap

Thank you for your interest in contributing to LearnSnap! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and considerate in all interactions. We aim to maintain a welcoming and inclusive community.

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL (or use Neon serverless)
- Redis (optional, for caching)

### Local Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/learnsnap.git
   cd learnsnap
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. Set up the database:
   ```bash
   npm run db:push
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

## Development Guidelines

### Code Style

- Use TypeScript with strict mode
- Follow existing code patterns and conventions
- Use meaningful variable and function names
- Keep functions small and focused
- Add comments only when necessary to explain "why", not "what"

### TypeScript Standards

- **No `any` types** - Use proper typing
- **No type assertions** (`as`) unless absolutely necessary
- Use Zod for runtime validation
- Export types from `shared/schema.ts`

### File Organization

- Keep files under 500 lines
- Group related functionality in modules
- Use the established directory structure:
  - `client/` - React frontend
  - `server/` - Express backend
  - `shared/` - Shared types and schemas
  - `docs/` - Documentation

### Testing

- Write tests for new features
- Ensure all tests pass before submitting:
  ```bash
  npm run test
  ```
- Target 80%+ code coverage

### Commit Messages

Follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Example:
```
feat: add quiz retry functionality

- Allow users to retry failed questions
- Track retry attempts in database
- Update UI with retry button
```

## Pull Request Process

1. **Fork** the repository
2. Create a **feature branch**: `git checkout -b feat/your-feature`
3. Make your changes
4. Run tests: `npm run test`
5. Run type check: `npx tsc --noEmit`
6. Commit with a descriptive message
7. Push to your fork
8. Create a **Pull Request**

### PR Checklist

- [ ] Tests added/updated
- [ ] TypeScript types are correct (no `any`)
- [ ] Code follows existing patterns
- [ ] Documentation updated if needed
- [ ] All CI checks pass

## Reporting Issues

When reporting issues, please include:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Browser/environment details
- Screenshots if applicable

## Security Vulnerabilities

**Do not report security vulnerabilities in public issues.**

Please see [SECURITY.md](SECURITY.md) for instructions on reporting security issues.

## Questions?

If you have questions, feel free to:
- Open a discussion on GitHub
- Review existing documentation in `/docs`

Thank you for contributing to LearnSnap!

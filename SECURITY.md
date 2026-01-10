# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 3.3.x   | :white_check_mark: |
| 3.2.x   | :white_check_mark: |
| 3.1.x   | :x:                |
| < 3.1   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please report it by emailing:
- **Security Contact**: security@learnsnap.app

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix/Mitigation**: Within 30 days (critical issues prioritized)

## Security Measures

LearnSnap implements the following security measures:

### Authentication & Authorization
- Session-based authentication with JWT tokens
- Google OAuth 2.0 integration
- Rate limiting on auth endpoints (10 req/min for auth, 30 req/min for API)
- Secure password hashing with bcrypt

### Data Protection
- All data encrypted in transit (TLS/HTTPS)
- Secrets stored in environment variables (never in code)
- Database queries via Drizzle ORM (SQL injection prevention)
- Input validation with Zod schemas

### API Security
- CSRF protection on all mutating endpoints
- Content Security Policy (CSP) headers
- Webhook signature verification (timing-safe comparison)
- Request ID tracking for audit

### Infrastructure
- Rate limiting per IP/device
- Graceful error handling (no stack traces in production)
- Audit logging for admin actions

## Security Best Practices for Contributors

1. **Never commit secrets** - Use `.env` files
2. **Validate all input** - Use Zod schemas
3. **Use parameterized queries** - Always use Drizzle ORM
4. **Sanitize output** - Prevent XSS
5. **Check authorization** - Verify user permissions

## Acknowledgments

We appreciate security researchers who help keep LearnSnap safe. Responsible disclosure will be acknowledged in our release notes.

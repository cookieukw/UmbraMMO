# UMBRA ONLINE - Security Measures

## Overview
This document outlines the security measures implemented in Umbra Online to protect against common vulnerabilities.

---

## Server-Side Security

### 1. Input Validation & Sanitization
- **All incoming messages** are validated for correct type and structure
- **String inputs** are sanitized to remove:
  - HTML tags (prevents XSS)
  - Control characters
  - Excessive whitespace
- **Length limits** enforced on all string inputs:
  - Player names: 16 characters max
  - Other strings: Context-dependent limits

### 2. Rate Limiting
- **Per-player message rate limiting**: 10 messages per second max
- **Connection limit per IP**: 5 concurrent connections max
- Prevents DoS attacks and spam

### 3. Message Size Limits
- **Maximum payload size**: 4KB per WebSocket message
- Prevents memory exhaustion attacks

### 4. Origin Validation (Production)
- WebSocket connections validated against allowed origins
- Prevents cross-site WebSocket hijacking
- Allowed origins: `umbra.labzts.fun`, `labzts.fun`

### 5. Secure Player IDs
- Player IDs are **cryptographically random** (16 hex characters)
- Prevents ID enumeration attacks

### 6. Error Handling
- All message parsing in try/catch blocks
- Errors logged but don't expose internal details to clients
- Graceful shutdown on SIGTERM

### 7. Production Logging
- Verbose logging disabled in production
- Only warnings and errors logged
- Prevents information leakage

---

## Client-Side Security

### 1. Debug Mode
- Console logging only enabled on localhost
- Production builds don't expose message details in console

### 2. Automatic Protocol Detection
- Client automatically uses `wss://` for HTTPS sites
- Ensures WebSocket connections are encrypted when main site is

---

## Network Security (Infrastructure)

### 1. Nginx Reverse Proxy
- Client never directly connects to Node.js server
- Nginx handles:
  - SSL termination
  - WebSocket upgrade headers
  - Static file serving

### 2. HTTPS (Recommended)
- Enable Let's Encrypt SSL for encrypted connections
- Commands:
  ```bash
  sudo apt install certbot python3-certbot-nginx
  sudo certbot --nginx -d umbra.labzts.fun
  ```

### 3. Firewall (Recommended)
- Only expose ports 80, 443, 22 (SSH)
- Block direct access to port 3000
  ```bash
  sudo ufw allow 80
  sudo ufw allow 443
  sudo ufw allow 22
  sudo ufw enable
  ```

---

## Security Configuration

### Environment Variables (.env)
```env
NODE_ENV=production
PORT=3000
DOMAIN=labzts.fun
ALLOWED_ORIGINS=https://umbra.labzts.fun,http://umbra.labzts.fun
MAX_CONNECTIONS_PER_IP=5
RATE_LIMIT_MESSAGES=10
RATE_LIMIT_WINDOW_MS=1000
```

---

## Future Security Considerations

As development progresses, implement:

### Phase 3+ (Player Accounts)
- [ ] Password hashing (bcrypt/argon2)
- [ ] Session tokens with expiration
- [ ] Account lockout after failed attempts
- [ ] Email verification

### Phase 5+ (Database)
- [ ] Parameterized queries (prevent SQL injection)
- [ ] Database connection pooling
- [ ] Encrypted database connections

### Phase 6+ (Combat/Economy)
- [ ] Server-authoritative game logic
- [ ] Anti-cheat validation
- [ ] Transaction logging for disputes

### Phase 19+ (Trading)
- [ ] Trade confirmation windows
- [ ] Escrow system for marketplace
- [ ] Rate limiting on transactions

---

## Security Testing Checklist

Before major releases, verify:

- [ ] XSS: Try `<script>alert('xss')</script>` in player name
- [ ] Rate Limiting: Send 100 messages rapidly
- [ ] Large Payload: Send 1MB message
- [ ] Invalid JSON: Send malformed data
- [ ] Origin Bypass: Connect from different domain
- [ ] ID Enumeration: Try to guess player IDs
- [ ] SQL Injection: (When DB added) Test inputs with SQL

---

*Last Updated: January 12, 2026*

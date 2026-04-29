# Security Audit Report - Task Planner Application
**Date:** 2026-04-29  
**Auditor:** Security Review Agent  
**Scope:** /c/Users/morty/task_planner/

---

## Executive Summary

This security audit identified **12 security vulnerabilities** across the task planner application, including **4 CRITICAL**, **5 HIGH**, and **3 MEDIUM** severity issues. The application has significant security gaps in authentication, authorization, data protection, and OWASP Top 10 compliance.

**Critical Findings:**
1. Hardcoded JWT secret key in production code
2. Insecure PIN code storage and validation (default PIN "1234")
3. Missing WebSocket authentication
4. Overly permissive CORS configuration allowing all origins

---

## 1. Authentication & Authorization

### 🔴 CRITICAL: Hardcoded JWT Secret Key
**File:** `/c/Users/morty/task_planner/backend/auth.py:13`

**Issue:**
```python
SECRET_KEY = "your-secret-key-change-this-in-production"
```

The JWT secret key is hardcoded in the source code with a placeholder value. This is a critical security vulnerability.

**Exploitation Scenario:**
1. Attacker obtains source code (GitHub, leaked repo, etc.)
2. Attacker can forge valid JWT tokens for any user
3. Attacker gains full access to any account including admin accounts
4. Complete authentication bypass

**Impact:** Complete authentication bypass, unauthorized access to all user accounts

**Recommended Fix:**
```python
import os

SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("JWT_SECRET_KEY environment variable must be set")
```

Add to `.env`:
```
JWT_SECRET_KEY=<generate-with-secrets.token_urlsafe(64)>
```

---

### 🔴 CRITICAL: Insecure PIN Code System
**File:** `/c/Users/morty/task_planner/backend/main.py:24-62`

**Issues:**
1. Default PIN code is "1234" (line 45)
2. PIN code stored in plaintext in `.pin_code` file
3. No rate limiting on PIN verification endpoint
4. PIN code check happens before user authentication (site-wide access gate)

**Exploitation Scenario:**
1. Attacker attempts brute force on `/auth/check-pin` endpoint
2. No rate limiting allows unlimited attempts
3. Default PIN "1234" grants access if not changed
4. Attacker receives 30-day access token
5. Attacker can then register accounts and access the system

**Impact:** Unauthorized site access, brute force vulnerability

**Recommended Fixes:**
1. Remove site-wide PIN system or implement proper rate limiting
2. Hash PIN codes using bcrypt before storage
3. Add rate limiting (max 5 attempts per IP per hour)
4. Force PIN change on first deployment
5. Implement account lockout after failed attempts

```python
from fastapi_limiter.depends import RateLimiter

@app.post("/auth/check-pin", dependencies=[Depends(RateLimiter(times=5, hours=1))])
def check_pin(pin_data: schemas.PinCodeCheck):
    # Hash comparison instead of plaintext
    if not bcrypt.checkpw(pin_data.pin_code.encode(), HASHED_PIN.encode()):
        raise HTTPException(status_code=401, detail="Invalid pin code")
    # ... rest of code
```

---

### 🔴 CRITICAL: Missing WebSocket Authentication
**File:** `/c/Users/morty/task_planner/backend/main.py:763-772`

**Issue:**
```python
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    # No authentication check!
```

WebSocket endpoint has no authentication. Anyone can connect and receive real-time updates about all tasks, comments, and user activity.

**Exploitation Scenario:**
1. Attacker connects to `ws://target.com/ws`
2. Receives all broadcast messages containing:
   - Task details (titles, descriptions, assignments)
   - User information (usernames, IDs)
   - Comments and activity
   - Timer sessions
3. Information disclosure of all application activity

**Impact:** Complete information disclosure, privacy violation

**Recommended Fix:**
```python
async def get_websocket_user(websocket: WebSocket, db: Session = Depends(get_db)):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        raise HTTPException(status_code=401, detail="Missing token")
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user:
            await websocket.close(code=1008)
            raise HTTPException(status_code=401, detail="Invalid token")
        return user
    except JWTError:
        await websocket.close(code=1008)
        raise HTTPException(status_code=401, detail="Invalid token")

@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    current_user: models.User = Depends(get_websocket_user)
):
    await manager.connect(websocket)
    # ... rest of code
```

---

### 🟠 HIGH: Weak Access Token Storage
**File:** `/c/Users/morty/task_planner/backend/main.py:65`

**Issue:**
```python
valid_access_tokens = {}  # {token: expiry_time}
```

Access tokens stored in memory dictionary. Tokens are lost on server restart, and there's no distributed session management for horizontal scaling.

**Impact:** Session management issues, scalability problems

**Recommended Fix:**
Use Redis for token storage:
```python
import redis
redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)

def store_access_token(token: str, expiry: datetime):
    redis_client.setex(token, timedelta(days=30), "valid")

def verify_access_token(token: str) -> bool:
    return redis_client.exists(token) == 1
```

---

### 🟠 HIGH: Missing Authorization Checks
**File:** `/c/Users/morty/task_planner/backend/main.py:363-448`

**Issues:**
1. No ownership verification on task operations
2. Any authenticated user can delete any task (line 435-448)
3. Any authenticated user can update any task (line 416-433)
4. No check if user has permission to assign tasks

**Exploitation Scenario:**
1. User A creates a task
2. User B (malicious) can delete User A's task
3. User B can modify task details, assignments, status
4. Data integrity compromised

**Impact:** Unauthorized data modification, data loss

**Recommended Fix:**
```python
def verify_task_access(task: models.Task, user: models.User, require_owner: bool = False):
    if require_owner and task.created_by != user.id:
        raise HTTPException(status_code=403, detail="Only task creator can perform this action")
    
    if task.created_by != user.id and task.assigned_to != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

@app.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_task = crud.get_task(db, task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    verify_task_access(db_task, current_user, require_owner=True)
    
    success = crud.delete_task(db, task_id)
    # ... rest of code
```

---

### 🟡 MEDIUM: Admin Privilege Escalation Risk
**File:** `/c/Users/morty/task_planner/backend/main.py:340-359`

**Issue:**
Admin toggle endpoint allows admins to change other users' admin status, but the check preventing self-modification can be bypassed by having two admin accounts collude.

**Impact:** Privilege escalation

**Recommended Fix:**
- Require super-admin role for admin management
- Implement audit logging for admin changes
- Add multi-factor authentication for admin operations

---

## 2. Input Validation

### 🟠 HIGH: Missing Input Sanitization
**Files:** Multiple endpoints

**Issues:**
1. No HTML sanitization on user inputs (task titles, descriptions, comments)
2. No length limits enforced on text fields
3. No validation of special characters

**Exploitation Scenario:**
1. Attacker creates task with title: `<script>alert('XSS')</script>`
2. If frontend renders without escaping, XSS executes
3. Attacker can steal session tokens, perform actions as victim

**Impact:** Cross-Site Scripting (XSS), data integrity issues

**Recommended Fix:**
```python
from bleach import clean

def sanitize_text(text: str, max_length: int = 1000) -> str:
    if not text:
        return ""
    
    # Remove HTML tags
    cleaned = clean(text, tags=[], strip=True)
    
    # Enforce length limit
    if len(cleaned) > max_length:
        raise ValueError(f"Text exceeds maximum length of {max_length}")
    
    return cleaned.strip()

# In crud.py
def create_task(db: Session, task: schemas.TaskCreate, user_id: str):
    if not task.title or not task.title.strip():
        raise ValueError("Task title is required")
    
    db_task = models.Task(
        title=sanitize_text(task.title, max_length=200),
        description=sanitize_text(task.description, max_length=5000) if task.description else None,
        # ... rest
    )
```

---

### 🟠 HIGH: SQL Injection Risk in Raw Queries
**File:** `/c/Users/morty/task_planner/backend/main.py:76-134`

**Issue:**
Migration code uses raw SQL with `text()` but doesn't use parameterized queries for the username:

```python
result = conn.execute(text("""
    UPDATE users
    SET is_admin = TRUE
    WHERE username = 'Viktor'
"""))
```

While this specific case is hardcoded, the pattern is dangerous and could be copied elsewhere.

**Impact:** Potential SQL injection if pattern is reused with user input

**Recommended Fix:**
Always use parameterized queries:
```python
result = conn.execute(
    text("UPDATE users SET is_admin = TRUE WHERE username = :username"),
    {"username": "Viktor"}
)
```

---

### 🟡 MEDIUM: Missing Email Validation
**File:** `/c/Users/morty/task_planner/backend/schemas.py:13`

**Issue:**
While `EmailStr` is used, there's no verification that the email actually belongs to the user (no email confirmation flow).

**Impact:** Account takeover via email spoofing, spam accounts

**Recommended Fix:**
Implement email verification:
1. Send confirmation email on registration
2. Mark account as unverified until email confirmed
3. Restrict unverified accounts from certain actions

---

## 3. Data Protection

### 🔴 CRITICAL: Sensitive Data in Logs
**File:** `/c/Users/morty/task_planner/backend/main.py:379-704`

**Issue:**
Multiple `print()` statements logging potentially sensitive data:

```python
print(f"Creating task: {task.dict()}")  # Line 379
print(f"Task validation error: {validation_error}")  # Line 489
print(f"WebSocket broadcast failed: {broadcast_error}")  # Line 432
```

These logs may contain sensitive information and are not properly structured.

**Impact:** Information disclosure through logs

**Recommended Fix:**
```python
import logging

logger = logging.getLogger(__name__)

# Configure logging to exclude sensitive fields
class SensitiveDataFilter(logging.Filter):
    def filter(self, record):
        # Redact sensitive fields
        if hasattr(record, 'msg'):
            record.msg = str(record.msg).replace('password', '[REDACTED]')
        return True

logger.addFilter(SensitiveDataFilter())

# Use structured logging
logger.info("Task created", extra={
    "task_id": db_task.id,
    "user_id": current_user.id,
    "action": "create_task"
})
```

---

### 🟠 HIGH: Password Storage
**File:** `/c/Users/morty/task_planner/backend/auth.py:27-28`

**Issue:**
While bcrypt is used (good!), there's no check for password strength requirements.

**Impact:** Weak passwords allowed

**Recommended Fix:**
```python
import re

def validate_password_strength(password: str):
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain lowercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain digit")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        raise ValueError("Password must contain special character")

def get_password_hash(password: str) -> str:
    validate_password_strength(password)
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
```

---

### 🟡 MEDIUM: JWT Token Expiration
**File:** `/c/Users/morty/task_planner/backend/auth.py:15`

**Issue:**
JWT tokens expire in 30 minutes, but there's no refresh token mechanism. Users must re-authenticate frequently.

**Impact:** Poor user experience, potential for session fixation

**Recommended Fix:**
Implement refresh token pattern:
1. Short-lived access tokens (15 minutes)
2. Long-lived refresh tokens (7 days)
3. Refresh endpoint to get new access token
4. Store refresh tokens securely (httpOnly cookies)

---

## 4. OWASP Top 10 Analysis

### A01:2021 - Broken Access Control ✅ FOUND
- **Missing authorization checks on task operations** (HIGH)
- **No WebSocket authentication** (CRITICAL)
- **Admin privilege management issues** (MEDIUM)

### A02:2021 - Cryptographic Failures ✅ FOUND
- **Hardcoded JWT secret** (CRITICAL)
- **Plaintext PIN storage** (CRITICAL)
- **Passwords properly hashed with bcrypt** ✓ (GOOD)

### A03:2021 - Injection ✅ FOUND
- **SQL injection risk in raw queries** (HIGH)
- **Missing input sanitization** (HIGH)
- **ORM usage prevents most SQL injection** ✓ (GOOD)

### A04:2021 - Insecure Design ✅ FOUND
- **Site-wide PIN system without rate limiting** (CRITICAL)
- **In-memory token storage** (HIGH)
- **No email verification** (MEDIUM)

### A05:2021 - Security Misconfiguration ✅ FOUND
- **CORS allows all origins** (CRITICAL)
- **Debug print statements in production** (CRITICAL)
- **No security headers configured** (HIGH)

### A06:2021 - Vulnerable Components ⚠️ NEEDS AUDIT
**Recommendation:** Run `pip-audit` or `safety check`

Current dependencies:
```
fastapi==0.109.0
uvicorn==0.27.0
sqlalchemy==2.0.25
python-jose==3.3.0
bcrypt==4.2.0
psycopg2-binary==2.9.9
```

**Action Required:**
```bash
pip install pip-audit
pip-audit
```

### A07:2021 - Identification and Authentication Failures ✅ FOUND
- **Weak PIN system** (CRITICAL)
- **No MFA support** (MEDIUM)
- **No account lockout** (HIGH)
- **No password strength requirements** (HIGH)

### A08:2021 - Software and Data Integrity Failures ⚠️ PARTIAL
- **No integrity checks on WebSocket messages** (MEDIUM)
- **No code signing** (INFO)

### A09:2021 - Security Logging and Monitoring Failures ✅ FOUND
- **Using print() instead of proper logging** (CRITICAL)
- **No audit trail for admin actions** (HIGH)
- **No intrusion detection** (MEDIUM)

### A10:2021 - Server-Side Request Forgery (SSRF) ✓ NOT FOUND
- No external URL fetching detected

---

## 5. CORS Configuration

### 🔴 CRITICAL: Overly Permissive CORS
**File:** `/c/Users/morty/task_planner/backend/main.py:143-152`

**Issue:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # CRITICAL: Allows ANY origin
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
```

Allowing all origins with credentials enabled is a critical security vulnerability.

**Exploitation Scenario:**
1. Attacker hosts malicious site at `evil.com`
2. Victim visits `evil.com` while logged into task planner
3. Malicious JavaScript makes authenticated requests to task planner API
4. Attacker can read/modify victim's data

**Impact:** Cross-Origin attacks, data theft

**Recommended Fix:**
```python
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "").split(",")
if not ALLOWED_ORIGINS or ALLOWED_ORIGINS == [""]:
    raise ValueError("ALLOWED_ORIGINS environment variable must be set")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # Specific origins only
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Access-Token"],
    max_age=3600
)
```

Add to `.env`:
```
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

---

## 6. Security Headers

### 🟠 HIGH: Missing Security Headers
**File:** `/c/Users/morty/task_planner/backend/main.py`

**Issue:**
No security headers configured. Application is vulnerable to clickjacking, MIME sniffing, and other attacks.

**Recommended Fix:**
```python
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["yourdomain.com", "*.yourdomain.com"])
```

---

## 7. Frontend Security

### 🟠 HIGH: Token Storage in localStorage
**File:** `/c/Users/morty/task_planner/task_planner/frontend/js/api.js:6-16`

**Issue:**
```javascript
token: localStorage.getItem('token'),

setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
}
```

Storing JWT tokens in localStorage is vulnerable to XSS attacks.

**Impact:** Token theft via XSS

**Recommended Fix:**
Use httpOnly cookies instead:

Backend:
```python
@app.post("/auth/login")
def login(response: Response, form_data: OAuth2PasswordRequestForm = Depends()):
    # ... authentication logic
    
    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        secure=True,  # HTTPS only
        samesite="strict",
        max_age=1800  # 30 minutes
    )
    return {"message": "Login successful"}
```

Frontend:
```javascript
// No need to manually handle tokens
// Browser automatically sends httpOnly cookie
async request(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        credentials: 'include'  // Include cookies
    });
    // ... rest
}
```

---

### 🟡 MEDIUM: Console.log in Production
**Files:** Multiple JavaScript files

**Issue:**
Console.log statements present in production code can leak sensitive information.

**Recommended Fix:**
1. Remove all console.log statements
2. Use proper logging library
3. Configure build process to strip console statements:

```javascript
// webpack.config.js
module.exports = {
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
          },
        },
      }),
    ],
  },
};
```

---

## 8. Rate Limiting

### 🟠 HIGH: No Rate Limiting
**Files:** All endpoints

**Issue:**
No rate limiting on any endpoints. Application vulnerable to:
- Brute force attacks (login, PIN)
- DoS attacks
- Resource exhaustion

**Recommended Fix:**
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    # ... rest

@app.post("/auth/check-pin")
@limiter.limit("5/hour")
async def check_pin(request: Request, pin_data: schemas.PinCodeCheck):
    # ... rest

@app.post("/tasks")
@limiter.limit("100/hour")
async def create_task(request: Request, task: schemas.TaskCreate):
    # ... rest
```

---

## Summary of Vulnerabilities

| Severity | Count | Issues |
|----------|-------|--------|
| 🔴 CRITICAL | 4 | Hardcoded JWT secret, Insecure PIN system, Missing WebSocket auth, Permissive CORS |
| 🟠 HIGH | 5 | Missing authorization checks, No input sanitization, SQL injection risk, Missing security headers, Token in localStorage |
| 🟡 MEDIUM | 3 | Admin privilege escalation, Missing email validation, JWT expiration issues |

---

## Immediate Action Items (Priority Order)

### 1. CRITICAL - Fix Before Production
- [ ] Move JWT secret to environment variable
- [ ] Implement WebSocket authentication
- [ ] Fix CORS configuration to whitelist specific origins
- [ ] Add rate limiting to PIN and login endpoints
- [ ] Hash PIN codes with bcrypt

### 2. HIGH - Fix Within 1 Week
- [ ] Add authorization checks to all task operations
- [ ] Implement input sanitization for all user inputs
- [ ] Add security headers middleware
- [ ] Move tokens from localStorage to httpOnly cookies
- [ ] Replace print() with proper logging
- [ ] Add rate limiting to all endpoints

### 3. MEDIUM - Fix Within 1 Month
- [ ] Implement email verification
- [ ] Add password strength requirements
- [ ] Implement refresh token mechanism
- [ ] Add audit logging for admin actions
- [ ] Remove console.log from production code

### 4. ONGOING
- [ ] Run dependency vulnerability scans weekly
- [ ] Implement security monitoring and alerting
- [ ] Conduct regular penetration testing
- [ ] Security training for development team

---

## Testing Recommendations

### Security Testing Checklist
- [ ] Run OWASP ZAP scan
- [ ] Perform manual penetration testing
- [ ] Test authentication bypass scenarios
- [ ] Test authorization on all endpoints
- [ ] Test input validation with malicious payloads
- [ ] Test rate limiting effectiveness
- [ ] Verify CORS configuration
- [ ] Test WebSocket security
- [ ] Review all logs for sensitive data

### Automated Security Scanning
```bash
# Python dependency vulnerabilities
pip install pip-audit
pip-audit

# SAST (Static Application Security Testing)
pip install bandit
bandit -r backend/

# Frontend security
npm install -g retire
retire --path frontend/

# API security testing
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:8000
```

---

## Compliance Considerations

### GDPR Compliance Issues
1. No data retention policy
2. No user data export functionality
3. No user data deletion functionality
4. No privacy policy
5. No consent management

### Recommendations
- Implement GDPR-compliant data handling
- Add user data export endpoint
- Add user account deletion endpoint
- Implement audit logging for data access
- Add privacy policy and terms of service

---

## Conclusion

The task planner application has significant security vulnerabilities that must be addressed before production deployment. The most critical issues are:

1. **Hardcoded secrets** - Complete authentication bypass possible
2. **Missing authentication on WebSocket** - Information disclosure
3. **Permissive CORS** - Cross-origin attacks possible
4. **Weak PIN system** - Brute force vulnerable

**Recommendation:** Do not deploy to production until all CRITICAL and HIGH severity issues are resolved.

**Estimated Remediation Time:**
- Critical issues: 2-3 days
- High issues: 1 week
- Medium issues: 2 weeks
- Total: 3-4 weeks for full remediation

---

## References

- OWASP Top 10 2021: https://owasp.org/Top10/
- OWASP API Security Top 10: https://owasp.org/API-Security/
- FastAPI Security: https://fastapi.tiangolo.com/tutorial/security/
- JWT Best Practices: https://tools.ietf.org/html/rfc8725
- CORS Security: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS

---

**Report Generated:** 2026-04-29  
**Next Review Date:** 2026-05-29 (or after major changes)

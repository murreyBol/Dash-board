# Security Upgrade Guide

## Critical Security Fixes Applied

This document describes the security improvements made to the Task Planner application.

### 1. PIN Code Security (CRITICAL)

**Problem:** PIN codes were stored in plaintext and had a weak default fallback ("1234").

**Fix:**
- PIN codes are now hashed using bcrypt before storage
- No default PIN fallback - must be explicitly configured
- PIN verification uses constant-time comparison via bcrypt

**Migration Required:**

If you had an existing `.pin_code` file, run the migration script:

```bash
cd backend
python migrate_pin.py
```

For new installations, set the PIN via environment variable:

```bash
export SITE_PIN_CODE="your-secure-pin-here"
python main.py
```

Or create the hash file manually:

```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'your-pin', bcrypt.gensalt()).decode())" > .pin_code_hash
chmod 600 .pin_code_hash
```

**Security Notes:**
- The `.pin_code_hash` file has 0600 permissions (owner read/write only)
- Admin endpoint no longer returns the PIN or hash
- Rate limiting (5 attempts per 5 minutes) prevents brute force attacks

### 2. Task Authorization (CRITICAL)

**Problem:** Any authenticated user could modify, delete, or complete any task.

**Fix:** Authorization checks added to all task operations:

| Operation | Authorization Rule |
|-----------|-------------------|
| Update task | Only creator or assignee |
| Delete task | Only creator |
| Assign task | Only creator or admin |
| Complete task | Only assignee |
| Archive task | Only creator |

**Impact:**
- Users can only modify tasks they created or are assigned to
- Only task creators can delete or archive tasks
- Only assignees can mark tasks as complete
- Admins can assign any task

### 3. WebSocket Token Security (CRITICAL)

**Problem:** Authentication token was exposed in WebSocket URL query parameters, visible in:
- Browser history
- Server logs
- Proxy logs
- Referrer headers

**Fix:**
- Token is now sent in the first message after WebSocket connection
- Backend validates token before accepting any other messages
- URL no longer contains sensitive authentication data

**Client Changes:**
The WebSocket client (`docs/js/websocket.js`) now:
1. Connects without token in URL
2. Sends authentication message: `{"type": "auth", "token": "..."}`
3. Waits for `{"type": "auth_success"}` before proceeding

**Backward Compatibility:** None - clients must update to the new authentication flow.

## Testing the Fixes

### Test PIN Code Security

```bash
# Try with wrong PIN (should fail)
curl -X POST http://localhost:8000/auth/check-pin \
  -H "Content-Type: application/json" \
  -d '{"pin_code": "wrong"}'

# Try with correct PIN (should succeed)
curl -X POST http://localhost:8000/auth/check-pin \
  -H "Content-Type: application/json" \
  -d '{"pin_code": "1234"}'
```

### Test Task Authorization

```bash
# Get access token first
ACCESS_TOKEN=$(curl -X POST http://localhost:8000/auth/check-pin \
  -H "Content-Type: application/json" \
  -d '{"pin_code": "1234"}' | jq -r .access_token)

# Login as user1
TOKEN1=$(curl -X POST http://localhost:8000/auth/login \
  -H "X-Access-Token: $ACCESS_TOKEN" \
  -d "username=user1&password=pass1" | jq -r .access_token)

# Login as user2
TOKEN2=$(curl -X POST http://localhost:8000/auth/login \
  -H "X-Access-Token: $ACCESS_TOKEN" \
  -d "username=user2&password=pass2" | jq -r .access_token)

# Create task as user1
TASK_ID=$(curl -X POST http://localhost:8000/tasks \
  -H "X-Access-Token: $ACCESS_TOKEN" \
  -H "Authorization: Bearer $TOKEN1" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Task", "priority": "medium"}' | jq -r .id)

# Try to delete as user2 (should fail with 403)
curl -X DELETE http://localhost:8000/tasks/$TASK_ID \
  -H "X-Access-Token: $ACCESS_TOKEN" \
  -H "Authorization: Bearer $TOKEN2"
```

### Test WebSocket Security

Open browser console and test:

```javascript
// Old method (no longer works)
const ws1 = new WebSocket('ws://localhost:8000/ws?token=abc123');
// Should close with policy violation

// New method (correct)
const ws2 = new WebSocket('ws://localhost:8000/ws');
ws2.onopen = () => {
  ws2.send(JSON.stringify({
    type: 'auth',
    token: localStorage.getItem('token')
  }));
};
ws2.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'auth_success') {
    console.log('Authenticated!');
  }
};
```

## Deployment Checklist

Before deploying to production:

- [ ] Set `SITE_PIN_CODE` environment variable with a strong PIN (12+ characters recommended)
- [ ] Verify `.pin_code_hash` file has 0600 permissions
- [ ] Update all WebSocket clients to use new authentication flow
- [ ] Test task authorization with multiple user accounts
- [ ] Review server logs to ensure no tokens appear in URLs
- [ ] Consider rotating JWT secret key (`SECRET_KEY` in auth.py)
- [ ] Enable HTTPS for production (tokens should never be sent over HTTP)

## Security Best Practices

1. **PIN Code:**
   - Use a strong PIN (12+ characters, mix of letters, numbers, symbols)
   - Rotate PIN periodically
   - Never commit `.pin_code_hash` to version control

2. **JWT Tokens:**
   - Keep `ACCESS_TOKEN_EXPIRE_MINUTES` reasonable (default: 30 minutes)
   - Use HTTPS in production
   - Consider implementing token refresh mechanism

3. **Database:**
   - Use parameterized queries (already implemented via SQLAlchemy)
   - Keep database credentials in environment variables
   - Enable database connection encryption

4. **CORS:**
   - Configure `ALLOWED_ORIGINS` to only include trusted domains
   - Never use `*` in production

## Questions?

For security concerns, please review the code changes in:
- `backend/main.py` (lines 24-88, 254-301, 303-328, 472-618, 814-867)
- `docs/js/websocket.js` (lines 9-40)

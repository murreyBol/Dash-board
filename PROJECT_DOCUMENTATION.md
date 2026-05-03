# Task Planner - Complete Project Documentation

**Generated:** 2026-05-03  
**Project Type:** Full-stack task management application with real-time collaboration

---

## Project Overview

Task Planner is a collaborative task management system with Kanban-style boards, time tracking, real-time updates via WebSocket, and comprehensive user management. The application features a three-tier security model (PIN code → User authentication → Role-based access) and supports PostgreSQL for production and SQLite for local development.

**Key Features:**
- Kanban board with 4 priority columns (Urgent, Medium, Low, Future)
- Real-time collaboration via WebSocket
- Time tracking with session management
- Comment system with session duration tracking
- Calendar view of work sessions
- Task archiving and overdue task detection
- Admin panel for user and PIN management
- Mobile-responsive design

---

## Architecture

### Backend/Frontend Separation

**Backend:** FastAPI (Python) REST API + WebSocket server
- Location: `/backend/`
- Port: 8000
- Database: PostgreSQL (production) / SQLite (development)

**Frontend:** Vanilla JavaScript SPA
- Location: `/docs/`
- Served as static files (GitHub Pages compatible)
- Auto-detects environment (localhost vs production)

**Deployment:**
- Backend: Render.com (Frankfurt region, free tier)
- Frontend: GitHub Pages or any static hosting
- Database: Render PostgreSQL (free tier)

---

## Database Models

### User Table
```python
users:
  - id: String (UUID, primary key)
  - username: String (unique, indexed)
  - email: String (unique, indexed)
  - password_hash: String (bcrypt)
  - auto_start_timer: Boolean (default: False)
  - is_admin: Boolean (default: False)
  - created_at: DateTime
```

**Relationships:**
- `created_tasks` → Tasks created by user
- `assigned_tasks` → Tasks assigned to user
- `comments` → User's comments
- `time_sessions` → User's time tracking sessions
- `task_assignments` → Assignment history

### Task Table
```python
tasks:
  - id: String (UUID, primary key)
  - title: String (required)
  - description: String (optional)
  - priority: Enum (urgent, medium, low, future, overdue*)
  - status: Enum (todo, in_progress, completed, postponed, archived)
  - postponed_reason: String (nullable)
  - created_by: String (FK → users.id)
  - assigned_to: String (FK → users.id, nullable, indexed)
  - started_at: DateTime (nullable)
  - completed_at: DateTime (nullable)
  - postponed_at: DateTime (nullable)
  - archived_at: DateTime (nullable)
  - total_time_seconds: Integer (default: 0)
  - created_at: DateTime
  - updated_at: DateTime (auto-updated)
```

*Note: `overdue` priority is deprecated but kept for backward compatibility

**Relationships:**
- `creator` → User who created the task
- `assignee` → User assigned to the task
- `comments` → Task comments
- `time_sessions` → Time tracking sessions
- `assignments` → Assignment history

### Comment Table
```python
comments:
  - id: String (UUID, primary key)
  - task_id: String (FK → tasks.id, indexed)
  - user_id: String (FK → users.id)
  - session_id: String (FK → time_sessions.id, nullable)
  - text: String (required)
  - created_at: DateTime
  - updated_at: DateTime (nullable)
```

**Relationships:**
- `task` → Associated task
- `user` → Comment author
- `session` → Associated time session (if comment added after timer stop)

### TimeSession Table
```python
time_sessions:
  - id: String (UUID, primary key)
  - task_id: String (FK → tasks.id, indexed)
  - user_id: String (FK → users.id, indexed)
  - started_at: DateTime (required)
  - ended_at: DateTime (nullable)
  - duration_seconds: Integer (default: 0)
```

**Relationships:**
- `task` → Associated task
- `user` → User who tracked time
- `comments` → Comments linked to this session

### TaskAssignment Table
```python
task_assignments:
  - id: String (UUID, primary key)
  - task_id: String (FK → tasks.id, indexed)
  - user_id: String (FK → users.id, indexed)
  - assigned_at: DateTime
  - unassigned_at: DateTime (nullable)
```

**Purpose:** Historical record of task assignments

---

## API Endpoints

### Authentication & Access Control

#### POST `/auth/check-pin`
**Purpose:** Verify site-wide PIN code (first security layer)  
**Body:** `{ "pin_code": "string" }`  
**Response:** `{ "success": true, "access_token": "string" }`  
**Rate Limit:** 5 attempts per 5 minutes per IP  
**Returns:** 30-day access token stored in `X-Access-Token` header

#### POST `/auth/register`
**Purpose:** Create new user account  
**Body:** `{ "username": "string", "email": "string", "password": "string" }`  
**Response:** User object  
**Auth:** Requires valid access token

#### POST `/auth/login`
**Purpose:** User authentication (second security layer)  
**Body:** Form data with `username` and `password`  
**Response:** `{ "access_token": "string", "token_type": "bearer" }`  
**Token Expiry:** 30 minutes

### User Management

#### GET `/users/me`
**Purpose:** Get current user profile  
**Response:** User object with `is_admin` flag  
**Auth:** Bearer token required

#### PUT `/users/me/settings`
**Purpose:** Update user settings  
**Body:** `{ "auto_start_timer": boolean }`  
**Response:** Updated user object

#### GET `/users`
**Purpose:** List all users  
**Response:** Array of user objects  
**Auth:** Bearer token required

#### DELETE `/users/{user_id}`
**Purpose:** Delete user (admin only)  
**Auth:** Admin role required  
**Restriction:** Cannot delete self

#### PUT `/users/{user_id}/admin`
**Purpose:** Toggle admin status (admin only)  
**Auth:** Admin role required  
**Restriction:** Cannot modify own admin status

### Admin Panel

#### GET `/admin/pin-code`
**Purpose:** Check if PIN is configured  
**Response:** `{ "message": "string", "has_pin": boolean }`  
**Auth:** Admin role required  
**Security:** Never returns actual PIN or hash

#### POST `/admin/pin-code`
**Purpose:** Update site PIN code  
**Body:** `{ "pin_code": "string" }` (min 4 characters)  
**Response:** `{ "success": true, "message": "string" }`  
**Auth:** Admin role required  
**Storage:** Saved to `.pin_code_hash` file with 0600 permissions

### Task Management

#### GET `/tasks`
**Purpose:** List all non-archived tasks  
**Query Params:** `priority` (optional), `status` (optional)  
**Response:** Array of task objects

#### GET `/tasks/{task_id}`
**Purpose:** Get single task details  
**Response:** Task object

#### POST `/tasks`
**Purpose:** Create new task  
**Body:** `{ "title": "string", "description": "string", "priority": "urgent|medium|low|future", "assigned_to": "user_id?" }`  
**Response:** Created task object  
**Validation:** Title required, max 20 tasks per priority column

#### PUT `/tasks/{task_id}`
**Purpose:** Update task  
**Body:** Partial task update  
**Authorization:** Only creator or assignee can update  
**Response:** Updated task object

#### DELETE `/tasks/{task_id}`
**Purpose:** Delete task  
**Authorization:** Only creator can delete  
**Response:** `{ "message": "Task deleted" }`

#### POST `/tasks/{task_id}/assign?user_id={user_id}`
**Purpose:** Assign task to user  
**Authorization:** Only creator or admin can assign  
**Response:** Updated task object

#### POST `/tasks/{task_id}/complete`
**Purpose:** Mark task as completed  
**Authorization:** Only assignee can complete  
**Side Effect:** Calculates total time from all sessions  
**Response:** Updated task object

#### POST `/tasks/{task_id}/postpone`
**Purpose:** Postpone task with reason  
**Body:** `{ "reason": "string" }`  
**Response:** Updated task object

#### POST `/tasks/{task_id}/archive`
**Purpose:** Archive completed/postponed task  
**Authorization:** Only creator can archive  
**Validation:** Task must be completed or postponed  
**Response:** Updated task object

#### GET `/tasks/archived/list`
**Purpose:** Get all archived tasks  
**Response:** Array of archived task objects

#### GET `/tasks/overdue`
**Purpose:** Get tasks with no activity for 7+ days  
**Response:** Array of overdue tasks with `last_activity_at` and `inactive_days`  
**Calculation:** Considers task updates, comments, and time sessions

#### POST `/tasks/{task_id}/restore`
**Purpose:** Reset 7-day countdown for overdue task  
**Response:** Updated task object

### Time Tracking

#### POST `/tasks/{task_id}/start-timer`
**Purpose:** Start time tracking session  
**Behavior:** Idempotent (returns existing active session)  
**Side Effect:** Sets task status to `in_progress` if `todo`  
**Response:** TimeSession object

#### POST `/tasks/{task_id}/stop-timer`
**Purpose:** Stop active time tracking session  
**Calculation:** `duration_seconds = ended_at - started_at`  
**Response:** TimeSession object with `duration_seconds`

### Comments

#### GET `/tasks/{task_id}/comments`
**Purpose:** Get all comments for task  
**Response:** Array of comments with `username` and `session_duration` (if linked to session)  
**Optimization:** Uses `joinedload` for user and session data

#### POST `/tasks/{task_id}/comments`
**Purpose:** Add comment to task  
**Body:** `{ "text": "string", "session_id": "string?" }`  
**Response:** Created comment object  
**Use Case:** `session_id` links comment to time session when timer stops

#### PUT `/comments/{comment_id}`
**Purpose:** Update comment  
**Body:** `{ "text": "string" }`  
**Authorization:** Only comment author can update  
**Response:** Updated comment object

#### DELETE `/comments/{comment_id}`
**Purpose:** Delete comment  
**Authorization:** Only comment author can delete  
**Response:** `{ "message": "Comment deleted" }`

### Calendar

#### GET `/calendar/sessions`
**Purpose:** Get time sessions for calendar view  
**Query Params:** `start_date` (optional), `end_date` (optional)  
**Response:** Array of sessions with task details and usernames  
**Joins:** TimeSession + Task + User (session user) + User (task creator)

### WebSocket

#### WS `/ws`
**Purpose:** Real-time updates  
**Authentication:** First message must be `{ "type": "auth", "token": "jwt_token" }`  
**Response:** `{ "type": "auth_success", "username": "string" }`  
**Events:** See WebSocket Events section below

---

## Frontend Modules

### `/docs/js/api.js` - API Client
**Purpose:** Centralized HTTP client with error handling  
**Features:**
- Auto-detects environment (localhost vs production)
- Adds `X-Access-Token` and `Authorization` headers
- User-friendly error messages (Russian)
- Automatic token refresh on 401
- Access token validation on 403

**Key Functions:**
- `request(endpoint, options)` - Base HTTP wrapper
- `login(username, password)` - Form-encoded login
- `getTasks()`, `createTask()`, `updateTask()`, etc.
- `startTimer()`, `stopTimer()` - Time tracking
- `getComments()`, `createComment()` - Comments
- `getCalendarSessions()` - Calendar data

### `/docs/js/auth.js` - Authentication Manager
**Purpose:** User session management  
**State:** `currentUser` object  
**Functions:**
- `init()` - Restore session from localStorage
- `login(username, password)` - Authenticate user
- `register(username, email, password)` - Create account
- `logout()` - Clear session and reload
- `isAuthenticated()` - Check login status

### `/docs/js/websocket.js` - WebSocket Client
**Purpose:** Real-time updates and reconnection logic  
**Features:**
- Automatic reconnection with exponential backoff (max 30s)
- Unlimited reconnection attempts
- Manual reconnect button after 3 failed attempts
- JWT authentication on connect

**Message Handlers:**
- `task_created`, `task_updated`, `task_deleted`
- `task_assigned`, `task_completed`, `task_postponed`, `task_archived`, `task_restored`
- `timer_started`, `timer_stopped`
- `comment_added`, `comment_updated`, `comment_deleted`

### `/docs/js/timer.js` - Time Tracking
**Purpose:** Client-side timer display and management  
**State:** `activeSessions` Map (taskId → { interval, startTime, seconds })  
**Functions:**
- `start(taskId)` - Start timer and update display every second
- `stop(taskId)` - Stop timer and show comment modal
- `formatTime(seconds)` - HH:MM:SS format
- `formatDuration(seconds)` - Human-readable (e.g., "2ч 15мин")
- `updateDisplay(taskId, seconds)` - Update task card timer

### `/docs/js/comments.js` - Comment System
**Purpose:** Comment modal and completion flow  
**Modes:**
- **Normal:** Show all comments + add new
- **Completion:** Show only input (after timer stop)

**Functions:**
- `show(taskId)` - Open comments modal
- `showForCompletion(taskId, sessionId)` - Open for task completion
- `addComment()` - Add comment (auto-completes task in completion mode)
- `skipComment()` - Complete task without comment
- `editComment()`, `deleteComment()` - Modify comments

### `/docs/js/calendar.js` - Calendar View
**Purpose:** Monthly calendar with session visualization  
**Features:**
- Month navigation
- Day highlighting (today, has activity, selected)
- Session details grouped by task
- Total time per day calculation

**Functions:**
- `show()` - Load and display calendar
- `loadSessions()` - Fetch all sessions
- `render()` - Draw calendar grid
- `selectDate(dateStr)` - Show day details
- `prevMonth()`, `nextMonth()` - Navigate

### `/docs/js/notifications.js` - Browser Notifications
**Purpose:** Desktop notifications for real-time events  
**Features:**
- Permission request on init
- Notifications for task assignments and comments
- Fallback to silent mode if permission denied

### `/docs/js/kanban.js` - Kanban Board
**Purpose:** Main task board with drag-and-drop  
**Features:**
- 4 priority columns with 20-task limit per column
- Drag-and-drop priority changes
- Inline comment expansion
- Event delegation for performance
- Real-time updates via WebSocket

**Key Functions:**
- `init()` - Load tasks and setup event listeners
- `render()` - Render all task cards
- `createTaskCard(task)` - Generate task card HTML
- `setupDragAndDrop()` - Enable drag-and-drop
- `toggleComments(taskId)` - Expand/collapse inline comments
- `assignToMe()`, `toggleTimer()`, `completeTask()`, `archiveTask()`, `deleteTask()`

### `/docs/js/app.js` - Main Application Controller
**Purpose:** Application initialization and modal management  
**Screens:**
1. PIN screen (first security layer)
2. Login/Register screen (second security layer)
3. Dashboard (main application)

**Key Functions:**
- `init()` - Check PIN → Check auth → Show appropriate screen
- `checkPin()` - Verify PIN and get access token
- `login()`, `register()` - User authentication
- `showCreateTaskModal()`, `saveTask()` - Task creation/editing
- `showSettings()`, `saveSettings()` - User preferences
- `showCalendar()`, `showArchive()`, `showOverdue()` - Modal views
- `showAdminPanel()` - Admin user management and PIN update
- `updatePinCode()` - Change site PIN (admin only)

---

## Authentication Flow

### Three-Layer Security Model

**Layer 1: Site PIN Code**
1. User enters PIN on first screen
2. Backend verifies PIN (bcrypt hash comparison)
3. Rate limited: 5 attempts per 5 minutes per IP
4. Returns 30-day access token
5. Token stored in localStorage as `access_token`
6. Token sent in `X-Access-Token` header on all requests

**Layer 2: User Authentication**
1. User logs in with username/password
2. Backend verifies credentials (bcrypt)
3. Returns JWT token (30-minute expiry)
4. Token stored in localStorage as `token`
5. Token sent in `Authorization: Bearer {token}` header

**Layer 3: Role-Based Access Control**
- `is_admin` flag on User model
- Admin-only endpoints: user management, PIN management
- Task-level authorization: creator/assignee checks

### Token Storage
```javascript
localStorage:
  - pin_verified: "true" (flag)
  - access_token: "30-day token" (site access)
  - token: "JWT token" (user session, 30 min)
```

### Authorization Rules

**Task Operations:**
- **Update:** Creator or assignee
- **Delete:** Creator only
- **Assign:** Creator or admin
- **Complete:** Assignee only
- **Archive:** Creator only

**Comment Operations:**
- **Create:** Any authenticated user
- **Update/Delete:** Comment author only

---

## WebSocket Events

### Client → Server
```javascript
// Authentication (first message)
{ "type": "auth", "token": "jwt_token" }
```

### Server → Client

#### Task Events
```javascript
// Task created
{ "type": "task_created", "data": { "task": Task, "user": { "id", "username" } } }

// Task updated
{ "type": "task_updated", "data": { "task": Task } }

// Task deleted
{ "type": "task_deleted", "data": { "task_id": "string" } }

// Task assigned
{ "type": "task_assigned", "data": { "task": Task, "user": User, "assigned_to_me": boolean } }

// Task completed
{ "type": "task_completed", "data": { "task": Task, "user": User } }

// Task postponed
{ "type": "task_postponed", "data": { "task": Task, "user": User, "reason": "string" } }

// Task archived
{ "type": "task_archived", "data": { "task": Task, "user": User } }

// Task restored (from overdue)
{ "type": "task_restored", "data": { "task": Task, "user": User } }
```

#### Timer Events
```javascript
// Timer started
{ "type": "timer_started", "data": { "task": Task, "user": User } }

// Timer stopped
{ "type": "timer_stopped", "data": { "task": Task, "user": User, "duration": number } }
```

#### Comment Events
```javascript
// Comment added
{ "type": "comment_added", "data": { "comment": Comment, "task": Task, "user": User, "is_my_task": boolean } }

// Comment updated
{ "type": "comment_updated", "data": { "comment": Comment, "task_id": "string" } }

// Comment deleted
{ "type": "comment_deleted", "data": { "comment_id": "string", "task_id": "string" } }
```

---

## Deployment Configuration

### Render.yaml
```yaml
services:
  - type: web
    name: task-planner-backend
    env: python
    region: frankfurt
    plan: free
    buildCommand: "pip install -r backend/requirements.txt"
    startCommand: "bash start_render.sh"
    envVars:
      - PYTHON_VERSION: 3.11.0
      - DATABASE_URL: (from database)
      - JWT_SECRET_KEY: (auto-generated)
      - SITE_PIN_CODE: (manual config)
      - ALLOWED_ORIGINS: https://yourusername.github.io
      - PORT: 8000

databases:
  - name: task-planner-db
    databaseName: task_planner
    user: task_planner_user
    plan: free
```

### Environment Variables

**Required:**
- `JWT_SECRET_KEY` - JWT signing key (auto-generated on Render)
- `SITE_PIN_CODE` - Site-wide PIN code (plain text or bcrypt hash)
- `ALLOWED_ORIGINS` - CORS origins (comma-separated)

**Optional:**
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Render)
- `PORT` - Server port (default: 8000)

**Local Development:**
- No `DATABASE_URL` → Uses SQLite (`task_planner.db`)
- Create `.env` file in `/backend/` with required variables

### Database Migration

**Automatic on startup:**
- Creates tables if not exist
- Adds `is_admin` column if missing
- Adds `total_time_seconds` column if missing
- Adds `session_id` column to comments if missing
- Sets Viktor as admin (if exists)

**Manual migrations:**
- `/backend/migrate_add_admin.py` - Add admin column
- `/backend/migrate_overdue.py` - Overdue task detection
- `/backend/migrate_pin.py` - PIN code setup
- `/backend/apply_migrations.py` - Apply all migrations

---

## Security Features

### PIN Code Management
- Stored as bcrypt hash in `.pin_code_hash` file
- File permissions: 0600 (owner read/write only)
- Can be set via environment variable `SITE_PIN_CODE`
- Admin can update via UI (hashed before storage)
- Rate limited: 5 attempts per 5 minutes per IP

### Password Security
- Bcrypt hashing with auto-generated salt
- No password length limit (bcrypt handles truncation)
- Passwords never logged or returned in API responses

### Token Security
- JWT tokens signed with `HS256` algorithm
- 30-minute expiry for user sessions
- 30-day expiry for site access tokens
- Tokens validated on every request
- Automatic token refresh on expiry

### CORS Configuration
- Configurable via `ALLOWED_ORIGINS` environment variable
- Credentials allowed for authenticated requests
- Preflight requests handled correctly

### SQL Injection Prevention
- SQLAlchemy ORM (parameterized queries)
- No raw SQL except migrations (using `text()` wrapper)

### XSS Prevention
- Frontend: `escapeHtml()` function for all user input
- Backend: Pydantic validation and sanitization

### Authorization Checks
- Middleware validates access token on all non-auth endpoints
- `check_task_authorization()` helper for task operations
- Admin-only endpoints check `is_admin` flag

---

## Key Workflows

### Task Creation Flow
1. User clicks "Create Task" button
2. Modal opens with form (title, description, priority, assignee)
3. Frontend validates: title required, column limit (20 tasks)
4. POST `/tasks` with task data
5. Backend creates task, broadcasts `task_created` event
6. All connected clients receive update and refresh board

### Task Assignment Flow
1. User clicks "Take" button on unassigned task
2. POST `/tasks/{id}/assign?user_id={current_user_id}`
3. Backend checks authorization (creator or admin)
4. Creates `TaskAssignment` record
5. If `auto_start_timer` enabled, starts timer automatically
6. Broadcasts `task_assigned` event
7. Assignee receives browser notification

### Time Tracking Flow
1. User clicks "Start" button on assigned task
2. POST `/tasks/{id}/start-timer`
3. Backend creates `TimeSession` with `started_at`
4. Frontend starts local timer (updates every second)
5. User clicks "Stop" button
6. POST `/tasks/{id}/stop-timer`
7. Backend calculates `duration_seconds`, sets `ended_at`
8. Frontend shows comment modal with `session_id`
9. User adds comment (linked to session) or skips
10. Task marked as completed

### Task Completion Flow
1. User stops timer (or clicks "Complete" directly)
2. Comment modal appears (if timer was running)
3. User adds comment with session duration or skips
4. POST `/tasks/{id}/complete`
5. Backend:
   - Calculates total time from all sessions
   - Sets `status = completed`, `completed_at = now()`
   - Updates `total_time_seconds`
6. Broadcasts `task_completed` event
7. Task card shows "✓ Completed" badge
8. "Archive" button becomes available

### Overdue Task Detection
1. Cron job or manual check calls GET `/tasks/overdue`
2. Backend calculates `last_activity_at` for each task:
   - Max of: `created_at`, `updated_at`, latest comment, latest session
3. Filters tasks with `last_activity_at` > 7 days ago
4. Returns tasks with `inactive_days` count
5. Frontend displays in "Overdue" modal
6. User can "Restore" task (resets `updated_at` to now)

---

## Performance Optimizations

### Frontend
- **Event Delegation:** Single click listener for all task cards
- **Debounced Rendering:** 50ms delay to batch updates
- **Lazy Comment Loading:** Comments loaded only when expanded
- **WebSocket Reconnection:** Exponential backoff to reduce server load

### Backend
- **Database Connection Pooling:** 10 connections, 20 overflow
- **Eager Loading:** `joinedload` for comments with user/session data
- **Indexed Columns:** `username`, `email`, `assigned_to`, `priority`, `status`, `task_id`, `user_id`
- **Efficient Overdue Query:** SQL-level filtering with `HAVING` clause

### Database
- **PostgreSQL Production:** Better performance for concurrent users
- **SQLite Development:** Zero-config local development
- **Cascade Deletes:** Automatic cleanup of related records

---

## Testing Recommendations

### Unit Tests (Backend)
- `crud.py` functions (create, update, delete operations)
- `auth.py` functions (password hashing, token generation)
- Authorization checks in `main.py`

### Integration Tests (Backend)
- API endpoints with authentication
- WebSocket connection and message handling
- Database migrations

### E2E Tests (Frontend)
- PIN code verification
- User registration and login
- Task creation and assignment
- Timer start/stop flow
- Comment addition
- Real-time updates (WebSocket)

### Manual Testing Checklist
- [ ] PIN code rate limiting (5 attempts)
- [ ] Token expiry and refresh
- [ ] WebSocket reconnection
- [ ] Drag-and-drop priority change
- [ ] Column limit enforcement (20 tasks)
- [ ] Admin panel access control
- [ ] Overdue task detection (7 days)
- [ ] Calendar session grouping
- [ ] Mobile responsiveness

---

## Known Limitations

1. **In-Memory Access Tokens:** Access tokens stored in Python dict (lost on restart). Use Redis for production.
2. **No Email Verification:** Email addresses not verified on registration.
3. **No Password Reset:** Users cannot reset forgotten passwords.
4. **No Task Search:** No search functionality for tasks.
5. **No File Attachments:** Cannot attach files to tasks or comments.
6. **No Task Dependencies:** Cannot link tasks or create subtasks.
7. **No Recurring Tasks:** No support for recurring/repeating tasks.
8. **No Export:** Cannot export tasks or time reports.
9. **Single PIN Code:** One PIN for entire site (not per-user).
10. **No Audit Log:** No history of who changed what and when.

---

## Future Enhancements

### High Priority
- Redis for access token storage
- Task search and filtering
- Email notifications
- Password reset flow
- Audit log for admin actions

### Medium Priority
- File attachments
- Task dependencies and subtasks
- Recurring tasks
- Export to CSV/PDF
- Dark mode toggle
- Keyboard shortcuts

### Low Priority
- Task templates
- Custom priority levels
- Team/project grouping
- Gantt chart view
- Mobile app (React Native)

---

## Troubleshooting

### Backend Won't Start
- **Error:** `JWT_SECRET_KEY environment variable is not set`
  - **Fix:** Set `JWT_SECRET_KEY` in environment or `.env` file
  - **Generate:** `python -c 'import secrets; print(secrets.token_urlsafe(32))'`

- **Error:** `No PIN code configured`
  - **Fix:** Set `SITE_PIN_CODE` environment variable or run `migrate_pin.py`

### Database Connection Issues
- **Error:** `could not connect to server`
  - **Fix:** Check `DATABASE_URL` format: `postgresql://user:pass@host:port/db`
  - **Render:** Ensure database is in same region as web service

### WebSocket Connection Fails
- **Error:** `WebSocket connection failed`
  - **Fix:** Check CORS `ALLOWED_ORIGINS` includes frontend URL
  - **Fix:** Ensure backend URL uses `wss://` for HTTPS sites

### Frontend Shows "Access Denied"
- **Error:** 403 on all requests
  - **Fix:** Clear localStorage and re-enter PIN code
  - **Fix:** Check `X-Access-Token` header is being sent

### Tasks Not Updating in Real-Time
- **Fix:** Check WebSocket connection status (should show "authenticated")
- **Fix:** Verify JWT token not expired (30-minute limit)
- **Fix:** Check browser console for WebSocket errors

---

## Development Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env file
echo "JWT_SECRET_KEY=$(python -c 'import secrets; print(secrets.token_urlsafe(32))')" > .env
echo "SITE_PIN_CODE=1234" >> .env
echo "ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080" >> .env

# Run migrations
python migrate_pin.py

# Start server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd docs
# Serve with any static server
python -m http.server 8080
# or
npx serve -p 8080
```

### Access Application
1. Open http://localhost:8080
2. Enter PIN: `1234`
3. Register new user
4. Start creating tasks!

---

## Maintenance

### Database Backups (Render)
```bash
# Download backup
render db backup task-planner-db

# Restore backup
render db restore task-planner-db backup-id
```

### Log Monitoring
```bash
# View backend logs
render logs task-planner-backend --tail
```

### Update PIN Code
1. Login as admin
2. Click "👑 Админка" button
3. Enter new PIN in "Управление PIN-кодом" section
4. Click "Изменить PIN"
5. All users must re-enter PIN on next visit

---

## Contact & Support

**Project Repository:** (Add your GitHub URL)  
**Deployment:** Render.com (Frankfurt)  
**Frontend:** GitHub Pages  
**Database:** PostgreSQL (Render)

**Admin User:** Viktor (set automatically on first migration)

---

*This documentation was generated by analyzing the complete codebase on 2026-05-03.*

from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
from typing import List, Optional
from jose import JWTError, jwt
import json
import os
import secrets

import models
import schemas
import crud
import auth
from database import engine, get_db
import logging
import threading
import stat
import bcrypt

# Setup logging
logger = logging.getLogger(__name__)

# PIN code file path
PIN_CODE_FILE = os.path.join(os.path.dirname(__file__), ".pin_code_hash")

# Lock for thread-safe PIN code updates
_pin_code_lock = threading.Lock()

def hash_pin_code(pin_code: str) -> str:
    """Hash a PIN code using bcrypt."""
    return bcrypt.hashpw(pin_code.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_pin_code(pin_code: str, hashed: str) -> bool:
    """Verify a PIN code against its hash."""
    try:
        return bcrypt.checkpw(pin_code.encode('utf-8'), hashed.encode('utf-8'))
    except Exception as e:
        logger.error(f"Error verifying PIN code: {e}", exc_info=True)
        return False

def load_pin_code_hash():
    """Load PIN code hash from file or environment variable. No default fallback."""
    if os.path.exists(PIN_CODE_FILE):
        try:
            with open(PIN_CODE_FILE, 'r') as f:
                pin_hash = f.read().strip()
                if pin_hash:
                    logger.info("PIN code hash loaded from file")
                    return pin_hash
        except Exception as e:
            logger.error(f"Error reading PIN code hash file: {e}", exc_info=True)

    # Try environment variable (must be a bcrypt hash)
    env_pin = os.getenv("SITE_PIN_CODE")
    if env_pin:
        # Check if it's already a hash or plain text
        if env_pin.startswith('$2b$') or env_pin.startswith('$2a$') or env_pin.startswith('$2y$'):
            logger.info("Using PIN code hash from environment variable")
            return env_pin
        else:
            # Hash the plain text PIN from environment
            logger.warning("Environment variable contains plain text PIN, hashing it")
            return hash_pin_code(env_pin)

    # No PIN code configured - this is a critical error
    logger.error("CRITICAL: No PIN code configured. Set SITE_PIN_CODE environment variable.")
    raise ValueError("No PIN code configured. Set SITE_PIN_CODE environment variable.")

def save_pin_code_hash(pin_code: str):
    """Hash and save PIN code to file with restricted permissions."""
    try:
        pin_hash = hash_pin_code(pin_code)

        with open(PIN_CODE_FILE, 'w') as f:
            f.write(pin_hash)

        # Set file permissions to 0600 (owner read/write only)
        os.chmod(PIN_CODE_FILE, stat.S_IRUSR | stat.S_IWUSR)
        logger.info("PIN code hash saved successfully")
        return pin_hash
    except Exception as e:
        logger.error(f"Error saving PIN code hash: {e}", exc_info=True)
        return None

# Get PIN code hash from file or environment variable
try:
    SITE_PIN_CODE_HASH = load_pin_code_hash()
except ValueError as e:
    logger.error(f"Failed to load PIN code: {e}")
    logger.error("Application will not start without a configured PIN code.")
    logger.error("Please set SITE_PIN_CODE environment variable or run migrate_pin.py")
    raise

# Store valid access tokens (in production use Redis or database)
valid_access_tokens = {}  # {token: expiry_time}

# Rate limiting for PIN attempts
pin_attempt_tracker = {}  # {ip: [timestamp1, timestamp2, ...]}
PIN_ATTEMPT_LIMIT = 5  # Max attempts
PIN_ATTEMPT_WINDOW = 300  # 5 minutes in seconds

def check_rate_limit(ip: str) -> bool:
    """Check if IP has exceeded rate limit for PIN attempts."""
    now = datetime.utcnow()

    # Clean up old attempts
    if ip in pin_attempt_tracker:
        pin_attempt_tracker[ip] = [
            timestamp for timestamp in pin_attempt_tracker[ip]
            if (now - timestamp).total_seconds() < PIN_ATTEMPT_WINDOW
        ]

    # Check if limit exceeded
    if ip in pin_attempt_tracker and len(pin_attempt_tracker[ip]) >= PIN_ATTEMPT_LIMIT:
        return False

    return True

def record_pin_attempt(ip: str):
    """Record a PIN attempt for rate limiting."""
    if ip not in pin_attempt_tracker:
        pin_attempt_tracker[ip] = []
    pin_attempt_tracker[ip].append(datetime.utcnow())

# Create tables
models.Base.metadata.create_all(bind=engine)

# Run migration to add is_admin field and total_time_seconds
def run_migration():
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            # Check if is_admin column exists (PostgreSQL syntax)
            result = conn.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_name='users' AND column_name='is_admin'
            """))

            if result.scalar() == 0:
                print("Adding is_admin column to users table...")
                conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE"))
                conn.commit()
                print("✓ Column added successfully")

            # Check if total_time_seconds column exists
            result = conn.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_name='tasks' AND column_name='total_time_seconds'
            """))

            if result.scalar() == 0:
                print("Adding total_time_seconds column to tasks table...")
                conn.execute(text("ALTER TABLE tasks ADD COLUMN total_time_seconds INTEGER DEFAULT 0"))
                conn.commit()
                print("✓ Column added successfully")

            # Check if session_id column exists in comments table
            result = conn.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_name='comments' AND column_name='session_id'
            """))

            if result.scalar() == 0:
                print("Adding session_id column to comments table...")
                conn.execute(text("""
                    ALTER TABLE comments
                    ADD COLUMN session_id VARCHAR
                    REFERENCES time_sessions(id)
                """))
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_comments_session_id
                    ON comments(session_id)
                """))
                conn.commit()
                print("✓ session_id column added successfully")

            # Make Viktor admin
            print("Setting Viktor as admin...")
            result = conn.execute(text("""
                UPDATE users
                SET is_admin = TRUE
                WHERE username = 'Viktor'
            """))
            conn.commit()

            if result.rowcount > 0:
                print("✓ Viktor is now admin")
            else:
                print("⚠ User Viktor not found")

        except Exception as e:
            print(f"Migration error: {e}")

run_migration()

app = FastAPI(title="Task Planner API")

# CORS - load allowed origins from environment variable
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8080")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

if not allowed_origins:
    logger.warning("No ALLOWED_ORIGINS configured, using default localhost origins")
    allowed_origins = ["http://localhost:3000", "http://localhost:8080"]

logger.info(f"CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600
)

# Middleware to check access token
@app.middleware("http")
async def check_access_token_middleware(request, call_next):
    # Skip access token check for OPTIONS (CORS preflight)
    if request.method == "OPTIONS":
        return await call_next(request)

    # Skip access token check for auth endpoints
    if request.url.path in ["/auth/check-pin", "/auth/login", "/auth/register"]:
        return await call_next(request)

    # Get access token from header
    access_token = request.headers.get("X-Access-Token")

    # Check if token is valid
    if access_token and access_token in valid_access_tokens:
        # Check if not expired
        if datetime.utcnow() <= valid_access_tokens[access_token]:
            return await call_next(request)
        else:
            # Token expired, remove it
            del valid_access_tokens[access_token]

    # No valid token - return 403 with CORS headers
    from fastapi.responses import JSONResponse

    # Determine the origin to allow based on request
    request_origin = request.headers.get("origin", "")
    allowed_origin = request_origin if request_origin in allowed_origins else (allowed_origins[0] if allowed_origins else "*")

    response = JSONResponse(
        status_code=403,
        content={"detail": "Access denied. Please verify PIN code first."}
    )
    # Add CORS headers manually
    response.headers["Access-Control-Allow-Origin"] = allowed_origin
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

# Helper function to check task authorization
def check_task_authorization(
    db: Session,
    task_id: str,
    current_user: models.User,
    action: str
) -> models.Task:
    """
    Check if user is authorized to perform action on task.
    Returns the task if authorized, raises HTTPException otherwise.

    Authorization rules:
    - update: Only creator or assignee
    - delete: Only creator
    - assign: Only creator or admin
    - complete: Only assignee
    - archive: Only creator
    """
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if action == "update":
        if task.created_by != current_user.id and task.assigned_to != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Only task creator or assignee can update this task"
            )
    elif action == "delete":
        if task.created_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Only task creator can delete this task"
            )
    elif action == "assign":
        if task.created_by != current_user.id and not current_user.is_admin:
            raise HTTPException(
                status_code=403,
                detail="Only task creator or admin can assign this task"
            )
    elif action == "complete":
        if task.assigned_to != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Only the assignee can complete this task"
            )
    elif action == "archive":
        if task.created_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Only task creator can archive this task"
            )

    return task

# Pin code endpoint with rate limiting
@app.post("/auth/check-pin")
def check_pin(pin_data: schemas.PinCodeCheck, request: Request):
    # Get client IP
    client_ip = request.client.host

    # Check rate limit
    if not check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many PIN attempts. Please try again in 5 minutes."
        )

    # Record attempt
    record_pin_attempt(client_ip)

    if verify_pin_code(pin_data.pin_code, SITE_PIN_CODE_HASH):
        # Generate access token
        access_token = secrets.token_urlsafe(32)
        # Token valid for 30 days
        expiry = datetime.utcnow() + timedelta(days=30)
        valid_access_tokens[access_token] = expiry

        return {
            "success": True,
            "message": "Pin code correct",
            "access_token": access_token
        }
    else:
        raise HTTPException(status_code=401, detail="Invalid pin code")

# Dependency to check access token
def verify_access_token(access_token: str = None):
    # Allow access if no token system is set up yet (backward compatibility)
    if not access_token:
        # Check if it's in header
        from fastapi import Request
        return None

    if access_token not in valid_access_tokens:
        raise HTTPException(status_code=403, detail="Invalid or expired access token")

    # Check if token expired
    if datetime.utcnow() > valid_access_tokens[access_token]:
        del valid_access_tokens[access_token]
        raise HTTPException(status_code=403, detail="Access token expired")

    return access_token

@app.get("/admin/pin-code")
def get_pin_code(current_user: models.User = Depends(auth.get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    # Never return the actual PIN or hash
    return {"message": "PIN code is configured", "has_pin": bool(SITE_PIN_CODE_HASH)}

@app.post("/admin/pin-code")
def update_pin_code(
    pin_data: schemas.PinCodeCheck,
    current_user: models.User = Depends(auth.get_current_user)
):
    global SITE_PIN_CODE_HASH
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    if not pin_data.pin_code or len(pin_data.pin_code) < 4:
        raise HTTPException(status_code=400, detail="Pin code must be at least 4 characters")

    with _pin_code_lock:
        # Hash and save to file
        new_hash = save_pin_code_hash(pin_data.pin_code)
        if not new_hash:
            raise HTTPException(status_code=500, detail="Failed to save pin code")

        SITE_PIN_CODE_HASH = new_hash

    return {"success": True, "message": "Pin code updated and saved"}

# Auth endpoints
@app.post("/auth/register", response_model=schemas.User)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db=db, user=user)

@app.post("/auth/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# User endpoints
@app.get("/users/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@app.put("/users/me/settings", response_model=schemas.User)
async def update_settings(
    settings: schemas.UserSettings,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return crud.update_user_settings(db, current_user.id, settings)

@app.get("/users", response_model=List[schemas.User])
async def get_users(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return crud.get_all_users(db)

@app.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can delete users")

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}

@app.put("/users/{user_id}/admin")
async def toggle_admin(
    user_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can manage admin rights")

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own admin status")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_admin = not user.is_admin
    db.commit()
    db.refresh(user)
    return user


# Task endpoints
@app.get("/tasks", response_model=List[schemas.Task])
async def get_tasks(
    priority: Optional[str] = None,
    status: Optional[str] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return crud.get_tasks(db, priority=priority, status=status)

@app.post("/tasks", response_model=schemas.Task)
async def create_task(
    task: schemas.TaskCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    try:
        print(f"Creating task: {task.dict()}")
        db_task = crud.create_task(db, task, current_user.id)
        print(f"Task created successfully: {db_task.id}")
        try:
            await manager.broadcast({
                "type": "task_created",
                "data": {
                    "task": schemas.Task.model_validate(db_task).model_dump(),
                    "user": {"id": current_user.id, "username": current_user.username}
                }
            })
            print("Broadcast sent successfully")
        except Exception as broadcast_error:
            # Log broadcast error but don't fail the request
            print(f"WebSocket broadcast failed: {broadcast_error}")
        return db_task
    except ValueError as e:
        print(f"ValueError in create_task: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Exception in create_task: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create task: {str(e)}")

@app.get("/tasks/{task_id}", response_model=schemas.Task)
async def get_task(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_task = crud.get_task(db, task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    return db_task

@app.put("/tasks/{task_id}", response_model=schemas.Task)
async def update_task(
    task_id: str,
    task_update: schemas.TaskUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Check authorization
    check_task_authorization(db, task_id, current_user, "update")

    db_task = crud.update_task(db, task_id, task_update)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    try:
        await manager.broadcast({
            "type": "task_updated",
            "data": {"task": schemas.Task.model_validate(db_task).model_dump()}
        })
    except Exception as broadcast_error:
        print(f"WebSocket broadcast failed: {broadcast_error}")
    return db_task

@app.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Check authorization
    check_task_authorization(db, task_id, current_user, "delete")

    success = crud.delete_task(db, task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    await manager.broadcast({
        "type": "task_deleted",
        "data": {"task_id": task_id}
    })
    return {"message": "Task deleted"}

@app.post("/tasks/{task_id}/assign", response_model=schemas.Task)
async def assign_task(
    task_id: str,
    user_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Check authorization
    check_task_authorization(db, task_id, current_user, "assign")

    db_task = crud.assign_task(db, task_id, user_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    assigned_user = db.query(models.User).filter(models.User.id == user_id).first()
    try:
        await manager.broadcast({
            "type": "task_assigned",
            "data": {
                "task": schemas.Task.model_validate(db_task).model_dump(),
                "user": {"id": current_user.id, "username": current_user.username},
                "assigned_to_me": user_id == current_user.id
            }
        })
    except Exception as broadcast_error:
        print(f"WebSocket broadcast failed: {broadcast_error}")
    return db_task

@app.post("/tasks/{task_id}/complete", response_model=schemas.Task)
async def complete_task(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Check authorization
    check_task_authorization(db, task_id, current_user, "complete")

    db_task = crud.complete_task(db, task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Validate separately from broadcast
    try:
        task_data = schemas.Task.model_validate(db_task).model_dump()
    except Exception as validation_error:
        print(f"Task validation error: {validation_error}")
        raise HTTPException(status_code=500, detail="Task validation failed")

    # Broadcast separately
    try:
        await manager.broadcast({
            "type": "task_completed",
            "data": {
                "task": task_data,
                "user": {"id": current_user.id, "username": current_user.username}
            }
        })
    except Exception as broadcast_error:
        print(f"WebSocket broadcast failed: {broadcast_error}")

    return db_task

@app.post("/tasks/{task_id}/postpone", response_model=schemas.Task)
async def postpone_task(
    task_id: str,
    postpone_data: schemas.TaskPostpone,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_task = crud.postpone_task(db, task_id, postpone_data.reason)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    try:
        await manager.broadcast({
            "type": "task_postponed",
            "data": {
                "task": schemas.Task.model_validate(db_task).model_dump(),
                "user": {"id": current_user.id, "username": current_user.username},
                "reason": postpone_data.reason
            }
        })
    except Exception as broadcast_error:
        print(f"WebSocket broadcast failed: {broadcast_error}")
    return db_task

@app.post("/tasks/{task_id}/archive", response_model=schemas.Task)
async def archive_task(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Check authorization
    check_task_authorization(db, task_id, current_user, "archive")

    try:
        db_task = crud.archive_task(db, task_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Validate separately from broadcast
    try:
        task_data = schemas.Task.model_validate(db_task).model_dump()
    except Exception as validation_error:
        print(f"Task validation error: {validation_error}")
        raise HTTPException(status_code=500, detail="Task validation failed")

    # Broadcast separately
    try:
        await manager.broadcast({
            "type": "task_archived",
            "data": {
                "task": task_data,
                "user": {"id": current_user.id, "username": current_user.username}
            }
        })
    except Exception as broadcast_error:
        print(f"WebSocket broadcast failed: {broadcast_error}")

    return db_task

@app.get("/tasks/archived/list", response_model=List[schemas.Task])
async def get_archived_tasks(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return crud.get_archived_tasks(db)

@app.get("/tasks/overdue", response_model=List[schemas.OverdueTask])
async def get_overdue_tasks(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return crud.get_overdue_tasks(db)

@app.post("/tasks/{task_id}/restore", response_model=schemas.Task)
async def restore_task(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_task = crud.restore_task(db, task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        await manager.broadcast({
            "type": "task_restored",
            "data": {
                "task": schemas.Task.model_validate(db_task).model_dump(),
                "user": {"id": current_user.id, "username": current_user.username}
            }
        })
    except Exception as broadcast_error:
        print(f"WebSocket broadcast failed: {broadcast_error}")

    return db_task

# Timer endpoints
@app.post("/tasks/{task_id}/start-timer", response_model=schemas.TimeSession)
async def start_timer(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    session = crud.start_timer(db, task_id, current_user.id)
    task = crud.get_task(db, task_id)
    try:
        await manager.broadcast({
            "type": "timer_started",
            "data": {
                "task": schemas.Task.model_validate(task).model_dump(),
                "user": {"id": current_user.id, "username": current_user.username}
            }
        })
    except Exception as broadcast_error:
        print(f"WebSocket broadcast failed: {broadcast_error}")
    return session

@app.post("/tasks/{task_id}/stop-timer", response_model=schemas.TimeSession)
async def stop_timer(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    session = crud.stop_timer(db, task_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="No active timer found")
    task = crud.get_task(db, task_id)
    try:
        await manager.broadcast({
            "type": "timer_stopped",
            "data": {
                "task": schemas.Task.model_validate(task).model_dump(),
                "user": {"id": current_user.id, "username": current_user.username},
                "duration": session.duration_seconds
            }
        })
    except Exception as broadcast_error:
        print(f"WebSocket broadcast failed: {broadcast_error}")
    return session

# Comment endpoints
@app.get("/tasks/{task_id}/comments", response_model=List[schemas.Comment])
async def get_comments(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    comments = crud.get_comments(db, task_id)

    # Build response with computed fields (user and session already loaded via joinedload)
    result = []
    for comment in comments:
        # Convert to dict and add computed fields
        comment_dict = {
            "id": comment.id,
            "task_id": comment.task_id,
            "user_id": comment.user_id,
            "session_id": comment.session_id,
            "text": comment.text,
            "created_at": comment.created_at,
            "updated_at": comment.updated_at,
            "username": comment.user.username if comment.user else "Unknown",
            "session_duration": None
        }

        # Add session duration if available (already loaded via joinedload)
        if comment.session and comment.session.duration_seconds:
            comment_dict["session_duration"] = comment.session.duration_seconds

        result.append(comment_dict)

    return result

@app.post("/tasks/{task_id}/comments", response_model=schemas.Comment)
async def create_comment(
    task_id: str,
    comment: schemas.CommentCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_comment = crud.create_comment(db, task_id, current_user.id, comment)
    task = crud.get_task(db, task_id)
    try:
        await manager.broadcast({
            "type": "comment_added",
            "data": {
                "comment": schemas.Comment.model_validate(db_comment).model_dump(),
                "task": schemas.Task.model_validate(task).model_dump(),
                "user": {"id": current_user.id, "username": current_user.username},
                "is_my_task": task.created_by == current_user.id or task.assigned_to == current_user.id
            }
        })
    except Exception as broadcast_error:
        print(f"WebSocket broadcast failed: {broadcast_error}")
    return db_comment

@app.put("/comments/{comment_id}", response_model=schemas.Comment)
async def update_comment(
    comment_id: str,
    comment_update: schemas.CommentUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_comment = crud.update_comment(db, comment_id, comment_update)
    if not db_comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if db_comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this comment")
    try:
        await manager.broadcast({
            "type": "comment_updated",
            "data": {
                "comment": schemas.Comment.model_validate(db_comment).model_dump(),
                "task_id": db_comment.task_id
            }
        })
    except Exception as broadcast_error:
        print(f"WebSocket broadcast failed: {broadcast_error}")
    return db_comment

@app.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not db_comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if db_comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment")

    task_id = db_comment.task_id
    success = crud.delete_comment(db, comment_id)
    if success:
        await manager.broadcast({
            "type": "comment_deleted",
            "data": {"comment_id": comment_id, "task_id": task_id}
        })
    return {"message": "Comment deleted"}

# Calendar endpoints
@app.get("/calendar/sessions", response_model=List[schemas.CalendarSession])
async def get_calendar_sessions(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return crud.get_calendar_sessions(db, start_date, end_date)

# WebSocket endpoint with authentication
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    try:
        # Wait for authentication message (first message must contain token)
        data = await websocket.receive_text()
        auth_message = json.loads(data)

        if auth_message.get("type") != "auth" or "token" not in auth_message:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication required")
            return

        token = auth_message["token"]

        # Verify JWT token
        try:
            payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
            username: str = payload.get("sub")
            if username is None:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
                return
        except JWTError:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
            return

        # Send authentication success
        await websocket.send_json({"type": "auth_success", "username": username})

        # Connection authenticated, add to manager
        manager.active_connections.append(websocket)

        try:
            while True:
                data = await websocket.receive_text()
                # Echo back for now, can add more logic later
                await websocket.send_text(f"Message received: {data}")
        except WebSocketDisconnect:
            manager.disconnect(websocket)
    except WebSocketDisconnect:
        # Client disconnected before authentication
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        try:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR, reason="Internal error")
        except:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

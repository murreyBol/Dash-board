from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import List, Optional
import json

import models
import schemas
import crud
import auth
from database import engine, get_db

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Task Planner API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        db_task = crud.create_task(db, task, current_user.id)
        await manager.broadcast({
            "type": "task_created",
            "data": {
                "task": schemas.Task.from_orm(db_task).dict(),
                "user": {"id": current_user.id, "username": current_user.username}
            }
        })
        return db_task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create task")

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
    db_task = crud.update_task(db, task_id, task_update)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    await manager.broadcast({
        "type": "task_updated",
        "data": {"task": schemas.Task.from_orm(db_task).dict()}
    })
    return db_task

@app.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
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
    db_task = crud.assign_task(db, task_id, user_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    assigned_user = db.query(models.User).filter(models.User.id == user_id).first()
    await manager.broadcast({
        "type": "task_assigned",
        "data": {
            "task": schemas.Task.from_orm(db_task).dict(),
            "user": {"id": current_user.id, "username": current_user.username},
            "assigned_to_me": user_id == current_user.id
        }
    })
    return db_task

@app.post("/tasks/{task_id}/complete", response_model=schemas.Task)
async def complete_task(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_task = crud.complete_task(db, task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    await manager.broadcast({
        "type": "task_completed",
        "data": {
            "task": schemas.Task.from_orm(db_task).dict(),
            "user": {"id": current_user.id, "username": current_user.username}
        }
    })
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
    await manager.broadcast({
        "type": "task_postponed",
        "data": {
            "task": schemas.Task.from_orm(db_task).dict(),
            "user": {"id": current_user.id, "username": current_user.username},
            "reason": postpone_data.reason
        }
    })
    return db_task

@app.post("/tasks/{task_id}/archive", response_model=schemas.Task)
async def archive_task(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_task = crud.archive_task(db, task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
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

# Timer endpoints
@app.post("/tasks/{task_id}/start-timer", response_model=schemas.TimeSession)
async def start_timer(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    session = crud.start_timer(db, task_id, current_user.id)
    task = crud.get_task(db, task_id)
    await manager.broadcast({
        "type": "timer_started",
        "data": {
            "task": schemas.Task.from_orm(task).dict(),
            "user": {"id": current_user.id, "username": current_user.username}
        }
    })
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
    await manager.broadcast({
        "type": "timer_stopped",
        "data": {
            "task": schemas.Task.from_orm(task).dict(),
            "user": {"id": current_user.id, "username": current_user.username},
            "duration": session.duration_seconds
        }
    })
    return session

# Comment endpoints
@app.get("/tasks/{task_id}/comments", response_model=List[schemas.Comment])
async def get_comments(
    task_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return crud.get_comments(db, task_id)

@app.post("/tasks/{task_id}/comments", response_model=schemas.Comment)
async def create_comment(
    task_id: str,
    comment: schemas.CommentCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_comment = crud.create_comment(db, task_id, current_user.id, comment)
    task = crud.get_task(db, task_id)
    await manager.broadcast({
        "type": "comment_added",
        "data": {
            "comment": schemas.Comment.from_orm(db_comment).dict(),
            "task": schemas.Task.from_orm(task).dict(),
            "user": {"id": current_user.id, "username": current_user.username},
            "is_my_task": task.created_by == current_user.id or task.assigned_to == current_user.id
        }
    })
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
    await manager.broadcast({
        "type": "comment_updated",
        "data": {
            "comment": schemas.Comment.from_orm(db_comment).dict(),
            "task_id": db_comment.task_id
        }
    })
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
@app.get("/calendar/sessions", response_model=List[schemas.TimeSession])
async def get_calendar_sessions(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return crud.get_calendar_sessions(db, start_date, end_date)

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back for now, can add more logic later
            await websocket.send_text(f"Message received: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

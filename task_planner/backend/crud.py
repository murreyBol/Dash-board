from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime
from typing import List, Optional

import models
import schemas
from auth import get_password_hash

# User CRUD
def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        password_hash=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def update_user_settings(db: Session, user_id: str, settings: schemas.UserSettings):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user:
        user.auto_start_timer = settings.auto_start_timer
        db.commit()
        db.refresh(user)
    return user

# Task CRUD
def create_task(db: Session, task: schemas.TaskCreate, user_id: str):
    db_task = models.Task(
        title=task.title,
        description=task.description,
        priority=task.priority,
        created_by=user_id
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

def get_tasks(db: Session, priority: Optional[str] = None, status: Optional[str] = None):
    query = db.query(models.Task)
    if priority:
        query = query.filter(models.Task.priority == priority)
    if status:
        query = query.filter(models.Task.status == status)
    return query.filter(models.Task.status != models.StatusEnum.archived).all()

def get_task(db: Session, task_id: str):
    return db.query(models.Task).filter(models.Task.id == task_id).first()

def update_task(db: Session, task_id: str, task_update: schemas.TaskUpdate):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if db_task:
        update_data = task_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_task, key, value)
        db_task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_task)
    return db_task

def delete_task(db: Session, task_id: str):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if db_task:
        db.delete(db_task)
        db.commit()
        return True
    return False

def assign_task(db: Session, task_id: str, user_id: str):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if db_task:
        # Create assignment history
        assignment = models.TaskAssignment(
            task_id=task_id,
            user_id=user_id
        )
        db.add(assignment)

        db_task.assigned_to = user_id
        db_task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_task)
    return db_task

def complete_task(db: Session, task_id: str):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if db_task:
        db_task.status = models.StatusEnum.completed
        db_task.completed_at = datetime.utcnow()
        db_task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_task)
    return db_task

def postpone_task(db: Session, task_id: str, reason: str):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if db_task:
        db_task.status = models.StatusEnum.postponed
        db_task.postponed_reason = reason
        db_task.postponed_at = datetime.utcnow()
        db_task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_task)
    return db_task

def archive_task(db: Session, task_id: str):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if db_task:
        db_task.status = models.StatusEnum.archived
        db_task.archived_at = datetime.utcnow()
        db_task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_task)
    return db_task

def get_archived_tasks(db: Session):
    return db.query(models.Task).filter(models.Task.status == models.StatusEnum.archived).all()

# Comment CRUD
def create_comment(db: Session, task_id: str, user_id: str, comment: schemas.CommentCreate):
    db_comment = models.Comment(
        task_id=task_id,
        user_id=user_id,
        text=comment.text
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    return db_comment

def get_comments(db: Session, task_id: str):
    return db.query(models.Comment).filter(models.Comment.task_id == task_id).all()

def update_comment(db: Session, comment_id: str, comment_update: schemas.CommentUpdate):
    db_comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if db_comment:
        db_comment.text = comment_update.text
        db_comment.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_comment)
    return db_comment

def delete_comment(db: Session, comment_id: str):
    db_comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if db_comment:
        db.delete(db_comment)
        db.commit()
        return True
    return False

# TimeSession CRUD
def start_timer(db: Session, task_id: str, user_id: str):
    # Check if there's already an active session
    active_session = db.query(models.TimeSession).filter(
        and_(
            models.TimeSession.task_id == task_id,
            models.TimeSession.user_id == user_id,
            models.TimeSession.ended_at == None
        )
    ).first()

    if active_session:
        return active_session

    db_session = models.TimeSession(
        task_id=task_id,
        user_id=user_id,
        started_at=datetime.utcnow()
    )
    db.add(db_session)

    # Update task status
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if task and task.status == models.StatusEnum.todo:
        task.status = models.StatusEnum.in_progress
        task.started_at = datetime.utcnow()

    db.commit()
    db.refresh(db_session)
    return db_session

def stop_timer(db: Session, task_id: str, user_id: str):
    active_session = db.query(models.TimeSession).filter(
        and_(
            models.TimeSession.task_id == task_id,
            models.TimeSession.user_id == user_id,
            models.TimeSession.ended_at == None
        )
    ).first()

    if active_session:
        active_session.ended_at = datetime.utcnow()
        duration = (active_session.ended_at - active_session.started_at).total_seconds()
        active_session.duration_seconds = int(duration)
        db.commit()
        db.refresh(active_session)

    return active_session

def get_calendar_sessions(db: Session, start_date: Optional[str] = None, end_date: Optional[str] = None):
    query = db.query(models.TimeSession).filter(models.TimeSession.ended_at != None)

    if start_date:
        query = query.filter(models.TimeSession.started_at >= start_date)
    if end_date:
        query = query.filter(models.TimeSession.started_at <= end_date)

    return query.all()

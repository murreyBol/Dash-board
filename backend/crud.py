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

def get_all_users(db: Session):
    return db.query(models.User).all()

def update_user_settings(db: Session, user_id: str, settings: schemas.UserSettings):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user:
        user.auto_start_timer = settings.auto_start_timer
        db.commit()
        db.refresh(user)
    return user

# Task CRUD
def create_task(db: Session, task: schemas.TaskCreate, user_id: str):
    if not task.title or not task.title.strip():
        raise ValueError("Task title is required")
    if not user_id:
        raise ValueError("User ID is required")

    try:
        db_task = models.Task(
            title=task.title.strip(),
            description=task.description.strip() if task.description else None,
            priority=task.priority,
            created_by=user_id,
            assigned_to=task.assigned_to
        )
        db.add(db_task)
        db.commit()
        db.refresh(db_task)
        return db_task
    except Exception as e:
        db.rollback()
        raise e

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
    if not task_id:
        raise ValueError("Task ID is required")

    try:
        db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if db_task:
            update_data = task_update.dict(exclude_unset=True)
            for key, value in update_data.items():
                setattr(db_task, key, value)
            db_task.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(db_task)
        return db_task
    except Exception as e:
        db.rollback()
        raise e

def delete_task(db: Session, task_id: str):
    if not task_id:
        raise ValueError("Task ID is required")

    try:
        db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
        if db_task:
            db.delete(db_task)
            db.commit()
            return True
        return False
    except Exception as e:
        db.rollback()
        raise e

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

def complete_task_with_comment(db: Session, task_id: str, user_id: str, comment_text: str):
    """Complete task with comment and archive it automatically."""
    # Get the task
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        return None

    # Calculate total time from all sessions
    all_sessions = db.query(models.TimeSession).filter(
        models.TimeSession.task_id == task_id
    ).all()
    total_seconds = sum(session.duration_seconds for session in all_sessions if session.duration_seconds)

    # Add comment
    db_comment = models.Comment(
        task_id=task_id,
        user_id=user_id,
        text=comment_text
    )
    db.add(db_comment)

    # Complete and archive task
    db_task.status = models.StatusEnum.archived
    db_task.completed_at = datetime.utcnow()
    db_task.archived_at = datetime.utcnow()
    db_task.total_time_seconds = total_seconds
    db_task.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(db_task)
    db.refresh(db_comment)

    return db_task

def get_calendar_sessions(db: Session, start_date: Optional[str] = None, end_date: Optional[str] = None):
    query = db.query(models.TimeSession).filter(models.TimeSession.ended_at != None)

    if start_date:
        query = query.filter(models.TimeSession.started_at >= start_date)
    if end_date:
        query = query.filter(models.TimeSession.started_at <= end_date)

    return query.all()

def get_task_last_activity(db: Session, task_id: str) -> Optional[datetime]:
    """Calculate the most recent activity timestamp for a task."""
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        return None

    timestamps = [task.created_at, task.updated_at]

    # Check latest comment
    latest_comment = db.query(models.Comment).filter(
        models.Comment.task_id == task_id
    ).order_by(models.Comment.created_at.desc()).first()
    if latest_comment:
        timestamps.append(latest_comment.created_at)
        if latest_comment.updated_at:
            timestamps.append(latest_comment.updated_at)

    # Check latest time session
    latest_session = db.query(models.TimeSession).filter(
        models.TimeSession.task_id == task_id
    ).order_by(models.TimeSession.started_at.desc()).first()
    if latest_session:
        timestamps.append(latest_session.started_at)
        if latest_session.ended_at:
            timestamps.append(latest_session.ended_at)

    # Return the most recent timestamp
    return max(ts for ts in timestamps if ts is not None)

def get_overdue_tasks(db: Session, days_threshold: int = 7):
    """Get tasks with no activity for the specified number of days."""
    all_tasks = db.query(models.Task).filter(
        models.Task.status != models.StatusEnum.archived
    ).all()

    overdue_tasks = []
    now = datetime.utcnow()

    for task in all_tasks:
        last_activity = get_task_last_activity(db, task.id)
        if last_activity:
            days_inactive = (now - last_activity).days
            if days_inactive >= days_threshold:
                # Add computed fields to task object
                task.last_activity_at = last_activity
                task.inactive_days = days_inactive
                overdue_tasks.append(task)

    return overdue_tasks

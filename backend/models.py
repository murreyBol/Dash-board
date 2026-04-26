from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from database import Base

def generate_uuid():
    return str(uuid.uuid4())

class PriorityEnum(str, enum.Enum):
    urgent = "urgent"
    medium = "medium"
    low = "low"
    overdue = "overdue"  # Deprecated: kept for backward compatibility with existing DB records
    future = "future"

class StatusEnum(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    completed = "completed"
    postponed = "postponed"
    archived = "archived"

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    auto_start_timer = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    created_tasks = relationship("Task", back_populates="creator", foreign_keys="Task.created_by")
    assigned_tasks = relationship("Task", back_populates="assignee", foreign_keys="Task.assigned_to")
    comments = relationship("Comment", back_populates="user")
    time_sessions = relationship("TimeSession", back_populates="user")
    task_assignments = relationship("TaskAssignment", back_populates="user")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(String, default="")
    priority = Column(SQLEnum(PriorityEnum), nullable=False, index=True)
    status = Column(SQLEnum(StatusEnum), default=StatusEnum.todo, index=True)
    postponed_reason = Column(String, nullable=True)

    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    assigned_to = Column(String, ForeignKey("users.id"), nullable=True, index=True)

    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    postponed_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    creator = relationship("User", back_populates="created_tasks", foreign_keys=[created_by])
    assignee = relationship("User", back_populates="assigned_tasks", foreign_keys=[assigned_to])
    comments = relationship("Comment", back_populates="task", cascade="all, delete-orphan")
    time_sessions = relationship("TimeSession", back_populates="task", cascade="all, delete-orphan")
    assignments = relationship("TaskAssignment", back_populates="task", cascade="all, delete-orphan")

class Comment(Base):
    __tablename__ = "comments"

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    text = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True)

    # Relationships
    task = relationship("Task", back_populates="comments")
    user = relationship("User", back_populates="comments")

class TimeSession(Base):
    __tablename__ = "time_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)

    # Relationships
    task = relationship("Task", back_populates="time_sessions")
    user = relationship("User", back_populates="time_sessions")

class TaskAssignment(Base):
    __tablename__ = "task_assignments"

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    unassigned_at = Column(DateTime, nullable=True)

    # Relationships
    task = relationship("Task", back_populates="assignments")
    user = relationship("User", back_populates="task_assignments")

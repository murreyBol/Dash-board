from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from models import PriorityEnum, StatusEnum

# User schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserSettings(BaseModel):
    auto_start_timer: bool

class User(UserBase):
    id: str
    auto_start_timer: bool
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}

# Task schemas
class TaskBase(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: PriorityEnum

class TaskCreate(TaskBase):
    assigned_to: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[PriorityEnum] = None
    status: Optional[StatusEnum] = None
    assigned_to: Optional[str] = None

class TaskPostpone(BaseModel):
    reason: str

class Task(TaskBase):
    id: str
    status: StatusEnum
    postponed_reason: Optional[str] = None
    created_by: str
    assigned_to: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    postponed_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    total_time_seconds: int = 0

class OverdueTask(Task):
    last_activity_at: datetime
    inactive_days: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

# Complete task with comment schema
class CompleteTaskWithComment(BaseModel):
    comment_text: str

# Comment schemas
class CommentBase(BaseModel):
    text: str

class CommentCreate(CommentBase):
    pass

class CommentUpdate(CommentBase):
    pass

class Comment(CommentBase):
    id: str
    task_id: str
    user_id: str
    username: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

# TimeSession schemas
class TimeSessionBase(BaseModel):
    task_id: str

class TimeSessionCreate(TimeSessionBase):
    pass

class TimeSession(TimeSessionBase):
    id: str
    user_id: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: int

    model_config = {"from_attributes": True}

# Token schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Calendar schemas
class CalendarSession(BaseModel):
    date: str
    task_title: str
    username: str
    duration_seconds: int

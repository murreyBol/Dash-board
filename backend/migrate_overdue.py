"""
Migration script to update tasks with priority='overdue' to priority='urgent'
Run this once after deploying the new code that removes 'overdue' from PriorityEnum
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Get database URL from environment
DATABASE_URL = os.environ.get('DATABASE_URL')

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable not set")
    exit(1)

# Fix postgres:// to postgresql://
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

# Create engine and session
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()

try:
    # Update all tasks with priority='overdue' to priority='urgent'
    result = session.execute(
        text("UPDATE tasks SET priority = 'urgent' WHERE priority = 'overdue'")
    )
    session.commit()

    print(f"✓ Successfully updated {result.rowcount} tasks from 'overdue' to 'urgent'")

except Exception as e:
    session.rollback()
    print(f"✗ Error during migration: {e}")
    exit(1)

finally:
    session.close()
    engine.dispose()

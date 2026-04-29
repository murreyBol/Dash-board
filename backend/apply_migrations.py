from sqlalchemy import text
from database import engine

def apply_migrations():
    """Apply database migrations on startup"""
    try:
        with engine.connect() as conn:
            # Check if session_id column exists in comments table
            result = conn.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='comments' AND column_name='session_id'
            """))

            if not result.fetchone():
                print("🔄 Applying migration: add session_id to comments table")

                # Add session_id column
                conn.execute(text("""
                    ALTER TABLE comments
                    ADD COLUMN session_id VARCHAR
                    REFERENCES time_sessions(id)
                """))

                # Create index for better performance
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_comments_session_id
                    ON comments(session_id)
                """))

                conn.commit()
                print("✅ Migration applied successfully: session_id added to comments")
            else:
                print("✓ Migration already applied: session_id exists in comments")

    except Exception as e:
        print(f"❌ Migration error: {e}")
        # Don't crash the app if migration fails
        pass

if __name__ == "__main__":
    apply_migrations()

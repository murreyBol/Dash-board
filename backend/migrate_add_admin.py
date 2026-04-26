"""
Migration script to add is_admin field to existing users
"""
from sqlalchemy import create_engine, text
from database import SQLALCHEMY_DATABASE_URL

def migrate():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

    with engine.connect() as conn:
        # Check if column exists
        result = conn.execute(text("""
            SELECT COUNT(*)
            FROM pragma_table_info('users')
            WHERE name='is_admin'
        """))

        if result.scalar() == 0:
            print("Adding is_admin column to users table...")
            conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"))
            conn.commit()
            print("✓ Column added successfully")

            # Make first user admin
            print("Setting first user as admin...")
            conn.execute(text("""
                UPDATE users
                SET is_admin = 1
                WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1)
            """))
            conn.commit()
            print("✓ First user is now admin")
        else:
            print("✓ Column is_admin already exists")

if __name__ == "__main__":
    migrate()

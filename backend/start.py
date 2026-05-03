#!/usr/bin/env python3
"""
Startup script for Task Planner Backend on Render.com
Validates environment and starts Uvicorn server
"""
import os
import sys

def validate_env():
    """Validate required environment variables"""
    required_vars = {
        'JWT_SECRET_KEY': 'JWT signing key',
        'SITE_PIN_CODE': 'Site PIN code (min 4 chars)',
        'DATABASE_URL': 'PostgreSQL connection string'
    }

    missing = []
    for var, description in required_vars.items():
        if not os.getenv(var):
            missing.append(f"  - {var}: {description}")

    if missing:
        print("ERROR: Missing required environment variables:")
        print("\n".join(missing))
        sys.exit(1)

    print("✓ All required environment variables present")

def setup_pin():
    """Hash PIN code if needed"""
    print("Setting up PIN code...")
    try:
        from main import load_pin_code_hash
        load_pin_code_hash()
        print("✓ PIN code configured")
    except Exception as e:
        print(f"ERROR: Failed to setup PIN: {e}")
        sys.exit(1)

def run_migrations():
    """Run database migrations"""
    print("Running database migrations...")
    try:
        from database import engine
        import models
        models.Base.metadata.create_all(bind=engine)
        print("✓ Database tables created/verified")
    except Exception as e:
        print(f"ERROR: Failed to run migrations: {e}")
        sys.exit(1)

def start_server():
    """Start Uvicorn server"""
    import uvicorn
    port = int(os.getenv('PORT', 8000))
    print(f"\n🚀 Starting Uvicorn server on port {port}...")

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

if __name__ == "__main__":
    print("=== Task Planner Backend Startup ===")
    print(f"Working directory: {os.getcwd()}")
    print(f"Python: {sys.version}")

    validate_env()
    setup_pin()
    run_migrations()
    start_server()

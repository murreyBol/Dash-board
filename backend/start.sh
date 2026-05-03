#!/bin/bash
set -e

echo "=============================================="
echo "=== Task Planner Backend Startup Script ==="
echo "=============================================="
echo ""
echo "Environment Information:"
echo "  Current directory: $(pwd)"
echo "  Script path: ${BASH_SOURCE[0]}"
echo "  Script directory: $(dirname "${BASH_SOURCE[0]}")"
echo "  HOME: ${HOME:-not set}"
echo "  USER: ${USER:-not set}"
echo ""

# Function to find and navigate to backend directory
find_backend_dir() {
    echo "Detecting backend directory..."

    # Check if we're already in backend (main.py exists here)
    if [ -f "main.py" ] && [ -f "requirements.txt" ]; then
        echo "✓ Already in backend directory: $(pwd)"
        return 0
    fi

    # Check if backend/ subdirectory exists
    if [ -d "backend" ] && [ -f "backend/main.py" ]; then
        echo "✓ Found backend/ subdirectory, navigating..."
        cd backend
        echo "✓ Now in: $(pwd)"
        return 0
    fi

    # Check if we're one level deep and need to go up
    if [ -f "../main.py" ] && [ -f "../requirements.txt" ]; then
        echo "✓ Found main.py in parent directory, navigating up..."
        cd ..
        echo "✓ Now in: $(pwd)"
        return 0
    fi

    # Last resort: check if script is in backend/ and we need to cd to script dir
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$SCRIPT_DIR/main.py" ]; then
        echo "✓ Found main.py in script directory, navigating there..."
        cd "$SCRIPT_DIR"
        echo "✓ Now in: $(pwd)"
        return 0
    fi

    # Failed to find backend
    echo "✗ ERROR: Cannot locate backend directory with main.py"
    echo ""
    echo "Directory structure:"
    echo "Current directory ($(pwd)):"
    ls -la
    echo ""
    if [ -d "backend" ]; then
        echo "backend/ directory contents:"
        ls -la backend/
    fi
    echo ""
    echo "Script directory ($SCRIPT_DIR):"
    ls -la "$SCRIPT_DIR" || echo "Cannot access script directory"
    return 1
}

# Navigate to backend directory
if ! find_backend_dir; then
    exit 1
fi

echo ""
echo "=============================================="
echo "=== Environment Variables Check ==="
echo "=============================================="

# Check required environment variables
MISSING_VARS=0

if [ -z "$JWT_SECRET_KEY" ]; then
    echo "✗ ERROR: JWT_SECRET_KEY is not set"
    echo "  Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
    MISSING_VARS=1
else
    echo "✓ JWT_SECRET_KEY is set (${#JWT_SECRET_KEY} characters)"
fi

if [ -z "$SITE_PIN_CODE" ]; then
    echo "✗ ERROR: SITE_PIN_CODE is not set"
    echo "  Set a secure PIN code (minimum 4 characters)"
    MISSING_VARS=1
else
    echo "✓ SITE_PIN_CODE is set (${#SITE_PIN_CODE} characters)"
fi

if [ -z "$DATABASE_URL" ]; then
    echo "✗ ERROR: DATABASE_URL is not set"
    MISSING_VARS=1
else
    # Mask the password in the URL for logging
    MASKED_URL=$(echo "$DATABASE_URL" | sed -E 's/(:[^:@]+@)/:*****@/')
    echo "✓ DATABASE_URL is set: $MASKED_URL"
fi

if [ $MISSING_VARS -eq 1 ]; then
    echo ""
    echo "✗ Missing required environment variables. Exiting."
    exit 1
fi

echo ""
echo "=============================================="
echo "=== Python Environment Check ==="
echo "=============================================="
echo "Python version: $(python --version 2>&1)"
echo "Python location: $(which python)"
echo "Pip version: $(pip --version 2>&1)"
echo ""

echo "=============================================="
echo "=== PIN Code Configuration ==="
echo "=============================================="
python -c "
import os
import sys
import bcrypt

try:
    from main import load_pin_code_hash, save_pin_code_hash

    # Load or create PIN hash
    pin_hash = load_pin_code_hash()
    print('✓ PIN code configured successfully')
    sys.exit(0)
except Exception as e:
    print(f'✗ ERROR configuring PIN code: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
"

if [ $? -ne 0 ]; then
    echo "✗ PIN code configuration failed"
    exit 1
fi

echo ""
echo "=============================================="
echo "=== Database Migration ==="
echo "=============================================="
python -c "
import sys

try:
    from database import engine
    import models

    # Create all tables
    models.Base.metadata.create_all(bind=engine)
    print('✓ Database tables created/verified successfully')
    sys.exit(0)
except Exception as e:
    print(f'✗ ERROR during database migration: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
"

if [ $? -ne 0 ]; then
    echo "✗ Database migration failed"
    exit 1
fi

echo ""
echo "=============================================="
echo "=== Starting Uvicorn Server ==="
echo "=============================================="
PORT=${PORT:-8000}
echo "Server configuration:"
echo "  Host: 0.0.0.0"
echo "  Port: $PORT"
echo "  Working directory: $(pwd)"
echo ""
echo "Starting server..."
echo "=============================================="
echo ""

exec uvicorn main:app --host 0.0.0.0 --port $PORT

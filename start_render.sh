#!/bin/bash
set -e

echo "=== Task Planner Backend Startup ==="
echo "Working directory: $(pwd)"
echo "Script location: ${BASH_SOURCE[0]}"

# Detect if we're in the backend directory or project root
if [ -f "main.py" ]; then
    echo "Already in backend directory"
    BACKEND_DIR="."
elif [ -d "backend" ] && [ -f "backend/main.py" ]; then
    echo "In project root, navigating to backend/"
    BACKEND_DIR="backend"
else
    echo "ERROR: Cannot find backend directory with main.py"
    echo "Current directory contents:"
    ls -la
    exit 1
fi

cd "$BACKEND_DIR"
echo "Changed to: $(pwd)"

# Check required environment variables
if [ -z "$JWT_SECRET_KEY" ]; then
    echo "ERROR: JWT_SECRET_KEY environment variable is not set"
    echo "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
    exit 1
fi

if [ -z "$SITE_PIN_CODE" ]; then
    echo "ERROR: SITE_PIN_CODE environment variable is not set"
    echo "Set a secure PIN code (minimum 4 characters)"
    exit 1
fi

if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

# Hash the PIN code if it's not already hashed
echo "Checking PIN code..."
python -c "
import os
import bcrypt
from main import load_pin_code_hash, save_pin_code_hash

# Load or create PIN hash
pin_hash = load_pin_code_hash()
print('PIN code configured successfully')
"

# Run database migrations
echo "Running database migrations..."
python -c "
from database import engine
import models

# Create all tables
models.Base.metadata.create_all(bind=engine)
print('Database tables created/verified')
"

# Start the server
echo "Starting Uvicorn server on port ${PORT:-8000}..."
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

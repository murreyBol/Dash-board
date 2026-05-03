#!/bin/bash
# Root-level wrapper script for Task Planner Backend
# This script simply delegates to the backend/start.sh script

set -e

echo "=== Root-level start.sh wrapper ==="
echo "Current directory: $(pwd)"
echo "Delegating to backend/start.sh..."
echo ""

# Execute the backend startup script
exec bash backend/start.sh

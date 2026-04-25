#!/bin/bash

# Task Planner - Скрипт деплоя на GitHub
# Использование: ./deploy.sh "YOUR_GITHUB_USERNAME"

if [ -z "$1" ]; then
    echo "Ошибка: Укажите ваш GitHub username"
    echo "Использование: ./deploy.sh YOUR_USERNAME"
    exit 1
fi

GITHUB_USERNAME=$1
REPO_NAME="task-planner"

echo "=========================================="
echo "Task Planner - Деплой на GitHub"
echo "=========================================="
echo ""

# Шаг 1: Инициализация Git
echo "[1/4] Инициализация Git репозитория..."
cd "$(dirname "$0")"
git init
git add .
git commit -m "Initial commit: Task Planner Dashboard"

# Шаг 2: Подключение к GitHub
echo ""
echo "[2/4] Подключение к GitHub..."
git remote add origin "https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"
git branch -M main

# Шаг 3: Пуш на GitHub
echo ""
echo "[3/4] Загрузка на GitHub..."
echo "Вам может потребоваться ввести логин и пароль GitHub"
git push -u origin main

# Шаг 4: Инструкции
echo ""
echo "[4/4] Готово!"
echo ""
echo "=========================================="
echo "Следующие шаги:"
echo "=========================================="
echo ""
echo "1. Backend (Render.com):"
echo "   - Перейдите на https://render.com"
echo "   - Создайте PostgreSQL базу данных"
echo "   - Создайте Web Service из вашего GitHub репозитория"
echo "   - Root Directory: backend"
echo "   - Build Command: pip install -r requirements.txt"
echo "   - Start Command: uvicorn main:app --host 0.0.0.0 --port \$PORT"
echo ""
echo "2. Frontend (GitHub Pages):"
echo "   - Перейдите на https://github.com/$GITHUB_USERNAME/$REPO_NAME/settings/pages"
echo "   - Source: Deploy from a branch"
echo "   - Branch: main → Folder: /frontend"
echo "   - Нажмите Save"
echo ""
echo "3. Обновите API_URL в frontend/js/api.js:"
echo "   - Замените 'your-backend-app.onrender.com' на ваш Render URL"
echo "   - Закоммитьте и запушьте изменения"
echo ""
echo "4. Обновите CORS в backend/main.py:"
echo "   - Добавьте 'https://$GITHUB_USERNAME.github.io' в origins"
echo "   - Закоммитьте и запушьте изменения"
echo ""
echo "=========================================="
echo "Ваш сайт будет доступен по адресу:"
echo "https://$GITHUB_USERNAME.github.io/$REPO_NAME/"
echo "=========================================="

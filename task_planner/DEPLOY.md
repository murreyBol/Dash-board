# Task Planner - Инструкция по деплою

## Архитектура
- **Frontend**: GitHub Pages (статические файлы)
- **Backend**: Render.com (FastAPI + PostgreSQL)

---

## Шаг 1: Деплой Backend на Render.com

### 1.1 Создайте аккаунт на Render.com
- Перейдите на https://render.com
- Зарегистрируйтесь через GitHub

### 1.2 Создайте PostgreSQL базу данных
1. Dashboard → New → PostgreSQL
2. Name: `task-planner-db`
3. Plan: Free
4. Нажмите "Create Database"
5. **Скопируйте Internal Database URL** (понадобится позже)

### 1.3 Создайте Web Service для Backend
1. Dashboard → New → Web Service
2. Connect your GitHub repository
3. Настройки:
   - **Name**: `task-planner-backend`
   - **Root Directory**: `backend`
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free

4. Environment Variables (Add):
   ```
   DATABASE_URL = <Internal Database URL из шага 1.2>
   SECRET_KEY = <сгенерируйте случайную строку>
   ```

5. Нажмите "Create Web Service"
6. Дождитесь деплоя (5-10 минут)
7. **Скопируйте URL** (например: `https://task-planner-backend.onrender.com`)

---

## Шаг 2: Обновите Frontend для работы с Backend

### 2.1 Измените API_URL в frontend/js/api.js
Замените `your-backend-app.onrender.com` на ваш реальный URL из шага 1.3:

```javascript
const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : 'https://task-planner-backend.onrender.com';  // ← ВАШ URL
```

---

## Шаг 3: Деплой Frontend на GitHub Pages

### 3.1 Инициализируйте Git репозиторий

```bash
cd C:\Users\morty\task_planner
git init
git add .
git commit -m "Initial commit: Task Planner Dashboard"
```

### 3.2 Создайте репозиторий на GitHub
1. Перейдите на https://github.com/new
2. Repository name: `task-planner`
3. Public
4. Нажмите "Create repository"

### 3.3 Загрузите код на GitHub

```bash
git remote add origin https://github.com/ВАШ_USERNAME/task-planner.git
git branch -M main
git push -u origin main
```

### 3.4 Настройте GitHub Pages
1. Перейдите в Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` → Folder: `/frontend`
4. Нажмите "Save"
5. Дождитесь деплоя (1-2 минуты)
6. Ваш сайт будет доступен по адресу: `https://ВАШ_USERNAME.github.io/task-planner/`

---

## Шаг 4: Обновите CORS в Backend

После деплоя frontend, добавьте его URL в CORS:

В `backend/main.py` найдите:
```python
origins = [
    "http://localhost:8080",
    "http://localhost:3000",
]
```

Добавьте ваш GitHub Pages URL:
```python
origins = [
    "http://localhost:8080",
    "http://localhost:3000",
    "https://ВАШ_USERNAME.github.io",  # ← добавьте это
]
```

Закоммитьте и запушьте изменения:
```bash
git add backend/main.py
git commit -m "Add GitHub Pages to CORS"
git push
```

Render автоматически передеплоит backend.

---

## Готовые Bash команды

```bash
# 1. Инициализация Git
cd C:\Users\morty\task_planner
git init
git add .
git commit -m "Initial commit: Task Planner Dashboard"

# 2. Подключение к GitHub (замените YOUR_USERNAME на ваш username)
git remote add origin https://github.com/YOUR_USERNAME/task-planner.git
git branch -M main
git push -u origin main

# 3. После настройки GitHub Pages и Render, обновите CORS
# Отредактируйте backend/main.py (добавьте ваш GitHub Pages URL)
git add backend/main.py
git commit -m "Add GitHub Pages to CORS"
git push
```

---

## Проверка

1. **Backend**: Откройте `https://your-backend.onrender.com/docs` - должна открыться Swagger документация
2. **Frontend**: Откройте `https://YOUR_USERNAME.github.io/task-planner/` - должна открыться страница входа
3. **Регистрация**: Создайте пользователя и проверьте что все работает

---

## Важные замечания

### Бесплатный план Render.com:
- Backend "засыпает" после 15 минут неактивности
- Первый запрос после сна занимает ~30 секунд
- 750 часов/месяц бесплатно (достаточно для личного использования)

### PostgreSQL вместо SQLite:
Backend автоматически переключится на PostgreSQL при наличии `DATABASE_URL` в переменных окружения.

### WebSocket:
Render поддерживает WebSocket, real-time синхронизация будет работать.

---

## Альтернативные варианты

Если Render не подходит:

1. **Railway.app** - проще, но меньше бесплатных часов
2. **Fly.io** - больше контроля, сложнее настройка
3. **Vercel** - только для serverless, нужна переделка backend

---

## Поддержка

Если что-то не работает:
1. Проверьте логи на Render (Dashboard → Service → Logs)
2. Проверьте консоль браузера (F12)
3. Убедитесь что CORS настроен правильно

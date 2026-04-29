# 📋 Checklist для деплоя

Перед тем как пушить в GitHub, выполните эти шаги:

## 1. Обновите API URL в коде

**Файл:** `docs/js/api.js` (строка 2)

Замените `YOUR-RENDER-APP-NAME` на имя вашего приложения на Render:

```javascript
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'https://YOUR-RENDER-APP-NAME.onrender.com';  // ← ЗАМЕНИТЕ ЭТО!
```

Например:
```javascript
: 'https://task-planner-backend.onrender.com';
```

---

## 2. Создайте сервисы на Render.com

### PostgreSQL Database:
1. New → PostgreSQL
2. Name: `task-planner-db`
3. Region: Frankfurt
4. Plan: Free
5. **Скопируйте Internal Database URL**

### Web Service:
1. New → Web Service
2. Подключите GitHub репозиторий
3. Settings:
   - Name: `task-planner-backend` (или другое имя)
   - Build Command: `pip install -r backend/requirements.txt`
   - Start Command: `bash backend/start.sh`
   - Plan: Free

---

## 3. Настройте Environment Variables на Render

В Web Service → Environment добавьте:

```bash
# Database (из созданной PostgreSQL)
DATABASE_URL=postgresql://user:password@host/database

# JWT Secret (ОБЯЗАТЕЛЬНО сгенерируйте новый!)
JWT_SECRET_KEY=<запустите: python -c 'import secrets; print(secrets.token_urlsafe(32))'>

# PIN код (минимум 4 символа, НЕ используйте "1234"!)
SITE_PIN_CODE=your-secure-pin-here

# CORS (замените yourusername на ваш GitHub username)
ALLOWED_ORIGINS=https://yourusername.github.io

# Port (автоматически установится Render)
PORT=8000
```

---

## 4. Обновите ALLOWED_ORIGINS после деплоя

После того как GitHub Pages задеплоится:

1. Узнайте ваш GitHub Pages URL: `https://yourusername.github.io/task_planner`
2. Вернитесь в Render → Environment
3. Обновите `ALLOWED_ORIGINS`:
   ```
   https://yourusername.github.io
   ```
4. Сохраните (сервис перезапустится)

---

## 5. Push в GitHub

```bash
git add .
git commit -m "Configure for production deployment"
git push origin main
```

---

## 6. Включите GitHub Pages

1. GitHub → Settings → Pages
2. Source: **GitHub Actions**
3. Сохраните

Через 2-3 минуты ваш сайт будет доступен!

---

## 7. Проверьте работу

1. Откройте `https://yourusername.github.io/task_planner`
2. Введите PIN код (который вы установили в `SITE_PIN_CODE`)
3. Создайте первого пользователя
4. Проверьте что WebSocket работает (real-time обновления)

---

## ⚠️ Важно!

- **НЕ коммитьте** файлы с реальными секретами
- **Сгенерируйте уникальный** `JWT_SECRET_KEY` для продакшена
- **Используйте безопасный** `SITE_PIN_CODE` (не "1234")
- **Проверьте** что `ALLOWED_ORIGINS` содержит только ваш домен

---

## 🐛 Если что-то не работает

### Backend не запускается:
- Проверьте Logs в Render
- Убедитесь что все environment variables установлены
- Проверьте что `DATABASE_URL` правильный

### Frontend не подключается:
- Откройте DevTools (F12) → Console
- Проверьте CORS ошибки
- Убедитесь что API_URL в `api.js` правильный
- Проверьте что `ALLOWED_ORIGINS` содержит ваш GitHub Pages URL

### WebSocket не работает:
- Проверьте что используется `wss://` (не `ws://`)
- Убедитесь что токен отправляется в первом сообщении
- Render Free Plan поддерживает WebSocket

---

## 📚 Полная документация

- [DEPLOYMENT.md](DEPLOYMENT.md) - подробная инструкция
- [README.md](README.md) - описание проекта
- [SECURITY_UPGRADE.md](backend/SECURITY_UPGRADE.md) - безопасность

# Task Planner - Deployment Guide

## 🚀 Деплой на Render.com + GitHub Pages

### Часть 1: Деплой Backend на Render.com

#### Шаг 1: Создайте PostgreSQL базу данных
1. Зайдите на [Render.com](https://render.com)
2. Нажмите **New** → **PostgreSQL**
3. Настройки:
   - **Name**: `task-planner-db`
   - **Database**: `task_planner`
   - **User**: `task_planner_user`
   - **Region**: Frankfurt (или ближайший к вам)
   - **Plan**: Free
4. Нажмите **Create Database**
5. **Сохраните Internal Database URL** - он понадобится

#### Шаг 2: Создайте Web Service
1. Нажмите **New** → **Web Service**
2. Подключите ваш GitHub репозиторий
3. Настройки:
   - **Name**: `task-planner-backend` (или любое имя)
   - **Region**: Frankfurt
   - **Branch**: `main`
   - **Root Directory**: оставьте пустым
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `bash backend/start.sh`
   - **Plan**: Free

#### Шаг 3: Настройте Environment Variables
В разделе **Environment** добавьте:

```bash
# Database (скопируйте из созданной БД)
DATABASE_URL=postgresql://user:password@host/database

# JWT Secret (сгенерируйте новый!)
JWT_SECRET_KEY=<сгенерируйте: python -c 'import secrets; print(secrets.token_urlsafe(32))'>

# PIN код для доступа (минимум 4 символа)
SITE_PIN_CODE=your-secure-pin-code

# CORS (замените на ваш GitHub Pages URL)
ALLOWED_ORIGINS=https://yourusername.github.io,http://localhost:8080

# Port (Render автоматически установит)
PORT=8000
```

#### Шаг 4: Deploy
1. Нажмите **Create Web Service**
2. Дождитесь завершения деплоя (5-10 минут)
3. **Скопируйте URL вашего сервиса** (например: `https://task-planner-backend.onrender.com`)

---

### Часть 2: Деплой Frontend на GitHub Pages

#### Шаг 1: Обновите API URL в коде
1. Откройте `docs/js/api.js`
2. Замените `YOUR-RENDER-APP-NAME` на имя вашего Render сервиса:
   ```javascript
   const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
       ? 'http://localhost:8000'
       : 'https://task-planner-backend.onrender.com';  // ← Ваш URL
   ```

#### Шаг 2: Включите GitHub Pages
1. Зайдите в **Settings** вашего репозитория
2. Перейдите в **Pages**
3. В разделе **Source** выберите:
   - **Source**: GitHub Actions
4. Сохраните

#### Шаг 3: Push в GitHub
```bash
git add .
git commit -m "Configure for Render.com and GitHub Pages deployment"
git push origin main
```

#### Шаг 4: Проверьте деплой
1. Перейдите во вкладку **Actions** в GitHub
2. Дождитесь завершения workflow "Deploy to GitHub Pages"
3. Ваш сайт будет доступен по адресу: `https://yourusername.github.io/task_planner`

---

### Часть 3: Обновите CORS на Render

После того как GitHub Pages задеплоится:

1. Вернитесь в Render.com → ваш Web Service
2. Перейдите в **Environment**
3. Обновите `ALLOWED_ORIGINS`:
   ```
   https://yourusername.github.io
   ```
4. Сохраните (сервис автоматически перезапустится)

---

## 🔧 Важные замечания

### Render.com Free Plan ограничения:
- ⚠️ **Сервис засыпает после 15 минут неактивности**
- Первый запрос после сна занимает ~30-60 секунд
- 750 часов в месяц (достаточно для одного сервиса)
- PostgreSQL: 1GB storage, 97 часов в месяц

### Решение проблемы "холодного старта":
Добавьте в Render.com **Cron Job** для пинга каждые 14 минут:
1. New → Cron Job
2. Command: `curl https://your-app.onrender.com/health`
3. Schedule: `*/14 * * * *`

Или используйте внешний сервис типа [UptimeRobot](https://uptimerobot.com) (бесплатно).

---

## 📝 Checklist перед деплоем

- [ ] Сгенерирован уникальный `JWT_SECRET_KEY`
- [ ] Установлен безопасный `SITE_PIN_CODE` (не "1234"!)
- [ ] `DATABASE_URL` скопирован из Render PostgreSQL
- [ ] `ALLOWED_ORIGINS` содержит ваш GitHub Pages URL
- [ ] В `docs/js/api.js` указан правильный Render URL
- [ ] Файл `backend/start.sh` имеет права на выполнение
- [ ] GitHub Actions включен в настройках репозитория

---

## 🐛 Troubleshooting

### Backend не запускается:
1. Проверьте логи в Render: **Logs** → **Deploy Logs**
2. Убедитесь что все environment variables установлены
3. Проверьте что `DATABASE_URL` правильный

### Frontend не подключается к Backend:
1. Откройте DevTools (F12) → Console
2. Проверьте CORS ошибки
3. Убедитесь что `ALLOWED_ORIGINS` содержит ваш GitHub Pages домен
4. Проверьте что API_URL в `api.js` правильный

### WebSocket не работает:
1. Render Free Plan поддерживает WebSocket
2. Проверьте что используется `wss://` (не `ws://`)
3. Убедитесь что токен отправляется в первом сообщении

### База данных не создается:
1. Проверьте логи: `start.sh` должен создать таблицы
2. Убедитесь что `DATABASE_URL` правильный
3. PostgreSQL на Render должна быть запущена

---

## 🔐 Первый вход

1. Откройте `https://yourusername.github.io/task_planner`
2. Введите PIN код (который вы установили в `SITE_PIN_CODE`)
3. Создайте первого пользователя
4. Готово! 🎉

---

## 📚 Дополнительные ресурсы

- [Render.com Documentation](https://render.com/docs)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [PostgreSQL on Render](https://render.com/docs/databases)

# NEON STACK — backend (Этап 1)

FastAPI + PostgreSQL + JWT авторизация для библиотеки кибербезопасности.

## Что готово на Этапе 1

✅ Реальная авторизация (bcrypt + JWT access/refresh)
✅ Полная схема БД (12 таблиц) с миграциями Alembic
✅ Эндпоинты: книги (CRUD + поиск/фильтр/сортировка), прогресс чтения, MyList, отзывы, заметки, тесты, тепловая карта, админ-дашборд, лидерборд
✅ Серверная геймификация: XP, уровни, стрики, достижения
✅ CORS, OpenAPI/Swagger UI на `/docs`
✅ Безопасный seed: пароль администратора только из окружения; production требует явного разрешения
✅ Docker Compose для PostgreSQL и MinIO

## Что будет дальше

- **Этап 2:** загрузка PDF в MinIO/S3, выдача книги через подписанные URL, оффлайн-кэш
- **Этап 3:** реальный AI через Claude API (саммари, AI-генерация тестов из текста PDF, рекомендации)
- **Этап 4:** PWA (Service Worker, IndexedDB), деплой

## Структура

```
backend/
├── app/
│   ├── main.py              # FastAPI app
│   ├── api/                 # роутеры (auth, books, library, quizzes, admin)
│   ├── core/                # config, security (bcrypt + JWT)
│   ├── db/                  # async-сессия SQLAlchemy
│   ├── models/              # ORM-модели
│   ├── schemas/             # Pydantic-контракты
│   └── services/            # бизнес-логика (геймификация)
├── alembic/                 # миграции БД
├── scripts/seed.py          # начальные данные
└── tests/                   # smoke-тесты
```

## Запуск (локально)

### 1. Поднимаем PostgreSQL и MinIO

Из корня проекта (где `docker-compose.yml`):

```bash
docker compose up -d
```

Проверить, что Postgres готов:
```bash
docker compose ps
# postgres должен быть в статусе healthy
```

### 2. Готовим Python-окружение

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# обязательно поменяйте SECRET_KEY в .env (минимум 32 случайных символа)
```

### 3. Применяем миграции

Первая миграция создастся автогенерацией:

```bash
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

### 4. Добавляем начальные данные

Seed не содержит паролей по умолчанию. Задайте отдельный пароль администратора
через окружение; не сохраняйте его в `.env`, истории команд или репозитории.

Linux/macOS:

```bash
read -s -p "Пароль администратора: " SEED_ADMIN_PASSWORD
echo
export SEED_ADMIN_PASSWORD
python -m scripts.seed
unset SEED_ADMIN_PASSWORD
```

PowerShell:

```powershell
$secure = Read-Host "Пароль администратора" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:SEED_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    python -m scripts.seed
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    Remove-Item Env:SEED_ADMIN_PASSWORD
}
```

В режиме разработки создаются администратор, демонстрационный пользователь,
четыре книги и достижения. В production обычный запуск запрещён. Для первичной
настройки используйте `--allow-production`: будут созданы только администратор
и достижения, без демонстрационных данных.

### 5. Запускаем сервер

```bash
uvicorn app.main:app --reload --port 8000
```

Открыть Swagger: http://localhost:8000/docs

### 6. Smoke-тесты

```bash
pytest tests/test_smoke.py -v
```

## Проверка вручную (curl)

```bash
# Логин — PASSWORD задайте локально, не вставляйте реальный пароль в документацию
read -s -p "Пароль: " PASSWORD; echo
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  --data "$(printf '{"username":"admin","password":"%s"}' "$PASSWORD")"
unset PASSWORD
# → access_token в JSON; refresh-сессия устанавливается HttpOnly cookie

# Список книг (требует access token)
curl http://localhost:8000/api/books -H "Authorization: Bearer $TOKEN"

# Профиль (нужен токен)
TOKEN="<paste access_token here>"
curl http://localhost:8000/api/auth/me -H "Authorization: Bearer $TOKEN"

# Дашборд (admin only)
curl http://localhost:8000/api/admin/dashboard -H "Authorization: Bearer $TOKEN"
```

## Безопасность — что уже сделано

| Проблема исходника                          | Решение                                                              |
|---------------------------------------------|-----------------------------------------------------------------------|
| Пароли в открытом виде в `state.users`      | bcrypt (rounds=12) — `app/core/security.py`                          |
| Кража долгоживущего токена через JavaScript | Refresh-сессия в HttpOnly cookie, access-токен короткоживущий          |
| `users` приходят из JS-массива на клиенте   | PostgreSQL + миграции Alembic                                        |
| Любой может создать книгу через `state`     | `POST /api/books` защищён `get_current_admin`                        |
| Рейтинг книги — мутируемое поле в JS        | Пересчитывается на сервере из таблицы `reviews`                      |
| Достижения раздаются на клиенте             | `services/gamification.py` — серверная логика, не подделать          |

## Следующий шаг

Когда подтвердите, что Этап 1 поднимается и тесты идут — начнём Этап 2: интеграцию с MinIO для загрузки PDF и выдачи через подписанные URL, плюс адаптацию фронта к API.

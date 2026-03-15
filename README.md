# IC Leaderboard (MVP)

Real-time leaderboard where admins manually submit player score updates and players see live ranking updates.

## Stack

- Backend: FastAPI + SQLAlchemy + WebSockets
- Frontend: React + Vite
- Database: SQLite for local development (switch to Postgres in production)

## Project Structure

- `backend/` - API, auth, score ingestion, live broadcasts
- `frontend/` - Admin and Player UI

## Local Run

### 1) Backend

```powershell
Set-Location backend
Copy-Item .env.example .env
D:/Programming/Languages/Python/python.exe -m pip install -r requirements.txt
D:/Programming/Languages/Python/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
"D:\Programming\Tools\VSCode\Microsoft VS Code\bin"
Backend API docs: http://127.0.0.1:8000/docs

### 2) Frontend

```powershell
Set-Location frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend URL: http://localhost:5173

## Default Admin Credentials

Set these in `backend/.env`:

- `ADMIN_USERNAME=admin`
- `ADMIN_PASSWORD=change-me`

Change them before sharing the app.

## Implemented Endpoints

- `POST /auth/login`
- `POST /players` (admin token required)
- `GET /players`
- `POST /scores` (admin token required)
- `GET /leaderboard`
- `WS /ws/leaderboard`

## Quick Manual Test

1. Open player view in one browser tab.
2. Open admin view in another tab.
3. Login as admin.
4. Create a player.
5. Submit a score update.
6. Verify player view updates within ~1 second.

## Next Build Steps

- Add Postgres + Alembic migrations.
- Add test suite (ranking, API, WebSocket behavior).
- Add rate limiting and stronger auth hardening.
- Add CSV import flow for bulk score updates.

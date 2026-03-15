# IC Leaderboard (MVP)

Real-time leaderboard where admins manually submit player score updates and players see live ranking updates.

## Stack

- Backend: FastAPI + SQLAlchemy + WebSockets
- Frontend: React + Vite
- Database: SQLite (local) or Neon Postgres (deployment)

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

## Deploy with Render + Neon (Free-Friendly)

### 1) Create Neon database

1. Create a project in Neon.
2. Create or use the default database.
3. Copy the connection string from Neon dashboard.
4. Ensure SSL is enabled in URL (`sslmode=require`).

Example:

```text
postgresql://USER:PASSWORD@ep-xxxxxx.ap-southeast-1.aws.neon.tech/DBNAME?sslmode=require
```

### 2) Configure Render backend service

1. Root Directory: `backend`
2. Build Command: `pip install -r requirements.txt`
3. Start Command: `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### 3) Set Render environment variables

- `DATABASE_URL=<your neon connection string>`
- `ADMIN_USERNAME=<your admin username>`
- `ADMIN_PASSWORD=<your admin password>`
- `JWT_SECRET=<long random secret>`
- `JWT_EXPIRES_MINUTES=120`
- `CORS_ORIGINS=<your frontend domain>`

Notes:

- You do not need a Render persistent disk when using Neon.
- Code auto-supports `postgres://` and `postgresql://` connection formats.

### 4) Deploy frontend

Set frontend environment variables on your frontend host (Netlify/Vercel):

- `VITE_API_BASE_URL=https://<your-render-backend-domain>`
- `VITE_WS_BASE_URL=wss://<your-render-backend-domain>`

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

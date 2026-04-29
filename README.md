# MERN + bpmn.io + Camunda 7 Starter

This repo contains:
- `docker-compose.yml` to run **Camunda 7** (port 8080) and **MongoDB** (port 27017)
- `backend/` (Express + Mongo) to store, validate, and deploy BPMN
- `workers/` (Node external-task workers) to execute safe task topics
- `frontend/` (React + bpmn.io editor)
- `frontend-template/` (template source used by frontend)

## One-command run

From project root:

```bash
./start.sh
```

This starts **frontend + backend + workers + camunda + mongo** together via Docker Compose.

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000/health`
- Camunda: `http://localhost:8080/camunda`

## Prerequisites
- Docker & Docker Compose
- Node.js 18+ and npm

## Local Run

### 1) Start Camunda 7 + MongoDB
```bash
docker compose up -d
# Camunda Web Apps: http://localhost:8080/camunda
# Camunda REST:     http://localhost:8080/engine-rest
# MongoDB:          mongodb://127.0.0.1:27017
```

### 2) Start backend
```bash
cd backend
cp .env.example .env
npm install
npm start
# Backend on http://localhost:4000
```

### 3) Start workers
```bash
cd workers
cp .env.example .env
npm install
npm start
```

### 4) Start frontend
```bash
cd frontend
cp .env.example .env
npm install
npm start
# Frontend on http://localhost:3000
```

## Use It
1. Open frontend (`http://localhost:3000`).
2. Select a **Service Task** and choose a topic (`checkInventory`, `sendEmail`, or `httpRequest`).
3. Click **Save Draft**.
4. Click **Publish Latest Draft** (deploys to Camunda).
5. Start an instance:
   ```bash
   curl -X POST http://localhost:4000/api/workflows/order_flow/start \
     -H "Content-Type: application/json" \
     -d '{"variables":{"sku":{"value":"ABC-123","type":"String"}}}'
   ```
6. Watch worker logs for task completion.

## Deploy to Zeabur

Deploy this as multiple services from one GitHub repo.

### Create services in Zeabur
1. Push this repo to GitHub.
2. In Zeabur, create one project and add:
   - a **MongoDB** service (Zeabur managed database)
   - a **Camunda 7** service (from `camunda/camunda-bpm-platform:latest` image, port `8080`)
   - a **backend** service from `backend/Dockerfile`
   - a **workers** service from `workers/Dockerfile`
   - a **frontend** service from `frontend/Dockerfile`

### Environment variables

Set these in each service:

#### Backend service
- `PORT=4000` (or Zeabur-provided port)
- `MONGO_URI=<Zeabur Mongo connection string>/flows`
- `CAMUNDA_BASE_URL=<public/internal URL of Camunda service>`
- `CORS_ORIGIN=<frontend public URL>`
- `ALLOWED_TOPICS=checkInventory,sendEmail,httpRequest`
- `JWT_SECRET=<strong-random-secret>`

#### Workers service
- `CAMUNDA_BASE_URL=<public/internal URL of Camunda service>`
- `PORT=4001` (optional; enables health endpoint for platform checks)

#### Frontend service
- `REACT_APP_API_BASE_URL=<backend public URL>`

### Zeabur notes
- `REACT_APP_API_BASE_URL` is compiled into the frontend at build time, so redeploy frontend after changing it.
- Backend has `GET /health` for health checks.
- Workers expose a health endpoint only when `PORT` is set.

## Safety Notes
- Backend validates BPMN: only allows **external** service tasks with whitelisted topics.
- Blocks `scriptTask` and `callActivity` by default.
- Extend `ALLOWED_TOPICS` and implement corresponding worker subscriptions.

## Customization
- Add RBAC/JWT checks to `requireAdmin` in backend.
- Implement real integrations in workers (email, DB, HTTP) and keep domain allowlists tight.
# bpmn

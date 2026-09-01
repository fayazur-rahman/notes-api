# Notes API


A minimal REST API for notes (create / list / get / delete), built with Node.js
(Express) and PostgreSQL. Configuration comes entirely from environment variables,
so the same image runs unchanged on a laptop, an EC2 box, or a CI runner. Built as
the Phase 1 deployment target for my DevOps portfolio.


## Tech stack


- Node.js 20 (ESM), Express 5
- PostgreSQL via `pg`
- No build step (pure JavaScript); tests via Node's built-in runner
- Container image: multi-stage Dockerfile, runs non-root


## Prerequisites


- Docker and Docker Compose (for the containerized paths — recommended)
- Optionally Node.js 20.6+ and npm (only if running bare, without Docker)
- For the registry path: AWS CLI configured, and an ECR repo in `us-east-1`


## Configuration


All variables are **required** — the app refuses to start if any is missing (no
fallback defaults). Copy the example and fill in real values:


```bash
cp .env.example .env
```


| Variable | Description | Local (bare) | Local (Compose) |
|---|---|---|---|
| `DB_HOST` | PostgreSQL host | `localhost` | `db` (the Compose service name) |
| `DB_PORT` | PostgreSQL port | `5432` | `5432` |
| `DB_USER` | PostgreSQL user | `notes_app` | `notes_app` |
| `DB_PASSWORD` | PostgreSQL password | *(your value)* | *(your value)* |
| `DB_NAME` | Database name | `notes_db` | `notes_db` |
| `PORT` | HTTP port the API listens on | `3000` | `3000` |


`.env` is git-ignored and must never be committed. On startup the app runs
`CREATE TABLE IF NOT EXISTS notes (...)`, so no separate migration step is needed.


## Run locally


### Option A — Docker Compose (recommended)


Brings up PostgreSQL and the API together; waits for the database to be healthy
before starting the app.


```bash
# .env must have DB_HOST=db
docker compose up
curl -i localhost:3000/health        # -> 200 {"status":"ok"}
docker compose down                  # add -v to also wipe the database volume
```


### Option B — bare Node (no Docker)


Requires a PostgreSQL you can reach and a `.env` with `DB_HOST=localhost`.


```bash
npm install
npm run dev        # uses Node's built-in --env-file=.env
```


## Build and run the image


```bash
docker build -t notes-api:0.1.0 .


# run against the Compose database on its network:
docker compose up -d db
docker run --rm --network notes-api_default --env-file .env -p 3000:3000 notes-api:0.1.0
curl -i localhost:3000/health        # -> 200
```


The image ships **no configuration** — every value comes from environment variables
at run time, and the container runs as a non-root user.


## Push to / pull from Amazon ECR


```bash
export ACCOUNT_ID=XXXXXXXXXXX
export REGION=us-east-1
export REGISTRY=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com


aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin $REGISTRY


docker tag  notes-api:0.1.0 $REGISTRY/notes-api:0.1.0
docker push $REGISTRY/notes-api:0.1.0
docker pull $REGISTRY/notes-api:0.1.0     # from any machine with credentials
```
Deploy the pinned tag (`0.1.0`), not `latest`.


## API


| Method | Path | Success | Notes |
|---|---|---|---|
| GET | `/health` | 200 `{"status":"ok"}` | also checks the DB is reachable |
| POST | `/notes` | 201 | JSON body `{"title","body"}`; 400 if `title` empty |
| GET | `/notes` | 200 | array of notes |
| GET | `/notes/:id` | 200 / 404 | |
| DELETE | `/notes/:id` | 204 / 404 | |


```bash
curl -X POST localhost:3000/notes \
  -H 'Content-Type: application/json' \
  -d '{"title":"First note","body":"Hello from curl"}'
curl localhost:3000/notes
```


If your `PORT` isn't `3000`, adjust the examples.


## Tests
Tests use Node's built-in runner with an in-memory repository, so no database is
required:


```bash
npm test
```


## Architecture


See [docs/architecture.md](docs/architecture.md) for the delivery pipeline
(laptop → GitHub → ECR) and the target runtime topology (EC2 → container → PostgreSQL).


## Project structure


```text
notes-api/
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── package-lock.json
├── README.md
├── docs/
│   └── architecture.md
├── src/
│   ├── app.js
│   ├── config.js
│   ├── db.js
│   ├── notesRepository.js
│   └── server.js
└── test/
    └── app.test.js
```

# Minimal Notes REST API

A small Node.js REST API built with Express and PostgreSQL. It supports creating, listing, fetching, and deleting notes.

## Requirements

- Node.js 20.6.0 or newer
- npm
- PostgreSQL

The application does not contain fallback configuration values. All runtime and database connection configuration listed below must be supplied through environment variables.

## Environment variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `DB_HOST` | Yes | PostgreSQL host name or IP address | `localhost` |
| `DB_PORT` | Yes | PostgreSQL TCP port | `5432` |
| `DB_USER` | Yes | PostgreSQL user | `notes_app` |
| `DB_PASSWORD` | Yes | PostgreSQL password | `change_me` |
| `DB_NAME` | Yes | PostgreSQL database name | `notes_db` |
| `PORT` | Yes | HTTP port the API listens on | `3000` |

Copy the example file for local development:

```bash
cp .env.example .env
```

Then edit `.env` with real database credentials. `.env` is ignored by Git.

## Database setup

Create the database and user with PostgreSQL tooling appropriate for your environment, then grant that user permission to create and use tables in the selected database.

On startup, the API runs `CREATE TABLE IF NOT EXISTS notes (...)`, so no separate migration command is required for this minimal project.

## Install

```bash
npm install
```

## Run

### Local development with `.env`

```bash
npm run dev
```

This uses Node's built-in `--env-file=.env` support.

### Run with environment variables supplied by the shell/runtime

```bash
npm start
```

The server listens on the value of `PORT`. With the `.env.example` values, that is port `3000`.

## API

### Health check

```text
GET /health
```

Returns HTTP `200` with:

```json
{"status":"ok"}
```

The endpoint also checks that PostgreSQL is reachable.

### Create a note

```text
POST /notes
Content-Type: application/json
```

Body:

```json
{
  "title": "Example",
  "body": "Remember this"
}
```

Returns HTTP `201`.

### List notes

```text
GET /notes
```

Returns HTTP `200` and a JSON array.

### Get one note

```text
GET /notes/:id
```

Returns HTTP `200`, or `404` when the note does not exist.

### Delete one note

```text
DELETE /notes/:id
```

Returns HTTP `204`, or `404` when the note does not exist.

## Example curl commands

```bash
curl http://localhost:3000/health

curl -X POST http://localhost:3000/notes \
  -H 'Content-Type: application/json' \
  -d '{"title":"First note","body":"Hello from curl"}'

curl http://localhost:3000/notes
curl http://localhost:3000/notes/1
curl -X DELETE http://localhost:3000/notes/1
```

If your `PORT` is not `3000`, replace `3000` in the examples with your configured value.

## Tests

Tests use Node's built-in test runner and an in-memory repository, so they do not require a running PostgreSQL instance.

Run them with:

```bash
npm test
```

## Project structure

```text
minimal-notes-api/
├── .env.example
├── .gitignore
├── package.json
├── README.md
├── src/
│   ├── app.js
│   ├── config.js
│   ├── db.js
│   ├── notesRepository.js
│   └── server.js
└── test/
    └── app.test.js
```

There is intentionally no Dockerfile. The layout is Dockerfile-friendly: dependencies are declared in `package.json`, application code is under `src/`, configuration comes from environment variables, and `npm start` is the runtime command.

## Push to a Git remote

After creating an empty repository on GitHub, GitLab, Bitbucket, or another Git host, run these commands from this project's root directory. Replace `<REMOTE_URL>` with the repository's Git URL.

```bash
git init
git add .
git commit -m "Add minimal Express notes API"
git branch -M main
git remote add origin <REMOTE_URL>
git push -u origin main
```

These commands only initialize and push the source repository; they do not deploy the application.


## Run locally with Docker Compose


1. Copy `.env.example` to `.env` and set `DB_HOST=db` (the Compose service name) and a `DB_PASSWORD`.
2. `docker compose up` — starts Postgres, waits for it to be healthy, then starts the API.
3. `curl -i localhost:3000/health` → `200 {"status":"ok"}`.
4. `docker compose down` to stop (add `-v` to also wipe the database volume).


## Build & run the image


```bash
docker build -t notes-api:0.1.0 .
docker compose up -d db                      # start Postgres
docker run --rm --network notes-api_default --env-file .env -p 3000:3000 notes-api:0.1.0
curl -i localhost:3000/health                # 200
```
The image ships no config — every value comes from env vars at run time.


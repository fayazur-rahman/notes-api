# Four Questions — notes-api


## 1. Build — what turns source into something runnable?
- Command: `npm ci`   <!-- or: pip install -r requirements.txt -->
- Notes: interpreted stack → "build" = install dependencies (no compile step).


## 2. Artifact — what does the build produce?
- Archetype: interpreted runtime (archetype 2)
- Artifact: source + installed dependencies + the interpreter


## 3. Runtime needs
- Runtime + version: Node <fill in from engines>   <!-- or Python 3.x -->
- Listens on port: <fill in>
- Environment variables:
  | Var | Purpose | Example (from .env.example) |
  |---|---|---|
  | | | |
- Config source: environment variables, no hardcoded values — audited ✅


## 4. Connections — talks to / exposes
- Depends on: <Postgres/MySQL> via env-supplied host/port/name/user/pass
- Exposes: `GET /health` → 200; <list the CRUD endpoints>


## How to run (from the README — to be verified on D2)
- Install: `...`
- Run: `...`
- Test: `...`


> Historical web prototype. The active frontend is now ../mobile; see the repository README.

# Pulse · Riverside

A working hackathon base for festival incident reporting and human-led coordination. Volunteers describe an incident; Pulse structures the report, asks a short follow-up, and suggests responders. A safety lead approves, modifies, or rejects the response, follows the timeline, and resolves the incident.

**This is a local demo.** Parsing and coordination are deterministic mocks. Resources are simulated; no real responders or emergency services are contacted. No AI key is needed.

## Run locally on Windows

This checkout has an isolated Python environment at `backend/.venv`, a workspace-local Node.js runtime under `.tools`, and frontend packages in `frontend/node_modules`. The start scripts use those local runtimes automatically. Global Python packages are not used; activation is optional.

From the repository root, run these in **two terminals**:

```powershell
# Terminal 1: FastAPI, using backend/.venv/Scripts/python.exe
powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1
```

```powershell
# Terminal 2: React / Vite
powershell -ExecutionPolicy Bypass -File scripts/start-frontend.ps1
```

- Volunteer: http://127.0.0.1:5173/volunteer
- Safety overview: http://127.0.0.1:5173/safety
- Resources: http://127.0.0.1:5173/safety/resources
- API documentation: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

Stop each server with Ctrl+C. Data survives restarts in `backend/data/pulse.db`.

### First-time setup on another Windows checkout

Install Python 3.10+ first. It is used only to create the virtual environment; installs and application commands use that environment. Use Node.js 22.12+, or request a local, checksum-verified Node 22 runtime:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 -InstallLocalNode
# If Node is already installed, omit -InstallLocalNode.
```

Setup uses the tested versions in `backend/requirements-lock.txt` and `frontend/package-lock.json`. `backend/requirements.txt` describes runtime dependencies; `requirements-dev.txt` adds tests. Virtual environments, packages, local runtimes, and SQLite files are ignored by Git.

### macOS / Linux

With Python 3.10+ and Node 22.12+ installed:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-lock.txt
cd frontend
npm ci
```

Then, from the repository root in separate terminals:

```bash
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

```bash
cd frontend
npm run dev
```

## Demo walkthrough

1. Open `/volunteer`, choose **Medical incident**, and submit. The original wording is preserved, the report receives a unique ID, and the mock asks about breathing.
2. Answer **Yes, they are breathing normally.** The incident moves from `awaiting_clarification` to `awaiting_approval`.
3. Open `/safety`. Reports refresh every five seconds. Open the incident to review responders, reasoning, actions, and coverage warnings.
4. Choose **Approve response**. Selected resources become assigned and unavailable to other incidents. Only a human decision can do this.
5. Add an update. A routine update moves a dispatched response to `in_progress`. For escalation, submit **Update: the person is now unconscious.** The incident returns to review and retains existing assignments without adding new ones.
6. Choose **Resolve incident** and record an outcome. Assigned resources become available again. A downloadable, template-based draft report contains the timeline.

Try **Lost child** and **Site hazard** for simultaneous incidents. To demonstrate resource conflicts, open two medical incidents before approving either. Approve one, then attempt the other from a stale view: the API rejects responders already taken. Refreshing suggests remaining qualified resources. **Reject** records a reason without dispatching. **Modify** edits responders and actions before approval.

Twenty resources are seeded idempotently across Lawn Stage, River Stage, Food Village, North Gate, South Gate, and Medical Tent. There are no seeded incidents. Demo buttons populate the report field and still require submission.

## Architecture

```text
React + TypeScript / Vite
  /volunteer                     reports, clarification, updates
  /safety                        priority-sorted incident cards
  /safety/incidents/:id           decisions, timeline, resolution
  /safety/resources               skills, availability, assignments
             │ REST JSON / five-second polling
             ▼
FastAPI + Pydantic
  routers → mock parser → deterministic coordinator
             │ validated state changes and timeline events
             ▼
SQLite (Python standard library)
  incidents and resources persisted as typed JSON records
```

```text
backend/
  app/
    main.py                  lifecycle, CORS, health
    database.py              SQLite transactions and persistence
    models.py                zones and required skills
    schemas.py               request and response contracts
    seed.py                  20 simulated resources
    routers/                 reports, incidents, resources
    services/
      ai_mock.py             replaceable parsing boundary
      coordinator.py         skills, availability, zone, coverage
      incidents.py           event and state helpers
  tests/test_workflow.py      isolated API and concurrency tests
frontend/
  src/
    api/                     typed REST client and polling
    components/              shell and shared UI
    pages/                   volunteer, safety, detail, resources
    types/                   frontend API contracts
  e2e/workflow.spec.ts        real browser workflow tests
scripts/                     Windows setup, start, and check scripts
```

The coordinator requires a matching skill, excludes unavailable resources, and ranks eligible responders by skill (+40), same zone (+25), availability (+25), and no assignment (+10). Higher-urgency medical fixtures also suggest an available first-aid team. Coverage warnings use a demo minimum of one available resource per zone.

SQLite `BEGIN IMMEDIATE` serializes approvals. The API rechecks responder existence, qualifications, availability, and assignments before committing. It never silently substitutes a responder at approval time. Failed decisions roll back. Resolved incidents reject further mutations. The lead can approve before clarification is complete; missing details remain visible.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | API and database availability |
| POST | `/api/reports` | Create and structure a report |
| GET | `/api/incidents` | List all incidents, active/urgency/newest first |
| GET | `/api/incidents/{id}` | Details and timeline |
| POST | `/api/incidents/{id}/updates` | Clarification or incident update |
| POST | `/api/incidents/{id}/decision` | Approve, modify, or reject |
| POST | `/api/incidents/{id}/resolve` | Resolve and release resources |
| GET | `/api/resources` | Resource roster and assignments |
| GET | `/api/zones` | Festival zones |

Reports and updates accept `text` and `reported_by` (default `VOL-014`). Decisions accept `decision`, optional `responder_ids`, `actions`, `note`, and `decided_by`. Rejection and modification require a note. Resolution accepts `note` and `resolved_by`; the UI requires an outcome note. `/docs` contains full schemas.

Statuses: `reported`, `awaiting_clarification`, `awaiting_approval`, `response_dispatched`, `in_progress`, `resolved`. Synchronous parsing means creation returns one of the awaiting states. Rejection leaves the incident awaiting review and records `last_decision=reject` plus a timeline event.

## Verification

Backend tests and frontend production build, using local environments:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
```

Browser tests start their own backend on **8001**, frontend on **5174**, and a fresh SQLite database under `.run/`. They do not touch the demo database. To use installed Edge without downloading a browser:

```powershell
. ./scripts/common.ps1
Set-PulseNodePath
cd frontend
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

Alternatively, run `npx playwright install chromium` in `frontend`, then `npm run test:e2e`. Tests cover reporting, clarification, approval, rejection, modification, persisted resolution, and mobile layouts.

## Configuration and limitations

- `PULSE_DB_PATH`: optional database path; defaults to `backend/data/pulse.db` regardless of working directory.
- `PULSE_CORS_ORIGINS`: comma-separated origins; defaults to localhost and 127.0.0.1 on port 5173.
- `PULSE_API_TARGET`: development proxy destination; defaults to `http://127.0.0.1:8000`.
- `VITE_API_BASE_URL`: optional frontend API origin. Leave empty for the Vite development proxy. For a separately hosted production bundle, configure the API origin at build time and matching backend CORS, or supply a reverse proxy. Vite preview alone does not proxy API requests.
- Backend variables come from the shell; root `.env.example` is documentation. Vite supports `frontend/.env.local`.

Role navigation is a demo workspace switch, **not authentication or authorization**. This scaffold is not a live operations system. The keyword parser cannot reliably interpret arbitrary language. Recommendation, escalation, and coverage rules are fixtures, not clinical judgement or production protocols. All assignments are simulated. Documentation uses a template, not an LLM. Voice, duplicate linking, heat-cluster detection, GPS, real dispatch, and external AI integration are outside this base.

**Next integration:** replace `parse_report` and `parse_update` in `backend/app/services/ai_mock.py` with a provider returning a validated `ParsedReport`. Keep resource validation and human approval in the backend; add fixture-based AI checks and failure handling. Original reports and updates remain available in the timeline.

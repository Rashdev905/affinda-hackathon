# Pulse manager dashboard

The website is a manager-only dashboard. It does not expose volunteer reporting or volunteer mode. It includes:

- Operations board with Pending, Active, and Resolved incident queues and searchable incident details.
- Incident approval, optional-note modification, rejection, resolution, timeline updates, and reviewed volunteer alerts.
- Team and resource availability, zone filters, the illustrative festival map, and responder assignments.
- Manager update notifications while the dashboard is open, backend connection settings, resolved-incident filtering, and incident data controls.

The dashboard uses the same FastAPI backend and SQLite database as the mobile app. It has no user authentication; manager-only describes its interface, not a security boundary.

## Run on Windows

From the repository root, start the backend and website in separate PowerShell terminals:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-frontend.ps1
```

Open <http://127.0.0.1:5173>. Keep both terminals running. The website uses the Vite proxy to reach the backend at <http://127.0.0.1:8000> by default. The first website launch installs dependencies from `frontend/package-lock.json` if they are missing. `scripts/setup.ps1` installs both mobile and website dependencies during full setup.

To use another backend, open **Settings** and enter its URL. The backend must allow the dashboard origin through CORS. If incidents are created from the mobile app, connect both apps to the same backend URL.

## Build

From the repository root, use the local Node runtime where available:

```powershell
. ./scripts/common.ps1
Set-PulseNodePath
cd frontend
npm run build
```

`npm run dev` is the recommended local workflow. `npm run preview` serves the built static website but does not provide the Vite API proxy; configure `VITE_API_BASE_URL`, backend CORS, or a reverse proxy when hosting it separately.

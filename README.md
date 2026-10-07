# Pulse - Android app and Python backend

Pulse is a native **React Native** app backed by **FastAPI + SQLite**. The current target is a standalone Android APK you can install directly on a phone. No Expo account, Apple membership, app store, or Expo Go is needed for the APK.

## Install and test the Android APK

The local build produces **`artifacts/Pulse-Android.apk`**. Transfer that file to your phone, or download it from the Python server:

```text
http://YOUR-COMPUTER-IP:8000/downloads/pulse.apk
```

1. Connect the computer and Android phone to the same Wi-Fi.
2. Start the Python backend in a PowerShell terminal at the repository root:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1 -Lan
   ```

3. Open the download URL in the phone browser. The backend terminal prints the computer's available IP addresses; use the Wi-Fi address.
4. Open the APK and allow **Install unknown apps** for that browser/file manager if Android asks. This is a locally signed test app, not a Play Store release.
5. Open **Pulse** from the phone launcher. In **Connection**, enter the computer's address, for example `http://192.168.1.42:8000`, and tap **Test & save connection**.

The APK bundles the frontend and runs without Metro or Expo Go. The **Python server must remain running** for reports and coordination. Installing an APK does not put the Python backend on your phone. For use away from this Wi-Fi, deploy an HTTPS backend and change the app's Connection setting.

The build includes ARM64 and ARMv7 libraries and requires **Android 7.0 / API 24 or later**. It is signed with the generated local test keystore. No production signing key or cloud account is required. No iPhone binary is being produced; the shared native source still supports iOS.

## Demo flow

- In **Report**, select **Medical**, submit, and answer the breathing follow-up.
- In **Incidents**, open the report and review the suggested responders, actions, reasoning, and coverage warnings.
- **Approve response** assigns the simulated responders. **Modify response** edits the selection/actions before approval. **Reject suggestion** records a reason without dispatching.
- In **Team**, check resource availability and current assignments.
- Add an incident update. The mock recognizes the supplied unconsciousness escalation fixture and asks for new approval without assigning additional responders automatically.
- **Resolve incident**, add an outcome, and confirm. Assigned resources become available again. **Share draft report** opens Android's share sheet.

There are 20 simulated resources across six festival zones. Incidents and timelines persist in `backend/data/pulse.db`. Role navigation is for the demo, not authentication. No real responders are contacted.

## Local environments

- Python: `backend/.venv` (all installs, server runs, and tests use this interpreter).
- Node: `.tools/node-v22.23.3-win-x64` in this checkout.
- Mobile dependencies: `mobile/node_modules`.
- Android SDK/NDK/CMake: `.tools/android-sdk`.
- Gradle cache: `.tools/gradle`.
- Java: the already installed Microsoft OpenJDK 21.

The global Python environment is not used for application work. The system interpreter is only a bootstrap for creating the virtual environment on a fresh checkout.

For a new checkout with Python installed:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 -InstallLocalNode
```

This installs locked Python/mobile packages; it does not download the Android SDK. For a local native build on another machine, install Android platform 36, build tools 36.0.0, NDK 27.1.12297006, and CMake 3.22.1 under `.tools/android-sdk`, plus Java 17 or 21.

## Rebuild the APK

With the local Android tools installed:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1 -ApiUrl 'http://YOUR-COMPUTER-IP:8000'
```

`-ApiUrl` supplies a default address for the app; users can change it in Connection. The script generates the native Android project, compiles a release variant with bundled Hermes JavaScript, signs it with the local test key, and copies the result to `artifacts/Pulse-Android.apk`.

The script synchronizes the mobile source to an isolated `C:\pulse-apk-<id>` build folder because this repository's long Windows path exceeds native compiler limits. Its location is recorded in `.run/apk-build-root.txt` and reused for incremental builds. SDK and Gradle caches stay in this project; a temporary drive alias gives those tools a space-free path and is removed afterward. The resulting APK is copied back into `artifacts/`. Never use the generated test signing key for a production store release.

## Develop with live reload (optional)

The standalone APK does not need this. For live frontend development, install an SDK 54-compatible Expo Go and run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-mobile.ps1
```

Scan its QR code on the same Wi-Fi. The script prefers the Wi-Fi interface; override it with `-HostAddress 'YOUR-IP'` if needed. `scripts/start-frontend.ps1` now starts this native development server. The old website remains in `frontend/` only as a historical reference.

## Checks and architecture

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
```

Runs the Python API/state tests, mobile TypeScript checks, and native component/API tests. Android and iOS JavaScript bundles can also be compiled with `npm run export` in `mobile/` after adding the local Node runtime to PATH using `scripts/common.ps1`.

```text
mobile/
  App.tsx                      native navigation and safe areas
  src/screens/                 reporting, incidents, decisions, team, connection
  src/api.ts                   REST client and foreground polling
  src/connection.tsx           verified server URL saved on the phone
  src/ui.tsx                   native controls and styles
  src/types.ts                 API contracts
  src/__tests__/               native workflow/API tests
  plugins/withPulseIcon.js     native Android launcher icon
             | REST JSON
backend/
  app/main.py                  API, health, local APK download
  app/routers/                 reports, incidents, resources
  app/services/ai_mock.py       replaceable deterministic parser
  app/services/coordinator.py  responder eligibility and coverage
  app/database.py              transactional SQLite persistence
  tests/test_workflow.py       workflow, concurrency, download tests
```

The app uses native text fields, buttons, sheets, switches, scrolling, keyboard handling, and sharing. It has no WebView or browser frontend. The backend revalidates availability inside a database transaction before assignment, preventing competing approvals from claiming the same resource. API documentation is available on the computer at `http://127.0.0.1:8000/docs`.

## Troubleshooting and current limits

- If port 8000 is occupied, stop the earlier backend with Ctrl+C before starting it with `-Lan`.
- A phone's `localhost` refers to the phone. Use the computer's Wi-Fi IP, not `localhost` or `0.0.0.0`.
- Allow Python on the computer's private-network firewall if prompted. Guest/campus Wi-Fi may isolate devices; a shared phone hotspot is an alternative. The scripts do not modify firewall rules.
- A compile, signature verification, and native component tests do not replace testing on a real phone. No physical Android device is attached to this workspace.
- AI parsing, responder reasoning, and report generation remain deterministic demo logic. No API key is needed. Voice, push notifications, offline report queuing, authentication, and duplicate/cluster detection are not included.
- SDK 54 was selected for Expo Go compatibility during development. Its older development toolchain inherits npm advisories. Do not run `npm audit fix --force` to change Expo/React Native versions independently; upgrade the SDK as a unit before production work.
- The next AI integration point is `backend/app/services/ai_mock.py`. Preserve schema validation, deterministic responder checks, and human approval.

# Pulse - Android app and Python backend

Pulse is a native **React Native** app backed by **FastAPI + SQLite**. The current target is a standalone Android APK you can install directly on a phone. No Expo account, Apple membership, app store, or Expo Go is needed for the APK.

## Run the backend, website, and mobile app

On Windows, open a PowerShell terminal in the repository folder. On a fresh checkout, run setup once:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 -InstallLocalNode
```

Keep the backend running whenever you use the website or mobile app. Start each service in its own PowerShell terminal from the repository folder.

**1. Backend API** (terminal 1):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1
```

This serves the API at **http://127.0.0.1:8000** and API docs at **http://127.0.0.1:8000/docs**. To connect a phone over Wi-Fi, use `-Lan` instead; the script prints the computer's available addresses:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1 -Lan
```

**2. Manager website** (terminal 2):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-frontend.ps1
```

Open **http://127.0.0.1:5173** in your browser. The website uses the local backend proxy at **http://127.0.0.1:8000** by default. The startup script installs website dependencies if they are missing.

**3. Mobile app, live development** (terminal 3):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-mobile.ps1
```

Scan the QR code with a compatible Expo Go app on the same Wi-Fi. If automatic address detection fails, pass the computer's Wi-Fi address with `-HostAddress`, for example `-HostAddress '192.168.1.42'`. In the app's Connection settings, set the backend URL to `http://192.168.1.42:8000` (use the address printed by the backend when started with `-Lan`). A phone cannot use `127.0.0.1` to reach the computer.

The QR workflow runs the JavaScript development preview. To use the complete Android app, including custom native alert features, build and install the standalone APK as described below. The website dashboard is manager-only; it does not include volunteer reporting. It has no user authentication, so manager-only describes its interface and workflows, not an access-control boundary.

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
5. Open **Pulse** from the phone launcher. Use **Connection settings** on the role-selection or volunteer-login screen (or **Settings** after entering a mode) to enter the computer's address, for example `http://192.168.1.42:8000`, and tap **Test & save connection**.

The APK bundles the frontend and runs without Metro or Expo Go. The **Python server must remain running** for reports and coordination. Installing an APK does not put the Python backend on your phone. For use away from this Wi-Fi, deploy an HTTPS backend and change the app's Connection setting.

The build includes ARM64 and ARMv7 libraries and requires **Android 7.0 / API 24 or later**. It is signed with the generated local test keystore. No production signing key or cloud account is required. No iPhone binary is being produced; the shared native source still supports iOS.

## Demo flow

- Choose **Volunteer**, then log in with a four-digit demo ID (`0001` to `0016`; `0002` is Jamie Chen). Reports and updates use that volunteer's identity.
- In **Report**, tap **Tap to record**, describe what happened and where, then tap **Stop & transcribe**. Allow microphone access the first time. Review or edit the transcript, then **Submit incident**. Recording stops when opening another tab or incident.
- **Type a report instead** opens the text input and example reports. Describe what happened and the person's condition; the backend supplies your assigned zone. Mention another festival zone if the incident is elsewhere, and add a landmark when useful. Use updates to answer clarification questions or supply new/corrected information.
- On another phone, or via **Settings > Return to main menu**, choose **Manager**. In **Operations**, open the report and review the suggested responders, actions, reasoning, and coverage warnings.
- **Modify response** saves the edited responders and actions back to the incident for review, without assigning anyone. The updated response appears on the incident screen; **Approve response** is a separate step that assigns the simulated responders. **Reject suggestion** records a reason without dispatching.
- In **Team**, check resource availability and current assignments.
- After approving a response at any priority (High, Medium, or Low), the manager can review and edit an AI-suggested message for each assigned volunteer before sending. Each message includes the situation, location, and that person's task. No alert is sent until the manager selects **Send reviewed alerts**.
- Once a response is approved, the manager can **Send volunteer alert** from incident details. These messages use the same alert delivery path, targeting assigned volunteers. Volunteer incident details allow updates under the volunteer's identity; approval, modification, rejection, resolution, and alert controls appear in Manager mode.
- Add an incident update. The mock recognizes the supplied unconsciousness escalation fixture and asks for new approval without assigning additional responders automatically.
- **Resolve incident**, add an outcome, and confirm. Assigned resources become available again. **Share draft report** opens Android's share sheet.

There are 19 simulated resources across six festival zones: named volunteers and security staff, including two paramedic volunteers. Incidents, timelines, alert inboxes, and acknowledgements persist in `backend/data/pulse.db`. The selected mode and volunteer login are remembered on the phone for the selected backend. Returning to the role menu ends that volunteer session and stops background alerts. The volunteer report picker shows their own reports and current assignments. Role navigation is for the demo, not authentication or server-side authorization. No real responders are contacted.

## Emergency alerts and locked-phone testing

Install **APK 0.5.2** over the existing app. No Firebase/Expo account is needed. This Android demo uses an on-duty foreground service that checks your existing Python backend every three seconds, even while Pulse is off-screen. It keeps a **Pulse alerts active** notification with a **Stop alerts** action. While the app is open, an alert overlay checks the same inbox every two seconds and pauses any voice recording. Vibration stays on continuously, with no pauses, while any alert remains active and unacknowledged. Android runs one indefinitely repeating waveform containing only an on segment; inbox polling and app navigation do not restart it. One ongoing notification represents the alarm. Merely opening Pulse does not stop the alarm. With full-screen permission, a new alert requests a native red lock-screen activity that turns the display on without waiting for JavaScript or another network request. Opening the app then shows the red alert over any volunteer tab. If an unstopped alert remains and the screen goes dark again, Pulse retries the permitted full-screen wake-up at most once every 30 seconds. Retries replace the existing alarm notification and do not restart the continuous vibration. A screen-off receiver reissues the continuous waveform after Android has processed its screen-off cancellation; a brief system interruption is possible during that transition. Stop alert removes the receiver and any queued recovery before cancelling the motor. Stop alert cancels these retries. Android decides whether to launch full-screen or show a heads-up notification; Pulse does not bypass notification permissions or Do Not Disturb.

1. Log in as a volunteer, e.g. **0002**, and allow notifications when Android asks.
2. Open **My alerts**. Check **On duty · background alerts active**. Use **Notification & vibration settings** to enable the Emergency alerts channel and its vibration. Use **Test vibration** to check the phone motor. If shown, tap **Allow lock-screen wake-up** and enable Android's full-screen alert access for Pulse (Android 14+).
3. Tap **Allow background activity** and approve the Android prompt. Leave the phone in vibration mode, with Do Not Disturb off. This on-duty service uses extra battery; stop it after testing/your shift.
4. Keep the laptop backend running and the phone on the same reachable Wi-Fi. From a terminal in the project root run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/test-alert.ps1 -DelaySeconds 30
   ```

5. The script creates a clearly labelled test incident. In Manager Operations, approve it, review or edit the message for each assigned responder, and select **Send reviewed alerts**. The assigned volunteer phone should wake (when permitted) and vibrate continuously. Check that vibration continues without pauses, then tap **Stop alert**. Resolve the test incident in Manager mode afterwards.

You can also test while Pulse is open on any volunteer tab, or swipe the app away while the on-duty notification remains. **Force stop**, Android's **Stop app** control, a reboot, disabled notifications, device-specific battery restrictions, or an unreachable laptop interrupt delivery. Reopen Pulse to resume after a reboot/force stop. If you use the notification's Stop action, reopen Pulse and tap **Enable background alerts**. The manager cannot override the phone owner's silent/DND/notification settings. This local-network demo is not a guaranteed emergency paging service. Background delivery still needs verification on the actual phone.

Reviewed alerts are saved when the manager sends them. Repeated reads update the same native alarm without starting another vibration loop. **Stop alert** stops that alert locally immediately, even offline; a durable Android acknowledgement queue retries when the selected backend is reachable. Local stop state is scoped to the server and volunteer and survives app restarts. Acknowledgement is per volunteer; resolution also stops outstanding alarms on the next successful inbox read. Cached, unstopped alarms keep vibrating continuously if Wi-Fi drops after delivery. Multiple alerts must each be stopped. Unacknowledged active alerts are recovered on reconnect. An incident report, approval, or update alone does not send an alert; the manager reviews and sends the individual messages. The inbox returns the latest 200 alerts per volunteer.

Native service source is in `mobile/plugins/android/`; `withPulseAlerts.js` registers it during Android prebuild. `GET /api/volunteers/VOL-002/alerts` reads an inbox; `POST /api/volunteers/VOL-002/alerts/{alert_id}/acknowledge` acknowledges one alert. Manager messages are drafted at `POST /api/incidents/{id}/alert-drafts` and sent at `POST /api/incidents/{id}/alerts`. The future live tracking map is outside this alert implementation.

Android platform references: [foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types), [Doze and battery restrictions](https://developer.android.com/training/monitoring-device-state/doze-standby), [full-screen alert permission and lock-screen behavior](https://source.android.com/docs/core/permissions/fsi-limits).

## Festival map and report locations

Only **Manager** mode has a **Map** tab, with a schematic festival, mock responder positions and active incident markers. Tap zones or responders to inspect them. Volunteer mode has Report, My alerts and Settings; the map is not mounted there. Positions use each resource's stored zone; this is not GPS tracking.

New reports automatically use the reporting volunteer's assigned zone when no location is stated. Alex Morgan (`0001`) can report "Someone is dying" and the backend uses Lawn Stage. An explicitly mentioned zone overrides that default. The original text stays in the timeline, alongside a note explaining inferred location. See [map implementation and two-phone test steps](docs/FESTIVAL_MAP.md).

Install Android **0.6.1** for the manager-only Map tab and Gemini labels; the Python backend must also contain the merged changes. Development previews load the updated mobile code through Metro.

## Voice reporting

The phone records AAC audio and uploads it to `POST /api/transcriptions` as a multipart `audio` field. The Python backend runs faster-whisper `base.en` locally on the laptop CPU and returns an editable English transcript. Recording and transcription do not create an incident; the user explicitly submits the reviewed text through the existing reports API. No cloud speech account or API key is required.

The English model is already installed in this checkout at `backend/models/base.en`. On a fresh setup, `scripts/setup.ps1` installs it after the Python dependencies. To download or repair it separately:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-speech.ps1
```

Model setup requires internet once; subsequent transcription uses only the local model. Python packages remain in `backend/.venv`. Voice messages stop automatically after 1 minute 50 seconds, or when leaving the Report screen or backgrounding the app. The API rejects recordings over two minutes or 10 MB. Silence, unreadable audio, missing models, and a busy recognizer return actionable errors. Failed uploads can be retried from the same screen without recording again; typing remains available. Recordings are temporary, are not stored with incidents, and are deleted from the phone after successful transcription or discard. Restarting the app does not preserve a pending recording.

Install APK version **0.6.1** over the previous app to combine the manager map, emergency alerts, Manager/Volunteer modes, voice recording and Gemini integration. The existing backend with `--reload` picks up code changes automatically. Speech recognition remains local. Check transcripts, especially place names and speech in noisy surroundings.

## Keyword incident priority

Without Gemini configuration, reports use the local keyword rules: `Someone is dying` is high priority; unclear illness is medium; clearly minor injuries with reassuring context are low. With Gemini enabled, explicit high-risk keyword warnings remain a priority floor so the original dying-report bug cannot reappear for supported phrases. These remain demo safeguards, not validated medical triage. See [keyword priority integration and testing](docs/KEYWORD_PRIORITY.md).

To explicitly select the keyword parser, set `$env:PULSE_AI_MODE = 'mock'` in the terminal before starting the backend. `/health` should show `analysis_mode: mock`. No API key, training job or APK rebuild is needed for these backend changes.

## Gemini incident analysis and alert drafts

The fetched Gemini integration is merged with the map, zone defaults and priority rules. Set these variables in the PowerShell terminal used to start the backend (create a key in [Google AI Studio](https://aistudio.google.com/app/apikey)):

```powershell
$env:GEMINI_API_KEY = 'your-key'
$env:PULSE_AI_MODE = 'gemini'
$env:PULSE_ALERT_PROVIDER = 'gemini'
# Optional; defaults to gemini-3.8-flash.
$env:PULSE_GEMINI_MODEL = 'gemini-3.8-flash'
powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1 -Lan
```

With no explicit analysis mode, a `GEMINI_API_KEY` selects Gemini; without a key, it selects mock. Explicit `PULSE_AI_MODE=mock` always selects the keyword parser. `PULSE_ALERT_PROVIDER` selects drafting separately and otherwise follows analysis mode. Old `openai` mode settings (and `ollama` for alert drafting) redirect to Gemini and require a Gemini key. Persisted legacy incidents remain readable. No API key belongs in the phone app or Git. Tests use mocked provider responses, not a live account.

The backend uses Gemini structured JSON output for the 0–100 incident priority score, medical-assistance need, and per-person responder requirements. Only the High/Medium/Low band is shown in the app; the manager board sorts by the numeric score. Report text and incident facts go to Gemini for analysis. Volunteer names and IDs are not sent; responder matching remains server-side and assignments still require manager approval. After approval, Gemini drafts a short situation/location/task message for each assigned volunteer. The manager can edit each draft and must press **Send reviewed alerts** before anyone is notified. Alert generation sends incident details and each responder’s role/task, but not names or IDs. [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output) · [Gemini models](https://ai.google.dev/gemini-api/docs/models).

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

This installs locked Python/mobile packages; it does not download the Android SDK. To build an APK, open **Android Studio → More Actions → SDK Manager** and set **Android SDK Location** to `<repository>\.tools\android-sdk` (for this checkout: `C:\Users\Joonk\Documents\GitHub\affinda-hackathon\.tools\android-sdk`). Install:

- **SDK Platforms:** Android API 36.
- **SDK Tools** (enable **Show Package Details**): Android SDK Build-Tools 36.0.0, NDK (Side by side) 27.1.12297006, and CMake 3.22.1.

Java 17 or 21 is also required for the native build.

## Rebuild the APK

With the local Android tools installed:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1 -ApiUrl 'http://YOUR-COMPUTER-IP:8000'
```

`-ApiUrl` supplies a default address for the app; users can change it in Connection. The script generates the native Android project, compiles a release variant with bundled Hermes JavaScript, signs it with the local test key, and copies the result to `artifacts/Pulse-Android.apk`.

The script synchronizes the mobile source to an isolated `C:\pulse-apk-<id>` build folder because this repository's long Windows path exceeds native compiler limits. Its location is recorded in `.run/apk-build-root.txt` and reused for incremental builds. SDK and Gradle caches stay in this project; a temporary drive alias gives those tools a space-free path and is removed afterward. The resulting APK is copied back into `artifacts/`. Never use the generated test signing key for a production store release.

## Develop the mobile app with live reload (optional)

For a JavaScript development preview, install an SDK 54-compatible Expo Go and run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-mobile.ps1
```

Scan its QR code on the same Wi-Fi. The script prefers the Wi-Fi interface; override it with `-HostAddress 'YOUR-IP'` if needed. Keep the backend running and configure the app's Connection settings with the computer's LAN URL, such as `http://192.168.1.42:8000`. The website is started separately with `scripts/start-frontend.ps1` as described above. Expo Go is a development preview; use the standalone APK for custom native Android alert features.

## Checks and architecture

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
```

Runs the Python API/state tests, native dependency compatibility checks (including transitive dependencies), mobile TypeScript checks, and native component/API tests. The APK builder also checks both the source and isolated build dependencies, removing changed or removed package copies before synchronizing. This prevents a downgraded dependency from leaving incompatible files in the incremental build. Android and iOS JavaScript bundles can also be compiled with `npm run export` in `mobile/` after adding the local Node runtime to PATH using `scripts/common.ps1`.

```text
mobile/
  App.tsx                      native navigation and safe areas
  src/screens/                 reporting, incidents, decisions, team, connection
  src/api.ts                   REST client, audio upload, foreground polling
  src/VoiceRecorder.tsx        native recording and transcription controls
  src/connection.tsx           verified server URL saved on the phone
  src/ui.tsx                   native controls and styles
  src/types.ts                 API contracts
  src/__tests__/               native workflow/API tests
  plugins/withPulseIcon.js     native Android launcher icon
             | REST JSON
backend/
  app/main.py                  API, health, local APK download
  app/routers/                 reports, incidents, resources, transcription
  app/services/transcription.py bounded audio decoding and local speech model
  app/services/ai_analysis.py   structured Gemini incident analysis and mock fallback
  app/services/ai_mock.py       deterministic no-key report parser
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
- Without Gemini configuration, incident parsing and responder suggestions use deterministic demo logic. With Gemini enabled, score and response needs come from the model, while responder matching and assignment validation remain deterministic. Push notifications, offline report queuing, authentication, and duplicate/cluster detection are not included.
- SDK 54 was selected for Expo Go compatibility during development. Its older development toolchain inherits npm advisories. Do not run `npm audit fix --force` to change Expo/React Native versions independently; upgrade the SDK as a unit before production work.
- Gemini report analysis and alert drafting live in `backend/app/services/ai_analysis.py`; `backend/app/services/ai_mock.py` remains the no-key fallback. Preserve schema validation, deterministic responder checks, and manager approval.

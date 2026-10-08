# Gemini merge with the manager map

**Later change (APK 0.7.1):** incident updates now save the sender's text directly to the timeline without AI analysis or automatic changes to priority, location or the response plan. Only initial reports retain their analysis step. Both saved volunteer reports and updates notify managers; see [manager notifications](MANAGER_UPDATE_NOTIFICATIONS.md). Earlier update-analysis behavior described below is historical.

Incoming commit: `2a305c7` (`AI use unrestricted`) from
`origin/Joon_LLM_Manager_Response`. Local map, keyword priority and assigned-zone
work was checkpointed as `aec939c` before merging. The incoming change replaces
OpenAI/Ollama adapters with Gemini for incident analysis and responder message
drafting. No remote push is part of this merge.

Resolved overlapping changes in README, backend health/provider selection and the
mobile Report screen. The combined behavior is:

- **Manager-only map:** Manager has Operations, Team, Map, Settings. Volunteer
  has Report, My alerts, Settings. The volunteer workspace does not mount the map.
- **Assigned-zone reports:** Gemini receives the reporter's stored zone as
  context, without the roster name or ID. Explicit reported locations retain
  their landmarks and take precedence. The server's missing-location fallback
  remains available. Report text is unchanged in the timeline.
- **Priority:** Gemini analyzes configured reports. Keyword mock mode remains
  available, and supported high-risk keyword signals prevent model under-scoring
  those reports. No training job was created.
- **Clarification:** the volunteer still sees and can answer an outstanding
  question, alongside the incoming UI for new information/corrections.
- **Alerts:** Gemini drafts per-assignment messages after approval. The manager
  reviews/edits and sends them explicitly. Native polling, vibration and Stop alert
  behavior are unchanged. Invalid/missing/duplicate draft indices are rejected.
- **Error handling:** malformed, blocked/truncated or invalid-schema Gemini
  output returns an error without saving a report or silently switching modes.
  Thought parts are excluded from the JSON answer. HTTP errors do not reflect
  arbitrary upstream messages or credentials back to phones.
- **Response timing:** mobile report/update requests allow 55 seconds for the
  existing 45-second Gemini response window, avoiding the prior 12-second client
  timeout during ordinary model latency. Requests are not automatically retried.
- **Compatibility:** existing `openai` incident records remain readable. Incoming
  legacy mode aliases are retained; OpenAI/Ollama runtime settings redirect to
  Gemini and need a Gemini key.

## Run

In the PowerShell terminal that starts Python:

```powershell
$env:GEMINI_API_KEY = 'your-key'
$env:PULSE_AI_MODE = 'gemini'
$env:PULSE_ALERT_PROVIDER = 'gemini'
$env:PULSE_GEMINI_MODEL = 'gemini-3.8-flash'
powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1 -Lan
```

Use the existing `backend/.venv`. Restart the backend when changing its environment
variables. The key stays on the laptop; never commit it or bundle it in the APK.
With no explicit mode, a Gemini key selects Gemini and no key selects mock.
To keep everything local, explicitly set both providers to `mock`.

Install APK **0.6.1 / code 10** for manager-only navigation and Gemini labels.
Map visibility is a UI role choice, not a new authentication/authorization system.

## Verification scope

Automated tests exercise the GenerateContent HTTP payload, model JSON validation,
assigned-zone inference, explicit landmark preservation, priority floors, existing
incident updates, malformed/error responses and reviewed-message delivery. API
responses are mocked, and tests use temporary databases. The test environment
explicitly disables real provider settings so a developer's key cannot turn normal
tests into paid calls.

Final checks: 128 targeted Gemini/priority/location cases passed; the full backend
suite has 153 passing and the same 10 pre-existing failures. Mobile TypeScript
passed; the full mobile suite has 30 passing and the same 3 pre-existing workflow
failures. The manager-only map navigation and delayed-response API tests pass.

No Gemini API key was available in this agent's environment, so live-account
delivery/latency and model quality were not tested. The working phone vibration
code was not modified. Existing unrelated roster/manager/alert test failures were
present before this merge; see the task's validation results for the final counts.

The incoming default model was checked against the official
[Gemini 3.8 Flash model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash).
The adapter retains the REST GenerateContent JSON schema approach described in
[Google's structured output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

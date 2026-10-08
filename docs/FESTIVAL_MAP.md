# Festival map and automatic report location

The **Map** tab is reserved for managers:

- Manager: Operations, Team, Map, Settings.
- Volunteer: Report, My alerts, Settings. The map screen is not mounted in this mode.

The native React Native screen draws a simple Riverside festival with Lawn Stage,
River Stage, Food Village, North Gate, South Gate and Medical Tent, walking paths
and a river edge. No map account, API key, GPS permission or new native package is
needed. The positions are explicitly labelled **mock**, not live phone tracking.

## Positions and interaction

`GET /api/resources` provides the existing roster and each responder's stored
`zone`. The map assigns repeatable schematic positions within that zone, ordered
by resource ID. This includes volunteers, paramedics, Security North/South/Stages,
Site Operations and the first-aid teams. The current seed has 22 resources.

Colours distinguish medical, security, site operations and other volunteers.
Volunteer markers use the short volunteer number; security uses S1/S2/S3,
operations OP, and first-aid teams A/B. Tap a marker or a
responder list item for their name, role, status, zone and assignment. Tap a zone
or use the zone filters to narrow the lists. Volunteers see their assigned zone on
the Report screen and receive instructions through their alerts.

Active incidents from `GET /api/incidents` appear as red count badges in their
matching zone. Tap a badge, then an incident, to open the existing detail screen.
Resolved incidents disappear. Existing role restrictions still apply to the detail
screen. These are incident markers, not proof that a phone alert has been sent.

Both resources and incidents refresh every five seconds while the app is active;
pull down to refresh immediately. Errors are shown alongside any cached data.
Unknown zones/locations remain visible in the lists, with a warning that they have
no position on this layout. There is no random wandering or GPS simulation.

## Automatic report location

On **new reports**, the backend looks up `reported_by` in its current resource
records. If the parsed report lacks a location, it fills in that resource's zone.
For example, Alex Morgan (`0001` / `VOL-001`) can submit **Someone is dying** and
the incident location becomes **Lawn Stage**. The breathing clarification stays;
the location question is removed.

- An explicitly reported festival zone wins over the stored zone. Alex reporting
  **Someone needs help at North Gate** creates a North Gate incident.
- The raw text/transcript is not rewritten. A `location_inferred` timeline event
  identifies the assigned demo zone and the responder used for the default.
- Unknown reporters and resources with no zone retain the location question.
- Updates preserve the original incident location unless they explicitly give a
  different zone. An updater's own position does not move the incident.
- The Report screen shows the reporter's assigned demo zone and no longer tells
  them they must say their location every time. Voice and typed reports use the
  same backend flow.

This is assigned-zone inference, not a measurement of where the phone physically
is. Responder assignment alone does not relocate their marker. Location defaults
are applied to new incidents; existing incidents are not migrated or moved.

## Changed files

- `mobile/src/festivalMap.ts`: shared schematic layout, markers and positions.
- `mobile/src/screens/MapScreen.tsx`: map, filters, responder and incident details.
- `mobile/App.tsx`: Map tab in Manager mode only.
- `mobile/src/screens/ReportScreen.tsx`: assigned-zone display and reporting copy.
- `backend/app/services/report_location.py`: server-side zone fallback.
- `backend/app/routers/reports.py`: apply fallback before recommendations/persistence.
- `mobile/app.config.ts`: Android release 0.6.1, version code 10.
- New map and report-location tests; one existing clarification test updated to
  expect the newly automatic zone.

No database migration or new API endpoint is required.

## Try it on two phones

1. Keep one Python backend running with the current code (`start-backend.ps1 -Lan`).
   Both phones use that same HTTP server address in Settings.
2. Install the updated APK from `artifacts/Pulse-Android.apk` on both phones, or use
   the updated Metro/Expo preview. A previous standalone APK will not gain a new
   tab just by restarting Python.
3. On one phone select Manager and open Map. On the other select Volunteer and
   log in with `0001`. Its Report screen shows Lawn Stage; it has no Map tab.
4. On the volunteer phone submit **Someone is dying**, without giving a location.
   The incident should show Lawn Stage and ask whether the person is breathing.
5. The manager's map should show an active incident at Lawn Stage within the next
   refresh. Open it to review. Sending vibration alerts still uses the existing
   approval and reviewed-message flow.
6. Submit another report mentioning **North Gate** to check that an explicit zone
   overrides Alex's default. Resolve test incidents when finished.

Targeted local checks (from the repository root):

```powershell
Set-Location backend
& .venv/Scripts/python.exe -m pytest tests/test_report_location.py tests/test_medical_priority.py -q
Set-Location ../mobile
. ../scripts/common.ps1
Set-PulseNodePath
npm run typecheck
npm test -- --runTestsByPath src/__tests__/map.test.tsx
```

Tests use temporary databases or mocked requests and never notify real phones.
There are 13 new backend location cases and 7 new mobile map/report/navigation
checks. Before this work, the full suites already had 10 backend and 3 mobile
failures in older roster/manager/alert tests. Those unrelated tests are not fixed
by adding the map.

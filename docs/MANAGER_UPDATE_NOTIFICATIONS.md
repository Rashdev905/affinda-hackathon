# Volunteer update notifications for managers

Android APK 0.7.1 (version code 12) notifies managers about both new volunteer reports and updates to existing incidents. Updates save directly without AI processing.

## Test with two phones

1. Restart the Python backend with `scripts/start-backend.ps1 -Lan` so it creates the new notification table. Keep your Gemini environment variables in the terminal if using Gemini.
2. Install `artifacts/Pulse-Android.apk` on the manager phone. Point both phones at the same Python server.
3. Choose Manager mode, allow notifications, and wait for the persistent notification to say `Connected · manager updates`.
4. In manager Settings, use **Allow background monitoring** if available. Keep Android notifications enabled and the phone in normal/vibrate mode.
5. On the volunteer phone, submit a new report, then open that incident and submit new information. After the backend successfully saves it, the manager should receive a notification with a brief vibration, normally within a few seconds. This also runs while locked or the app is in the background.
6. Tap the notification to open the incident. With the manager app open, a banner also offers **View volunteer update**.

Existing volunteer APKs can submit updates to the new backend. The manager needs this new APK for the Android notification code. Expo Go and iOS currently receive the in-app banner only.

## Behavior and implementation

- Each saved report or update from a recognized `VOL-...` resource creates one `manager_updates` SQLite row in the same transaction as the incident. A `kind` field distinguishes reports and updates; existing database rows migrate to `update`. Rejected submissions and manager-authored messages do not notify. New reports retain their initial AI classification and notify once saved. Updates append the exact text to the timeline without calling Gemini or the keyword parser, changing priority, interpreting location corrections, or changing assignments or the response plan. Managers see the raw text in a prominent Latest update card and review it themselves. Updates continue to save and notify when Gemini has no key or is unavailable.
- `GET /api/manager/updates` starts a subscription at the current cursor without replaying old history. `?after=<cursor>` returns up to 100 subsequent events in order. Every manager device keeps its own cursor, including across app restarts and temporary disconnections.
- The Android foreground service polls every three seconds plus request time. Manager notifications use a separate high-importance channel, a brief vibration and no repeating emergency alarm. The existing volunteer continuous-vibration alarm is unchanged.
- Notification taps carry the incident ID and server in a `pulse://incident/...` link. The manager app ignores links for another server. Switching role/server stops the old monitor and clears its displayed notifications.
- Manager Settings offers start/stop, notification settings and battery exemption controls. Android force-stop, stopping monitoring, disabled notifications, restrictive battery settings, or loss of access to the Python server prevents delivery. This is the existing local polling approach, not Firebase/cloud push.
- The feed uses the project's existing demo role model, without authentication. Selecting Manager is not a security boundary.

## Verification

Backend tests cover persistence, independent manager cursors, pagination, avoiding duplicates on later polls, cleared incident history, AI-independent updates, initial reports, transaction rollback and rejected/non-volunteer submissions. Mobile tests cover the banner, server changes, notification link handling, manager service startup and existing volunteer alarms. The native code is compiled into the APK. Physical phone delivery still needs the two-phone test above.

param(
    [string]$ApiUrl = 'http://127.0.0.1:8000',
    [ValidateRange(0, 600)][int]$DelaySeconds = 10
)
$ErrorActionPreference = 'Stop'
$base = $ApiUrl.TrimEnd('/')
Write-Output "A DEMO emergency report will be sent in $DelaySeconds seconds. Lock your phone now."
Write-Output 'Pulse must be logged in as a volunteer with background alerts enabled.'
if ($DelaySeconds) { Start-Sleep -Seconds $DelaySeconds }
$body = @{ text = 'DEMO ALERT TEST: Someone needs medical assistance at Lawn Stage. This is a test; acknowledge the alert.'; reported_by = 'Demo alert test' } | ConvertTo-Json
$incident = Invoke-RestMethod -Uri ($base + '/api/reports') -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 15
Write-Output "Created $($incident.id). All 14 demo volunteer inboxes were alerted."
Write-Output 'Expect a screen wake-up (if full-screen alerts are allowed) and continuous vibration without pauses. Open Pulse and tap Stop alert to stop it.'
Write-Output "Resolve $($incident.id) in Manager > Operations after testing."

# Keyword medical priority integration

Pulse now applies the synthetic dataset's priority policy using local English
keyword rules. No LLM was added or trained. The parser does not read the dataset
at runtime, need an API key, or make a network request.

## What changed

- `backend/app/services/medical_priority.py` contains the ordered medical rules,
  limited negation/context handling and common transcription spelling variants.
- `ai_mock.py` uses those rules for submitted reports and updates, including
  reviewed voice transcripts. It preserves the reported words in observations,
  asks for missing details and retains an active incident's highest priority.
- `ai_analysis.py` defaults to `mock`, even when an OpenAI key exists. The existing
  possible-fracture safeguard shares the new context/negation handling. An
  explicit `PULSE_AI_MODE=openai` still selects the previously implemented adapter;
  this change adds no prompt or training integration to it.
- `/health` reports the same default mode. No new API fields or phone build are
  required. The app already displays the score's High/Medium/Low band.
- `backend/tests/test_medical_priority.py` covers the 60 training examples plus
  negation, mixed symptoms, spelling, report/update APIs and the approval/alert
  workflow. Validation/test dataset examples are not loaded into these fixtures.

| Example | Priority |
| --- | --- |
| Someone is dying. | High, provisional; asks about normal breathing. |
| Someone fell down stairs and is unconscious. | High in the app; internal urgency remains `critical`. |
| Not unconscious, but cannot breathe. | High. |
| Someone feels unwell, no details yet. | Medium; asks for symptoms and current condition. |
| Sore swollen wrist after a minor trip. | Medium. |
| Small paper cut, bleeding stopped, otherwise well. | Low. |
| Small paper cut, but also crushing chest pain. | High; the warning wins. |

High patterns cover reported dying, unresponsiveness, absent/abnormal breathing,
airway swelling, severe breathing difficulty, chest symptoms, selected stroke-like
phrases, major bleeding, seizures, heat with confusion, collapse and possible
fractures. Clearly minor complaints need reassuring context to receive low.
Other recognized medical complaints default to medium, with clarification for
vague illness. Numbers are demo queue constants within the existing score bands
(low 0–34, medium 35–69, high 70–100), not clinical measurements.

Negation is scoped to recognized symptoms/lists, so “not unconscious” does not
cancel “cannot breathe.” Explicit fictional/historical clauses and a small set
of idioms are handled. A current warning in a separate clause still wins.
Recent recovery from unconsciousness is retained as high pending human review.
Updates can raise priority but never silently lower an active incident; resolve
the incident through the existing manager workflow after appropriate assessment.

The existing fracture policy remains conservative: an explicit/suspected fracture
is high. A sore wrist without a reported fracture is not automatically called one.

Reporting, updating or approving an incident does not itself send a phone alert.
The manager still approves the response, reviews the individual messages, then
sends them. This change does not alter vibration, recipient selection or tracking.

## Run and test

In the terminal running your backend, press **Ctrl+C**, then run from the repository
root (stop the old server before starting another on port 8000):

```powershell
$env:PULSE_AI_MODE = 'mock'
powershell -ExecutionPolicy Bypass -File scripts/start-backend.ps1 -Lan
```

This script uses `backend/.venv`, not global Python. If `--reload` is already
running in mock mode, Python changes reload automatically. Existing stored reports
are not reclassified; submit fresh reports to try the examples above. Typed reports
and edited voice transcripts follow the same path.

In a second terminal:

```powershell
(Invoke-RestMethod http://127.0.0.1:8000/health).analysis_mode
# Expected: mock

Set-Location backend
& .venv/Scripts/python.exe -m pytest tests/test_medical_priority.py -q
```

The tests use temporary databases and block external analysis requests. They do
not send alerts to your running server or connected phones.

Verification for this integration: 91 keyword tests pass. The full backend suite
has 116 passing tests and the same 10 failures reproduced before these changes.
Those failures concern old roster counts, automatic-alert expectations, the
removed `modify` decision, assignment counts and changed timeline/conflict text.
The full suite is therefore not green; those existing tests were not rewritten
as part of this priority change.

## Limits and provenance

These are hackathon keyword heuristics, not medical triage validation. Unrecognized
wording can still be misclassified; context handling is deliberately limited and
English-only. Scores and dataset labels need qualified clinical review before any
real medical use. The synthetic training fixtures are development examples, so
passing them is not independent accuracy evidence. No held-out model-performance
claim is made.

The policy and source references are in
[the dataset README](../datasets/medical_priority_v1/README.md). Warning concepts
are informed by [Healthdirect emergency guidance](https://www.healthdirect.gov.au/calling-triple-zero);
the exact rules and score choices are application decisions. In a real emergency,
contact 000 in Australia without waiting for classification or manager approval.

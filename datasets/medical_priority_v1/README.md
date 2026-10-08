# Pulse medical priority: synthetic training and evaluation starter

Created 8 October 2026. **90 original synthetic examples: 30 high, 30 medium, 30 low.** These are written for festival-report classification, informed by published medical guidance. They are **not real patient records, professionally labelled clinical cases, or a validated triage dataset**. Every example is marked as requiring qualified clinical review. Review labels before training or use in real emergency decisions.

This package does not train a model, upload data or call an API. Its policy is now adapted into Pulse's local keyword parser; see [implementation and testing](../../docs/KEYWORD_PRIORITY.md). The runtime does not load these files. Neither the dataset nor keyword rules guarantee correct priority classification. For real immediate danger, contact emergency services (000 in Australia) without waiting for a model or manager approval. [Healthdirect emergency guidance](https://www.healthdirect.gov.au/calling-triple-zero)

## The original problem, before keyword integration

The deterministic parser in `backend/app/services/ai_mock.py` was checked locally:

| Input | Previous mock output | Intended three-class target |
| --- | --- | --- |
| `someone is dying` | `general`, score 20, urgency `low` | `high`, provisional, ask about responsiveness and normal breathing |
| `someone fell down from the stairs and is unconscious` | `medical`, score 98, urgency `critical` | `high` |

The previous mock used a short keyword list that included `unconscious` but not `dying`. The keyword integration fixes this example and adds three-level medical rules. This original reproduction did **not** prove which mode the user's running backend was using.

Check the running server's `GET /health` response for `analysis_mode`, and an incident's `parser_mode`. `PULSE_AI_MODE=mock` selects the keyword parser. Following the Gemini merge, an unset mode selects Gemini when `GEMINI_API_KEY` exists, otherwise mock. Old `openai` mode settings redirect to Gemini. The keyword rules still provide high-risk floors on Gemini results; no model was fine-tuned.

## What the labels mean

These labels are a proposed **application review priority**, not a diagnosis, a medical dispatch protocol, or a mapping to Australia's five-level clinical triage scale. WHO's red/yellow/green framework provides a broad prioritization reference, but this dataset does not implement the full Interagency Integrated Triage Tool. Clinical tools require assessment that a short voice transcript cannot provide. [WHO IITT](https://www.who.int/tools/triage)

| Label | Dataset policy | Existing Pulse score band |
| --- | --- | --- |
| `high` | Credible immediate danger or time-sensitive harm; escalate for immediate human assessment. A literal current claim that someone is dying is provisionally high even when details are missing. | 70–100 |
| `medium` | A current problem needs prompt assessment, or the complaint is too unclear to justify low and no specific severe warning has been reported. | 35–69 |
| `low` | Explicitly minor/stable symptoms with enough reassuring context, or a clear nonmedical request. Low does not mean safe or no care required. | 0–34 |

The score bands are **existing app configuration**, not medically validated thresholds. The dataset deliberately avoids inventing precise numerical clinical scores. For three-class evaluation, an existing `critical` label belongs in `high`.

The conservative interpretation of vague distress, treatment of missing information, and retention of unresolved earlier high-priority context are **author-defined application safeguards**. They are not quoted rules or endorsements from WHO or Healthdirect. Qualified clinicians should review them along with the individual cases.

## Files

| File | Use |
| --- | --- |
| `cases.csv` | Open in Excel to review all reports, labels, short rationales and source IDs. |
| `cases.jsonl` | Canonical records with IDs, context, split, target output and provenance. |
| `train.jsonl` | 60 chat-format examples: 20 per label. |
| `validation.jsonl` | 18 chat-format examples: 6 per label. Use for development/tuning. |
| `test.jsonl` | 12 chat-format examples with answers: 4 per label. Keep held out. |
| `test_inputs.jsonl` | The same 12 test inputs without answers, with IDs for scoring. |
| `classifier_prompt.txt` | Proposed rules and output contract for a classification-only component. |
| `sources.json` | Source titles, direct URLs and access date. `POLICY` identifies our own labelling policy. |
| `manifest.json` | Counts, provenance, score-band mapping and validation status. |
| `build_dataset.py` | Hand-authored scenario definitions and reproducible local export/validation. |
| `evaluate.py` | Local classification metrics for predictions you supply; no model/API calls. |

Chat JSONL uses `system`, `user`, and `assistant` messages. This follows the documented supervised fine-tuning data shape; it does not establish that every OpenAI model supports fine-tuning. Check eligibility of the chosen base model before creating a job. No model was selected or trained here. [OpenAI supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)

All reports are newly authored. Source pages support the clinical warning/context concepts; **they do not supply or clinically validate these exact scenario labels**. Per-case source IDs are review aids, not claims that the example was extracted from a patient record. `POLICY`-only examples concern language, uncertainty, fictional reports or logistics.

## Coverage and separation

- High examples include vague dying reports, unresponsiveness after a fall, abnormal breathing, severe chest symptoms, sudden neurological deficits, airway allergy symptoms, uncontrolled bleeding, prolonged seizures, heat-related confusion, recent loss of consciousness, overdose warning signs, smoke exposure and chemical eye injury.
- Medium examples include stable injuries needing review, controlled but gaping wounds, minor head impacts needing assessment, heat-related weakness, repeated vomiting, recurring abdominal discomfort, recurring nosebleeds, small blistering scalds, persistent eye irritation, prolonged fever, unclear illness, dizziness, worsening local bites and persistent headaches.
- Low examples include explicitly minor cuts/grazes, friction blisters, brief stopped nosebleeds, limited mild sunburn, small local bites, mild aches, familiar improving headache/nasal allergies, resolved minor nausea and clear nonmedical language.
- Two paraphrases belong to each of 45 scenario groups. Both remain in the same split: 30 training groups, 9 validation groups and 6 test groups. This prevents direct paraphrase leakage across splits. Related clinical concepts still overlap; this is not independent clinical validation.
- Includes intelligible spelling/transcription errors, negation, figurative speech, historical/fictional contexts and an update containing an instruction to lower priority. Do not train the model to obey instructions embedded inside a report.
- The small balanced set is deliberately educational, not representative of real-world prevalence. It cannot establish sensitivity or safety for rare events.
- Coverage is mainly adult festival reports, with generic urgent statements where age is unknown. It is incomplete for paediatrics, pregnancy, older/frail people, comorbidities, vital signs, mental-health crises and other emergencies. Expand with qualified reviewers and appropriately governed real evaluation data.

Examples of the desired distinction:

| Report | Expected |
| --- | --- |
| Someone is dying. | High; details urgently needed. |
| Not unconscious, but cannot breathe properly and lips look blue. | High; negating one warning does not negate another. |
| Someone feels unwell; I do not know what is wrong. | Medium provisionally; clarify symptoms, responsiveness and breathing. |
| Small surface cut, bleeding stopped, otherwise well. | Low; minor first aid. |
| Dying of laughter; everyone is well and no medical help is needed. | Low; explicitly figurative. |
| Breathing normally now, after an earlier unresolved unresponsive head-injury report. | High pending qualified reassessment; retain earlier context. |

## Fit with the current LLM integration

**These files train/evaluate a classification-only output; they are not a drop-in replacement for `LLMAnalysis`.** Current `backend/app/services/ai_analysis.py` requests a larger JSON schema: incident type/location/summary/observations, numeric `priority_score`, missing information, follow-up question, medical-assistance need, responder requirements, actions and reasoning. The app derives high/medium/low from the score in `schemas.py`.

The new proposed output is:

```json
{
  "priority": "high",
  "immediate_escalation": true,
  "needs_clarification": true,
  "follow_up_question": "Are they responding, and are they breathing normally?",
  "reason": "A literal current report of possible death needs immediate assessment despite missing details."
}
```

`immediate_escalation` is a desired human-response flag, **not an implemented automatic call, dispatch or phone notification**. `needs_clarification` identifies missing classification-relevant context; it is not a confidence score or complete assessment checklist. Even a case with it set to false still requires operational details and human review.

The implemented integration uses deterministic keyword rules and preserves the existing response schema and human assignment approval. For a future LLM integration, either add a separate classification step with a validated adapter to the existing score bands, or adapt reviewed examples to the complete existing analysis schema. Do not substitute these JSON objects into that schema unchanged, or invent responder/treatment fields merely to satisfy validation. Numeric scoring within a band requires its own reviewed policy. In a real emergency, emergency-service contact must not be delayed by in-app assignment approval.

No training job or example demonstrations were added to a model. The Gemini merge adapts the policy text to its existing full analysis schema. The 60 training examples serve as keyword regression fixtures; validation/test groups are not loaded by the parser or those tests. Merely copying additional examples into the dataset does not change the rules or a hosted model.

## Rebuild and evaluate locally

From the repository root, use the local Python environment:

```powershell
& backend/.venv/Scripts/python.exe datasets/medical_priority_v1/build_dataset.py
```

The builder checks IDs, source references, output labels, class balance and split separation, then rewrites only the generated dataset files in this directory. To edit labels, update the scenario definitions, then rebuild. Structural checks are not clinical validation.

Run the same candidate model/prompt on `test_inputs.jsonl` after development is complete. Never include the corresponding assistant answers or held-out cases in training/few-shot prompts. Save predictions as JSONL, one per ID:

```json
{"id":"H14-1","priority":"high"}
```

Then score a complete set of predictions:

```powershell
& backend/.venv/Scripts/python.exe datasets/medical_priority_v1/evaluate.py path/to/predictions.jsonl --split test
```

The evaluator reports confusion counts, accuracy, per-class recall, high-priority misses, high-to-low mistakes and overtriage. Missing, duplicate or invalid predictions are rejected rather than silently ignored. Treat malformed output/API failure as an explicit review-needed state in the application, never as low priority. Use validation cases for iteration; repeatedly tuning on the test cases invalidates the held-out claim. Do not infer deployment readiness from a perfect score on 12 synthetic test inputs.

This package has no trained-model performance result. The reproduced mock outputs above describe the code before keyword integration, not a benchmark of an OpenAI model. Passing training examples with the new rules is development regression coverage, not independent clinical validation.

## Selected source references

- [WHO Interagency Integrated Triage Tool](https://www.who.int/tools/triage): broad prioritization framework; the complete clinical tool is not implemented here.
- [Healthdirect: calling triple zero](https://www.healthdirect.gov.au/calling-triple-zero): serious injury and emergency warning signs.
- [Healthdirect: head injuries](https://www.healthdirect.gov.au/head-injuries), [heart attack](https://www.healthdirect.gov.au/heart-attack), [stroke](https://www.healthdirect.gov.au/stroke), [anaphylaxis](https://www.healthdirect.gov.au/anaphylaxis): examples of time-sensitive warning patterns.
- [Healthdirect: wounds, cuts and grazes](https://www.healthdirect.gov.au/wounds-cuts-and-grazes), [sprains and strains](https://www.healthdirect.gov.au/sprains-and-strains), [heatstroke](https://www.healthdirect.gov.au/heatstroke): distinctions informing minor, review-needed and emergency scenarios.
- Further per-condition references are in `sources.json` and linked by every applicable case.

These organizations did not author, review or endorse the generated dataset. Qualified clinical review and a broader evaluation are required before using any resulting classifier for real medical prioritization.

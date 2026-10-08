"""English keyword rules for the festival demo, not a clinical triage system.

Rules reflect the policy in datasets/medical_priority_v1. No model, training,
network requests or runtime dependency on the dataset is involved. Scores are
queue ordering constants within Pulse's existing bands, not medical scores.
"""

from dataclasses import dataclass
import re


@dataclass(frozen=True)
class MedicalPriority:
    score: int
    reason: str
    vague: bool = False

    @property
    def urgency(self) -> str:
        return "critical" if self.score >= 98 else "high" if self.score >= 70 else "medium" if self.score >= 35 else "low"


def normalize(text: str) -> str:
    text = text.lower().replace("\u2019", "'").replace("\u2018", "'")
    replacements = {
        r"\b(?:can't|cant|cannot)\b": "cannot", r"\b(?:won't|wont)\b": "will not",
        r"\b(?:isn't|isnt)\b": "is not", r"\b(?:aren't|arent)\b": "are not",
        r"\b(?:doesn't|doesnt)\b": "does not", r"\b(?:didn't|didnt)\b": "did not",
        r"\b(?:hasn't|hasnt)\b": "has not", r"\b(?:don't|dont)\b": "do not",
        r"\b(?:dieing|dyin)\b": "dying", r"\bunconcious\b": "unconscious",
    }
    for pattern, replacement in replacements.items():
        text = re.sub(pattern, replacement, text)
    return re.sub(r"\s+", " ", text).strip()


# Mask only the negated symptom/list, never the entire report. In particular,
# 'not breathing' must remain a positive warning, unlike 'no breathing trouble'.
_SYMPTOM = (
    r"(?:unconscious(?:ness)?|unresponsive(?:ness)?|loss of consciousness|blackout|"
    r"passed out|faint(?:ed|ing|ness)?|collapse(?:d)?|confusion|confused|"
    r"(?:severe |major |heavy |uncontrolled |external )?bleeding|blood|"
    r"(?:severe |sudden |crushing )?(?:chest pain|chest pressure|pain|headache)|"
    r"chest symptoms|breathlessness|breathing (?:trouble|difficulty|problems)|"
    r"(?:tongue|throat) swelling|wheez(?:ing|e)|seizures?|convulsions?|"
    r"(?:broken|fractured)(?: (?:left |right )?(?:leg|arm|ankle|wrist|hip|rib|bone))?|fracture|"
    r"(?:head |other |serious )?injur(?:y|ies)|trauma|deformity|numbness|"
    r"colou?r change|dizziness|dizzy|weakness|speech change|vision change|"
    r"vomiting|nausea|sweating|cold sweat|fever|rash|stiff neck|sudden onset|"
    r"blisters?|illness|(?:spreading )?swelling|allergy history|symptoms elsewhere|"
    r"other symptoms|unusual symptoms|difficulty walking)"
)
_NEGATED_SYMPTOMS = re.compile(
    r"\b(?:no longer|no|not|without|never|denies|denied|has not|have not|"
    r"does not have|did not have|did not sustain|does not appear to have)\s+"
    r"(?:(?:evidence|signs|indication) of )?(?:any |a |the )?"
    + _SYMPTOM + r"(?:\s*(?:,\s*(?:(?:or|and)\s+)?|\bor\s+|\band\s+)" + _SYMPTOM + r")*\b"
)


def current_symptoms(text: str) -> str:
    """Limited context/negation handling; deliberately not general language understanding."""
    text = normalize(text)
    # Remove the idiom itself only; real symptoms elsewhere still take priority.
    text = re.sub(r"\bdying (?:of|from) (?:laughter|boredom|embarrassment)\b", "figurative expression", text)
    text = re.sub(r"\b(?:no one|nobody) (?:is )?dying\b|\bnot dying\b", "", text)
    text = re.sub(r"\b(?:nobody|no one) (?:is (?:actually )?(?:ill|injured|unwell)(?: or needs medical help)?|needs medical help)\b", "", text)
    text = re.sub(r"\bno (?:patient|emergency)\b", "", text)
    clauses = re.split(r"[.!?;]|\b(?:but|however)\b", text)
    current = []
    for clause in clauses:
        # Only clearly labelled non-current clauses are ignored. A following
        # 'but someone is actually ...' is a separate clause and still assessed.
        if re.search(r"\b(?:fictional|practice scenario|training (?:scenario|exercise)|this is (?:only |just )?a drill)\b", clause):
            continue
        if (re.search(r"\b(?:last year|years ago|as a child|previously|old injury)\b", clause)
                and re.search(r"\b(?:healed|recovered|resolved|fully well)\b", clause)):
            continue
        clause = re.sub(r"\bno longer (?:unconscious|unresponsive)\b", "recent loss of consciousness", clause)
        clause = re.sub(r"\bfracture (?:was |is )?(?:ruled out|not present)\b", "", clause)
        current.append(_NEGATED_SYMPTOMS.sub(" ", clause))
    return " ; ".join(current)


_FRACTURE = re.compile(
    r"\b(?:broken|fractured) (?:left |right )?(?:leg|arm|ankle|wrist|hip|rib|bone)\b"
    r"|\bfracture\b|\b(?:leg|arm|ankle|wrist|hip|rib|bone) (?:is )?"
    r"(?:(?:possibly|suspected to be|may be|might be|could be) )?(?:a )?(?:broken|fractured)\b"
)


def has_possible_fracture(text: str) -> bool:
    return bool(_FRACTURE.search(current_symptoms(text)))


# Ordered patterns: a reassuring phrase must never win over a current warning.
_CRITICAL = re.compile(
    r"\b(?:unconscious|unresponsive)\b|\b(?:not|stopped|no longer) breathing\b"
    r"|\bno (?:normal )?breathing\b|\b(?:will not|cannot|not) (?:wake|waking|respond|responding)\b"
    r"|\b(?:only (?:occasional )?gasps|gasping for (?:air|breath))\b"
)
_DANGER_RULES = (
    (r"\bdying\b|\b(?:going|about) to die\b", "Possible life-threatening distress reported; details need urgent confirmation."),
    (r"\b(?:cannot|struggling to|hard to|unable to) breathe\b|\b(?:difficulty|trouble) breathing\b|"
     r"\bstruggling (?:for breath|to get air)\b|\b(?:lips|face) (?:look |are |turning )?blue\b|"
     r"\b(?:tongue|throat) (?:swelling|swelled|swollen)\b|\b(?:swollen|swelling) (?:tongue|throat)\b|"
     r"\b(?:hard to wake|barely responds|breathing very slowly|long pauses between breaths)\b",
     "Breathing, airway or responsiveness warning reported."),
    (r"\bchest (?:pain|pressure|tightness)\b|\b(?:crushing|squeezing|pressure) (?:in (?:the )?)?chest\b|"
     r"\b(?:face|facial) (?:suddenly )?droop(?:ed|ing)?\b|\bslurred speech\b|\bspeech is slurred\b|"
     r"\bcannot lift (?:one|an?) arm\b|\b(?:one-sided|one sided) weakness\b",
     "Chest or sudden neurological warning reported."),
    (r"\b(?:uncontrolled|heavy|severe|spurting) bleeding\b|\bblood is spurting\b|"
     r"\bbleeding (?:will not|does not|cannot) stop\b|\bsoaking through with blood\b|"
     r"\b(?:seizure|convulsing|convulsions)\b|\bhaving a fit\b",
     "Major bleeding or seizure warning reported."),
    (r"\b(?:sudden|worst ever|worst-ever) (?:severe )?headache\b",
     "Sudden severe headache warning reported."),
)
_DANGER_RULES = tuple((re.compile(pattern), reason) for pattern, reason in _DANGER_RULES)
_MEDICAL = re.compile(
    r"\b(?:medical|first aid|unwell|ill|sick|injur\w*|pain|ach\w*|sore\w*|"
    r"dizzy|dizziness|nausea|vomit\w*|fever|headache|cramps?|swollen|swelling|"
    r"cut|nick|wound|graze|scraped?|blister|burn|sunburn|scald|nosebleed|bleeding|breathing status|"
    r"bite|sting|allergy|hay fever|seasonal sniffles|sneezing|itchy|irritation|gritty eye|"
    r"twisted|sprain\w*|rolled an ankle|head bump|bumped their head|"
    r"weak|faint\w*|collapsed|heat|overheated)\b"
)
_MINOR = re.compile(
    r"\b(?:small|tiny|minor|shallow|little) (?:clean |intact )?(?:surface |paper |friction |knee |heel )?(?:cut|nick|graze|scrape|blister)\b|"
    r"\bscraped the skin\b|"
    r"\bpaper cut\b|\b(?:mild|slight) (?:sunburn|ankle (?:soreness|pain)|muscle (?:soreness|ache)|"
    r"familiar headache|headache|hay fever)\b|\busual (?:small headache|mild hay fever)\b|"
    r"\b(?:small|local|single itchy) (?:mosquito|mozzie|insect) bite\b|"
    r"\b(?:small|tiny) nosebleed\b|\b(?:mildly red sunburn|pink skin from the sun)\b|"
    r"\bankle (?:mildly sore|ache)\b|\bmildly achy\b|\bordinary muscle soreness\b|\bseasonal sniffles\b"
)
_REASSURING = re.compile(
    r"\b(?:bleeding (?:has )?stopped|not bleeding|no bleeding|otherwise (?:well|fine)|"
    r"walking normally|can walk normally|can walk as usual|moving normally|improving|getting better|"
    r"easing|fading|feels better|feels (?:completely )?well|no more blood|no other symptoms|"
    r"no (?:spreading swelling|redness spreading|blisters|wheeze)|stopped (?:quickly|in two minutes))\b"
)
_NEEDS_ASSESSMENT = re.compile(
    r"\b(?:moderate|severe|worsening|getting worse|persistent|persists|repeated|repeatedly|"
    r"cannot (?:walk|bear weight)|gaping|edges remain apart|head bump|head injury|"
    r"bumped their head|blistering|scald|vomit\w*|(?<!hay )fever|dizzy|dizziness|confused|"
    r"unwell|medical help|stomach|tummy|abdominal|third|keeps bleeding)\b"
)


def medical_priority(text: str) -> MedicalPriority | None:
    symptoms = current_symptoms(text)
    if _CRITICAL.search(symptoms):
        return MedicalPriority(98, "Reported unresponsiveness or absent/abnormal breathing needs immediate human assessment.")
    for pattern, reason in _DANGER_RULES:
        if pattern.search(symptoms):
            return MedicalPriority(90, reason)
    if re.search(r"\b(?:hot|heat|sun|overheated)\b", symptoms) and re.search(r"\b(?:confused|confusion|staggering|not making sense|cannot walk straight)\b", symptoms):
        return MedicalPriority(90, "Heat exposure with confusion or difficulty walking reported.")
    if _FRACTURE.search(symptoms):
        return MedicalPriority(82, "Possible fracture: the existing demo policy requires high-priority medical review.")
    if re.search(r"\b(?:collapsed|fainted|passed out|blacked out|loss of consciousness)\b", symptoms):
        return MedicalPriority(82, "Collapse or loss of consciousness reported; a short reassuring phrase does not clear it.")
    if not _MEDICAL.search(symptoms):
        return None
    if _MINOR.search(symptoms) and _REASSURING.search(normalize(text)) and not _NEEDS_ASSESSMENT.search(symptoms):
        return MedicalPriority(20, "Explicitly minor complaint with reassuring context; human review still applies.")
    vague = bool(re.search(r"\b(?:unwell|medical help|ill|sick|no details|do not know|breathing status)\b", symptoms))
    return MedicalPriority(55, "Current medical complaint needs assessment; missing details do not justify low priority.", vague=vague)

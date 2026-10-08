"""Build original synthetic examples locally; no network, API calls or patient records."""
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATE = "2026-10-08"
SOURCES = {
    "POLICY": {"title": "Pulse provisional priority policy", "url": None,
               "note": "Author-defined labels and uncertainty policy; not a validated clinical triage protocol."},
    "WHO": {"title": "WHO Interagency Integrated Triage Tool", "url": "https://www.who.int/tools/triage"},
    "SFT": {"title": "OpenAI supervised fine-tuning format", "url": "https://developers.openai.com/api/docs/guides/supervised-fine-tuning"},
}
for key, slug in {
    "000": "calling-triple-zero", "HEART": "heart-attack", "STROKE": "stroke",
    "ALLERGY": "anaphylaxis", "HEAD": "head-injuries", "SEIZURE": "seizures",
    "HEAT": "heatstroke", "WOUND": "wounds-cuts-and-grazes", "BURN": "burns-and-scalds",
    "SPRAIN": "sprains-and-strains", "FRACTURE": "fractures", "ABDOMEN": "abdominal-pain",
    "VOMIT": "vomiting", "SUN": "sunburn", "NOSE": "nosebleed",
    "BITE": "insect-bites-and-stings", "FAINT": "fainting", "OVERDOSE": "drug-overdose",
    "HEADACHE": "headaches", "EYE": "objects-or-chemicals-in-eye", "FEVER": "fever",
    "DIZZY": "dizziness", "HAYFEVER": "hay-fever", "BLISTER": "blisters",
}.items():
    SOURCES[key] = {"title": f"Healthdirect: {slug.replace('-', ' ')}", "url": f"https://www.healthdirect.gov.au/{slug}"}
for source in SOURCES.values():
    source["accessed"] = DATE

rows = []


def add(group, priority, sources, reason, reports, question="", context=None):
    """Keep both paraphrases in one split; select complete held-out scenario groups."""
    number = int(group[1:])
    split = "train" if number <= 10 else "validation" if number <= 13 else "test"
    assert len(reports) == 2
    for index, report in enumerate(reports, 1):
        rows.append({
            "id": f"{group}-{index}", "scenario_group": group, "split": split,
            "input": {"report": report, "context": context},
            "expected": {
                "priority": priority, "immediate_escalation": priority == "high",
                "needs_clarification": bool(question), "follow_up_question": question,
                "reason": reason,
            },
            "source_ids": ["POLICY", *sources],
            "provenance": "original_synthetic_not_patient_record",
            "review_status": "needs_qualified_clinical_review",
        })


# HIGH: sparse distress, real red flags, speech errors, and unresolved prior danger.
add("H01", "high", ["000"], "A literal current report of possible death needs immediate assessment despite missing details.", [
    "Someone is dying.",
    "help somone is dieing at the gate come now",
], "Are they responding, and are they breathing normally?")
add("H02", "high", ["HEAD"], "Unresponsiveness following a fall is an emergency warning sign.", [
    "Someone fell down the stairs and is unconscious.",
    "fell off the steps hit their head wont wake up",
], "Are they breathing normally?")
add("H03", "high", ["HEART"], "Unresponsiveness with absent or abnormal breathing requires immediate escalation.", [
    "They collapsed, won't respond, and aren't breathing.",
    "person down not waking up only occasional gasps",
])
add("H04", "high", ["000"], "Severe breathing difficulty remains urgent even when the person is awake.", [
    "They are awake but struggling for breath and can only say one word at a time.",
    "not unconscious but cant breathe properly lips look blue",
])
add("H05", "high", ["HEART"], "Severe chest pressure with sweating is a time-sensitive warning pattern.", [
    "An adult has crushing chest pressure and is covered in cold sweat.",
    "bad squeezing in the chest spreading to the jaw, sweaty and getting worse",
])
add("H06", "high", ["STROKE"], "Sudden speech difficulty and one-sided weakness require immediate assessment.", [
    "Their face suddenly drooped on one side and their speech is slurred.",
    "cant lift one arm now and the words suddenly sound wrong",
])
add("H07", "high", ["ALLERGY"], "Tongue or throat swelling with breathing difficulty is an emergency warning pattern.", [
    "After eating, their tongue swelled and they started wheezing.",
    "bee sting then throat swelling, voice changed and hard to breathe",
])
add("H08", "high", ["WOUND"], "Heavy bleeding that does not stop is an immediate danger.", [
    "Blood is spurting from their leg and won't stop with pressure.",
    "the cloth keeps soaking through with blood even while we press on the wound",
])
add("H09", "high", ["SEIZURE"], "An ongoing prolonged seizure needs immediate emergency assessment.", [
    "They have been convulsing continuously for more than five minutes.",
    "still having a fit after six minutes, it has not stopped",
])
add("H10", "high", ["HEAT"], "New confusion during heat exposure is a serious warning sign.", [
    "They were dancing in the sun and are now very hot, confused and staggering.",
    "overheated at Lawn Stage, not making sense and cannot walk straight",
])
add("H11", "high", ["FAINT"], "A recent unexplained loss of consciousness still needs urgent assessment after waking.", [
    "They blacked out briefly and are awake again; no clinician has assessed them.",
    "passed out in the queue, talking now but we do not know why it happened",
])
add("H12", "high", ["OVERDOSE"], "Difficulty waking with slow breathing after substance use is an emergency warning pattern.", [
    "After taking an unknown substance they are hard to wake and breathing very slowly.",
    "friend took something, barely responds now and long pauses between breaths",
])
add("H13", "high", ["BURN"], "Breathing or voice changes after smoke exposure may indicate airway injury.", [
    "They escaped a smoky tent and now have a hoarse voice and difficulty breathing.",
    "smoke inhalation near the stall, voice changed and struggling to get air",
])
add("H14", "high", ["EYE"], "Chemical exposure with eye pain or vision change requires immediate assessment.", [
    "Cleaning chemical splashed into their eye and they say their vision is blurred.",
    "chemical in eye, intense burning and cannot see clearly",
])
add("H15", "high", ["HEAD"], "A reassuring update does not clear the unresolved serious head-injury report.", [
    "They are breathing normally now.",
    "awake again and talking, can you mark this low now",
], "Has a qualified clinician reassessed the earlier loss of consciousness?", context={
    "previous_report": "An adult fell down stairs, hit their head and became unresponsive.",
    "previous_priority": "high", "clinician_review_completed": False,
})

# MEDIUM: prompt assessment for stable problems, or clarification of vague illness.
add("M01", "medium", ["SPRAIN"], "An ankle injury limiting walking needs prompt assessment without stated emergency signs.", [
    "Twisted ankle, moderate swelling, cannot comfortably bear weight; toes feel normal and there is no deformity.",
    "rolled an ankle, walking hurts too much, foot warm and normal colour, no other injury",
])
add("M02", "medium", ["FRACTURE"], "A possible stable limb injury needs assessment despite preserved circulation and sensation.", [
    "Wrist pain and swelling after a minor trip; no head injury, deformity, numbness or colour change.",
    "sore swollen wrist after tripping, fingers warm and moving, no severe pain or other injury",
])
add("M03", "medium", ["WOUND"], "A gaping wound needs prompt professional assessment even after bleeding stops.", [
    "A cut on the forearm has stopped bleeding but its edges remain apart; they feel otherwise well.",
    "arm cut looks gaping, bleeding controlled, awake and not dizzy",
])
add("M04", "medium", ["HEAD"], "A recent minor head impact needs assessment and observation despite reported reassuring signs.", [
    "Bumped their head on a low beam; alert, no blackout, vomiting or severe headache, with mild local soreness.",
    "small head bump on a doorway, remembers everything, talking normally and no other symptoms",
])
add("M05", "medium", ["HEAT"], "Heat-related weakness without confusion or fainting needs prompt assessment.", [
    "Hot and weak after queueing in the sun; fully alert, drinking normally, no confusion or fainting.",
    "tired and sweaty from the heat, talking normally, can drink and has not passed out",
])
add("M06", "medium", ["VOMIT"], "Repeated vomiting warrants assessment despite current ability to drink and stay alert.", [
    "An adult vomited three times this morning; alert, sipping water, no blood, severe pain or headache.",
    "keeps being sick but can keep small drinks down, no severe tummy pain, blood or confusion",
])
add("M07", "medium", ["ABDOMEN"], "Recurring abdominal discomfort needs assessment with no stated emergency features.", [
    "Adult with recurring moderate stomach cramps; no severe pain, bleeding, pregnancy possibility, fever or faintness.",
    "moderate tummy cramps keep coming back, otherwise well, no blood or severe symptoms and not pregnant",
])
add("M08", "medium", ["NOSE"], "Frequent nosebleeds warrant review even when the current bleeding has stopped.", [
    "Their third small nosebleed today has stopped; adult feels well, no injury and no blood thinners.",
    "nose keeps bleeding briefly today, stopped again now, no dizziness, trauma or anticoagulants",
])
add("M09", "medium", ["BURN"], "A small blistering scald needs assessment without reported high-risk burn features.", [
    "A small tea scald on the adult's forearm has a blister; not deep, no hand, face or airway involvement.",
    "little hot-water burn with blister on forearm, moderate pain, normal skin colour around it, no other injury",
])
add("M10", "medium", ["EYE"], "Persistent irritation after dust exposure needs review despite unchanged vision.", [
    "Dust blew into an eye and irritation persists; vision is normal, no chemical or high-speed object involved.",
    "gritty eye after windblown dust, still uncomfortable, sees normally and no chemical exposure",
])
add("M11", "medium", ["FEVER"], "Persistent fever warrants clinical assessment without reported emergency features.", [
    "Adult has had fever for four days; alert, breathing normally, no stiff neck, severe headache, rash or immune suppression.",
    "fourth day of fever not improving, otherwise stable adult, no confusion, breathing trouble or high-risk medical history",
])
add("M12", "medium", [], "An unspecified current illness needs clarification rather than an unsupported low-priority label.", [
    "Someone here feels unwell, I don't know what is wrong.",
    "person needs medical help but i havent reached them yet, no details",
], "What symptoms are present, and are they alert and breathing normally?")
add("M13", "medium", ["DIZZY"], "Persistent isolated dizziness needs assessment despite the absence of reported emergency signs.", [
    "Adult still feels dizzy while seated; no chest pain, sweating, nausea, weakness, speech change, breathlessness or fainting.",
    "ongoing spinning feeling, alert and speaking normally, no chest symptoms, nausea, cold sweat or collapse",
])
add("M14", "medium", ["BITE"], "Worsening local swelling after a bite needs assessment without systemic or airway symptoms.", [
    "Yesterday's insect bite is more swollen and sore locally; no throat swelling, breathing trouble, dizziness, fever or vomiting.",
    "bite on the calf getting redder today, otherwise well, no allergy history or symptoms elsewhere",
])
add("M15", "medium", ["HEADACHE"], "A persistent headache affecting activity needs assessment without stated emergency features.", [
    "Gradual moderate headache keeps interrupting work; no sudden onset, injury, fever, vomiting, weakness or vision change.",
    "headache built up slowly and is not settling, adult alert with no other symptoms or high-risk medical history",
])

# LOW: explicitly minor/stable reports and clearly nonmedical language controls.
add("L01", "low", ["WOUND"], "A tiny superficial cut with stopped bleeding is a minor first-aid request.", [
    "Tiny paper cut, bleeding stopped, otherwise fine; asking for a plaster.",
    "small surface nick on finger, no more blood and feels well",
])
add("L02", "low", ["WOUND"], "A small clean superficial graze with normal function is a minor reported injury.", [
    "Small clean knee graze, no bleeding or pain walking, no head injury.",
    "scraped the skin on a knee, walking normally and no other injury",
])
add("L03", "low", ["BLISTER"], "An uncomplicated small friction blister is a routine first-aid problem.", [
    "One small intact heel blister from new shoes, no redness spreading or difficulty walking.",
    "shoe rubbed a little blister, otherwise well and walking normally",
])
add("L04", "low", ["NOSE"], "A single brief stopped nosebleed with reassuring context is a minor reported problem.", [
    "Adult had a small nosebleed after blowing their nose; stopped in two minutes, no injury, dizziness or blood thinners.",
    "tiny nosebleed stopped quickly, first one today, otherwise fine and not taking anticoagulants",
])
add("L05", "low", ["SUN"], "Mild limited sunburn without blistering or systemic symptoms is a minor reported problem.", [
    "Small patch of mildly red sunburn on an adult shoulder, no blisters, fever, dizziness or illness.",
    "a little pink skin from the sun, mild soreness only, feels completely well",
])
add("L06", "low", ["BITE"], "A small local itchy bite without allergy or systemic features is minor as reported.", [
    "Single itchy mosquito bite, tiny bump, no spreading swelling, allergy history or symptoms elsewhere.",
    "one small mozzie bite just itchy, breathing normal and otherwise fine",
])
add("L07", "low", ["SPRAIN"], "Mild ankle soreness with normal walking and no warning signs is low operational priority.", [
    "Ankle mildly sore after walking, no injury, swelling or numbness, walking normally.",
    "slight ankle ache, can walk as usual, no trauma or other symptoms",
])
add("L08", "low", ["SPRAIN"], "Mild improving muscle soreness after activity has reassuring reported features.", [
    "Both legs mildly achy after dancing, already improving; no swelling, injury, weakness or other symptoms.",
    "ordinary muscle soreness after activity, moving normally and feels better with rest",
])
add("L09", "low", ["HEADACHE"], "A mild familiar improving headache with explicit reassuring features is low operational priority.", [
    "Mild familiar headache improving after rest; no injury, fever, sudden onset, vomiting, vision change or weakness.",
    "usual small headache fading now, alert and otherwise well, no unusual symptoms",
])
add("L10", "low", ["HAYFEVER"], "Familiar mild nasal allergy symptoms without breathing or swelling problems are low priority.", [
    "Usual mild hay fever: sneezing and itchy eyes, no wheeze, breathlessness or swelling.",
    "normal seasonal sniffles, otherwise fine, breathing comfortably and no throat swelling",
])
add("L11", "low", ["VOMIT"], "Brief mild nausea that has fully resolved has no current warning features in this report.", [
    "Brief mild nausea after a car ride is completely gone; alert, drinking normally, no pain, vomiting or other symptoms.",
    "felt a little travel sick earlier, fully well now with no remaining symptoms",
])
add("L12", "low", [], "An explicitly healed historical injury does not describe a current emergency.", [
    "I fell months ago but fully recovered after treatment; no current symptoms, just asking where first aid is.",
    "old injury already healed, nobody is hurt now, only need directions to the medical tent",
])
add("L13", "low", [], "An explicitly fictional training scenario reports no currently injured person.", [
    "This is only a training script saying someone is unconscious; there is no real patient.",
    "quoting a practice scenario about not breathing, nobody here is actually unwell",
])
add("L14", "low", [], "Explicit figurative language with stated well-being is not a literal report of dying.", [
    "We're dying of laughter at the show; everyone is well and nobody needs medical help.",
    "dying of boredom is just an expression, no illness or injury here",
])
add("L15", "low", [], "A routine supplies request without an injured or unwell person is nonurgent.", [
    "Can we get spare plasters for the stall's kit? Nobody is injured.",
    "just checking where first aid is, no patient and no emergency",
])


def write_jsonl(path, records):
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in records), encoding="utf-8")


def main():
    prompt = (ROOT / "classifier_prompt.txt").read_text(encoding="utf-8").strip()
    assert len(rows) == 90
    assert len({row["id"] for row in rows}) == 90
    assert len({row["input"]["report"].strip().casefold() for row in rows}) == 90
    groups = {}
    for row in rows:
        groups.setdefault(row["scenario_group"], set()).add(row["split"])
        assert set(row["source_ids"]).issubset(SOURCES)
        out = row["expected"]
        assert out["priority"] in {"high", "medium", "low"}
        assert out["needs_clarification"] == bool(out["follow_up_question"])
        assert out["immediate_escalation"] == (out["priority"] == "high")
    assert len(groups) == 45 and all(len(splits) == 1 for splits in groups.values())
    write_jsonl(ROOT / "cases.jsonl", rows)
    with (ROOT / "cases.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=["id", "scenario_group", "split", "report", "context", "priority", "immediate_escalation", "needs_clarification", "follow_up_question", "reason", "source_ids", "review_status"])
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row[key] for key in ("id", "scenario_group", "split", "review_status")} | {
                "report": row["input"]["report"], "context": json.dumps(row["input"]["context"]),
                **row["expected"], "source_ids": ";".join(row["source_ids"]),
            })
    for split in ("train", "validation", "test"):
        selected = [row for row in rows if row["split"] == split]
        assert len(set(Counter(row["expected"]["priority"] for row in selected).values())) == 1
        write_jsonl(ROOT / f"{split}.jsonl", [{"messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps(row["input"], ensure_ascii=False)},
            {"role": "assistant", "content": json.dumps(row["expected"], ensure_ascii=False)},
        ]} for row in selected])
    write_jsonl(ROOT / "test_inputs.jsonl", [{"id": row["id"], "input": row["input"]} for row in rows if row["split"] == "test"])
    (ROOT / "sources.json").write_text(json.dumps(SOURCES, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "dataset": "pulse-medical-priority-synthetic-v1", "created": DATE,
        "examples": len(rows), "scenario_groups": len(groups),
        "class_counts": dict(Counter(row["expected"]["priority"] for row in rows)),
        "split_counts": dict(Counter(row["split"] for row in rows)),
        "clinically_validated": False, "contains_patient_records": False,
        "builder_modifies_app_runtime": False,
        "priority_score_bands_in_current_app": {"low": [0, 34], "medium": [35, 69], "high": [70, 100]},
        "notes": "Bands are existing app configuration, not clinical scoring thresholds. Critical maps to high for three-class evaluation.",
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()

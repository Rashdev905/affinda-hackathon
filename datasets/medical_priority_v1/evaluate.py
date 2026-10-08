"""Score local classifier predictions without calling any model or changing the app."""
import argparse
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LABELS = ("low", "medium", "high")


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8-sig").splitlines() if line.strip()]


def evaluate(predictions_path, split):
    cases = [row for row in read_jsonl(ROOT / "cases.jsonl") if row["split"] == split]
    expected = {row["id"]: row["expected"]["priority"] for row in cases}
    predictions = {}
    for row in read_jsonl(predictions_path):
        identifier, label = row["id"], row["priority"]
        if identifier not in expected or identifier in predictions or label not in LABELS:
            raise ValueError(f"Unknown/duplicate ID or invalid label: {identifier!r}, {label!r}")
        predictions[identifier] = label
    missing = sorted(set(expected) - set(predictions))
    if missing:
        raise ValueError(f"Missing predictions: {missing}; do not silently exclude failed cases.")
    confusion = {truth: {guess: 0 for guess in LABELS} for truth in LABELS}
    high_misses, high_to_low, overtriaged = [], [], []
    for identifier, truth in expected.items():
        guess = predictions[identifier]
        confusion[truth][guess] += 1
        if truth == "high" and guess != "high":
            high_misses.append(identifier)
        if truth == "high" and guess == "low":
            high_to_low.append(identifier)
        if LABELS.index(guess) > LABELS.index(truth):
            overtriaged.append(identifier)
    counts = Counter(expected.values())
    recall = {label: confusion[label][label] / counts[label] for label in LABELS}
    return {
        "split": split, "cases": len(cases), "confusion_rows_true_columns_predicted": confusion,
        "accuracy": sum(confusion[label][label] for label in LABELS) / len(cases),
        "recall_by_class": recall, "macro_recall": sum(recall.values()) / len(LABELS),
        "high_undertriage_ids": high_misses, "high_to_low_ids": high_to_low,
        "overtriage_ids": overtriaged,
        "caution": "Synthetic classification check only; not clinical validation or a deployment pass/fail threshold.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("predictions", type=Path, help='JSONL rows: {"id":"H14-1","priority":"high"}')
    parser.add_argument("--split", choices=("train", "validation", "test"), default="test")
    args = parser.parse_args()
    print(json.dumps(evaluate(args.predictions, args.split), indent=2))

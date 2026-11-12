"""Frozen catalogue-search example: three variants, two fields, two comparisons."""

import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from input_analyzer import load_profile


def make_id(value):
    return str(uuid5(NAMESPACE_URL, "catalogue-analysis-example/" + value))


def build_catalog_fixture():
    profile = load_profile("catalog-search").to_dict()
    dataset = {
        "schemaVersion": 1,
        "kind": "synthetic",
        "profile": profile,
        "provenance": {"source": "deterministic-catalogue-fixture", "not_participant_data": True},
        "sessions": [],
        "trials": [],
        "events": [],
    }
    durations = [
        {"classic": [1000, 1400], "compact": [800, 1000], "assisted": [600, 800]},
        {"classic": [2000, 2200], "compact": [1800, 2000], "assisted": [1900, 1700]},
    ]
    for index, times in enumerate(durations):
        session = {
            "id": make_id(f"session-{index}"),
            "study_id": profile["studyId"],
            "participant_code": f"CATALOGUE-TEST-{index + 1}",
            "dataset_kind": "preflight",
            "protocol_version": profile["protocolVersion"],
            "group_code": profile["groups"][index]["id"],
        }
        dataset["sessions"].append(session)
        schedule = [("classic", "practice", 0, 50)]
        variant_order = profile["groups"][index]["variantOrder"]
        for variant in variant_order:
            for repetition, duration in enumerate(times[variant], 1):
                schedule.append((variant, "evaluation", repetition, duration))

        for ordinal, (variant, phase, repetition, duration) in enumerate(schedule):
            label = f"{index}-{ordinal}"
            trial_id = make_id("trial-" + label)
            page_id = "catalogue-page-" + label
            trial = {
                "id": trial_id,
                "session_id": session["id"],
                "ordinal": ordinal,
                "variant": variant,
                "phase": phase,
                "repetition": repetition,
                "scenario_id": "catalogue-task",
                "scenario": {
                    "label": "Find a publication",
                    "values": {"query": "synthetic title", "category": "synthetic category"},
                },
                "page_id": page_id,
                "status": "completed",
                "final_sequence": 7,
            }
            dataset["trials"].append(trial)
            observations = [
                (0, "trial.started", None, {}),
                (10, "focusin", "query", {}),
                (20, "input", "query", {"inputType": "insertText", "valueLength": 15}),
                (30, "focusout", "query", {}),
                (40, "change", "category", {"selectedCount": 1}),
                (duration, "submit.attempted", None, {"attemptId": "submit-1"}),
                (
                    duration + 500,
                    "trial.completed",
                    None,
                    {"attemptId": "submit-1", "submitTs": duration},
                ),
            ]
            for sequence, (timestamp, event_type, field, payload) in enumerate(observations, 1):
                if "." in event_type:
                    source = "app"
                else:
                    source = "browser"

                event = {
                    "event_id": f"{page_id}:{sequence}",
                    "trial_id": trial_id,
                    "batch_id": make_id("batch-" + label),
                    "page_id": page_id,
                    "sequence": sequence,
                    "ts_ms": timestamp,
                    "source": source,
                    "type": event_type,
                    "form_id": "catalog-search",
                    "field_id": field,
                    "payload": payload,
                }
                dataset["events"].append(event)
    return dataset


if __name__ == "__main__":
    path = Path(__file__).with_name("catalog-dataset.json")
    path.write_text(json.dumps(build_catalog_fixture(), indent=2) + "\n")

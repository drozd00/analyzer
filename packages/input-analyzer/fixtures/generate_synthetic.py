"""Regenerate deterministic test observations. These are not participant data."""

import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from input_analyzer import load_profile

FIELD_IDS = (
    "fullName",
    "phone",
    "email",
    "street",
    "houseNumber",
    "zipCode",
    "city",
    "objectType",
    "issueCategory",
    "priority",
    "preferredDate",
    "timeWindow",
)


def make_id(label):
    return str(uuid5(NAMESPACE_URL, "input-analyzer/synthetic/" + label))


def build_fixture():
    profile = load_profile("service-request").to_dict()
    sessions = []
    trials = []
    events = []
    groups = ("AX_BY", "BX_AY")
    for index, group in enumerate(groups, start=1):
        session = {
            "id": make_id(f"session-{index}"),
            "study_id": profile["studyId"],
            "participant_code": f"SYNTHETIC-{index}",
            "dataset_kind": "preflight",
            "protocol_version": "pilot-v1",
            "group_code": group,
            "created_at": "2026-01-01T00:00:00Z",
        }
        sessions.append(session)

    def add_trial(
        label,
        session_index,
        ordinal,
        variant,
        duration,
        phase="measured",
        errors=False,
        status="completed",
    ):
        trial_id = make_id(label)
        page_id = "synthetic-" + label
        scenario_values = {}
        for field in FIELD_IDS:
            scenario_values[field] = "synthetic"

        if status != "ready":
            started_at = "2026-01-01T00:00:00Z"
        else:
            started_at = None

        if status in ("completed", "aborted"):
            ended_at = "2026-01-01T00:00:05Z"
        else:
            ended_at = None

        trial = {
            "id": trial_id,
            "session_id": sessions[session_index]["id"],
            "ordinal": ordinal,
            "variant": variant,
            "phase": phase,
            "repetition": 1,
            "scenario_id": "synthetic-only",
            "scenario": {
                "label": "Synthetic fixture, never a pilot observation",
                "values": scenario_values,
            },
            "page_id": page_id,
            "status": status,
            "started_at": started_at,
            "ended_at": ended_at,
            "final_sequence": None,
        }
        trial_events = []

        def emit(ts, event_type, payload=None, field=None):
            sequence = len(trial_events) + 1
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
                "ts_ms": ts,
                "wall_time": "2026-01-01T00:00:00Z",
                "source": source,
                "type": event_type,
                "form_id": "service-request",
                "field_id": field,
                "payload": payload or {},
                "received_at": "2026-01-01T00:00:06Z",
            }
            trial_events.append(event)

        if status != "ready":
            emit(0, "trial.started")
            emit(min(100, duration / 10), "focusin", field="fullName")
            if errors:
                emit(
                    150,
                    "validation.result",
                    {"trigger": "blur", "valid": False, "ruleIds": ["required"]},
                    "fullName",
                )
                emit(
                    160,
                    "validation.result",
                    {"trigger": "submit", "valid": False, "ruleIds": ["mismatch"]},
                    "fullName",
                )
                emit(200, "input", {"inputType": "insertText", "valueLength": 3}, "fullName")
                emit(
                    250,
                    "validation.result",
                    {"trigger": "blur", "valid": True, "ruleIds": []},
                    "fullName",
                )
                emit(
                    300,
                    "validation.result",
                    {"trigger": "enter", "valid": False, "ruleIds": ["mismatch"]},
                    "fullName",
                )
                emit(
                    350,
                    "input",
                    {"inputType": "deleteContentBackward", "valueLength": 2},
                    "fullName",
                )
                emit(
                    400,
                    "validation.result",
                    {"trigger": "submit", "valid": True, "ruleIds": []},
                    "fullName",
                )
            if status == "completed":
                emit(duration, "submit.attempted", {"attemptId": "attempt-1"})
                emit(
                    duration + 500,
                    "trial.completed",
                    {"attemptId": "attempt-1", "submitTs": duration},
                )
                trial["final_sequence"] = len(trial_events)
            elif status == "aborted":
                emit(duration, "trial.aborted", {"reason": "synthetic-test"})
        trials.append(trial)
        events.extend(trial_events)

    add_trial("p1-familiarization", 0, 0, "A", 50, phase="familiarization")
    add_trial("p1-a", 0, 1, "A", 1000, errors=True)
    add_trial("p1-b", 0, 2, "B", 800)
    add_trial("p2-b", 1, 0, "B", 1800)
    add_trial("p2-a", 1, 1, "A", 2000)
    add_trial("p2-aborted", 1, 2, "B", 400, status="aborted")
    add_trial("p2-ready", 1, 3, "A", 0, status="ready")
    return {
        "schemaVersion": 1,
        "kind": "synthetic",
        "profile": profile,
        "provenance": {"source": "deterministic-test-fixture", "not_participant_data": True},
        "sessions": sessions,
        "trials": trials,
        "events": events,
    }


def write_fixtures():
    root = Path(__file__).resolve().parent
    dataset = build_fixture()
    (root / "synthetic-dataset.json").write_text(
        json.dumps(dataset, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    write_fixtures()

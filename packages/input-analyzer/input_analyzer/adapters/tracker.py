"""Convert input-tracker exports to analysis datasets."""

from copy import deepcopy

from pydantic import ValidationError

from ..models import TrackerEvent
from ..profile import StudyProfile
from ..validation import validate_dataset


def import_tracker_export(
    export: dict,
    session: dict,
    trial: dict,
    profile: StudyProfile,
    kind: str = "preflight",
    field_map: dict[tuple[str, str], str] | None = None,
) -> dict:
    """Import one trial with supplied study metadata.

    session/trial use the documented SQL column names. Status, scenario, variant,
    phase and final_sequence are supplied by the caller.
    The caller assigns a SQL-compatible session UUID; the original tracker session
    identity is retained in provenance.
    """
    source_session_id = export.get("sessionId")
    if not isinstance(source_session_id, str) or not source_session_id:
        raise ValueError("Tracker export must identify its source session.")

    if trial.get("session_id") != session.get("id"):
        raise ValueError("Supplied trial and session identities differ.")

    if export.get("pageId") != trial.get("page_id"):
        raise ValueError("Tracker export page differs from supplied trial.")

    rows = []
    for event in export.get("events", []):
        # Validate with the SQL session UUID while retaining the source ID in provenance.
        normalized_event = {**event, "sessionId": session["id"]}
        try:
            TrackerEvent.model_validate(normalized_event)
        except ValidationError as error:
            detail = error.errors(include_url=False, include_input=False)[0]
            raise ValueError("Tracker event fails metadata contract: " + detail["msg"]) from error

        event_session_id = event.get("sessionId")
        event_page_id = event.get("pageId")
        if event_session_id != export["sessionId"] or event_page_id != export["pageId"]:
            raise ValueError("Tracker event identity differs from export envelope.")

        field_id = event.get("fieldId")
        if field_map and field_id is not None:
            # Local form field IDs must map to unambiguous study-wide logical IDs.
            field_key = (event.get("formId"), field_id)
            field_id = field_map.get(field_key, field_id)

        row = {
            "event_id": event["eventId"],
            "trial_id": trial["id"],
            "page_id": event["pageId"],
            "sequence": event["sequence"],
            "ts_ms": event["ts"],
            "wall_time": event.get("wallTime"),
            "source": event["source"],
            "type": event["type"],
            "form_id": event.get("formId"),
            "field_id": field_id,
            "payload": deepcopy(event["payload"]),
        }
        rows.append(row)

    provenance = {
        "source": "input-tracker-export",
        "source_session_id": export["sessionId"],
    }
    dataset = {
        "schemaVersion": 1,
        "kind": kind,
        "profile": profile.to_dict(),
        "provenance": provenance,
        "sessions": [deepcopy(session)],
        "trials": [deepcopy(trial)],
        "events": rows,
    }

    if field_map:
        field_mapping = []
        for (form_id, source), target in sorted(field_map.items()):
            mapping_row = {
                "formId": form_id,
                "sourceFieldId": source,
                "logicalFieldId": target,
            }
            field_mapping.append(mapping_row)
        dataset["provenance"]["field_mapping"] = field_mapping

    validation = validate_dataset(dataset, profile)
    if not validation["valid"]:
        errors = "; ".join(validation["errors"][:10])
        raise ValueError("Tracker import failed validation: " + errors)

    return dataset

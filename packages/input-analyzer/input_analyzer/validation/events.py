"""Event contract validation and dataset-scoped event identities."""

import math

from pydantic import ValidationError

from ..models import TrackerEvent
from ..profile import StudyProfile
from .report import ValidationReport

STORED_LOCATION_NAMES = {
    "eventId": "event_id",
    "pageId": "page_id",
    "ts": "ts_ms",
    "formId": "form_id",
    "fieldId": "field_id",
}


def convert_event(row: dict, session_id: str) -> dict:
    """Convert a stored row to the tracker's wire format for schema validation."""
    event = {
        "schemaVersion": 1,
        "eventId": row["event_id"],
        "sessionId": session_id,
        "pageId": row["page_id"],
        "sequence": row["sequence"],
        "ts": row["ts_ms"],
        "source": row["source"],
        "type": row["type"],
        "payload": row["payload"],
    }

    optional_fields = (("form_id", "formId"), ("field_id", "fieldId"))
    for sql_name, wire_name in optional_fields:
        value = row.get(sql_name)
        if value is not None:
            event[wire_name] = value

    return event


def validate_events(
    rows: list, trials: dict, profile: StudyProfile, report: ValidationReport
) -> None:
    """Append contract and scope issues without changing the input rows."""
    definition = profile.to_dict()

    event_ids = set()
    sequences = set()
    field_forms = {}
    for index, row in enumerate(rows):
        try:
            event_id = row["event_id"]
            trial = trials.get(row["trial_id"])
            if trial is None:
                report.add_error(
                    "event.missing_trial",
                    f"Event references missing trial: {event_id}",
                    "events",
                    index,
                    "trial_id",
                )
                continue

            identity = (row["trial_id"], row["sequence"])
            if event_id in event_ids or identity in sequences:
                report.add_error(
                    "event.duplicate_identity",
                    f"Duplicate event ID or sequence: {event_id}",
                    "events",
                    index,
                )

            event_ids.add(event_id)
            sequences.add(identity)

            field_id = row.get("field_id")
            if field_id is not None and field_id not in profile.field_ids:
                report.add_error(
                    "event.unknown_field",
                    f"Event field outside profile: {event_id}",
                    "events",
                    index,
                    "field_id",
                )

            if field_id is not None:
                form_id = row.get("form_id")

                # Metrics use study-wide field IDs, so reuse across forms is ambiguous.
                if field_id in field_forms and field_forms[field_id] != form_id:
                    report.add_error(
                        "event.ambiguous_field",
                        f"Ambiguous field {field_id}: observed in different forms; "
                        "supply explicit logical field mapping.",
                        "events",
                        index,
                        "field_id",
                    )
                field_forms[field_id] = form_id

            form_id = row.get("form_id")
            if form_id is not None and form_id not in definition["forms"]:
                report.add_error(
                    "event.unknown_form",
                    f"Event form outside profile: {event_id}",
                    "events",
                    index,
                    "form_id",
                )

            event = convert_event(row, trial["session_id"])
            try:
                TrackerEvent.model_validate(event)
            except ValidationError as failure:
                errors = failure.errors(include_url=False, include_input=False)
                for error in errors:
                    location = list(error["loc"])
                    if location and isinstance(location[0], str):
                        stored_name = STORED_LOCATION_NAMES.get(location[0], location[0])
                        location[0] = stored_name
                    report.add_error(
                        "event.contract",
                        f"Event {event_id}: {error['msg']}",
                        "events",
                        index,
                        *location,
                    )

            if not math.isfinite(row["ts_ms"]):
                report.add_error(
                    "event.nonfinite_timestamp",
                    f"Non-finite timestamp: {event_id}",
                    "events",
                    index,
                    "ts_ms",
                )
        except (KeyError, TypeError, ValueError, AttributeError):
            report.add_error("event.malformed", "Malformed event row.", "events", index)

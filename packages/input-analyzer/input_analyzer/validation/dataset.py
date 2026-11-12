"""Validate dataset shape, session identity and study-scoped trial metadata."""

from uuid import UUID

from ..profile import StudyProfile, resolve_profile
from .events import validate_events
from .report import ValidationReport


def validate_report(dataset: dict, profile: StudyProfile | dict | None = None) -> ValidationReport:
    """Collect structured issues, resolving configuration only once.

    Lifecycle and timing problems remain metric quality flags. Empty datasets
    retain the original warning-only behavior.
    """
    report = ValidationReport()
    if not isinstance(dataset, dict):
        report.add_error("dataset.not_object", "Dataset must be an object.")
        return report

    try:
        profile = resolve_profile(dataset, profile)
    except (ValueError, TypeError, KeyError) as error:
        report.add_error("dataset.profile", str(error), "profile")
        return report

    report.profile = profile
    definition = profile.to_dict()

    group_ids = set()
    for row in definition["groups"]:
        group_ids.add(row["id"])

    phase_ids = set()
    for row in definition["phases"]:
        phase_ids.add(row["id"])

    dataset_kind = dataset.get("kind")
    if dataset_kind not in ("pilot", "preflight", "synthetic"):
        report.add_error(
            "dataset.kind", "Dataset kind must be pilot, preflight, or synthetic.", "kind"
        )

    for key in ("sessions", "trials", "events"):
        if not isinstance(dataset.get(key), list):
            report.add_error("dataset.collection", f"{key} must be an array.", key)

    if not report.valid:
        return report

    sessions = {}
    codes = set()
    for index, row in enumerate(dataset["sessions"]):
        try:
            session_id = str(UUID(row["id"]))
            if session_id in sessions or row["participant_code"] in codes:
                report.add_error(
                    "session.duplicate_identity",
                    f"Duplicate session or participant: {session_id}",
                    "sessions",
                    index,
                )

            if row["group_code"] not in group_ids:
                report.add_error(
                    "session.unknown_group",
                    f"Unknown group: {session_id}",
                    "sessions",
                    index,
                    "group_code",
                )

            session_kind = row.get("dataset_kind")
            if session_kind != dataset["kind"] and dataset["kind"] != "synthetic":
                report.add_error(
                    "session.kind_mismatch",
                    f"Dataset kind differs from session: {session_id}",
                    "sessions",
                    index,
                    "dataset_kind",
                )

            if row["protocol_version"] != profile.protocol_version:
                report.add_error(
                    "session.protocol_mismatch",
                    f"Protocol differs from profile: {session_id}",
                    "sessions",
                    index,
                    "protocol_version",
                )

            if row.get("study_id") != profile.study_id:
                report.add_error(
                    "session.study_mismatch",
                    f"Study differs from profile: {session_id}",
                    "sessions",
                    index,
                    "study_id",
                )

            participant_code = row["participant_code"]
            if not isinstance(participant_code, str) or not participant_code:
                report.add_error(
                    "session.participant_code",
                    f"Invalid participant code: {session_id}",
                    "sessions",
                    index,
                    "participant_code",
                )

            sessions[session_id] = row
            codes.add(row["participant_code"])
        except (ValueError, KeyError, TypeError, AttributeError):
            report.add_error("session.malformed", "Malformed session row.", "sessions", index)

    trials = {}
    ordinals = set()
    for index, row in enumerate(dataset["trials"]):
        try:
            trial_id = str(UUID(row["id"]))
            identity = (row["session_id"], row["ordinal"])
            if trial_id in trials or identity in ordinals:
                report.add_error(
                    "trial.duplicate_identity",
                    f"Duplicate trial or ordinal: {trial_id}",
                    "trials",
                    index,
                )

            if row["session_id"] not in sessions:
                report.add_error(
                    "trial.missing_session",
                    f"Trial references missing session: {trial_id}",
                    "trials",
                    index,
                    "session_id",
                )

            if row["variant"] not in profile.variant_ids or row["phase"] not in phase_ids:
                report.add_error(
                    "trial.condition", f"Invalid trial condition: {trial_id}", "trials", index
                )

            if row["status"] not in ("ready", "running", "completed", "aborted", "interrupted"):
                report.add_error(
                    "trial.status", f"Invalid trial status: {trial_id}", "trials", index, "status"
                )

            invalid_ordinal = False
            for key in ("ordinal", "repetition"):
                value = row[key]
                if type(value) is not int or value < 0:
                    invalid_ordinal = True
                    break
            if invalid_ordinal:
                report.add_error(
                    "trial.ordinal",
                    f"Invalid trial ordinal/repetition: {trial_id}",
                    "trials",
                    index,
                )

            if not isinstance(row["scenario"], dict):
                report.add_error(
                    "trial.scenario",
                    f"Scenario must be an object: {trial_id}",
                    "trials",
                    index,
                    "scenario",
                )
            elif definition["scenarioFieldsRequired"]:
                values = row["scenario"]["values"]
                invalid_values = False
                if not isinstance(values, dict):
                    invalid_values = True
                elif set(values) != set(profile.field_ids):
                    invalid_values = True
                else:
                    for value in values.values():
                        if not isinstance(value, str):
                            invalid_values = True
                            break

                if invalid_values:
                    report.add_error(
                        "trial.scenario_fields",
                        f"Scenario must contain exactly the profile's string fields: {trial_id}",
                        "trials",
                        index,
                        "scenario",
                        "values",
                    )

            trials[trial_id] = row
            ordinals.add(identity)
        except (ValueError, KeyError, TypeError, AttributeError):
            report.add_error("trial.malformed", "Malformed trial row.", "trials", index)

    validate_events(dataset["events"], trials, profile, report)

    if not sessions:
        report.add_warning("dataset.no_sessions", "Dataset contains no sessions.", "sessions")

    if not dataset["events"]:
        report.add_warning("dataset.no_events", "Dataset contains no events.", "events")

    return report


def validate_dataset(dataset: dict, profile: StudyProfile | dict | None = None) -> dict:
    """Return the original public JSON shape of valid, errors and warnings."""
    report = validate_report(dataset, profile)
    return report.to_dict()

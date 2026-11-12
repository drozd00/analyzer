"""Per-trial interaction metrics and lifecycle quality flags."""

from ..dataset import EventRow, TrialRow
from ..profile import StudyProfile

FATAL_FLAGS = {
    "missing_start",
    "multiple_starts",
    "multiple_completions",
    "sequence_gap",
    "nonmonotonic_timestamp",
    "multiple_pages",
    "completion_before_start",
    "status_completion_mismatch",
    "final_sequence_mismatch",
    "missing_submit_attempt",
    "events_after_completion",
    "submit_after_completion",
    "start_not_first",
    "submit_timestamp_mismatch",
}


def create_field_metrics(trial_id: str, field_id: str) -> dict:
    """Initialize counters even for fields with no recorded interaction."""
    metrics = {
        "trial_id": trial_id,
        "field_id": field_id,
        "focus_time_ms": 0.0,
        "focus_count": 0,
        "input_count": 0,
        "delete_count": 0,
        "error_count": 0,
        "correction_count": 0,
    }
    return metrics


def calculate_trial(
    trial: TrialRow, events: list[EventRow], profile: StudyProfile
) -> tuple[dict, list[dict]]:
    """Calculate trial and field metrics from structurally validated events.

    Lifecycle problems become quality flags and exclude a trial from comparisons.
    Incomplete trials still retain their observed interaction counts and focus time.
    """
    ordered_events = sorted(events, key=lambda event: event["sequence"])

    fields = {}
    for field_id in profile.field_ids:
        field = create_field_metrics(trial["id"], field_id)
        fields[field_id] = field

    flags = []
    starts = []
    completions = []
    for event in ordered_events:
        event_type = event["type"]
        if event_type == "trial.started":
            starts.append(event)
        elif event_type == "trial.completed":
            completions.append(event)

    if not starts:
        if not ordered_events and trial["status"] != "completed":
            flags.append("not_started")
        else:
            flags.append("missing_start")

    if len(starts) > 1:
        flags.append("multiple_starts")

    if starts and starts[0]["sequence"] != 1:
        flags.append("start_not_first")

    if len(completions) > 1:
        flags.append("multiple_completions")

    sequences_are_contiguous = True
    for expected_sequence, event in enumerate(ordered_events, start=1):
        if event["sequence"] != expected_sequence:
            sequences_are_contiguous = False
            break
    if not sequences_are_contiguous:
        flags.append("sequence_gap")

    timestamps_are_monotonic = True
    for index in range(1, len(ordered_events)):
        current_timestamp = ordered_events[index]["ts_ms"]
        previous_timestamp = ordered_events[index - 1]["ts_ms"]
        if current_timestamp < previous_timestamp:
            timestamps_are_monotonic = False
            break
    if not timestamps_are_monotonic:
        flags.append("nonmonotonic_timestamp")

    page_ids = set()
    for event in ordered_events:
        page_ids.add(event["page_id"])
    if len(page_ids) > 1:
        flags.append("multiple_pages")

    completed = len(completions) == 1 and len(starts) == 1
    has_completion_event = len(completions) > 0
    status_is_completed = trial["status"] == "completed"
    if has_completion_event != status_is_completed:
        flags.append("status_completion_mismatch")

    if starts:
        start_ts = starts[0]["ts_ms"]
    else:
        start_ts = None

    if ordered_events:
        end_ts = ordered_events[-1]["ts_ms"]
    else:
        end_ts = 0.0

    completion_time = None
    if completed:
        assert start_ts is not None
        completion = completions[0]

        # Stop timing at the successful submit, excluding acknowledgment delay.
        end_ts = completion["payload"]["submitTs"]
        if end_ts < start_ts:
            flags.append("completion_before_start")
        else:
            completion_time = end_ts - start_ts

        final_sequence = trial.get("final_sequence")
        if final_sequence != completion["sequence"]:
            flags.append("final_sequence_mismatch")

        last_sequence = ordered_events[-1]["sequence"]
        if last_sequence != completion["sequence"]:
            flags.append("events_after_completion")

        if end_ts > completion["ts_ms"]:
            flags.append("submit_after_completion")

        attempt_id = completion["payload"]["attemptId"]
        matching_attempts = []
        for event in ordered_events:
            if event["type"] != "submit.attempted":
                continue
            if event["payload"]["attemptId"] != attempt_id:
                continue
            matching_attempts.append(event)

        if len(matching_attempts) != 1:
            flags.append("missing_submit_attempt")
        elif matching_attempts[0]["ts_ms"] != end_ts:
            flags.append("submit_timestamp_mismatch")
    else:
        flags.append("incomplete")

    invalid = {}
    edited = {}
    for field_id in profile.field_ids:
        invalid[field_id] = False
        edited[field_id] = False

    active_field = None
    active_since = None
    suspended_field = None
    attempts = set()
    rejections = set()
    keyboard_count = 0
    pointer_count = 0

    def close_focus(timestamp: float) -> None:
        """Accumulate the active interval, capped at the trial's observation end."""
        nonlocal active_field, active_since
        if active_field is not None and active_since is not None:
            interval_end = min(timestamp, end_ts)
            duration = max(0.0, interval_end - active_since)
            fields[active_field]["focus_time_ms"] += duration

        active_field = None
        active_since = None

    for event in ordered_events:
        event_type = event["type"]
        payload = event["payload"]
        field_id = event.get("field_id")
        timestamp = event["ts_ms"]

        if event_type == "submit.attempted":
            attempts.add(payload["attemptId"])
        elif event_type == "submit.rejected":
            rejections.add(payload["attemptId"])
        elif event_type == "keydown" and not payload.get("repeat", False):
            command_id = payload.get("commandId")
            if command_id in (
                "tab-navigation",
                "enter-navigation",
                "arrow-navigation",
            ):
                keyboard_count += 1
        elif event_type == "pointerdown" and payload.get("pointerType") == "mouse":
            pointer_count += 1

        if event_type == "focusin":
            close_focus(timestamp)
            suspended_field = None
            if field_id in fields and timestamp <= end_ts:
                active_field = field_id
                active_since = max(timestamp, start_ts or timestamp)
                fields[field_id]["focus_count"] += 1
        elif event_type == "focusout" and field_id == active_field:
            close_focus(timestamp)
        elif event_type == "focusout" and field_id == suspended_field:
            suspended_field = None
        elif event_type in ("pagehide", "trial.aborted"):
            close_focus(timestamp)
            suspended_field = None
        elif event_type == "visibilitychange" and payload.get("visibilityState") == "hidden":
            # Keep the focused field so visibility can resume the same interval
            # without counting hidden time or another focus entry.
            suspended_field = active_field
            close_focus(timestamp)
        elif event_type == "visibilitychange" and payload.get("visibilityState") == "visible":
            if suspended_field is not None and timestamp <= end_ts:
                active_field = suspended_field
                active_since = timestamp
                suspended_field = None

        if field_id is None or field_id not in fields:
            continue

        field = fields[field_id]
        if event_type in ("input", "change"):
            field["input_count"] += 1
            if invalid[field_id]:
                edited[field_id] = True

            if event_type == "input" and payload.get("inputType", "").startswith("delete"):
                field["delete_count"] += 1
        elif event_type == "validation.result":
            if not payload["valid"]:
                # Repeated invalid results belong to the same error episode.
                if not invalid[field_id]:
                    field["error_count"] += 1
                    edited[field_id] = False
                invalid[field_id] = True
            else:
                # Becoming valid counts as a correction only after an observed edit.
                if invalid[field_id] and edited[field_id]:
                    field["correction_count"] += 1
                invalid[field_id] = False
                edited[field_id] = False

    close_focus(end_ts)

    eligible = completed
    if eligible and trial["phase"] not in profile.included_phases:
        eligible = False
    if eligible and FATAL_FLAGS.intersection(flags):
        eligible = False

    metrics = {
        "trial_id": trial["id"],
        "session_id": trial["session_id"],
        "variant": trial["variant"],
        "phase": trial["phase"],
        "repetition": trial["repetition"],
        "ordinal": trial["ordinal"],
        "status": trial["status"],
        "completed": completed,
        "eligible": eligible,
        "completion_time_ms": completion_time,
        "submit_attempt_count": len(attempts),
        "rejected_submit_count": len(rejections),
        "keyboard_navigation_count": keyboard_count,
        "pointer_count": pointer_count,
        "quality_flags": flags,
    }

    for key in ("focus_time_ms", "input_count", "delete_count", "error_count", "correction_count"):
        total = 0
        for field in fields.values():
            total += field[key]
        metrics[key] = total

    return metrics, list(fields.values())

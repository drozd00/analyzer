"""Local validation rejects private metadata and malformed study definitions."""

import pytest
from pydantic import ValidationError

from input_analyzer import StudyProfile, load_profile
from input_analyzer.errors import ConfigurationError
from input_analyzer.models import TrackerEvent


@pytest.fixture
def event():
    return {
        "schemaVersion": 1,
        "eventId": "event-1",
        "sessionId": "12345678-1234-1234-1234-123456789abc",
        "pageId": "page-1",
        "sequence": 1,
        "ts": 12.5,
        "source": "browser",
        "type": "input",
        "payload": {"valueLength": 3},
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("schemaVersion", True),
        ("schemaVersion", 2),
        ("sequence", True),
        ("sequence", "1"),
        ("sequence", 1.5),
        ("sequence", 0),
        ("sequence", 2_147_483_648),
        ("ts", True),
        ("ts", -1),
        ("ts", float("nan")),
        ("ts", float("inf")),
        ("ts", 1_000_000_000_001),
        ("fieldId", None),
        ("eventId", ""),
        ("eventId", "🙂" * 161),
        ("sessionId", "not-a-uuid"),
        ("type", "unsupported"),
        ("source", "unknown"),
        ("secret", "unrecognized envelope field"),
    ],
)
def test_event_fields_are_strict(event, field, value):
    event[field] = value
    with pytest.raises(ValidationError):
        TrackerEvent.model_validate(event)


@pytest.mark.parametrize(
    "payload",
    [
        {"value": "private text"},
        {"valueLength": True},
        {"valueLength": "3"},
        {"valueLength": None},
        {"valueLength": -1},
        {"valueLength": 1.5},
        {"checked": 1},
        {"clientX": float("nan")},
        {"keyCategory": "content-like", "key": "a"},
        {"keyCategory": "content-like", "code": "KeyA"},
        {"keyCategory": "content-like", "shortcut": "a"},
    ],
)
def test_browser_payload_rejects_private_and_invalid_metadata(event, payload):
    event["payload"] = payload
    with pytest.raises(ValidationError):
        TrackerEvent.model_validate(event)


def test_event_preserves_integral_numbers_and_unicode_identifiers(event):
    event["eventId"] = "🙂" * 160
    event["sequence"] = 1.0
    event["payload"] = {"valueLength": 3.0, "keyCategory": "content-like"}
    validated = TrackerEvent.model_validate(event)
    assert validated.eventId == event["eventId"]
    assert validated.sequence == 1


@pytest.mark.parametrize(
    ("event_type", "payload"),
    [
        ("trial.started", {"secret": "private text"}),
        ("submit.attempted", {}),
        ("submit.rejected", {"attemptId": ""}),
        ("trial.completed", {"attemptId": "submit-1", "submitTs": -1}),
        ("trial.aborted", {"reason": ""}),
        ("validation.result", {"trigger": "blur", "valid": 1, "ruleIds": []}),
        (
            "validation.result",
            {"trigger": "blur", "valid": False, "ruleIds": ["required", "required"]},
        ),
        (
            "validation.result",
            {"trigger": "blur", "valid": False, "ruleIds": [str(i) for i in range(17)]},
        ),
    ],
)
def test_app_payloads_are_validated_by_event_type(event, event_type, payload):
    event.update(source="app", type=event_type, fieldId="query", payload=payload)
    with pytest.raises(ValidationError):
        TrackerEvent.model_validate(event)


def test_validation_results_require_field_identity(event):
    event.update(
        source="app",
        type="validation.result",
        payload={"trigger": "submit", "valid": True, "ruleIds": []},
    )
    with pytest.raises(ValidationError, match="identify a field"):
        TrackerEvent.model_validate(event)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("schemaVersion", True),
        ("studyId", ""),
        ("forms", ["form", "form"]),
        ("fields", [{"id": "field", "label": "Field", "unknown": True}]),
        ("phases", [{"id": "measured", "includeInAnalysis": "true"}]),
        ("groups", [{"id": "group", "variantOrder": ["classic", "classic"]}]),
        ("scenarioFieldsRequired", 1),
        ("unknown", True),
    ],
)
def test_profiles_reject_invalid_shapes(field, value):
    profile = load_profile("catalog-search").to_dict()
    profile[field] = value
    with pytest.raises(ConfigurationError, match="Invalid study profile"):
        StudyProfile.from_dict(profile)

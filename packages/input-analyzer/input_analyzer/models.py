"""Analyzer-owned Pydantic validation for imported events and study profiles."""

from typing import Annotated, Any, Literal, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)


def validate_integer(value: Any) -> Any:
    """Accept JSON integer numbers, including integral floats, without coercing text."""
    if isinstance(value, float) and value.is_integer():
        integral_value = int(value)
        return integral_value
    return value


Integer = Annotated[int, BeforeValidator(validate_integer)]
Identifier = Annotated[str, Field(min_length=1, max_length=160)]
NonemptyText = Annotated[str, Field(min_length=1)]
UuidText = Annotated[
    str,
    Field(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"),
]
Timestamp = Annotated[float, Field(ge=0, le=1_000_000_000_000)]
NonnegativeInteger = Annotated[Integer, Field(ge=0)]
Text40 = Annotated[str, Field(max_length=40)]
Text64 = Annotated[str, Field(max_length=64)]
Text80 = Annotated[str, Field(max_length=80)]


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)


class EventModel(StrictModel):
    @field_validator("*", mode="before")
    @classmethod
    def validate_present_value(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("Event metadata cannot be null.")
        return value


class BrowserPayload(EventModel):
    # Unset metadata is allowed; explicit null values are not valid metadata.
    valueLength: NonnegativeInteger | None = None
    lengthDelta: Integer | None = None
    checked: bool | None = None
    selectedCount: NonnegativeInteger | None = None
    elementTag: Text64 | None = None
    controlType: Text64 | None = None
    fieldKind: Text64 | None = None
    fieldPath: Annotated[str, Field(max_length=160)] | None = None
    relatedFieldId: Identifier | None = None
    relatedFormId: Identifier | None = None
    selectionStart: NonnegativeInteger | None = None
    selectionEnd: NonnegativeInteger | None = None
    inputType: Text80 | None = None
    isComposing: bool | None = None
    ctrlKey: bool | None = None
    metaKey: bool | None = None
    shiftKey: bool | None = None
    altKey: bool | None = None
    repeat: bool | None = None
    commandLike: bool | None = None
    keyCategory: Literal["command", "non-printable", "content-like"] | None = None
    key: Text40 | None = None
    code: Text40 | None = None
    shortcut: Text80 | None = None
    commandId: Text80 | None = None
    pointerType: Literal["", "mouse", "touch", "pen"] | None = None
    button: Integer | None = None
    clientX: float | None = None
    clientY: float | None = None
    defaultPrevented: bool | None = None
    visibilityState: Literal["visible", "hidden"] | None = None
    persisted: bool | None = None

    @model_validator(mode="after")
    def validate_keyboard_privacy(self) -> Self:
        if self.keyCategory != "content-like":
            return self

        private_fields = {"key", "code", "shortcut"}
        present_fields = private_fields & self.model_fields_set
        if present_fields:
            raise ValueError("Content-like keyboard events cannot contain key, code or shortcut.")
        return self


class EmptyPayload(StrictModel):
    pass


class ValidationPayload(StrictModel):
    trigger: Literal["blur", "enter", "submit"]
    valid: bool
    ruleIds: Annotated[list[Identifier], Field(max_length=16)]

    @field_validator("ruleIds")
    @classmethod
    def validate_rule_ids(cls, values: list[str]) -> list[str]:
        unique_values = set(values)
        if len(values) != len(unique_values):
            raise ValueError("Rule identifiers must be unique.")
        return values


class SubmitPayload(StrictModel):
    attemptId: Identifier


class CompletedPayload(SubmitPayload):
    submitTs: Timestamp


class AbortedPayload(StrictModel):
    reason: Annotated[str, Field(min_length=1, max_length=80)]


BROWSER_EVENT_TYPES = {
    "focusin",
    "focusout",
    "keydown",
    "keyup",
    "beforeinput",
    "input",
    "change",
    "compositionstart",
    "compositionend",
    "pointerdown",
    "pointerup",
    "click",
    "pointermove.sampled",
    "submit",
    "reset",
    "visibilitychange",
    "pagehide",
}
APP_PAYLOAD_MODELS = {
    "trial.started": EmptyPayload,
    "validation.result": ValidationPayload,
    "submit.attempted": SubmitPayload,
    "submit.rejected": SubmitPayload,
    "trial.completed": CompletedPayload,
    "trial.aborted": AbortedPayload,
}


class TrackerEvent(EventModel):
    schemaVersion: Annotated[Integer, Field(ge=1, le=1)]
    eventId: Identifier
    sessionId: UuidText
    pageId: Identifier
    sequence: Annotated[Integer, Field(ge=1, le=2_147_483_647)]
    ts: Timestamp
    wallTime: (
        Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")] | None
    ) = None
    formId: Identifier | None = None
    fieldId: Identifier | None = None
    source: Literal["browser", "app"]
    type: Identifier
    payload: dict[str, Any]

    @field_validator("type")
    @classmethod
    def validate_event_type(cls, value: str, info: ValidationInfo) -> str:
        source = info.data.get("source")
        if source == "browser" and value not in BROWSER_EVENT_TYPES:
            raise ValueError("Unsupported browser event type.")
        if source == "app" and value not in APP_PAYLOAD_MODELS:
            raise ValueError("Unsupported app event type.")
        return value

    @field_validator("payload")
    @classmethod
    def validate_payload(cls, value: dict, info: ValidationInfo) -> dict:
        if info.data.get("source") == "browser":
            BrowserPayload.model_validate(value)
        elif info.data.get("source") == "app":
            model = APP_PAYLOAD_MODELS.get(info.data.get("type"))
            if model is not None:
                model.model_validate(value)
        return value

    @model_validator(mode="after")
    def validate_validation_field(self) -> Self:
        if self.type == "validation.result" and "fieldId" not in self.model_fields_set:
            raise ValueError("Validation results must identify a field.")
        return self


class NamedDefinition(StrictModel):
    id: Identifier
    label: NonemptyText


class PhaseDefinition(StrictModel):
    id: Identifier
    includeInAnalysis: bool


class GroupDefinition(StrictModel):
    id: Identifier
    variantOrder: Annotated[list[Identifier], Field(min_length=1)]

    @field_validator("variantOrder")
    @classmethod
    def validate_variant_order(cls, values: list[str]) -> list[str]:
        unique_values = set(values)
        if len(values) != len(unique_values):
            raise ValueError("Variant order must contain unique identifiers.")
        return values


class ComparisonDefinition(StrictModel):
    id: Identifier
    baseline: Identifier
    candidate: Identifier


class ProfileDefinition(StrictModel):
    schemaVersion: Annotated[Integer, Field(ge=1, le=1)]
    studyId: Identifier
    protocolVersion: Identifier
    title: NonemptyText
    fields: Annotated[list[NamedDefinition], Field(min_length=1)]
    forms: Annotated[list[Identifier], Field(min_length=1)]
    variants: Annotated[list[NamedDefinition], Field(min_length=1)]
    phases: Annotated[list[PhaseDefinition], Field(min_length=1)]
    groups: Annotated[list[GroupDefinition], Field(min_length=1)]
    comparisons: list[ComparisonDefinition]
    scenarioFieldsRequired: bool
    reportAdapter: str | None
    procedure: dict[str, Any]

    @field_validator("forms")
    @classmethod
    def validate_form_ids(cls, values: list[str]) -> list[str]:
        unique_values = set(values)
        if len(values) != len(unique_values):
            raise ValueError("Form identifiers must be unique.")
        return values

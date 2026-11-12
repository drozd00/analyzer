"""Typed rows after structural validation; JSON input remains untrusted."""

from typing import Any, NotRequired, TypedDict


class SessionRow(TypedDict):
    id: str
    participant_code: str
    group_code: str
    study_id: str
    protocol_version: str
    dataset_kind: NotRequired[str]


class TrialRow(TypedDict):
    id: str
    session_id: str
    variant: str
    phase: str
    status: str
    ordinal: int
    repetition: int
    scenario: dict[str, Any]
    scenario_id: NotRequired[str]
    final_sequence: NotRequired[int | None]
    page_id: NotRequired[str | None]


class EventRow(TypedDict):
    event_id: str
    trial_id: str
    page_id: str
    sequence: int
    ts_ms: float
    source: str
    type: str
    payload: dict[str, Any]
    form_id: NotRequired[str | None]
    field_id: NotRequired[str | None]


class Dataset(TypedDict):
    schemaVersion: int
    kind: str
    sessions: list[SessionRow]
    trials: list[TrialRow]
    events: list[EventRow]
    profile: NotRequired[dict[str, Any]]
    provenance: NotRequired[dict[str, Any]]


class AnalysisResult(TypedDict):
    profile: dict[str, Any]
    trial_metrics: list[dict[str, Any]]
    field_metrics: list[dict[str, Any]]
    participant_metrics: list[dict[str, Any]]
    paired_metrics: list[dict[str, Any]]
    summary: dict[str, Any]
    manifest: NotRequired[dict[str, Any]]
    validation: NotRequired[dict[str, Any]]

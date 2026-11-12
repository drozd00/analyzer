import json
from copy import deepcopy
from pathlib import Path

import pytest

from input_analyzer import AnalysisConfig, analyze_file, load_profile, verify_result_directory
from input_analyzer.adapters.service_request import export_service_request_report
from input_analyzer.metrics import analyze_dataset, calculate_trial
from input_analyzer.reporting import render_report
from input_analyzer.validation import validate_dataset

PACKAGE = Path(__file__).resolve().parents[1]


@pytest.fixture
def dataset():
    return json.loads((PACKAGE / "fixtures" / "synthetic-dataset.json").read_text())


def test_episode_count_timing_and_familiarization(dataset):
    assert validate_dataset(dataset)["valid"]
    result = analyze_dataset(dataset)

    completed_a = None
    for row in result["trial_metrics"]:
        if row["error_count"]:
            completed_a = row
            break

    assert completed_a is not None
    assert completed_a["error_count"] == 2
    assert completed_a["correction_count"] == 2
    assert completed_a["delete_count"] == 1
    assert completed_a["completion_time_ms"] == 1000  # Completion event itself is at 1500.
    assert completed_a["focus_time_ms"] == 900
    assert result["summary"]["eligible_trials"] == 4
    assert result["summary"]["comparisons"]["B-A"]["overall"]["participants"] == 2
    assert result["summary"]["comparisons"]["B-A"]["overall"]["difference_ms"] == -200
    assert result["summary"]["comparisons"]["B-A"]["overall"]["percentage_difference"] == -15
    assert result["summary"]["comparisons"]["B-A"]["overall"]["difference_ci95_ms"] == [-200, -200]
    assert result["summary"]["comparisons"]["B-A"]["by_order"]["A/B"]["participants"] == 1
    assert result["summary"]["comparisons"]["B-A"]["by_order"]["B/A"]["participants"] == 1
    assert result["summary"]["quality_pass"]


def test_incomplete_trials_are_retained(dataset):
    result = analyze_dataset(dataset)
    incomplete = []
    for row in result["trial_metrics"]:
        if row["status"] in ("aborted", "ready"):
            incomplete.append(row)

    assert len(incomplete) == 2
    assert all(row["completion_time_ms"] is None and not row["eligible"] for row in incomplete)
    assert len(result["field_metrics"]) == 12 * len(dataset["trials"])


@pytest.mark.parametrize("status", ["aborted", "interrupted", "running"])
def test_unobserved_incomplete_trials_are_not_corruption(dataset, status):
    trial = None
    for row in dataset["trials"]:
        if row["status"] == "ready":
            trial = row
            break

    assert trial is not None
    trial["status"] = status
    result = analyze_dataset(dataset)

    metrics = None
    for row in result["trial_metrics"]:
        if row["trial_id"] == trial["id"]:
            metrics = row
            break

    assert metrics is not None
    assert not metrics["completed"]
    assert metrics["completion_time_ms"] is None
    assert metrics["quality_flags"] == ["not_started", "incomplete"]
    assert result["summary"]["quality_pass"]


def test_no_correction_without_an_edit(dataset):
    trial = None
    for row in dataset["trials"]:
        if row["phase"] != "measured":
            continue
        if row["variant"] != "A":
            continue
        trial = row
        break

    assert trial is not None
    events = []
    for row in dataset["events"]:
        if row["trial_id"] == trial["id"]:
            events.append(deepcopy(row))

    for event in events:
        if event["type"] == "input":
            event["type"] = "beforeinput"

    result, _ = calculate_trial(trial, events, load_profile("service-request"))
    assert result["error_count"] == 2
    assert result["correction_count"] == 0


def test_invalid_duplicates_fail_validation(dataset):
    dataset["events"].append(deepcopy(dataset["events"][0]))
    result = validate_dataset(dataset)
    assert not result["valid"]
    assert any("Duplicate event" in error for error in result["errors"])


def test_gap_excludes_trial_and_prevents_quality_pass(dataset):
    removed = dataset["events"].pop(1)
    result = analyze_dataset(dataset)

    trial = None
    for row in result["trial_metrics"]:
        if row["trial_id"] == removed["trial_id"]:
            trial = row
            break

    assert trial is not None
    assert "sequence_gap" in trial["quality_flags"]
    assert not trial["eligible"]
    assert not result["summary"]["quality_pass"]


def test_focus_pauses_while_page_hidden(dataset):
    trial = deepcopy(dataset["trials"][1])
    events = []
    for row in dataset["events"]:
        if row["trial_id"] == trial["id"]:
            events.append(deepcopy(row))

    original = events[1]
    hidden = {
        **original,
        "type": "visibilitychange",
        "ts_ms": 450,
        "field_id": None,
        "payload": {"visibilityState": "hidden"},
    }
    visible = {
        **original,
        "type": "visibilitychange",
        "ts_ms": 650,
        "field_id": None,
        "payload": {"visibilityState": "visible"},
    }
    events.extend([hidden, visible])
    events.sort(key=lambda row: row["ts_ms"])

    for sequence, event in enumerate(events, start=1):
        event["sequence"] = sequence

    trial["final_sequence"] = len(events)
    result, _ = calculate_trial(trial, events, load_profile("service-request"))
    assert result["focus_time_ms"] == 700


def test_multiple_pages_are_not_eligible(dataset):
    trial = dataset["trials"][1]
    events = []
    for row in dataset["events"]:
        if row["trial_id"] == trial["id"]:
            events.append(deepcopy(row))

    events[1]["page_id"] = "another-page"
    result, _ = calculate_trial(trial, events, load_profile("service-request"))
    assert not result["eligible"]
    assert "multiple_pages" in result["quality_flags"]


def test_submit_timestamp_must_match_attempt(dataset):
    trial = dataset["trials"][1]
    completion = None
    for row in dataset["events"]:
        if row["trial_id"] != trial["id"]:
            continue
        if row["type"] != "trial.completed":
            continue
        completion = row
        break

    assert completion is not None
    completion["payload"]["submitTs"] -= 100
    result = analyze_dataset(dataset)

    metrics = None
    for row in result["trial_metrics"]:
        if row["trial_id"] == trial["id"]:
            metrics = row
            break

    assert metrics is not None
    assert "submit_timestamp_mismatch" in metrics["quality_flags"]
    assert not metrics["eligible"]
    assert not result["summary"]["quality_pass"]


def test_trial_start_must_be_first_event(dataset):
    trial = dataset["trials"][1]
    events = []
    for row in dataset["events"]:
        if row["trial_id"] == trial["id"]:
            events.append(row)

    start = None
    next_event = None
    for row in events:
        if row["type"] == "trial.started":
            start = row
        if row["sequence"] == 2:
            next_event = row

    assert start is not None
    assert next_event is not None
    next_event["sequence"] = 1
    next_event["ts_ms"] = start["ts_ms"]
    start["sequence"] = 2

    result = analyze_dataset(dataset)
    metrics = None
    for row in result["trial_metrics"]:
        if row["trial_id"] == trial["id"]:
            metrics = row
            break

    assert metrics is not None
    assert "start_not_first" in metrics["quality_flags"]
    assert not metrics["eligible"]
    assert not result["summary"]["quality_pass"]


def test_reproducible_results_and_tampering_detection(tmp_path, dataset):
    source = tmp_path / "dataset.json"
    source.write_text(json.dumps(dataset))
    first = analyze_file(
        source, tmp_path / "first", config=AnalysisConfig(2026, 10000), code_revision="test-sha"
    )
    second = analyze_file(
        source, tmp_path / "second", config=AnalysisConfig(2026, 10000), code_revision="test-sha"
    )
    assert first == second
    verify_result_directory(tmp_path / "first")
    first["trial_metrics"][0]["completion_time_ms"] = 999
    (tmp_path / "first" / "analysis.json").write_text(json.dumps(first))
    with pytest.raises(ValueError, match="Saved metrics differ"):
        verify_result_directory(tmp_path / "first")


@pytest.mark.parametrize("kind", ["synthetic", "preflight"])
def test_nonpilot_report_cannot_publish(tmp_path, dataset, kind):
    result = analyze_dataset(dataset)
    result["manifest"] = {"dataset_kind": kind, "dataset_hash": "synthetic"}
    with pytest.raises(ValueError, match="Publication requires"):
        export_service_request_report(result, tmp_path / "publication")
    assert not (tmp_path / "publication").exists()


def test_report_creates_vector_figures_and_tables(tmp_path, dataset):
    result = analyze_dataset(dataset)
    result["manifest"] = {"dataset_kind": "synthetic", "dataset_hash": "synthetic"}
    render_report(result, tmp_path)
    assert (tmp_path / "figures" / "repetition-times.pdf").read_bytes().startswith(b"%PDF")
    assert "<svg" in (tmp_path / "figures" / "paired-differences.svg").read_text()
    assert "Comparison" in (tmp_path / "tables" / "comparisons.tex").read_text()
    assert not (tmp_path / "tables" / "pilot-ready.tex").exists()

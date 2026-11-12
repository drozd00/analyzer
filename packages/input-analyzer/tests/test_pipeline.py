"""Regression coverage for validation boundaries and unchanged metric outputs."""

import json
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

import pytest

from input_analyzer import AnalysisConfig, analyze, analyze_dataset
from input_analyzer.errors import DatasetValidationError, InputAnalyzerError
from input_analyzer.storage import hash_dataset
from input_analyzer.validation import dataset as dataset_validation
from input_analyzer.validation import validate_dataset, validate_report

PACKAGE = Path(__file__).resolve().parents[1]


def find_issue(report, code):
    for issue in report.issues:
        if issue.code == code:
            return issue
    raise StopIteration(f"No validation issue with code {code!r}.")


@pytest.fixture
def dataset():
    return json.loads((PACKAGE / "fixtures" / "catalog-dataset.json").read_text())


@pytest.mark.parametrize("entrypoint", [analyze, analyze_dataset])
def test_analysis_resolves_and_validates_once(dataset, entrypoint):
    with (
        patch.object(
            dataset_validation, "resolve_profile", wraps=dataset_validation.resolve_profile
        ) as resolve,
        patch.object(
            dataset_validation,
            "validate_events",
            wraps=dataset_validation.validate_events,
        ) as validate_events,
    ):
        result = entrypoint(dataset, config=AnalysisConfig(2026, 100))

    assert result["summary"]["eligible_trials"] == 12
    assert resolve.call_count == 1
    assert validate_events.call_count == 1


def test_structured_issues_preserve_the_public_json_shape(dataset):
    dataset["events"].append(deepcopy(dataset["events"][0]))
    report = validate_report(dataset)
    issue = find_issue(report, "event.duplicate_identity")

    assert issue.severity == "error"
    assert issue.location == ("events", len(dataset["events"]) - 1)
    assert report.to_dict() == validate_dataset(dataset)
    assert set(report.to_dict()) == {"valid", "errors", "warnings"}
    with pytest.raises(DatasetValidationError, match="Duplicate event") as failure:
        analyze(dataset)
    assert isinstance(failure.value, InputAnalyzerError)
    assert isinstance(failure.value, ValueError)


def test_empty_dataset_warnings_do_not_prevent_analysis(dataset):
    dataset.update(sessions=[], trials=[], events=[])
    report = validate_report(dataset)

    assert report.valid
    issue_codes = set()
    for issue in report.issues:
        issue_codes.add(issue.code)
    assert issue_codes == {"dataset.no_sessions", "dataset.no_events"}
    for issue in report.issues:
        assert issue.severity == "warning"

    result = analyze(dataset, config=AnalysisConfig(2026, 100))
    assert result["validation"] == report.to_dict()
    assert result["summary"]["sessions"] == 0


def test_event_contract_locations_use_stored_row_names(dataset):
    dataset["events"][0]["page_id"] = None
    report = validate_report(dataset)
    issue = find_issue(report, "event.contract")
    assert issue.location == ("events", 0, "page_id")


@pytest.mark.parametrize("collection", ["sessions", "trials", "events"])
def test_malformed_rows_become_validation_errors(dataset, collection):
    dataset[collection].append(None)
    report = validate_report(dataset)
    assert not report.valid

    expected_location = (collection, len(dataset[collection]) - 1)
    location_found = False
    for issue in report.issues:
        if issue.location == expected_location:
            location_found = True
            break
    assert location_found

    with pytest.raises(DatasetValidationError):
        analyze(dataset)


@pytest.mark.parametrize(
    ("fixture", "expected_hash"),
    [
        (
            "synthetic-dataset.json",
            "ec88a4d210867b4c6f56be7bdbaf51721bbd053dba60022ee1043327ef29115e",
        ),
        (
            "catalog-dataset.json",
            "5fe8de3a5859cf34c9600fe3dff07334349247726bfafaa3fc38a018fbe34cc6",
        ),
    ],
)
def test_metrics_match_reference_outputs(fixture, expected_hash):
    # Digests were calculated with the previous analyzer and these fixtures and settings.
    dataset = json.loads((PACKAGE / "fixtures" / fixture).read_text())
    result = analyze_dataset(dataset, config=AnalysisConfig(2026, 1000))
    assert hash_dataset(result) == expected_hash

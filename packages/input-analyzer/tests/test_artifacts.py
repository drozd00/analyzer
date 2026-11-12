"""Malformed saved results fail through the public provenance error boundary."""

import json
from pathlib import Path

import pytest

from input_analyzer import (
    AnalysisConfig,
    ProvenanceError,
    analyze,
    save_analysis,
    verify_result_directory,
)
from input_analyzer.cli import main

PACKAGE = Path(__file__).resolve().parents[1]


@pytest.fixture
def saved_analysis(tmp_path):
    dataset = json.loads((PACKAGE / "fixtures" / "catalog-dataset.json").read_text())
    result = analyze(dataset, config=AnalysisConfig(2026, 100))
    save_analysis(dataset, result, tmp_path)
    return tmp_path, result


@pytest.mark.parametrize(
    ("field", "value"),
    [("manifest", None), ("manifest", {"schemaVersion": 1}), ("profile", None), ("profile", [])],
)
def test_malformed_saved_objects_raise_provenance_error(saved_analysis, field, value):
    directory, result = saved_analysis
    result[field] = value
    (directory / "analysis.json").write_text(json.dumps(result))

    with pytest.raises(ProvenanceError, match="Malformed saved analysis"):
        verify_result_directory(directory)


@pytest.mark.parametrize("config", [None, {}, {"seed": "invalid", "bootstrap_samples": 100}])
def test_malformed_saved_configuration_raises_provenance_error(saved_analysis, config):
    directory, result = saved_analysis
    result["manifest"]["config"] = config
    (directory / "analysis.json").write_text(json.dumps(result))

    with pytest.raises(ProvenanceError, match="Malformed saved analysis"):
        verify_result_directory(directory)


@pytest.mark.parametrize("name", ["dataset.json", "analysis.json"])
def test_malformed_saved_json_raises_provenance_error(saved_analysis, name):
    directory, _ = saved_analysis
    (directory / name).write_text("{broken")

    with pytest.raises(ProvenanceError, match="Malformed saved analysis"):
        verify_result_directory(directory)


def test_cli_rejects_malformed_saved_results_without_traceback(saved_analysis, caplog):
    directory, _ = saved_analysis
    (directory / "analysis.json").write_text('{"manifest": null}')

    assert main(["report", "--input", str(directory)]) == 2
    assert "Malformed saved analysis" in caplog.text


def test_missing_artifact_remains_a_runtime_failure(saved_analysis):
    directory, _ = saved_analysis
    (directory / "analysis.json").unlink()

    with pytest.raises(FileNotFoundError):
        verify_result_directory(directory)
    assert main(["report", "--input", str(directory)]) == 1

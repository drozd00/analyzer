"""Regression checks for self-contained resources and analysis fingerprints."""

import json
import shutil
from pathlib import Path

import pytest

from input_analyzer import AnalysisConfig, analyze, load_profile, save_analysis
from input_analyzer.artifacts import CSV_COLUMNS
from input_analyzer.errors import DatasetValidationError
from input_analyzer.provenance import hash_analysis_sources

PACKAGE = Path(__file__).resolve().parents[1]
SOURCE = PACKAGE / "input_analyzer"


def test_profiles_load_without_a_repository_working_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    profile = load_profile("catalog-search")
    expected = SOURCE / "profiles" / "catalog-search.json"
    assert profile.to_dict() == json.loads(expected.read_text(encoding="utf-8"))


def test_provenance_excludes_presentation_but_tracks_calculation(tmp_path):
    copied = tmp_path / "input_analyzer"
    shutil.copytree(SOURCE, copied, ignore=shutil.ignore_patterns("__pycache__"))
    original = hash_analysis_sources(copied)
    for name in ("cli.py", "reporting/latex.py", "adapters/service_request.py"):
        path = copied / name
        path.write_text(
            path.read_text(encoding="utf-8") + "\n# presentation change\n", encoding="utf-8"
        )
    assert hash_analysis_sources(copied) == original
    metrics = copied / "metrics" / "trial.py"
    metrics.write_text(
        metrics.read_text(encoding="utf-8") + "\n# metric change\n", encoding="utf-8"
    )
    assert hash_analysis_sources(copied) != original


def test_empty_analysis_csv_has_explicit_headers(tmp_path):
    profile = load_profile("catalog-search").to_dict()
    dataset = {
        "schemaVersion": 1,
        "kind": "synthetic",
        "profile": profile,
        "sessions": [],
        "trials": [],
        "events": [],
    }
    result = analyze(dataset, config=AnalysisConfig(bootstrap_samples=10))
    save_analysis(dataset, result, tmp_path)
    for name, columns in CSV_COLUMNS.items():
        table_path = tmp_path / f"{name}.csv"
        header = table_path.read_text(encoding="utf-8").splitlines()[0]
        expected_header = ",".join(columns)
        assert header == expected_header


@pytest.mark.parametrize("value", [float("nan"), float("inf"), object()])
def test_in_memory_metadata_errors_are_categorized(value):
    dataset = json.loads(
        (PACKAGE / "fixtures" / "catalog-dataset.json").read_text(encoding="utf-8")
    )
    dataset["provenance"] = {"invalid": value}
    with pytest.raises(DatasetValidationError, match="finite JSON"):
        analyze(dataset, config=AnalysisConfig(bootstrap_samples=10))

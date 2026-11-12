"""Publication compatibility and explicit report boundaries."""

import builtins
import csv
import hashlib
import json
from pathlib import Path

import pytest

from input_analyzer import AnalysisConfig, analyze, analyze_dataset, load_profile, save_analysis
from input_analyzer.adapters.service_request import ServiceRequestReportAdapter
from input_analyzer.cli import main
from input_analyzer.errors import ConfigurationError, InputAnalyzerError
from input_analyzer.reporting import (
    render_adapted_report,
    render_report,
    select_report_adapter,
    write_csv,
)
from input_analyzer.reporting.figures import load_plotting

PACKAGE = Path(__file__).resolve().parents[1]

# Recorded from the pre-refactor renderers. Chart bytes are compared within a
# runtime below because matplotlib and font-library versions affect their bytes.
GENERIC_TABLE_HASHES = {
    "comparisons.tex": "f33f5659c84db68cebdcc42f7ff771f3ad46f209dd14dffed4f8977ef55a2b9a",
    "study-summary.tex": "36cabaa665485e2a5fa1f3ef03039c358430b038f773aceffc478b765cebd2fc",
}
PUBLICATION_TABLE_HASHES = {
    "order-groups.tex": "faacd25ef5938a4ca975cb337e1809bb78c2bea28aaecf4cdc94ae86d2b68aa1",
    "paired-times.tex": "06be74ebe86927ccf338122b8fc87f0e82b10184fcaee71e78a13d293d453311",
    "pilot-summary.tex": "f9375ef26cc370286d3eca7bc52fcb7faa6a8adc95cedd1bc7031b70e7270ea2",
    "sample-flow.tex": "cc2f5342b387a50fcab8d852984a452bf769269a71f77065ed55fe23d06c3f6b",
    "secondary-metrics.tex": "2437fab061f661069b45aba0a34ed9490d6bcdee0d914038bd269af5b0508bfa",
}


@pytest.mark.parametrize("specialized", [False, True])
def test_report_outputs_preserve_tables_and_repeatable_charts(tmp_path, specialized):
    fixture = "synthetic-dataset.json" if specialized else "catalog-dataset.json"
    dataset = json.loads((PACKAGE / "fixtures" / fixture).read_text())
    result = analyze_dataset(dataset, config=AnalysisConfig(2026, 100))
    result["manifest"] = {"dataset_kind": "pilot", "dataset_hash": "report-regression"}
    render = render_adapted_report if specialized else render_report
    first = tmp_path / "first"
    second = tmp_path / "second"
    render(result, first)
    render(result, second)
    expected = PUBLICATION_TABLE_HASHES if specialized else GENERIC_TABLE_HASHES
    for name, digest in expected.items():
        contents = (first / "tables" / name).read_bytes()
        assert hashlib.sha256(contents).hexdigest() == digest
    for path in first.rglob("*"):
        if path.is_file():
            relative_path = path.relative_to(first)
            second_path = second / relative_path
            assert path.read_bytes() == second_path.read_bytes()


@pytest.mark.parametrize("key", ["studyId", "protocolVersion", "reportAdapter"])
def test_publication_adapter_requires_matching_profile_identity(key):
    profile = load_profile("service-request").to_dict()
    assert isinstance(select_report_adapter(profile), ServiceRequestReportAdapter)
    profile[key] = "another-study-policy"
    with pytest.raises(ConfigurationError, match="No report adapter"):
        select_report_adapter(profile)


def test_generic_profile_has_no_implicit_publication_adapter():
    with pytest.raises(ConfigurationError, match="No report adapter"):
        select_report_adapter(load_profile("catalog-search").to_dict())


def test_cli_adapter_override_preserves_frozen_analysis(tmp_path):
    dataset = json.loads((PACKAGE / "fixtures" / "synthetic-dataset.json").read_text())
    dataset["kind"] = "pilot"
    dataset["profile"]["reportAdapter"] = "previous-renderer"
    for session in dataset["sessions"]:
        session["dataset_kind"] = "pilot"
    results = tmp_path / "results"
    publication = tmp_path / "publication"
    result = analyze(dataset, config=AnalysisConfig(2026, 100))
    save_analysis(dataset, result, results)

    command = ["report", "--input", str(results), "--publication-out", str(publication)]
    assert main(command) == 2
    assert not publication.exists()
    assert main([*command, "--report-adapter", "service-request"]) == 0
    assert (publication / "tables" / "pilot-ready.tex").exists()
    assert json.loads((results / "dataset.json").read_text()) == dataset
    assert json.loads((results / "analysis.json").read_text()) == result


def test_adapter_override_still_requires_compatible_study(tmp_path):
    result = {"profile": load_profile("catalog-search").to_dict()}
    with pytest.raises(ConfigurationError, match="No report adapter"):
        render_adapted_report(result, tmp_path, adapter_name="service-request")


def test_csv_retains_declared_columns_for_sparse_and_empty_results(tmp_path):
    path = tmp_path / "metrics.csv"
    columns = ["trial_id", "flags", "duration"]
    write_csv(
        path, [{"trial_id": "first"}, {"trial_id": "second", "flags": ["incomplete"]}], columns
    )
    with path.open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        assert reader.fieldnames == columns
        rows = list(reader)
    assert rows[0] == {"trial_id": "first", "flags": "", "duration": ""}
    assert json.loads(rows[1]["flags"]) == ["incomplete"]
    write_csv(path, [], columns)
    assert path.read_text() == "trial_id,flags,duration\n"
    with pytest.raises(ValueError, match="fields not in fieldnames"):
        write_csv(path, [{"unlisted": "must not disappear"}], columns)


def test_missing_plotting_extra_reports_install_instruction(monkeypatch):
    import_module = builtins.__import__

    def import_without_plotting(name, *args, **kwargs):
        if name == "matplotlib" or name.startswith("matplotlib."):
            raise ModuleNotFoundError(name)
        return import_module(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_plotting)
    with pytest.raises(InputAnalyzerError, match=r"install input-analyzer\[report\]"):
        load_plotting()

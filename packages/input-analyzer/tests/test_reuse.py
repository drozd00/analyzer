"""Profile configuration, tracker import and reporting tests."""

import json
from copy import deepcopy
from pathlib import Path

import pytest

from input_analyzer import (
    AnalysisConfig,
    StudyProfile,
    analyze,
    import_tracker_export,
    load_profile,
    render_report,
    save_analysis,
    validate_dataset,
    verify_result_directory,
)

PACKAGE = Path(__file__).resolve().parents[1]


@pytest.fixture
def catalog():
    return json.loads((PACKAGE / "fixtures/catalog-dataset.json").read_text())


def test_catalogue_public_api_has_three_variants_and_two_comparisons(tmp_path, catalog):
    profile = StudyProfile.from_dict(catalog["profile"])
    result = analyze(catalog, profile, AnalysisConfig(seed=2026, bootstrap_samples=10000))

    assert profile.field_ids == ("query", "category")
    variants = set()
    for row in result["participant_metrics"]:
        variants.add(row["variant"])
    assert variants == {
        "classic",
        "compact",
        "assisted",
    }
    assert result["summary"]["phase_counts"] == {"practice": 2, "evaluation": 12}
    assert result["summary"]["eligible_trials"] == 12
    assert len(result["field_metrics"]) == 28
    comparisons = result["summary"]["comparisons"]
    assert comparisons["compact-classic"]["overall"]["difference_ms"] == -250
    assert comparisons["compact-classic"]["overall"]["difference_ci95_ms"] == [-300, -200]
    assert comparisons["assisted-classic"]["overall"]["difference_ms"] == -400
    assert comparisons["assisted-classic"]["overall"]["difference_ci95_ms"] == [-500, -300]

    for row in result["paired_metrics"]:
        assert row["baseline_trials"] == 2
        assert row["candidate_trials"] == 2

    save_analysis(catalog, result, tmp_path)
    _, verified = verify_result_directory(tmp_path)
    assert verified == result
    render_report(result, tmp_path)
    assert (tmp_path / "figures/repetition-times.pdf").exists()
    assert "assisted-classic" in (tmp_path / "tables/comparisons.tex").read_text()
    assert not (tmp_path / "tables/pilot-ready.tex").exists()


def test_configuration_is_required_and_not_inferred(catalog):
    del catalog["profile"]
    assert not validate_dataset(catalog)["valid"]
    with pytest.raises(ValueError, match="explicit study profile"):
        analyze(catalog)
    assert validate_dataset(catalog, load_profile("catalog-search"))["valid"]
    assert not validate_dataset(catalog, load_profile("service-request"))["valid"]


def test_scope_and_protocol_are_validated(catalog):
    catalog["events"][1]["field_id"] = "fullName"
    assert not validate_dataset(catalog)["valid"]
    catalog["events"][1]["field_id"] = "query"
    catalog["sessions"][0]["protocol_version"] = "another-protocol"
    assert not validate_dataset(catalog)["valid"]


def test_profile_reference_errors_and_defensive_copy(catalog):
    value = deepcopy(catalog["profile"])
    profile = StudyProfile.from_dict(value)
    value["fields"][0]["id"] = "changed-outside"
    assert profile.field_ids[0] == "query"
    copy = profile.to_dict()
    copy["fields"][0]["id"] = "changed-returned-copy"
    assert profile.field_ids[0] == "query"
    value = deepcopy(catalog["profile"])
    value["comparisons"][0]["candidate"] = "unknown"
    with pytest.raises(ValueError, match="unknown variant"):
        StudyProfile.from_dict(value)


def make_tracker_export(catalog):
    trial = catalog["trials"][1]
    session = None
    for row in catalog["sessions"]:
        if row["id"] == trial["session_id"]:
            session = row
            break
    assert session is not None

    export = {"sessionId": session["id"], "pageId": trial["page_id"], "forms": [], "events": []}
    for row in catalog["events"]:
        if row["trial_id"] != trial["id"]:
            continue

        event = {
            "schemaVersion": 1,
            "eventId": row["event_id"],
            "sessionId": session["id"],
            "pageId": row["page_id"],
            "sequence": row["sequence"],
            "ts": row["ts_ms"],
            "source": row["source"],
            "type": row["type"],
            "payload": row["payload"],
            "formId": row["form_id"],
        }
        if row["field_id"]:
            event["fieldId"] = row["field_id"]
        export["events"].append(event)
    return export, session, trial


def test_tracker_export_requires_metadata_and_preserves_metrics(catalog):
    export, session, trial = make_tracker_export(catalog)
    original = "standalone-browser-session"
    export["sessionId"] = original
    for event in export["events"]:
        event["sessionId"] = original
    result = import_tracker_export(
        export, session, trial, load_profile("catalog-search"), kind="synthetic"
    )
    assert result["provenance"]["source_session_id"] == original
    metrics = analyze(result)["trial_metrics"][0]
    assert metrics["completion_time_ms"] == 1000
    assert metrics["input_count"] == 2
    export["events"][1]["rawValue"] = "forbidden"
    with pytest.raises(ValueError, match="metadata contract"):
        import_tracker_export(export, session, trial, load_profile("catalog-search"))


def test_same_field_in_two_forms_requires_explicit_mapping(catalog):
    export, session, trial = make_tracker_export(catalog)
    definition = deepcopy(catalog["profile"])
    definition["forms"].append("second-search")
    export["events"][4]["formId"] = "second-search"
    export["events"][4]["fieldId"] = "query"
    profile = StudyProfile.from_dict(definition)
    with pytest.raises(ValueError, match="Ambiguous field"):
        import_tracker_export(export, session, trial, profile)
    mapped = import_tracker_export(
        export, session, trial, profile, field_map={("second-search", "query"): "category"}
    )
    assert mapped["events"][4]["field_id"] == "category"
    assert analyze(mapped)["trial_metrics"][0]["input_count"] == 2


def test_service_request_adapter_keeps_expected_publication_files(tmp_path):
    from input_analyzer.adapters.service_request import export_service_request_report

    dataset = json.loads((PACKAGE / "fixtures/synthetic-dataset.json").read_text())
    # Exercise the publication branch in pytest's temporary directory.
    dataset["kind"] = "pilot"
    for session in dataset["sessions"]:
        session["dataset_kind"] = "pilot"
    result = analyze(dataset)
    export_service_request_report(result, tmp_path)
    assert (tmp_path / "tables/pilot-ready.tex").read_text().endswith("\\pilotdatareadytrue\n")
    for name in (
        "pilot-summary",
        "sample-flow",
        "paired-times",
        "secondary-metrics",
        "order-groups",
    ):
        assert (tmp_path / f"tables/{name}.tex").exists()
    for name in ("repetition-times", "paired-differences"):
        assert (tmp_path / f"figures/{name}.pdf").read_bytes().startswith(b"%PDF")

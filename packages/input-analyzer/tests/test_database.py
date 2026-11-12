"""Optional integration against an already migrated disposable PostgreSQL database."""

import json
import os
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import pytest

from input_analyzer import analyze, extract_dataset, load_profile, register_study
from input_analyzer.storage import load_analysis

psycopg = pytest.importorskip("psycopg")
pytestmark = pytest.mark.integration


@pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL requires a migrated disposable database",
)
@pytest.mark.parametrize(
    "fixture,trials,fields", [("synthetic-dataset.json", 7, 84), ("catalog-dataset.json", 14, 28)]
)
def test_analysis_load_is_idempotent_and_transactional(monkeypatch, fixture, trials, fields):
    monkeypatch.setenv("DATABASE_URL", os.environ["TEST_DATABASE_URL"])
    path = Path(__file__).resolve().parents[1] / "fixtures" / fixture
    dataset = json.loads(path.read_text())
    result = analyze(dataset, code_revision="synthetic-integration-" + str(uuid4()))
    assert load_analysis(dataset, result)
    assert not load_analysis(dataset, result)
    run_id = result["manifest"]["run_id"]
    with psycopg.connect(os.environ["TEST_DATABASE_URL"]) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM analysis.fact_trial_metrics WHERE run_id=%s", (run_id,)
            )
            assert cursor.fetchone()[0] == trials
            cursor.execute(
                "SELECT count(*) FROM analysis.fact_field_metrics WHERE run_id=%s", (run_id,)
            )
            assert cursor.fetchone()[0] == fields
    broken = deepcopy(result)
    broken["manifest"]["run_id"] = str(uuid4())
    broken["field_metrics"][0]["field_id"] = "unknown-field-must-rollback"
    with pytest.raises(psycopg.IntegrityError):
        load_analysis(dataset, broken)
    with psycopg.connect(os.environ["TEST_DATABASE_URL"]) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM analysis.runs WHERE id=%s", (broken["manifest"]["run_id"],)
            )
            assert cursor.fetchone()[0] == 0


@pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL requires a migrated disposable database",
)
def test_generic_study_registration_raw_extraction_and_dimension_scope(monkeypatch):
    from psycopg.types.json import Jsonb

    from input_analyzer import StudyProfile, validate_dataset

    url = os.environ["TEST_DATABASE_URL"]
    monkeypatch.setenv("DATABASE_URL", url)
    profile = load_profile("catalog-search")
    register_study(profile)
    assert not register_study(profile)
    renderer_changed = profile.to_dict()
    renderer_changed["reportAdapter"] = "new-renderer"
    assert not register_study(StudyProfile.from_dict(renderer_changed))
    changed = profile.to_dict()
    changed["title"] = "Changed title must not redefine an existing protocol"
    with pytest.raises(ValueError, match="different configuration"):
        register_study(StudyProfile.from_dict(changed))
    path = Path(__file__).resolve().parents[1] / "fixtures/catalog-dataset.json"
    dataset = json.loads(path.read_text())
    with psycopg.connect(url) as connection:
        with connection.cursor() as cursor:
            for row in dataset["sessions"]:
                cursor.execute(
                    "INSERT INTO raw.sessions("
                    "id,study_id,participant_code,dataset_kind,protocol_version,group_code) "
                    "VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                    (
                        row["id"],
                        row["study_id"],
                        row["participant_code"],
                        "preflight",
                        row["protocol_version"],
                        row["group_code"],
                    ),
                )
            for row in dataset["trials"]:
                cursor.execute(
                    "INSERT INTO raw.trials("
                    "id,session_id,ordinal,variant,phase,repetition,"
                    "scenario_id,scenario,page_id,status,final_sequence) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                    (
                        row["id"],
                        row["session_id"],
                        row["ordinal"],
                        row["variant"],
                        row["phase"],
                        row["repetition"],
                        row["scenario_id"],
                        Jsonb(row["scenario"]),
                        row["page_id"],
                        row["status"],
                        row["final_sequence"],
                    ),
                )
                events = []
                for event in dataset["events"]:
                    if event["trial_id"] == row["id"]:
                        events.append(event)
                cursor.execute(
                    "INSERT INTO raw.batches(id,trial_id,content_hash,event_count) "
                    "VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                    (events[0]["batch_id"], row["id"], "synthetic-fixture-only", len(events)),
                )
            for row in dataset["events"]:
                cursor.execute(
                    "INSERT INTO raw.events("
                    "event_id,trial_id,batch_id,page_id,sequence,ts_ms,"
                    "source,type,form_id,field_id,payload) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                    (
                        row["event_id"],
                        row["trial_id"],
                        row["batch_id"],
                        row["page_id"],
                        row["sequence"],
                        row["ts_ms"],
                        row["source"],
                        row["type"],
                        row["form_id"],
                        row["field_id"],
                        Jsonb(row["payload"]),
                    ),
                )
    frozen = extract_dataset("catalog-search", "search-v1", "preflight")
    assert validate_dataset(frozen)["valid"]
    assert frozen["profile"] == profile.to_dict()
    assert len(frozen["sessions"]) == 2
    assert len(frozen["events"]) == 98
    result = analyze(frozen, code_revision="catalogue-sql-" + str(uuid4()))
    assert result["summary"]["comparisons"]["compact-classic"]["overall"]["difference_ms"] == -250
    assert load_analysis(frozen, result)
    empty = extract_dataset("catalog-search", "search-v1", "pilot")
    assert empty["sessions"] == empty["trials"] == empty["events"] == []
    assert validate_dataset(empty)["valid"]
    # The same logical field identifier can have different labels in different runs/studies.
    alternate = deepcopy(dataset)
    alternate["profile"]["studyId"] = "other-catalogue"
    alternate["profile"]["fields"][0]["label"] = "Different meaning in a different study"
    for session in alternate["sessions"]:
        session["study_id"] = "other-catalogue"
    alternate_result = analyze(alternate)
    load_analysis(alternate, alternate_result)
    with psycopg.connect(url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT run_id,label FROM analysis.dim_fields "
                "WHERE id='query' AND run_id IN (%s,%s)",
                (result["manifest"]["run_id"], alternate_result["manifest"]["run_id"]),
            )
            rows = cursor.fetchall()
            assert len(rows) == 2
            labels = set()
            for row in rows:
                labels.add(row[1])
            assert len(labels) == 2

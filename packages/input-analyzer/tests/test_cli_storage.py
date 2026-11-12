"""CLI contracts, optional drivers and batched PostgreSQL writes."""

import builtins
import json
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path

import pytest

from input_analyzer import AnalysisConfig, analyze
from input_analyzer.cli import main
from input_analyzer.errors import DatabaseUnavailableError
from input_analyzer.storage import load_analysis, postgres, statements

PACKAGE = Path(__file__).resolve().parents[1]


def test_validate_preserves_json_and_returns_invalid_input_code(tmp_path, capsys):
    fixture = PACKAGE / "fixtures/catalog-dataset.json"
    assert main(["validate", "--input", str(fixture), "--json"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report == {"valid": True, "errors": [], "warnings": []}

    invalid = tmp_path / "invalid.json"
    invalid.write_text('{"schemaVersion": 99}', encoding="utf-8")
    assert main(["validate", "--input", str(invalid)]) == 2
    report = json.loads(capsys.readouterr().out)
    assert report["valid"] is False
    assert report["errors"]


def test_cli_distinguishes_bad_json_from_file_failure(tmp_path, caplog):
    invalid = tmp_path / "invalid.json"
    invalid.write_text("{invalid", encoding="utf-8")
    assert main(["validate", "--input", str(invalid)]) == 2
    assert "Invalid JSON" in caplog.text
    assert main(["validate", "--input", str(tmp_path / "absent.json")]) == 1


@pytest.mark.parametrize("constant", ["NaN", "Infinity", "-Infinity", "1e999"])
def test_cli_rejects_nonfinite_json_metadata(tmp_path, caplog, constant):
    fixture_text = (PACKAGE / "fixtures/catalog-dataset.json").read_text()
    invalid_text = '{"ignored_metadata": ' + constant + ", " + fixture_text[1:]
    invalid = tmp_path / "invalid.json"
    invalid.write_text(invalid_text, encoding="utf-8")
    assert main(["analyze", "--input", str(invalid), "--out", str(tmp_path / "results")]) == 2
    assert "Non-finite JSON number" in caplog.text
    assert not (tmp_path / "results").exists()


def test_cli_version_works_without_a_command(capsys):
    with pytest.raises(SystemExit) as result:
        main(["--version"])
    assert result.value.code == 0
    assert capsys.readouterr().out.startswith("input-analyzer ")


def test_core_cli_does_not_import_optional_dependencies():
    script = """
import importlib.abc
import sys

class RejectOptionalImports(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in ('psycopg', 'matplotlib'):
            raise ImportError('Optional dependency must not be imported: ' + fullname)
        return None

sys.meta_path.insert(0, RejectOptionalImports())
from input_analyzer.cli import main
raise SystemExit(main(['validate', '--input', sys.argv[1], '--json']))
"""
    result = subprocess.run(
        [sys.executable, "-c", script, str(PACKAGE / "fixtures/catalog-dataset.json")],
        cwd="/tmp",
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["valid"] is True


def test_missing_database_driver_explains_install_extra(monkeypatch):
    original_import = builtins.__import__

    def import_without_psycopg(name, *args, **kwargs):
        if name == "psycopg":
            raise ImportError("driver not installed")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_psycopg)
    with pytest.raises(DatabaseUnavailableError, match=r"input-analyzer\[db\]"):
        postgres.import_database_driver()


def test_database_load_batches_every_dimension_and_metric(monkeypatch):
    pytest.importorskip("psycopg")
    dataset = json.loads((PACKAGE / "fixtures/catalog-dataset.json").read_text())
    result = analyze(dataset, config=AnalysisConfig(bootstrap_samples=10))
    executions = []
    batches = {}

    class Cursor:
        def execute(self, statement, values):
            executions.append((statement, values))

        def fetchone(self):
            return None

        def executemany(self, statement, rows):
            batches[statement] = list(rows)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    class Connection:
        def cursor(self):
            return Cursor()

    @contextmanager
    def open_fake_database(database_url):
        yield Connection()

    monkeypatch.setattr(postgres, "open_database", open_fake_database)
    assert load_analysis(dataset, result)

    executed_statements = []
    for statement, _ in executions:
        executed_statements.append(statement)
    assert executed_statements == [
        statements.SELECT_RUN,
        statements.INSERT_RUN,
    ]
    assert len(batches[statements.INSERT_VARIANTS]) == len(dataset["profile"]["variants"])
    assert len(batches[statements.INSERT_FIELDS]) == len(dataset["profile"]["fields"])
    assert len(batches[statements.INSERT_PHASES]) == len(dataset["profile"]["phases"])
    assert len(batches[statements.INSERT_GROUPS]) == len(dataset["profile"]["groups"])
    assert len(batches[statements.INSERT_PARTICIPANTS]) == len(dataset["sessions"])
    assert len(batches[statements.INSERT_TRIALS]) == len(dataset["trials"])
    assert len(batches[statements.INSERT_TRIAL_METRICS]) == len(result["trial_metrics"])
    assert len(batches[statements.INSERT_FIELD_METRICS]) == len(result["field_metrics"])
    for row in batches[statements.INSERT_TRIAL_METRICS]:
        assert len(row) == 15
        assert row[0] == result["manifest"]["run_id"]


def test_connection_failure_has_domain_error(monkeypatch):
    driver = pytest.importorskip("psycopg")

    def fail_connect(*args, **kwargs):
        raise driver.OperationalError("connection refused")

    monkeypatch.setattr(driver, "connect", fail_connect)
    with pytest.raises(DatabaseUnavailableError, match="PostgreSQL is unavailable"):
        with postgres.open_database("postgresql://localhost/example"):
            raise AssertionError("A failed connection must not enter the transaction.")

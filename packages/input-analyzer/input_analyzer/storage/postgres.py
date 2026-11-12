"""Optional PostgreSQL registration, consistent extraction and atomic loading."""

import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator

from .. import __version__
from ..errors import (
    ConfigurationError,
    DatabaseUnavailableError,
    InputAnalyzerError,
    ProvenanceError,
)
from ..profile import StudyProfile
from . import statements
from .jsonio import encode_value, hash_dataset

TRIAL_METRIC_COLUMNS = (
    "completed",
    "eligible",
    "completion_time_ms",
    "error_count",
    "correction_count",
    "submit_attempt_count",
    "rejected_submit_count",
    "input_count",
    "delete_count",
    "keyboard_navigation_count",
    "pointer_count",
    "focus_time_ms",
)
FIELD_METRIC_COLUMNS = (
    "trial_id",
    "field_id",
    "focus_time_ms",
    "focus_count",
    "input_count",
    "delete_count",
    "error_count",
    "correction_count",
)


def import_database_driver():
    """Load the optional driver only when a database command is requested."""
    try:
        import psycopg
    except ImportError as error:
        raise DatabaseUnavailableError(
            "PostgreSQL support requires the optional driver; install 'input-analyzer[db]'."
        ) from error
    return psycopg


def get_database_url() -> str:
    """Read the database connection setting from the environment."""
    value = os.environ.get("DATABASE_URL")
    if not value:
        raise ConfigurationError(
            "DATABASE_URL is required for register/extract/load; "
            "never pass credentials as CLI arguments."
        )
    return value


@contextmanager
def open_database(database_url: str | None, **options: Any) -> Generator[Any, None, None]:
    """Open a transaction and translate connection failures to a domain error."""
    driver = import_database_driver()
    url = database_url or get_database_url()
    try:
        with driver.connect(url, **options) as connection:
            yield connection
    except driver.OperationalError as error:
        raise DatabaseUnavailableError(f"PostgreSQL is unavailable: {error}") from error


@contextmanager
def handle_database_command_errors() -> Generator[None, None, None]:
    """Translate driver errors at the CLI boundary, preserving library exceptions."""
    driver = import_database_driver()
    try:
        yield
    except driver.Error as error:
        raise InputAnalyzerError(f"Database command failed: {error}") from error


def get_collection_configuration(definition: dict) -> dict:
    """Use the collection configuration for registration identity."""
    configuration = {}
    for key, value in definition.items():
        if key == "reportAdapter":
            continue
        configuration[key] = value
    return configuration


def register_study(profile: StudyProfile, database_url: str | None = None) -> bool:
    """Register immutable collection configuration and preserve the first stored profile."""
    import_database_driver()
    from psycopg.types.json import Jsonb

    definition = profile.to_dict()
    with open_database(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                statements.REGISTER_STUDY,
                (
                    profile.study_id,
                    profile.protocol_version,
                    definition["title"],
                    Jsonb(definition),
                ),
            )
            inserted = cursor.fetchone() is not None
            cursor.execute(statements.SELECT_STUDY, (profile.study_id, profile.protocol_version))
            stored = cursor.fetchone()

            if stored is None:
                configuration_matches = False
            else:
                stored_configuration = get_collection_configuration(stored[0])
                requested_configuration = get_collection_configuration(definition)
                configuration_matches = stored_configuration == requested_configuration

            if not configuration_matches:
                raise ConfigurationError(
                    "Study ID/protocol already exists with a different configuration; "
                    "use a new version."
                )
    return inserted


def extract_dataset(
    study_id: str,
    protocol_version: str,
    kind: str = "preflight",
    code_revision: str = "unknown",
    database_url: str | None = None,
) -> dict:
    """Freeze one study's pilot or preflight data from a consistent SQL snapshot."""
    if kind not in ("pilot", "preflight"):
        raise ConfigurationError(
            "Only server-classified pilot/preflight sessions can be extracted."
        )

    import_database_driver()
    from psycopg.rows import dict_row

    with open_database(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(statements.BEGIN_SNAPSHOT)
            cursor.execute(statements.SELECT_STUDY, (study_id, protocol_version))
            study = cursor.fetchone()
            if study is None:
                raise ConfigurationError("Study/protocol is not registered.")

            profile = StudyProfile.from_dict(study["configuration"])
            if profile.study_id != study_id or profile.protocol_version != protocol_version:
                raise ConfigurationError("Stored profile identity differs from study row.")

            parameters = (study_id, protocol_version, kind)
            cursor.execute(statements.SELECT_SESSIONS, parameters)
            sessions = cursor.fetchall()
            cursor.execute(statements.SELECT_TRIALS, parameters)
            trials = cursor.fetchall()
            cursor.execute(statements.SELECT_EVENTS, parameters)
            events = cursor.fetchall()

    provenance = {
        "source": "postgresql",
        "code_revision": code_revision,
        "extracted_at": datetime.now(timezone.utc),
        "analyzer_version": __version__,
    }
    dataset = {
        "schemaVersion": 1,
        "kind": kind,
        "profile": profile.to_dict(),
        "provenance": provenance,
        "sessions": sessions,
        "trials": trials,
        "events": events,
    }

    serialized = json.dumps(dataset, default=encode_value)
    return json.loads(serialized)


def load_analysis(dataset: dict, result: dict, database_url: str | None = None) -> bool:
    """Insert a run atomically; batch dimensions/facts and preserve idempotence."""
    manifest = result["manifest"]
    if hash_dataset(dataset) != manifest["dataset_hash"]:
        raise ProvenanceError("Dataset hash does not match analysis provenance.")

    profile = StudyProfile.from_dict(result["profile"])
    definition = profile.to_dict()
    run_id = manifest["run_id"]

    import_database_driver()
    from psycopg.types.json import Jsonb

    with open_database(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(statements.SELECT_RUN, (run_id,))
            existing = cursor.fetchone()
            if existing:
                if existing[0] != manifest:
                    raise ProvenanceError(
                        "Analysis run ID already exists with different provenance."
                    )
                return False

            run_values = (
                run_id,
                manifest["dataset_hash"],
                manifest["analyzer_version"],
                manifest["metrics_version"],
                manifest["code_revision"],
                Jsonb(manifest["config"]),
                Jsonb(manifest),
                profile.study_id,
                profile.protocol_version,
                Jsonb(definition),
            )
            cursor.execute(statements.INSERT_RUN, run_values)

            # Scope every dimension to this run so studies can reuse logical IDs.
            variants = []
            for row in definition["variants"]:
                variants.append((run_id, row["id"], row["label"]))
            cursor.executemany(statements.INSERT_VARIANTS, variants)

            fields = []
            for row in definition["fields"]:
                fields.append((run_id, row["id"], row["label"]))
            cursor.executemany(statements.INSERT_FIELDS, fields)

            phases = []
            for row in definition["phases"]:
                phases.append((run_id, row["id"], row["includeInAnalysis"]))
            cursor.executemany(statements.INSERT_PHASES, phases)

            groups = []
            for row in definition["groups"]:
                groups.append((run_id, row["id"], Jsonb(row["variantOrder"])))
            cursor.executemany(statements.INSERT_GROUPS, groups)

            participants = []
            for row in dataset["sessions"]:
                dataset_kind = row.get("dataset_kind", dataset["kind"])
                participants.append(
                    (
                        run_id,
                        row["id"],
                        row["participant_code"],
                        dataset_kind,
                        row["protocol_version"],
                        row["group_code"],
                    )
                )
            cursor.executemany(statements.INSERT_PARTICIPANTS, participants)

            trials = []
            for row in dataset["trials"]:
                trials.append(
                    (
                        run_id,
                        row["id"],
                        row["session_id"],
                        row["variant"],
                        row["ordinal"],
                        row["phase"],
                        row["repetition"],
                        row["scenario_id"],
                        row["status"],
                    )
                )
            cursor.executemany(statements.INSERT_TRIALS, trials)

            trial_metrics = []
            for row in result["trial_metrics"]:
                values = [run_id, row["trial_id"]]
                for column in TRIAL_METRIC_COLUMNS:
                    values.append(row[column])
                values.append(Jsonb(row["quality_flags"]))
                trial_metrics.append(values)
            cursor.executemany(statements.INSERT_TRIAL_METRICS, trial_metrics)

            field_metrics = []
            for row in result["field_metrics"]:
                values = [run_id]
                for column in FIELD_METRIC_COLUMNS:
                    values.append(row[column])
                field_metrics.append(values)
            cursor.executemany(statements.INSERT_FIELD_METRICS, field_metrics)

    return True

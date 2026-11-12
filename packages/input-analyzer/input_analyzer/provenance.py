"""Stable analysis provenance, independent of CLI and report presentation."""

import hashlib
import json
import platform
from importlib.metadata import PackageNotFoundError, version
from importlib.resources import files
from importlib.resources.abc import Traversable
from uuid import NAMESPACE_URL, uuid5

from . import __version__
from .metrics import METRICS_VERSION
from .profile import AnalysisConfig, StudyProfile
from .storage.jsonio import hash_dataset

ANALYSIS_SOURCES = (
    "models.py",
    "dataset.py",
    "errors.py",
    "profile.py",
    "pipeline.py",
    "provenance.py",
    "metrics/__init__.py",
    "metrics/trial.py",
    "metrics/participants.py",
    "metrics/statistics.py",
    "validation/__init__.py",
    "validation/dataset.py",
    "validation/events.py",
    "validation/report.py",
    "storage/jsonio.py",
)


def hash_analysis_sources(source_directory: Traversable | None = None) -> str:
    """Fingerprint the calculation and validation code, excluding presentation."""
    if source_directory is None:
        source_directory = files("input_analyzer")

    source_hash = hashlib.sha256()
    for relative_path in ANALYSIS_SOURCES:
        encoded_path = relative_path.encode("utf-8")
        source_bytes = source_directory.joinpath(relative_path).read_bytes()
        source_hash.update(encoded_path)
        source_hash.update(source_bytes)

    return source_hash.hexdigest()


def build_manifest(
    dataset: dict, profile: StudyProfile, config: AnalysisConfig, code_revision: str
) -> dict:
    """Record inputs and runtime versions, deriving a stable ID for identical runs."""
    dataset_hash = hash_dataset(dataset)

    config_data = {
        "bootstrap_samples": config.bootstrap_samples,
        "seed": config.seed,
        "aggregation": "participant condition medians; mean paired candidate-baseline differences",
    }
    profile_data = profile.to_dict()
    profile_hash = hash_dataset(profile_data)

    package_versions = {}
    packages = ("pydantic", "matplotlib", "psycopg")
    for name in packages:
        try:
            package_version = version(name)
        except PackageNotFoundError:
            package_version = "unavailable"
        package_versions[name] = package_version

    source_sha256 = hash_analysis_sources()
    python_version = platform.python_version()
    identity_parts = [
        dataset_hash,
        config_data,
        __version__,
        METRICS_VERSION,
        code_revision,
        python_version,
        package_versions,
        source_sha256,
        profile_hash,
    ]
    identity = json.dumps(identity_parts, sort_keys=True)

    return {
        "schemaVersion": 1,
        "run_id": str(uuid5(NAMESPACE_URL, identity)),
        "dataset_kind": dataset["kind"],
        "dataset_hash": dataset_hash,
        "study_id": profile.study_id,
        "protocol_version": profile.protocol_version,
        "profile_sha256": profile_hash,
        "analyzer_version": __version__,
        "metrics_version": METRICS_VERSION,
        "code_revision": code_revision,
        "config": config_data,
        "python_version": python_version,
        "packages": package_versions,
        "source_sha256": source_sha256,
        "dataset_provenance": dataset.get("provenance", {}),
    }

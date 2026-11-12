"""Resolve and validate once, then calculate metrics and immutable provenance."""

from pathlib import Path
from typing import cast

from .dataset import Dataset
from .metrics import calculate_metrics
from .profile import AnalysisConfig, StudyProfile
from .provenance import build_manifest
from .storage import read_json
from .validation import validate_report


def run(
    dataset: dict,
    profile: StudyProfile | dict | None = None,
    config: AnalysisConfig | None = None,
    code_revision: str = "unknown",
) -> dict:
    """Analyze untrusted input through one explicit validation boundary."""
    if config is None:
        configuration = AnalysisConfig()
    else:
        configuration = config

    validation = validate_report(dataset, profile)
    resolved_profile = validation.require_valid()

    typed_dataset = cast(Dataset, dataset)
    metrics = calculate_metrics(typed_dataset, resolved_profile, configuration, validation)

    result = dict(metrics)
    manifest = build_manifest(dataset, resolved_profile, configuration, code_revision)
    result["manifest"] = manifest
    result["validation"] = validation.to_dict()
    return result


def analyze(
    dataset: dict,
    profile: StudyProfile | dict | None = None,
    config: AnalysisConfig | None = None,
    code_revision: str = "unknown",
) -> dict:
    """Validate and analyze in memory, retaining the public library entry point."""
    return run(dataset, profile, config, code_revision)


def analyze_file(
    input_path: Path,
    output: Path,
    profile: StudyProfile | None = None,
    config: AnalysisConfig | None = None,
    code_revision: str = "unknown",
) -> dict:
    """Analyze a frozen JSON dataset and save all result files together."""
    from .artifacts import save_analysis

    dataset = read_json(input_path)
    result = run(dataset, profile, config, code_revision)
    save_analysis(dataset, result, output)
    return result

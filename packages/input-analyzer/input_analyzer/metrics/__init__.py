"""Public metric helpers and the validated in-memory analysis entry point."""

from typing import cast

from ..dataset import Dataset
from ..profile import AnalysisConfig, StudyProfile
from ..validation import validate_report
from .participants import calculate_metrics
from .statistics import calculate_percentile, summarize_pairs
from .trial import FATAL_FLAGS, calculate_trial, create_field_metrics

METRICS_VERSION = "1.0.0"


def analyze_dataset(
    dataset: dict, profile: StudyProfile | dict | None = None, config: AnalysisConfig | None = None
) -> dict:
    """Validate and calculate metrics, preserving the original public JSON shape."""
    validation = validate_report(dataset, profile)
    resolved_profile = validation.require_valid()

    if config is None:
        configuration = AnalysisConfig()
    else:
        configuration = config

    typed_dataset = cast(Dataset, dataset)
    result = calculate_metrics(typed_dataset, resolved_profile, configuration, validation)
    return dict(result)


__all__ = [
    "METRICS_VERSION",
    "FATAL_FLAGS",
    "analyze_dataset",
    "calculate_metrics",
    "calculate_trial",
    "create_field_metrics",
    "calculate_percentile",
    "summarize_pairs",
]

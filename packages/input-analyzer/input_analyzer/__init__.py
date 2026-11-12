"""Analysis of browser interaction experiments."""

__version__ = "1.0.0"

from .adapters.tracker import import_tracker_export
from .api import analyze, analyze_file, save_analysis, verify_result_directory
from .errors import (
    ConfigurationError,
    DatabaseUnavailableError,
    DatasetValidationError,
    InputAnalyzerError,
    ProvenanceError,
)
from .metrics import analyze_dataset, calculate_trial
from .profile import AnalysisConfig, StudyProfile, load_profile
from .reporting import render_report
from .storage import extract_dataset, load_analysis, register_study
from .validation import ValidationIssue, ValidationReport, validate_dataset, validate_report

__all__ = [
    "import_tracker_export",
    "StudyProfile",
    "AnalysisConfig",
    "load_profile",
    "validate_dataset",
    "calculate_trial",
    "analyze_dataset",
    "analyze",
    "analyze_file",
    "save_analysis",
    "verify_result_directory",
    "render_report",
    "extract_dataset",
    "load_analysis",
    "register_study",
    "InputAnalyzerError",
    "ConfigurationError",
    "DatasetValidationError",
    "ProvenanceError",
    "DatabaseUnavailableError",
    "ValidationIssue",
    "ValidationReport",
    "validate_report",
]

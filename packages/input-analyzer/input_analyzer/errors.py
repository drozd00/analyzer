"""Errors callers can handle without depending on implementation libraries."""


class InputAnalyzerError(Exception):
    """Base class for expected analyzer failures."""


class ConfigurationError(InputAnalyzerError, ValueError):
    """Invalid study configuration or command options."""


class DatasetValidationError(InputAnalyzerError, ValueError):
    """Input data does not satisfy the dataset contract."""


class ProvenanceError(InputAnalyzerError, ValueError):
    """Saved inputs, metrics or provenance disagree."""


class DatabaseUnavailableError(InputAnalyzerError):
    """A database dependency or connection is unavailable."""

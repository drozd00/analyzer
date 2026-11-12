"""Structured validation details with a stable, legacy JSON representation."""

from dataclasses import dataclass, field
from typing import Literal

from ..errors import DatasetValidationError
from ..profile import StudyProfile


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    message: str
    location: tuple[str | int, ...]
    severity: Literal["error", "warning"] = "error"


@dataclass
class ValidationReport:
    issues: list[ValidationIssue] = field(default_factory=list)
    profile: StudyProfile | None = None

    @property
    def valid(self) -> bool:
        for issue in self.issues:
            if issue.severity == "error":
                return False
        return True

    def add_error(self, code: str, message: str, *location: str | int) -> None:
        issue = ValidationIssue(code, message, location)
        self.issues.append(issue)

    def add_warning(self, code: str, message: str, *location: str | int) -> None:
        issue = ValidationIssue(code, message, location, "warning")
        self.issues.append(issue)

    def to_dict(self) -> dict:
        """Keep existing validate and analysis JSON consumers compatible."""
        errors = []
        warnings = []
        for issue in self.issues:
            if issue.severity == "error":
                errors.append(issue.message)
            else:
                warnings.append(issue.message)
        return {
            "valid": self.valid,
            "errors": errors,
            "warnings": warnings,
        }

    def require_valid(self) -> StudyProfile:
        """Return the resolved profile or raise a categorized input error."""
        if not self.valid or self.profile is None:
            errors = []
            for issue in self.issues:
                if issue.severity == "error":
                    errors.append(issue.message)
            raise DatasetValidationError("Dataset validation failed: " + "; ".join(errors[:10]))
        return self.profile

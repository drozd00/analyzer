"""Study profile validation and loading."""

import json
from copy import deepcopy
from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path

from pydantic import ValidationError

from .errors import ConfigurationError
from .models import ProfileDefinition


@dataclass(frozen=True)
class StudyProfile:
    """Validated configuration. Use from_dict; to_dict returns a defensive copy."""

    _data: dict

    @classmethod
    def from_dict(cls, value: dict) -> "StudyProfile":
        """Validate local models and cross-references, then keep an independent copy."""
        try:
            ProfileDefinition.model_validate(value)
        except ValidationError as error:
            detail = error.errors(include_url=False, include_input=False)[0]
            raise ConfigurationError("Invalid study profile: " + detail["msg"]) from error

        # Pydantic checks shape; these checks enforce links between definitions.
        for name in ("fields", "variants", "phases", "groups", "comparisons"):
            identifiers = []
            for row in value[name]:
                identifiers.append(row["id"])
            if len(identifiers) != len(set(identifiers)):
                raise ConfigurationError(f"Duplicate {name} identifier in profile.")

        variants = set()
        for row in value["variants"]:
            variants.add(row["id"])

        for group in value["groups"]:
            variant_order = group["variantOrder"]
            if len(variant_order) != len(variants) or set(variant_order) != variants:
                raise ConfigurationError(
                    "Each group variantOrder must contain each variant exactly once."
                )

        for comparison in value["comparisons"]:
            baseline = comparison["baseline"]
            candidate = comparison["candidate"]
            if baseline not in variants or candidate not in variants:
                raise ConfigurationError("Comparison references an unknown variant.")
            if baseline == candidate:
                raise ConfigurationError("Comparison must use two different variants.")

        has_included_phase = False
        for row in value["phases"]:
            if row["includeInAnalysis"]:
                has_included_phase = True
                break
        if not has_included_phase:
            raise ConfigurationError("At least one phase must be included in analysis.")

        return cls(deepcopy(value))

    def to_dict(self) -> dict:
        """Return a copy that callers can edit without changing this profile."""
        return deepcopy(self._data)

    @property
    def study_id(self) -> str:
        return self._data["studyId"]

    @property
    def protocol_version(self) -> str:
        return self._data["protocolVersion"]

    @property
    def field_ids(self) -> tuple[str, ...]:
        """Return logical field IDs in the profile's declared order."""
        identifiers = []
        for row in self._data["fields"]:
            identifiers.append(row["id"])
        return tuple(identifiers)

    @property
    def variant_ids(self) -> tuple[str, ...]:
        identifiers = []
        for row in self._data["variants"]:
            identifiers.append(row["id"])
        return tuple(identifiers)

    @property
    def included_phases(self) -> tuple[str, ...]:
        """Return phases whose eligible trials contribute to participant comparisons."""
        identifiers = []
        for row in self._data["phases"]:
            if row["includeInAnalysis"]:
                identifiers.append(row["id"])
        return tuple(identifiers)


def load_profile(name_or_path: str | Path) -> StudyProfile:
    """Load a profile from an existing JSON path or a bundled example name."""
    path = Path(name_or_path)
    if path.exists():
        resource = path
    else:
        resource_name = str(name_or_path) + ".json"
        profiles = files("input_analyzer").joinpath("profiles")
        resource = profiles.joinpath(resource_name)

    try:
        definition = json.loads(resource.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ConfigurationError(f"Invalid study profile JSON: {error}") from error

    return StudyProfile.from_dict(definition)


def resolve_profile(dataset: dict, profile: StudyProfile | dict | None = None) -> StudyProfile:
    """Resolve an explicit or embedded profile, rejecting any disagreement."""
    if isinstance(profile, dict):
        profile = StudyProfile.from_dict(profile)

    if dataset.get("schemaVersion") != 1:
        raise ConfigurationError("Unsupported dataset schemaVersion (expected 1).")

    embedded_data = dataset.get("profile")
    if embedded_data is None:
        if profile is None:
            raise ConfigurationError(
                "An explicit study profile is required; supply profile or freeze it in the dataset."
            )
        return profile

    embedded = StudyProfile.from_dict(embedded_data)
    if profile is not None and profile.to_dict() != embedded.to_dict():
        raise ConfigurationError("Supplied profile differs from frozen dataset profile.")

    return embedded


@dataclass(frozen=True)
class AnalysisConfig:
    """Control reproducible participant bootstrap sampling."""

    seed: int = 2026
    bootstrap_samples: int = 10000

    def __post_init__(self):
        seed_is_integer = type(self.seed) is int
        bootstrap_is_integer = type(self.bootstrap_samples) is int
        if not seed_is_integer or not bootstrap_is_integer or self.bootstrap_samples < 1:
            raise ConfigurationError(
                "Seed must be an integer and bootstrap_samples a positive integer."
            )

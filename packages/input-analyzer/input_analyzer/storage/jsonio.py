"""Canonical JSON serialization for datasets and analysis artifacts."""

import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn
from uuid import UUID

from ..errors import DatasetValidationError


def encode_value(value: object) -> str:
    """Normalize PostgreSQL timestamps and UUIDs for JSON snapshots."""
    if isinstance(value, datetime):
        utc_value = value.astimezone(timezone.utc)
        return utc_value.isoformat().replace("+00:00", "Z")
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"Unsupported JSON value: {type(value).__name__}")


def write_json(path: Path, value: dict) -> None:
    """Write sorted, readable JSON and reject non-finite numbers."""
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(
        value,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
        allow_nan=False,
        default=encode_value,
    )
    path.write_text(serialized + "\n", encoding="utf-8")


def reject_json_constant(value: str) -> NoReturn:
    """Reject Python's nonstandard JSON constants before they enter analysis."""
    raise ValueError(f"Non-finite JSON number: {value}")


def parse_finite_float(value: str) -> float:
    """Reject JSON numbers that overflow the analyzer's finite numeric range."""
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"Non-finite JSON number: {value}")
    return number


def read_json(path: Path) -> dict:
    """Read a UTF-8 JSON object, reporting malformed input as a domain error."""
    try:
        text = path.read_text(encoding="utf-8")
        value = json.loads(
            text,
            parse_constant=reject_json_constant,
            parse_float=parse_finite_float,
        )
    except ValueError as error:
        raise DatasetValidationError(f"Invalid JSON in {path}: {error}") from error

    if not isinstance(value, dict):
        raise DatasetValidationError(f"JSON in {path} must be an object.")
    return value


def hash_dataset(dataset: dict) -> str:
    """Hash canonical JSON so dictionary insertion order does not affect identity."""
    try:
        encoded = json.dumps(
            dataset,
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as error:
        raise DatasetValidationError(f"Dataset must contain finite JSON values: {error}") from error

    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

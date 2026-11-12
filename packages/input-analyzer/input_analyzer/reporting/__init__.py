"""Public report helpers and explicit, profile-selected publication adapters."""

import csv
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Protocol

from ..adapters.service_request import ServiceRequestReportAdapter
from ..errors import ConfigurationError
from .figures import save_figure
from .generic import render_report
from .latex import escape_latex, format_number, write_table


class ReportAdapter(Protocol):
    """A renderer selected by profile metadata, independently of metric policy."""

    def matches(self, profile: dict) -> bool: ...

    def render(self, result: dict, output: Path) -> None: ...


REPORT_ADAPTERS: tuple[ReportAdapter, ...] = (ServiceRequestReportAdapter(),)


def select_report_adapter(
    profile: dict, adapters: Sequence[ReportAdapter] = REPORT_ADAPTERS
) -> ReportAdapter:
    """Resolve a configured adapter or reject an unknown or mismatched profile."""
    for adapter in adapters:
        if adapter.matches(profile):
            return adapter

    adapter_name = profile.get("reportAdapter")
    raise ConfigurationError(f"No report adapter matches this profile: {adapter_name!r}.")


def render_adapted_report(result: dict, output: Path, *, adapter_name: str | None = None) -> None:
    """Render the frozen profile's adapter or an explicit compatible override."""
    profile = result["profile"]
    if adapter_name is not None:
        profile = {**profile, "reportAdapter": adapter_name}

    adapter = select_report_adapter(profile)
    adapter.render(result, output)


def write_csv(path: Path, rows: list[dict], columns: Sequence[str]) -> None:
    """Write explicit columns, encoding nested values as JSON cells.

    Extra fields raise an error instead of silently losing data. Empty result
    sets retain their column headers so downstream consumers know their schema.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()

        for row in rows:
            serialized_row = {}
            for key, value in row.items():
                if isinstance(value, (dict, list)):
                    serialized_value = json.dumps(value, ensure_ascii=False)
                else:
                    serialized_value = value
                serialized_row[key] = serialized_value
            writer.writerow(serialized_row)


__all__ = [
    "ReportAdapter",
    "escape_latex",
    "format_number",
    "render_adapted_report",
    "render_report",
    "save_figure",
    "select_report_adapter",
    "write_csv",
    "write_table",
]

"""Publication tables and figures for the service-request study."""

from copy import deepcopy
from pathlib import Path
from statistics import median
from typing import TypedDict

from ..errors import ConfigurationError
from ..reporting.figures import FigureLabels, render_paired_differences, render_repetition_times
from ..reporting.latex import format_number, write_table


class ReportConfiguration(TypedDict):
    study_id: str
    protocol_version: str
    adapter: str
    comparison_id: str
    comparison_label: str
    variants: list[dict]
    orders: dict[str, str]


REPORT_CONFIG: ReportConfiguration = {
    "study_id": "service-request",
    "protocol_version": "pilot-v1",
    "adapter": "service-request",
    "comparison_id": "B-A",
    "comparison_label": "B - A",
    "variants": [
        {"id": "A", "label": "A", "color": "#2563eb"},
        {"id": "B", "label": "B", "color": "#d97706"},
    ],
    "orders": {"AB": "A/B", "BA": "B/A"},
}
FIGURE_LABELS = FigureLabels(
    repetition="Opakování",
    completion_time="Medián času (s)",
    variant="Varianta",
    empty_trials="Žádné způsobilé běhy",
    participant="Účastník (anonymní pořadí)",
    difference=f"Rozdíl mediánů {REPORT_CONFIG['comparison_label']} (s)",
    comparison=None,
    empty_pairs="Žádné úplné páry",
    hash_salt="input-analyzer-v1",
)

PUBLICATION_REQUIREMENTS = (
    "Publication requires a server-classified pilot dataset, "
    "passing data quality and at least one complete participant pair."
)
SECONDARY_METRICS = (
    ("error_count", "Chybové epizody"),
    ("correction_count", "Opravené epizody"),
    ("delete_count", "Mazací události"),
    ("keyboard_navigation_count", "Navigační klávesy"),
    ("pointer_count", "Stisky myši"),
)


def matches_service_request_protocol(profile: dict) -> bool:
    """Check whether the study and protocol provide the expected metrics."""
    if profile.get("studyId") != REPORT_CONFIG["study_id"]:
        return False
    return profile.get("protocolVersion") == REPORT_CONFIG["protocol_version"]


class ServiceRequestReportAdapter:
    """Select the service-request renderer by profile and adapter name."""

    def matches(self, profile: dict) -> bool:
        if not matches_service_request_protocol(profile):
            return False
        return profile.get("reportAdapter") == REPORT_CONFIG["adapter"]

    def render(self, result: dict, output: Path) -> None:
        export_service_request_report(result, output)


def convert_service_result(result: dict) -> dict:
    """Select the comparison and metrics used by the service-request report."""
    if not matches_service_request_protocol(result["profile"]):
        raise ConfigurationError("Publication requires the service-request pilot-v1 profile.")

    converted = deepcopy(result)
    summary = result["summary"]
    comparison = summary["comparisons"][REPORT_CONFIG["comparison_id"]]

    orders = {}
    for label, order in REPORT_CONFIG["orders"].items():
        orders[label] = comparison["by_order"][order]

    adapted_summary = dict(summary)
    adapted_summary["overall"] = comparison["overall"]
    for label, order_summary in orders.items():
        adapted_summary[label] = order_summary
    adapted_summary["measured_trials"] = summary["analysis_trials"]
    adapted_summary["completed_measured_trials"] = summary["completed_analysis_trials"]
    adapted_summary["eligible_measured_trials"] = summary["eligible_trials"]
    adapted_summary["familiarization_trials"] = summary["excluded_phase_trials"]
    converted["summary"] = adapted_summary

    selected_pairs = []
    for row in result["paired_metrics"]:
        if row["comparison_id"] == REPORT_CONFIG["comparison_id"]:
            selected_pairs.append(row)
    converted["paired_metrics"] = selected_pairs

    return converted


def create_tables(output: Path, result: dict) -> None:
    """Write five Czech tables from an adapted service-request result."""
    summary = result["summary"]
    overall = summary["overall"]
    comparison_label = REPORT_CONFIG["comparison_label"]

    summary_rows = [
        ["Sezení", summary["sessions"]],
        ["Párovaní účastníci", overall["participants"]],
        [f"Rozdíl {comparison_label} (s)", format_number(overall["difference_ms"], 1000)],
        ["Relativní rozdíl (%)", format_number(overall["percentage_difference"])],
    ]
    write_table(
        output / "pilot-summary.tex",
        ["Ukazatel", "Hodnota"],
        summary_rows,
    )

    incomplete_measured_trials = summary["measured_trials"] - summary["completed_measured_trials"]
    sample_flow_rows = [
        ["Všechny běhy", summary["trials"]],
        ["Seznamovací běhy", summary["familiarization_trials"]],
        ["Plánované měřené běhy", summary["measured_trials"]],
        ["Dokončené měřené běhy", summary["completed_measured_trials"]],
        ["Způsobilé měřené běhy", summary["eligible_measured_trials"]],
        ["Nedokončené měřené běhy", incomplete_measured_trials],
    ]
    write_table(
        output / "sample-flow.tex",
        ["Položka", "Počet"],
        sample_flow_rows,
    )

    interval = overall["difference_ci95_ms"]
    if interval is None:
        interval_text = "--"
    else:
        interval_text = f"{interval[0] / 1000:.2f}; {interval[1] / 1000:.2f}"

    paired_time_rows = [
        [
            f"Průměr párových rozdílů {comparison_label} (s)",
            format_number(overall["difference_ms"], 1000),
        ],
        ["95% bootstrap interval (s)", interval_text],
        ["Počet účastníků", overall["participants"]],
    ]
    write_table(
        output / "paired-times.tex",
        ["Statistika", "Hodnota"],
        paired_time_rows,
    )

    secondary = []
    for key, label in SECONDARY_METRICS:
        row = [label]
        for variant in REPORT_CONFIG["variants"]:
            values = []
            for item in result["participant_metrics"]:
                if item["variant"] == variant["id"]:
                    values.append(item[key])

            if values:
                formatted_value = format_number(median(values))
            else:
                formatted_value = "--"
            row.append(formatted_value)
        secondary.append(row)

    variant_labels = []
    for variant in REPORT_CONFIG["variants"]:
        variant_labels.append(variant["label"])

    write_table(
        output / "secondary-metrics.tex",
        ["Medián účastnických mediánů", *variant_labels],
        secondary,
    )

    order_rows = []
    for order in REPORT_CONFIG["orders"]:
        group = summary[order]
        order_rows.append(
            [
                order,
                group["participants"],
                format_number(group["difference_ms"], 1000),
                format_number(group["percentage_difference"]),
            ]
        )

    write_table(
        output / "order-groups.tex",
        ["Pořadí", "Účastníci", f"{comparison_label} (s)", "Změna (%)"],
        order_rows,
    )


def create_figures(output: Path, result: dict) -> None:
    """Write repetition and paired-difference charts with Czech labels."""
    render_repetition_times(
        result, output / "repetition-times", REPORT_CONFIG["variants"], FIGURE_LABELS
    )

    first_variant = REPORT_CONFIG["variants"][0]
    comparisons = [{"id": REPORT_CONFIG["comparison_id"], "color": first_variant["color"]}]
    render_paired_differences(result, output / "paired-differences", comparisons, FIGURE_LABELS)


def export_service_request_report(result: dict, output: Path) -> None:
    """Publish eligible pilot output and mark it ready only after rendering succeeds."""
    result = convert_service_result(result)

    manifest = result.get("manifest", {})
    if manifest.get("dataset_kind") != "pilot":
        raise ConfigurationError(PUBLICATION_REQUIREMENTS)
    if not result["summary"]["quality_pass"]:
        raise ConfigurationError(PUBLICATION_REQUIREMENTS)
    if result["summary"]["overall"]["participants"] < 1:
        raise ConfigurationError(PUBLICATION_REQUIREMENTS)

    output = Path(output)
    marker = output / "tables" / "pilot-ready.tex"
    # Remove a previous marker so readers can detect a partial export.
    marker.unlink(missing_ok=True)

    create_tables(output / "tables", result)
    create_figures(output / "figures", result)

    marker_text = (
        "% Verified pilot dataset: "
        + result["manifest"]["dataset_hash"]
        + "\n\\pilotdatareadytrue\n"
    )
    marker.write_text(marker_text, encoding="utf-8")

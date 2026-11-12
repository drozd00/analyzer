"""Default reports driven by profile variants and analysis comparisons."""

from pathlib import Path

from .figures import FigureLabels, render_paired_differences, render_repetition_times
from .latex import format_number, write_table


def render_report(result: dict, output: Path) -> None:
    """Render tables and figures for the comparisons defined in the profile."""
    output = Path(output)
    tables = output / "tables"
    figures = output / "figures"
    summary = result["summary"]

    study_summary_rows = [
        ["Sessions", summary["sessions"]],
        ["Scheduled trials", summary["trials"]],
        ["Eligible trials", summary["eligible_trials"]],
        ["Excluded phase trials", summary["excluded_phase_trials"]],
    ]
    write_table(
        tables / "study-summary.tex",
        ["Measure", "Count"],
        study_summary_rows,
    )

    comparison_rows = []
    for identifier, comparison in summary["comparisons"].items():
        overall = comparison["overall"]
        row = [
            identifier,
            overall["participants"],
            format_number(overall["difference_ms"], 1000),
            format_number(overall["percentage_difference"]),
        ]
        comparison_rows.append(row)

    write_table(
        tables / "comparisons.tex",
        ["Comparison", "Pairs", "Difference (s)", "Change (%)"],
        comparison_rows,
    )

    labels = FigureLabels()
    render_repetition_times(
        result, figures / "repetition-times", result["profile"]["variants"], labels
    )

    comparisons = []
    for identifier in summary["comparisons"]:
        comparisons.append({"id": identifier, "label": identifier})
    render_paired_differences(result, figures / "paired-differences", comparisons, labels)

"""Shared chart rendering with explicit study labels and styles."""

from dataclasses import dataclass
from pathlib import Path
from statistics import median

from ..errors import InputAnalyzerError


@dataclass(frozen=True)
class FigureLabels:
    repetition: str = "Repetition"
    completion_time: str = "Median completion time (s)"
    variant: str = "Variant"
    empty_trials: str = "No eligible trials"
    participant: str = "Participant (anonymous order)"
    difference: str = "Candidate minus baseline (s)"
    comparison: str | None = "Comparison"
    empty_pairs: str = "No complete pairs"
    hash_salt: str = "input-analyzer"


def load_plotting():
    """Load the optional plotting dependency only when rendering a chart."""
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError as error:
        raise InputAnalyzerError(
            "Report rendering requires matplotlib; install input-analyzer[report]."
        ) from error
    return plt


def save_figure(figure, path: Path) -> None:
    """Save PDF and SVG versions without volatile creation timestamps."""
    path.parent.mkdir(parents=True, exist_ok=True)
    for extension in ("pdf", "svg"):
        if extension == "pdf":
            metadata = {"CreationDate": None, "ModDate": None}
        else:
            metadata = {"Date": None}
        figure.savefig(path.with_suffix("." + extension), metadata=metadata)


def render_repetition_times(
    result: dict,
    path: Path,
    variants: list[dict],
    labels: FigureLabels,
) -> None:
    """Plot medians per repetition for the supplied variant labels and colors."""
    plt = load_plotting()
    with plt.rc_context({"font.size": 10, "svg.hashsalt": labels.hash_salt}):
        figure, axis = plt.subplots(figsize=(6.4, 3.8), layout="constrained")
        try:
            for variant in variants:
                rows = []
                for row in result["trial_metrics"]:
                    if not row["eligible"]:
                        continue
                    if row["variant"] != variant["id"]:
                        continue
                    rows.append(row)

                repetition_set = set()
                for row in rows:
                    repetition_set.add(row["repetition"])
                repetitions = sorted(repetition_set)

                values = []
                for repetition in repetitions:
                    durations = []
                    for row in rows:
                        if row["repetition"] == repetition:
                            durations.append(row["completion_time_ms"])
                    values.append(median(durations) / 1000)

                if repetitions:
                    if "color" in variant:
                        style = {"color": variant["color"]}
                    else:
                        style = {}
                    axis.plot(repetitions, values, marker="o", label=variant["label"], **style)

            axis.set(xlabel=labels.repetition, ylabel=labels.completion_time)
            if axis.lines:
                axis.legend(title=labels.variant)
            else:
                axis.text(0.5, 0.5, labels.empty_trials, ha="center", transform=axis.transAxes)

            save_figure(figure, path)
        finally:
            plt.close(figure)


def render_paired_differences(
    result: dict,
    path: Path,
    comparisons: list[dict],
    labels: FigureLabels,
) -> None:
    """Plot paired differences for each selected comparison."""
    plt = load_plotting()
    with plt.rc_context({"font.size": 10, "svg.hashsalt": labels.hash_salt}):
        figure, axis = plt.subplots(figsize=(6.4, 3.8), layout="constrained")
        try:
            for comparison in comparisons:
                pairs = []
                for row in result["paired_metrics"]:
                    if row["comparison_id"] != comparison["id"]:
                        continue
                    pairs.append(row)

                if pairs:
                    style = {}
                    if "color" in comparison:
                        style["color"] = comparison["color"]
                    if labels.comparison is not None:
                        style["label"] = comparison["label"]

                    values = []
                    for row in pairs:
                        values.append(row["difference_ms"] / 1000)

                    positions = range(1, len(pairs) + 1)
                    axis.scatter(positions, values, **style)

            if axis.collections:
                if labels.comparison is not None:
                    axis.legend(title=labels.comparison)
            else:
                axis.text(0.5, 0.5, labels.empty_pairs, ha="center", transform=axis.transAxes)

            axis.axhline(0, color="#64748b", linewidth=1)
            axis.set(xlabel=labels.participant, ylabel=labels.difference)
            save_figure(figure, path)
        finally:
            plt.close(figure)

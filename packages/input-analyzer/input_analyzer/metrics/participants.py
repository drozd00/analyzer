"""Participant aggregation, configured pairings and dataset summaries."""

from collections import defaultdict
from statistics import median
from typing import Any

from ..dataset import AnalysisResult, Dataset, EventRow
from ..profile import AnalysisConfig, StudyProfile
from ..validation import ValidationReport
from .statistics import summarize_pairs
from .trial import FATAL_FLAGS, calculate_trial

SUMMARY_METRICS = (
    "completion_time_ms",
    "error_count",
    "correction_count",
    "submit_attempt_count",
    "input_count",
    "delete_count",
    "keyboard_navigation_count",
    "pointer_count",
)


def _format_comparison_order(variant_order: list[str], baseline: str, candidate: str) -> str:
    """Keep the two compared variants in their original presentation order."""
    compared_variants = []
    for variant in variant_order:
        if variant in (baseline, candidate):
            compared_variants.append(variant)
    return "/".join(compared_variants)


def calculate_metrics(
    dataset: Dataset, profile: StudyProfile, config: AnalysisConfig, validation: ValidationReport
) -> AnalysisResult:
    """Calculate metrics from the dataset checked by the supplied report."""
    validation.require_valid()
    definition = profile.to_dict()

    group_orders = {}
    for row in definition["groups"]:
        group_orders[row["id"]] = row["variantOrder"]

    events_by_trial: dict[str, list[EventRow]] = defaultdict(list)
    for event in dataset["events"]:
        events_by_trial[event["trial_id"]].append(event)

    trial_metrics = []
    field_metrics = []
    ordered_trials = sorted(dataset["trials"], key=lambda row: (row["session_id"], row["ordinal"]))
    for trial in ordered_trials:
        trial_events = events_by_trial[trial["id"]]
        metrics, fields = calculate_trial(trial, trial_events, profile)
        trial_metrics.append(metrics)
        field_metrics.extend(fields)

    pairs = []
    participant_metrics = []
    ordered_sessions = sorted(dataset["sessions"], key=lambda row: row["id"])
    for session in ordered_sessions:
        eligible_trials = []
        for row in trial_metrics:
            if row["session_id"] != session["id"]:
                continue
            if not row["eligible"]:
                continue
            eligible_trials.append(row)

        variant_medians = {}
        # Collapse repetitions before pairing so each participant has equal weight.
        for variant in profile.variant_ids:
            variant_trials = []
            for row in eligible_trials:
                if row["variant"] == variant:
                    variant_trials.append(row)

            if not variant_trials:
                continue

            aggregate: dict[str, Any] = {
                "session_id": session["id"],
                "participant_code": session["participant_code"],
                "variant": variant,
                "trials": len(variant_trials),
            }
            for key in SUMMARY_METRICS:
                values = []
                for row in variant_trials:
                    values.append(row[key])
                aggregate[key] = median(values)

            participant_metrics.append(aggregate)
            variant_medians[variant] = aggregate

        for comparison in definition["comparisons"]:
            baseline = comparison["baseline"]
            candidate = comparison["candidate"]
            if baseline not in variant_medians:
                continue
            if candidate not in variant_medians:
                continue

            baseline_metrics = variant_medians[baseline]
            candidate_metrics = variant_medians[candidate]
            baseline_time = baseline_metrics["completion_time_ms"]
            candidate_time = candidate_metrics["completion_time_ms"]
            difference = candidate_time - baseline_time

            percentage_difference = None
            if baseline_time > 0:
                percentage_difference = 100 * difference / baseline_time

            order = group_orders[session["group_code"]]
            comparison_order = _format_comparison_order(order, baseline, candidate)
            pair = {
                "comparison_id": comparison["id"],
                "session_id": session["id"],
                "participant_code": session["participant_code"],
                "group_code": session["group_code"],
                "order": comparison_order,
                "baseline": baseline,
                "candidate": candidate,
                "baseline_median_ms": baseline_time,
                "candidate_median_ms": candidate_time,
                "difference_ms": difference,
                "baseline_trials": baseline_metrics["trials"],
                "candidate_trials": candidate_metrics["trials"],
                "percentage_difference": percentage_difference,
            }
            pairs.append(pair)

    comparisons = {}
    for comparison in definition["comparisons"]:
        comparison_pairs = []
        for row in pairs:
            if row["comparison_id"] == comparison["id"]:
                comparison_pairs.append(row)

        orders = set()
        for variant_order in group_orders.values():
            order = _format_comparison_order(
                variant_order, comparison["baseline"], comparison["candidate"]
            )
            orders.add(order)

        summaries_by_order = {}
        for order in sorted(orders):
            order_pairs = []
            for row in comparison_pairs:
                if row["order"] == order:
                    order_pairs.append(row)
            summaries_by_order[order] = summarize_pairs(
                order_pairs, config.seed, config.bootstrap_samples
            )

        comparisons[comparison["id"]] = {
            "baseline": comparison["baseline"],
            "candidate": comparison["candidate"],
            "overall": summarize_pairs(comparison_pairs, config.seed, config.bootstrap_samples),
            "by_order": summaries_by_order,
        }

    analysis_trials = 0
    completed_analysis_trials = 0
    eligible_trials = 0
    excluded_phase_trials = 0
    phase_counts = {}
    for phase in definition["phases"]:
        phase_counts[phase["id"]] = 0

    quality_pass = True
    for row in trial_metrics:
        phase = row["phase"]
        phase_is_included = phase in profile.included_phases
        if phase_is_included:
            analysis_trials += 1
            if row["completed"]:
                completed_analysis_trials += 1
        else:
            excluded_phase_trials += 1

        if row["eligible"]:
            eligible_trials += 1

        if phase in phase_counts:
            phase_counts[phase] += 1

        if FATAL_FLAGS.intersection(row["quality_flags"]):
            quality_pass = False

    summary = {
        "comparisons": comparisons,
        "sessions": len(dataset["sessions"]),
        "trials": len(trial_metrics),
        "analysis_trials": analysis_trials,
        "completed_analysis_trials": completed_analysis_trials,
        "eligible_trials": eligible_trials,
        "excluded_phase_trials": excluded_phase_trials,
        "phase_counts": phase_counts,
        "quality_pass": quality_pass,
        "interpretation": (
            "Differences are candidate minus baseline. "
            "Participants, not repeated trials, are resampled. "
            "Exploratory intervals; lack of significance does not establish equivalence."
        ),
    }

    return {
        "profile": definition,
        "trial_metrics": trial_metrics,
        "field_metrics": field_metrics,
        "participant_metrics": participant_metrics,
        "paired_metrics": pairs,
        "summary": summary,
    }

"""Persist and verify frozen analysis artifacts."""

from pathlib import Path

from .errors import ProvenanceError
from .metrics import analyze_dataset
from .profile import AnalysisConfig, StudyProfile, resolve_profile
from .reporting import write_csv
from .storage.jsonio import hash_dataset, read_json, write_json

CSV_COLUMNS = {
    "trial_metrics": (
        "trial_id",
        "session_id",
        "variant",
        "phase",
        "repetition",
        "ordinal",
        "status",
        "completed",
        "eligible",
        "completion_time_ms",
        "submit_attempt_count",
        "rejected_submit_count",
        "keyboard_navigation_count",
        "pointer_count",
        "quality_flags",
        "focus_time_ms",
        "input_count",
        "delete_count",
        "error_count",
        "correction_count",
    ),
    "field_metrics": (
        "trial_id",
        "field_id",
        "focus_time_ms",
        "focus_count",
        "input_count",
        "delete_count",
        "error_count",
        "correction_count",
    ),
    "participant_metrics": (
        "session_id",
        "participant_code",
        "variant",
        "trials",
        "completion_time_ms",
        "error_count",
        "correction_count",
        "submit_attempt_count",
        "input_count",
        "delete_count",
        "keyboard_navigation_count",
        "pointer_count",
    ),
    "paired_metrics": (
        "comparison_id",
        "session_id",
        "participant_code",
        "group_code",
        "order",
        "baseline",
        "candidate",
        "baseline_median_ms",
        "candidate_median_ms",
        "difference_ms",
        "baseline_trials",
        "candidate_trials",
        "percentage_difference",
    ),
    "summary": (
        "comparison_id",
        "order",
        "participants",
        "difference_ms",
        "difference_ci95_ms",
        "percentage_difference",
        "percentage_ci95",
    ),
}


def save_analysis(dataset: dict, result: dict, output: Path) -> None:
    """Write dataset, metrics and provenance files to a result directory."""
    manifest = result["manifest"]
    if hash_dataset(dataset) != manifest["dataset_hash"]:
        raise ProvenanceError("Dataset differs from analysis manifest.")

    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)

    write_json(output / "dataset.json", dataset)
    write_json(output / "analysis.json", result)
    write_json(output / "manifest.json", manifest)

    flagged_trials = []
    for row in result["trial_metrics"]:
        if row["quality_flags"]:
            flagged = {"trial_id": row["trial_id"], "flags": row["quality_flags"]}
            flagged_trials.append(flagged)

    quality_report = dict(result["validation"])
    quality_report["quality_pass"] = result["summary"]["quality_pass"]
    quality_report["trials"] = flagged_trials
    write_json(output / "quality-report.json", quality_report)

    metric_tables = ("trial_metrics", "field_metrics", "participant_metrics", "paired_metrics")
    for name in metric_tables:
        rows = result[name]
        columns = CSV_COLUMNS[name]
        write_csv(output / f"{name}.csv", rows, columns)

    summary_rows = []
    for identifier, comparison in result["summary"]["comparisons"].items():
        overall_row = {"comparison_id": identifier, "order": "overall", **comparison["overall"]}
        summary_rows.append(overall_row)
        for order, summary in comparison["by_order"].items():
            order_row = {"comparison_id": identifier, "order": order, **summary}
            summary_rows.append(order_row)

    write_csv(output / "summary.csv", summary_rows, CSV_COLUMNS["summary"])


def verify_result_directory(directory: Path) -> tuple[dict, dict]:
    """Check saved input hashes and recalculate metrics using the recorded settings."""
    directory = Path(directory)
    try:
        dataset = read_json(directory / "dataset.json")
        result = read_json(directory / "analysis.json")
        _verify_saved_result(dataset, result)
    except ProvenanceError:
        raise
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        raise ProvenanceError(f"Malformed saved analysis: {error}") from error

    return dataset, result


def _verify_saved_result(dataset: dict, result: dict) -> None:
    """Verify decoded artifacts; the public boundary categorizes malformed data."""
    manifest = result.get("manifest", {})
    if manifest.get("schemaVersion") != 1:
        raise ProvenanceError("Unsupported analysis schemaVersion.")

    if hash_dataset(dataset) != manifest["dataset_hash"]:
        raise ProvenanceError("Saved dataset differs from analysis manifest.")

    profile = resolve_profile(dataset, StudyProfile.from_dict(result["profile"]))
    if hash_dataset(profile.to_dict()) != manifest["profile_sha256"]:
        raise ProvenanceError("Profile differs from analysis manifest.")

    config = manifest["config"]
    analysis_config = AnalysisConfig(config["seed"], config["bootstrap_samples"])

    # Matching input hashes alone cannot detect edits to the saved metrics.
    expected = analyze_dataset(dataset, profile, analysis_config)
    for key, value in expected.items():
        if result.get(key) != value:
            raise ProvenanceError(
                "Saved metrics differ from a reproducible calculation; run analyze again."
            )

    if manifest["dataset_kind"] != dataset["kind"]:
        raise ProvenanceError("Dataset kind does not match manifest.")

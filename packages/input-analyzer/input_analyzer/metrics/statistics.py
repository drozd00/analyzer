"""Deterministic paired summaries and participant bootstrap intervals."""

import random
from statistics import mean


def calculate_percentile(values: list[float], quantile: float) -> float:
    """Interpolate a percentile of nonempty values for a quantile from 0 to 1."""
    ordered_values = sorted(values)
    position = (len(ordered_values) - 1) * quantile
    lower = int(position)
    upper = min(lower + 1, len(ordered_values) - 1)
    lower_value = ordered_values[lower]
    upper_value = ordered_values[upper]
    return lower_value + (upper_value - lower_value) * (position - lower)


def summarize_pairs(pairs: list[dict], seed: int, bootstrap_samples: int) -> dict:
    """Summarize paired differences with deterministic participant bootstrap intervals.

    Fewer than two pairs yields no interval. Percentage summaries omit pairs
    whose baseline duration is zero, while absolute differences retain them.
    """
    if not pairs:
        return {
            "participants": 0,
            "difference_ms": None,
            "difference_ci95_ms": None,
            "percentage_difference": None,
            "percentage_ci95": None,
        }

    differences = []
    percentages = []
    for row in pairs:
        differences.append(row["difference_ms"])
        if row["percentage_difference"] is not None:
            percentages.append(row["percentage_difference"])

    difference_interval = None
    percentage_interval = None
    if len(pairs) >= 2:
        generator = random.Random(seed)
        boot_differences = []
        boot_percentages = []
        for _ in range(bootstrap_samples):
            # Resample whole participants so each baseline/candidate pair stays intact.
            sampled = []
            for _ in pairs:
                index = generator.randrange(len(pairs))
                sampled.append(pairs[index])

            sampled_differences = []
            for row in sampled:
                sampled_differences.append(row["difference_ms"])
            boot_differences.append(mean(sampled_differences))

            sample_percentages = []
            for row in sampled:
                if row["percentage_difference"] is not None:
                    sample_percentages.append(row["percentage_difference"])
            if sample_percentages:
                boot_percentages.append(mean(sample_percentages))

        difference_interval = [
            calculate_percentile(boot_differences, 0.025),
            calculate_percentile(boot_differences, 0.975),
        ]
        if boot_percentages:
            percentage_interval = [
                calculate_percentile(boot_percentages, 0.025),
                calculate_percentile(boot_percentages, 0.975),
            ]

    return {
        "participants": len(pairs),
        "difference_ms": mean(differences),
        "difference_ci95_ms": difference_interval,
        "percentage_difference": mean(percentages) if percentages else None,
        "percentage_ci95": percentage_interval,
    }

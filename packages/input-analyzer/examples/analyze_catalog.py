"""Analyse the catalogue fixture and write tables and figures."""

import argparse
import json
from pathlib import Path

from input_analyzer import AnalysisConfig, analyze, load_profile, render_report, save_analysis


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    package = Path(__file__).resolve().parents[1]
    fixture_path = package / "fixtures" / "catalog-dataset.json"
    dataset = json.loads(fixture_path.read_text())
    profile = load_profile("catalog-search")
    config = AnalysisConfig(seed=2026, bootstrap_samples=10000)
    result = analyze(
        dataset,
        profile,
        config,
        code_revision="catalogue-example",
    )

    save_analysis(dataset, result, args.out)
    render_report(result, args.out)
    print(json.dumps(result["summary"]["comparisons"], indent=2))


if __name__ == "__main__":
    main()

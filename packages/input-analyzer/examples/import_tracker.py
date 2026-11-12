"""Import a tracker export with session and trial metadata."""

import argparse
import json
from pathlib import Path

from input_analyzer import (
    analyze,
    import_tracker_export,
    load_profile,
    render_report,
    save_analysis,
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--export", type=Path, required=True)
    parser.add_argument(
        "--metadata",
        type=Path,
        required=True,
        help="JSON with session and trial objects using SQL column names.",
    )
    parser.add_argument("--profile", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    export = json.loads(args.export.read_text())
    metadata = json.loads(args.metadata.read_text())
    profile = load_profile(args.profile)
    session = metadata["session"]
    trial = metadata["trial"]
    dataset = import_tracker_export(export, session, trial, profile, kind="preflight")
    result = analyze(dataset, profile)

    save_analysis(dataset, result, args.out)
    render_report(result, args.out)
    print(json.dumps(result["trial_metrics"], indent=2))


if __name__ == "__main__":
    main()

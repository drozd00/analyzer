"""Command-line entry point for the analysis library."""

import argparse
import json
import logging
from pathlib import Path

from . import __version__
from .api import analyze_file, verify_result_directory
from .errors import ConfigurationError, DatasetValidationError, InputAnalyzerError, ProvenanceError
from .profile import AnalysisConfig, load_profile
from .reporting import render_adapted_report, render_report
from .storage import extract_dataset, load_analysis, read_json, register_study, write_json
from .storage.postgres import handle_database_command_errors
from .validation import validate_dataset

LOGGER = logging.getLogger("input-analyzer")
PROFILE_HELP = "Explicit profile name or JSON path; otherwise use frozen dataset profile."


def create_parser() -> argparse.ArgumentParser:
    """Define arguments for each step of the analysis workflow."""
    parser = argparse.ArgumentParser(prog="input-analyzer")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument(
        "--verbose", action="store_true", help="Enable diagnostic logging on stderr."
    )

    commands = parser.add_subparsers(dest="command", required=True)

    register = commands.add_parser(
        "register", help="Register an immutable study profile (DATABASE_URL)."
    )
    register.add_argument("--profile", required=True)

    extract = commands.add_parser(
        "extract", help="Read a consistent PostgreSQL snapshot (DATABASE_URL)."
    )
    extract.add_argument("--out", type=Path, required=True)
    extract.add_argument("--study", required=True)
    extract.add_argument("--protocol", required=True)
    extract.add_argument("--kind", choices=("preflight", "pilot"), default="preflight")
    extract.add_argument("--code-revision", default="unknown")

    validate = commands.add_parser("validate", help="Check structure, identity and event contract.")
    validate.add_argument("--input", type=Path, required=True)
    validate.add_argument("--profile", help=PROFILE_HELP)
    validate.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON (also the default for compatibility).",
    )

    analyze = commands.add_parser("analyze", help="Calculate metrics from a frozen JSON dataset.")
    analyze.add_argument("--input", type=Path, required=True)
    analyze.add_argument("--profile", help=PROFILE_HELP)
    analyze.add_argument("--out", type=Path, required=True)
    analyze.add_argument("--seed", type=int, default=2026)
    analyze.add_argument("--bootstrap-samples", type=int, default=10000)
    analyze.add_argument("--code-revision", default="unknown")

    report = commands.add_parser(
        "report", help="Render existing verified metrics as LaTeX, PDF and SVG."
    )
    report.add_argument("--input", type=Path, required=True, help="Directory written by analyze.")
    report.add_argument(
        "--publication-out", type=Path, help="Output directory for a study-specific report."
    )
    report.add_argument(
        "--report-adapter", help="Override the frozen profile's adapter for publication."
    )

    load = commands.add_parser(
        "load", help="Load an immutable analysis run into SQL (DATABASE_URL)."
    )
    load.add_argument("--input", type=Path, required=True, help="Directory written by analyze.")

    return parser


def run_register(args: argparse.Namespace) -> int:
    """Register the requested profile using the optional database adapter."""
    profile = load_profile(args.profile)
    with handle_database_command_errors():
        inserted = register_study(profile)

    if inserted:
        print("Study profile registered.")
    else:
        print("Identical study profile already exists.")
    return 0


def run_extract(args: argparse.Namespace) -> int:
    """Save a consistent database snapshot."""
    with handle_database_command_errors():
        dataset = extract_dataset(args.study, args.protocol, args.kind, args.code_revision)

    write_json(args.out, dataset)
    session_count = len(dataset["sessions"])
    print(f"Extracted {session_count} {args.kind} sessions into {args.out}.")
    return 0


def run_validate(args: argparse.Namespace) -> int:
    """Emit the stable validation JSON shape and distinguish invalid input."""
    dataset = read_json(args.input)
    if args.profile:
        profile = load_profile(args.profile)
    else:
        profile = None

    result = validate_dataset(dataset, profile)
    print(json.dumps(result, indent=2, ensure_ascii=False))

    if result["valid"]:
        return 0
    return 2


def run_analyze(args: argparse.Namespace) -> int:
    """Analyze one frozen dataset and save its artifacts."""
    if args.profile:
        profile = load_profile(args.profile)
    else:
        profile = None

    config = AnalysisConfig(args.seed, args.bootstrap_samples)
    result = analyze_file(args.input, args.out, profile, config, args.code_revision)

    trials = result["summary"]["trials"]
    comparisons = len(result["summary"]["comparisons"])
    print(f"Analyzed {trials} trials; {comparisons} configured comparisons.")
    return 0


def run_report(args: argparse.Namespace) -> int:
    """Render verified results with generic and optional study-specific reporting."""
    if args.report_adapter is not None and args.publication_out is None:
        raise ConfigurationError("--report-adapter requires --publication-out.")

    _, result = verify_result_directory(args.input)
    render_report(result, args.input)
    if args.publication_out is not None:
        render_adapted_report(result, args.publication_out, adapter_name=args.report_adapter)

    print(f"Report written into {args.input}.")
    return 0


def run_load(args: argparse.Namespace) -> int:
    """Verify an analysis directory before loading its immutable run."""
    dataset, result = verify_result_directory(args.input)
    with handle_database_command_errors():
        inserted = load_analysis(dataset, result)

    if inserted:
        print("Analysis run inserted.")
    else:
        print("Identical analysis run already exists.")
    return 0


COMMAND_HANDLERS = {
    "register": run_register,
    "extract": run_extract,
    "validate": run_validate,
    "analyze": run_analyze,
    "report": run_report,
    "load": run_load,
}


def main(argv: list[str] | None = None) -> int:
    """Return 0 for success, 1 for runtime failure and 2 for invalid input."""
    parser = create_parser()
    args = parser.parse_args(argv)

    log_level = logging.DEBUG if args.verbose else logging.WARNING
    logging.basicConfig(level=log_level, format="%(name)s: %(message)s")
    LOGGER.debug("Running %s", args.command)

    try:
        handler = COMMAND_HANDLERS[args.command]
        return handler(args)
    except (ConfigurationError, DatasetValidationError, ProvenanceError) as error:
        LOGGER.error("%s", error)
        return 2
    except (InputAnalyzerError, OSError) as error:
        LOGGER.error("%s", error)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

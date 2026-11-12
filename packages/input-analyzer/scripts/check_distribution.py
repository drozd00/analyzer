"""Check wheel contents and install both wheel and sdist in clean environments."""

import os
import shutil
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

PACKAGE = Path(__file__).resolve().parents[1]
CORE_IMPORT_CHECK = (
    "import importlib.util; from input_analyzer import load_profile; "
    "assert load_profile('service-request').study_id == 'service-request'; "
    "assert all(importlib.util.find_spec(name) is None "
    "for name in ('matplotlib', 'psycopg', 'pytest', 'ruff', 'ty'))"
)


def run_command(arguments: list[str], directory: Path) -> None:
    """Run a distribution check without inheriting source import paths."""
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    environment.pop("PYTHONHOME", None)
    subprocess.run(arguments, cwd=directory, env=environment, check=True)


def check_wheel(uv: str, wheel: Path, directory: Path) -> None:
    """Verify installed core CLI/API behavior outside the repository."""
    environment = directory / "environment"
    run_command([uv, "venv", "--python", sys.executable, str(environment)], directory)

    if os.name == "nt":
        binaries = environment / "Scripts"
        python_name = "python.exe"
        cli_name = "input-analyzer.exe"
    else:
        binaries = environment / "bin"
        python_name = "python"
        cli_name = "input-analyzer"

    python = binaries / python_name
    cli = binaries / cli_name
    run_command([uv, "pip", "install", "--python", str(python), str(wheel)], directory)
    run_command(
        [
            str(python),
            "-I",
            "-c",
            CORE_IMPORT_CHECK,
        ],
        directory,
    )

    fixture = directory / "dataset.json"
    shutil.copyfile(PACKAGE / "fixtures" / "catalog-dataset.json", fixture)
    run_command([str(cli), "--version"], directory)
    run_command(
        [str(cli), "validate", "--input", str(fixture), "--profile", "catalog-search", "--json"],
        directory,
    )
    run_command(
        [
            str(cli),
            "analyze",
            "--input",
            str(fixture),
            "--out",
            str(directory / "results"),
            "--bootstrap-samples",
            "100",
        ],
        directory,
    )


def main() -> None:
    uv = shutil.which("uv")
    checker = shutil.which("check-wheel-contents")
    if uv is None or checker is None:
        raise RuntimeError("Run this script with uv run after installing the dev dependency group.")

    wheels = list((PACKAGE / "dist").glob("*.whl"))
    archives = list((PACKAGE / "dist").glob("*.tar.gz"))
    if len(wheels) != 1 or len(archives) != 1:
        raise RuntimeError(
            "Expected one wheel and one sdist in dist/; remove stale builds and run uv build."
        )

    with TemporaryDirectory(prefix="input-analyzer-distribution-") as temporary:
        directory = Path(temporary)
        run_command([checker, str(wheels[0])], directory)
        check_wheel(uv, wheels[0], directory)

        rebuilt = directory / "rebuilt"
        run_command(
            [uv, "build", str(archives[0]), "--wheel", "--out-dir", str(rebuilt)], directory
        )
        rebuilt_wheel = next(rebuilt.glob("*.whl"))
        run_command([checker, str(rebuilt_wheel)], directory)
        check_wheel(uv, rebuilt_wheel, rebuilt)


if __name__ == "__main__":
    main()

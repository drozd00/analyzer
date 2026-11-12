# Input analyzer

Turn browser form events into reproducible study results. The CLI checks a saved dataset, compares
form variants, and produces CSV metrics, LaTeX tables, and PDF and SVG charts. The Python library
exposes the same analysis for use in scripts.

## Try it

Use Python 3.12 or newer and uv. Run these commands from this directory with the included catalog
example:

```sh
uv sync --frozen --all-extras
uv run --frozen input-analyzer validate --input fixtures/catalog-dataset.json
uv run --frozen input-analyzer analyze --input fixtures/catalog-dataset.json --out results
uv run --frozen --extra report input-analyzer report --input results
```

The result directory keeps the input dataset, metrics, and a manifest recording how they were
calculated. The report command verifies the saved analysis before rendering.

A study profile describes the form fields, variants, and comparisons. Use the profile stored in the
dataset, or pass a matching profile to `validate` and `analyze` with `--profile`. See the
[catalog example](examples/analyze_catalog.py) for the Python API and the
[tracker import example](examples/import_tracker.py) for converting an event export into a dataset.

## PostgreSQL and publication

With the `db` extra and `DATABASE_URL` set, use `register` to register a study, `extract` to save a
snapshot, and `load` to save the calculated metrics. Run `input-analyzer COMMAND --help` for arguments.

For a study-specific report, run `report --input results --publication-out publication`. The bundled
service-request renderer requires a pilot dataset that passes the quality checks and includes at
least one complete participant pair. For a saved analysis with an older renderer name, add
`--report-adapter service-request` to select the compatible renderer.

## Build and test

```sh
uv run --frozen --all-extras pytest
uv build
docker build -t input-analyzer:1.0.0 .
```

Set `TEST_DATABASE_URL` to run integration tests against a migrated disposable PostgreSQL database.

# Input analysis

Collect form interactions in a browser, store them in PostgreSQL, and analyze them from a repeatable snapshot.

- [Input tracker](packages/input-tracker/README.md) records browser events without capturing typed text or field values.
- [Datastore](datastore/README.md) validates event batches and stores them in PostgreSQL.
- [Input analyzer](packages/input-analyzer/README.md) calculates metrics and generates tables and charts.

## Build the images

Run these commands from the repository root:

```sh
docker build -f datastore/Dockerfile -t input-datastore:1.0.0 .
docker build -t input-analyzer:1.0.0 packages/input-analyzer
```

The datastore takes a PostgreSQL connection string in `DATABASE_URL`. The analyzer can read a JSON
dataset directly or connect to PostgreSQL to extract one.
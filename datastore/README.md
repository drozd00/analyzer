# Datastore

The datastore is an HTTP service for collecting form interaction data. It validates incoming
sessions and event batches, then stores them in PostgreSQL for analysis.

## Build the image

From the repository root:

```sh
docker build -f datastore/Dockerfile -t input-datastore:1.0.0 .
```

Give the container a `DATABASE_URL` for a reachable PostgreSQL database. The service listens on port
3001 and applies pending SQL migrations at startup. Check `GET /api/health` to verify the database
connection. `STUDY_DATASET_KIND` defaults to `preflight` for test data. Set it to `pilot` for
participant data.

## Develop locally

Use the Node version in [`.nvmrc`](../.nvmrc) and set `DATABASE_URL` in the repository's `.env` or
your shell. From the repository root:

```sh
npm ci
npm run dev:datastore
npm run test:datastore
```

Use `npm run db:migrate` to apply [SQL migrations](migrations/) without starting the service. Keep
applied migrations intact and add a new numbered file for each schema change. Set
`TEST_DATASTORE_URL` to a disposable preflight service to include the HTTP persistence test.

The service registers the [service-request profile](profiles/service-request.json) when creating a
session. Use a new protocol version when collection rules change. The
[Python analyzer](../packages/input-analyzer/README.md) can extract and analyze stored data.

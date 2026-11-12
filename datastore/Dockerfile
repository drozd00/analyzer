FROM docker.io/library/node:26.13.1-bookworm-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY datastore/package.json datastore/package.json
COPY packages/input-tracker/package.json packages/input-tracker/package.json
RUN npm ci --ignore-scripts --workspace @input-analyzer/datastore
COPY datastore datastore
RUN npm run build:datastore

FROM docker.io/library/node:26.13.1-bookworm-slim AS datastore
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
COPY --from=build --chown=node:node /workspace/datastore/.output ./
USER node
EXPOSE 3001
CMD ["node", "server/index.mjs"]

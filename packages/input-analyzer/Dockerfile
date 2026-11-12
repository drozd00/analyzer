FROM docker.io/library/python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /uvx /bin/
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /opt/input-analyzer
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --all-extras --no-install-project
COPY README.md ./README.md
COPY input_analyzer ./input_analyzer
RUN uv sync --frozen --no-dev --all-extras --no-editable

FROM docker.io/library/python:3.12-slim AS runtime
ARG ANALYZER_UID=1000
ARG ANALYZER_GID=1000
RUN groupadd --gid ${ANALYZER_GID} analyzer \
    && useradd --uid ${ANALYZER_UID} --gid analyzer --create-home analyzer \
    && mkdir /artifacts /publication \
    && chown analyzer:analyzer /artifacts /publication
COPY --from=build /opt/input-analyzer/.venv /opt/input-analyzer/.venv
ENV PATH="/opt/input-analyzer/.venv/bin:$PATH" MPLCONFIGDIR=/tmp/matplotlib
WORKDIR /artifacts
USER analyzer
ENTRYPOINT ["input-analyzer"]

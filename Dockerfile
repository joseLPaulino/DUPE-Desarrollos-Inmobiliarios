FROM python:3.12-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# System deps for asyncpg / psycopg compilation
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Install dependencies via uv
# --frozen is used once uv.lock is committed; for first build uv generates it
COPY pyproject.toml ./
RUN uv sync --no-dev

# Copy application source
COPY src/ ./src/

ENV PYTHONPATH=/app/src
# Make uv-managed Python the default
ENV PATH="/app/.venv/bin:$PATH"

CMD ["uvicorn", "dupe_platform.adapters.inbound.api.main:app", "--host", "0.0.0.0", "--port", "8000"]

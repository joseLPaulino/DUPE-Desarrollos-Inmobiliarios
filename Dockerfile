FROM python:3.12-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY alembic.ini .
COPY alembic/ ./alembic/

ENV PYTHONPATH=/app/src

CMD ["uvicorn", "dupe_platform.adapters.inbound.api.main:app", "--host", "0.0.0.0", "--port", "8000"]

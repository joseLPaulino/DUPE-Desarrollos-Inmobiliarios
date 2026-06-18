-- Enable pgvector extension on startup.
-- This runs once when the Postgres container is first initialized.
CREATE EXTENSION IF NOT EXISTS vector;

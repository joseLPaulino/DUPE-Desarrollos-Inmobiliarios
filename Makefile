# DUPE Platform — test runner
# Requires Docker stack to be up for integration tests.

.PHONY: test test-unit test-integration rebuild

## Run all unit tests (no stack needed — pure domain logic)
test-unit:
	docker compose exec api python -m pytest tests/unit/ -v --tb=short

## Run integration tests (requires stack running on localhost:8000)
test-integration:
	docker compose exec api python -m pytest tests/integration/ -v --tb=short

## Run full suite
test:
	docker compose exec api python -m pytest tests/ -v --tb=short

## Reset DB + rebuild, then run full suite
test-fresh:
	docker compose down -v
	docker compose up --build -d
	@echo "Waiting 15s for stack to be ready..."
	sleep 15
	docker compose exec api python -m pytest tests/ -v --tb=short

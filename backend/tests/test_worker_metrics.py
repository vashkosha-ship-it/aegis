"""Метрики фоновых ARQ-задач не должны теряться или ломать задачу."""
from __future__ import annotations

import pytest

from app.worker import WORKER_METRICS_KEY, _measure_job


class FakeRedis:
    def __init__(self):
        self.values = {}

    async def hincrby(self, key, field, amount):
        assert key == WORKER_METRICS_KEY
        self.values[field] = int(self.values.get(field, 0)) + amount

    async def hset(self, key, mapping):
        assert key == WORKER_METRICS_KEY
        self.values.update(mapping)


class BrokenRedis:
    async def hincrby(self, *_args, **_kwargs):
        raise ConnectionError("Redis unavailable")


async def test_success_metric():
    redis = FakeRedis()

    async with _measure_job({"redis": redis}, "example"):
        pass

    assert redis.values["example:success"] == 1
    assert redis.values["example:last_status"] == "success"
    assert float(redis.values["example:last_duration_seconds"]) >= 0
    assert redis.values["example:last_finished_at"]


async def test_failure_metric_and_original_exception():
    redis = FakeRedis()

    with pytest.raises(ValueError, match="job failed"):
        async with _measure_job({"redis": redis}, "example"):
            raise ValueError("job failed")

    assert redis.values["example:failed"] == 1
    assert redis.values["example:last_status"] == "failed"


async def test_metrics_outage_does_not_fail_successful_job():
    async with _measure_job({"redis": BrokenRedis()}, "example"):
        pass

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import cotacao


def test_tabela_prazos_job_start_is_background_and_deduplicated(monkeypatch):
    calls = []
    job_id = "job-tabela-prazos-test"

    async def fake_processar(received_job_id):
        calls.append(received_job_id)
        await asyncio.sleep(0)

    async def run():
        cotacao._running_job_ids.discard(job_id)
        monkeypatch.setattr(cotacao, "_processar_tabela_prazos", fake_processar)

        task = cotacao._start_tabela_prazos_job(job_id)
        duplicate = cotacao._start_tabela_prazos_job(job_id)

        assert task is not None
        assert duplicate is None
        assert job_id in cotacao._running_job_ids

        await task
        await asyncio.sleep(0)

        assert calls == [job_id]
        assert job_id not in cotacao._running_job_ids

    asyncio.run(run())


def test_aprendizado_query_isola_por_tabela():
    query = cotacao._aprendizado_query("user-1", "tabela-a", ["ARROZ", "FEIJAO"])

    assert query == {
        "user_id": "user-1",
        "tabela_id": "tabela-a",
        "produto_cotacao_norm": {"$in": ["ARROZ", "FEIJAO"]},
        "confirmado": True,
    }


def test_aprendizado_key_isola_por_tabela():
    key = cotacao._aprendizado_key("user-1", "tabela-b", "ARROZ")

    assert key == {
        "user_id": "user-1",
        "tabela_id": "tabela-b",
        "produto_cotacao_norm": "ARROZ",
    }

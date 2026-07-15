import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import cotacao


def test_segunda_tabela_so_substitui_por_preco_menor():
    assert cotacao._deve_atualizar_menor_preco(1.65, 1.70) is True
    assert cotacao._deve_atualizar_menor_preco(1.70, 1.70) is False
    assert cotacao._deve_atualizar_menor_preco(1.76, 1.70) is False
    assert cotacao._deve_atualizar_menor_preco(1.70, None) is True


def test_item_preenchido_so_reprocessa_quando_informa_preco_atual():
    payload = cotacao.CotatudoPayload(
        tabela_id="507f1f77bcf86cd799439011",
        itens=[
            cotacao.CotatudoItem(
                idx=0,
                ean="7891032016625",
                filled=True,
                current_price=1.70,
                price_input_debug="inputs=1|pos=0|name=custo[1]",
            ),
            cotacao.CotatudoItem(idx=1, ean="7891032016626", filled=True),
            cotacao.CotatudoItem(idx=2, ean="7891032016627", filled=False),
        ],
    )

    itens = cotacao._cotatudo_itens_para_match(payload)

    assert [item["linha"] for item in itens] == [0, 2]
    assert itens[0]["current_price"] == 1.70
    assert itens[0]["price_input_debug"] == "inputs=1|pos=0|name=custo[1]"


def test_diagnostico_cotacao_registra_decisao_sem_nome_do_produto():
    diagnostics = cotacao._cotacao_diagnostics(
        [
            {"linha": 2, "ean": "7891032016625", "nome": "ACUCAR UNIAO", "current_price": 1.70},
            {"linha": 3, "ean": "7891032016626", "nome": "OUTRO PRODUTO"},
        ],
        [
            {"preco": 1.65, "tipo": "EAN"},
            {"preco": None, "tipo": None},
        ],
    )

    assert diagnostics[0].endswith("match=EAN|decisao=atualizar")
    assert diagnostics[1].endswith("match=nenhum|decisao=nao_encontrado")
    assert all("ACUCAR" not in line and "OUTRO" not in line for line in diagnostics)


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


def test_cotacao_temp_artifacts_default_to_twelve_hours():
    assert cotacao.COTACAO_TEMP_ARTIFACT_TTL_SECONDS == 12 * 60 * 60
    assert cotacao.COTACAO_COMPLETED_JOB_TTL_SECONDS == cotacao.COTACAO_TEMP_ARTIFACT_TTL_SECONDS
    assert cotacao.COTACAO_SESSION_TTL_SECONDS == cotacao.COTACAO_TEMP_ARTIFACT_TTL_SECONDS
    assert cotacao.COTACAO_ORPHAN_GRIDFS_TTL_SECONDS == cotacao.COTACAO_TEMP_ARTIFACT_TTL_SECONDS


def test_tabela_mestre_cleanup_rules_keep_one_week(monkeypatch):
    now = datetime(2026, 5, 28, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(cotacao, "COTACAO_TABELA_MESTRE_TTL_SECONDS", 8 * 24 * 60 * 60)

    recent = {"data_upload": now.replace(day=21)}
    stale = {"data_upload": now.replace(day=20)}
    missing_date = {}

    assert not cotacao._should_cleanup_tabela_mestre(recent, now)
    assert cotacao._should_cleanup_tabela_mestre(stale, now)
    assert not cotacao._should_cleanup_tabela_mestre(missing_date, now)


def test_cleanup_candidate_rules_skip_recent_and_running_jobs(monkeypatch):
    now = datetime(2026, 5, 28, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(cotacao, "COTACAO_COMPLETED_JOB_TTL_SECONDS", 3600)
    monkeypatch.setattr(cotacao, "COTACAO_STALE_ACTIVE_JOB_TTL_SECONDS", 1800)

    recent_done = {"_id": "done-recent", "status": "done", "created_at": now}
    stale_done = {"_id": "done-old", "status": "done", "created_at": now.replace(hour=0)}
    stale_processing = {"_id": "processing-old", "status": "processing", "created_at": now.replace(hour=0)}
    running_processing = {"_id": "running-old", "status": "processing", "created_at": now.replace(hour=0)}

    cotacao._running_job_ids.add("running-old")
    try:
        assert not cotacao._should_cleanup_cotacao_job(recent_done, now)
        assert cotacao._should_cleanup_cotacao_job(stale_done, now)
        assert cotacao._should_cleanup_cotacao_job(stale_processing, now)
        assert not cotacao._should_cleanup_cotacao_job(running_processing, now)
    finally:
        cotacao._running_job_ids.discard("running-old")


def test_confirmar_nao_grava_aprendizado_para_matches_ean():
    itens = [
        {"nome": "ARROZ TESTE 5KG"},
        {"nome": "FEIJAO TESTE 1KG"},
        {"nome": "MACARRAO TESTE 500G"},
    ]
    resultados = [
        {"preco": 10.0, "tipo": "EAN"},
        {"preco": 7.5, "tipo": "SIMILAR 92%"},
        {"preco": None, "tipo": None},
    ]

    ops = cotacao._build_aprendizado_ops(
        "user-1",
        "tabela-a",
        itens,
        resultados,
        [True, True, False],
        datetime.now(timezone.utc),
    )

    assert len(ops) == 1
    assert ops[0]._filter == {
        "user_id": "user-1",
        "tabela_id": "tabela-a",
        "produto_cotacao_norm": "FEIJAO TESTE 1KG",
    }


def test_confirmar_aplica_precos_editados_antes_do_aprendizado():
    resultados = [
        {"linha": 2, "preco": 10.0, "tipo": "EAN"},
        {"linha": 3, "preco": 7.5, "tipo": "SIMILAR 92%"},
        {"linha": 4, "preco": None, "tipo": None},
    ]

    atualizados = cotacao._resultados_com_precos_editados(resultados, [9.8, 7.25, 3.0])

    assert atualizados[0]["preco"] == 9.8
    assert atualizados[1]["preco"] == 7.25
    assert atualizados[2]["preco"] == 3.0
    assert atualizados[2]["tipo"] == "MANUAL"
    assert resultados[0]["preco"] == 10.0

    ops = cotacao._build_aprendizado_ops(
        "user-1",
        "tabela-a",
        [{"nome": "ARROZ TESTE 5KG"}, {"nome": "FEIJAO TESTE 1KG"}, {"nome": "MACARRAO"}],
        atualizados,
        [True, True, True],
        datetime.now(timezone.utc),
    )

    assert len(ops) == 2
    assert ops[0]._doc["$set"]["preco"] == 7.25
    assert ops[1]._doc["$set"]["preco"] == 3.0


def test_cotacao_audit_metadata_sanitizes_to_counts():
    stats = {
        "ean": 1,
        "descricao": 1,
        "ia": 0,
        "aprendido": 0,
        "manual": 1,
        "sem_match": 2,
        "total": 5,
    }

    metadata = cotacao._cotacao_audit_metadata(
        source="cotacao_pronta",
        tabela_id="tabela-a",
        prazo=7,
        modo="completo",
        session_id="session-1",
        stats=stats,
    )

    assert metadata == {
        "source": "cotacao_pronta",
        "sessionId": "session-1",
        "jobId": None,
        "tabelaId": "tabela-a",
        "prazo": 7,
        "modo": "completo",
        "totalItens": 5,
        "preenchidos": 3,
        "semMatch": 2,
        "ean": 1,
        "descricao": 1,
        "ia": 0,
        "aprendido": 0,
        "manual": 1,
    }

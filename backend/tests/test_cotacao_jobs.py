import asyncio
import os
import sys
from datetime import datetime, timezone

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


def test_tabela_mestre_cleanup_preserva_tabela_hospedada(monkeypatch):
    now = datetime(2026, 5, 28, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(cotacao, "COTACAO_TABELA_MESTRE_TTL_SECONDS", 8 * 24 * 60 * 60)

    shared = {"scope": cotacao.SHARED_TABLE_SCOPE, "data_upload": now.replace(day=1)}
    protected = {"protected": True, "data_upload": now.replace(day=1)}

    assert not cotacao._should_cleanup_tabela_mestre(shared, now)
    assert not cotacao._should_cleanup_tabela_mestre(protected, now)


def test_allowed_company_slugs_aceita_formatos_de_cadastro():
    data = {
        "allowedPriceDatabases": ["Destro", {"slug": "Spani", "enabled": True}, {"slug": "Muffato", "enabled": False}],
        "empresasLiberadas": {"Master Mix": True, "Bate Forte": False},
        "tabelasLiberadas": "Atacado Goiás; Compre Fácil",
    }

    assert cotacao._extract_allowed_company_slugs(data) == {
        "destro",
        "spani",
        "master-mix",
        "atacado-goias",
        "compre-facil",
    }


def test_acesso_tabela_hospedada_depende_do_atacado_liberado():
    tabela = {"scope": cotacao.SHARED_TABLE_SCOPE, "company_slug": "destro"}

    assert cotacao._user_can_access_table("user-1", tabela, {"destro"})
    assert not cotacao._user_can_access_table("user-1", tabela, {"spani"})


def test_acesso_tabela_hospedada_aceita_usuario_liberado_diretamente():
    tabela = {
        "scope": cotacao.SHARED_TABLE_SCOPE,
        "company_slug": "destro",
        "allowed_user_ids": ["user-1"],
    }

    assert cotacao._user_can_access_table("user-1", tabela, set())
    assert not cotacao._user_can_access_table("user-2", tabela, set())


def test_tabela_pessoal_antiga_continua_como_fallback_de_migracao():
    tabela = {"user_id": "user-1", "nome": "Tabela antiga"}

    assert cotacao._user_can_access_table("user-1", tabela, set())
    assert not cotacao._user_can_access_table("user-2", tabela, set())


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

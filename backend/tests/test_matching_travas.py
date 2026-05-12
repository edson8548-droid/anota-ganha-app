import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.matching_engine import nomes_incompativeis_v4, normalizar_nome

def _incompat(a, b):
    return nomes_incompativeis_v4(normalizar_nome(a), normalizar_nome(b))

def test_creme_dental_luminous_vs_mpa():
    assert _incompat(
        "CR DENT COLGATE LUMINOUS WHITE 70G",
        "CR DENT COLGATE MPA A/CARIE 90G"
    ), "LUMINOUS WHITE vs MPA deve ser bloqueado"

def test_creme_dental_nat_vs_mpa():
    assert _incompat(
        "CR DENT COLGATE NAT 90G COCO GENG DETOX",
        "CR DENT COLGATE MPA A/CARIE 90G"
    ), "NAT vs MPA deve ser bloqueado"

def test_creme_dental_total12_vs_mpa():
    assert _incompat(
        "CR DENT COLGATE TOTAL 12 90G WHITE",
        "CR DENT COLGATE MPA A/CARIE 90G"
    ), "TOTAL 12 vs MPA deve ser bloqueado"

def test_creme_dental_neutracucar_vs_total12():
    assert _incompat(
        "CR DENT COLGATE NEUTRACUCAR 70G",
        "CR DENT COLGATE TOTAL 12 90G"
    ), "NEUTRACUCAR vs TOTAL 12 deve ser bloqueado"

def test_creme_dental_sensitive_vs_mpa():
    assert _incompat(
        "CR DENT SENSODYNE SENSITIVE 90G",
        "CR DENT COLGATE MPA A/CARIE 90G"
    ), "SENSITIVE vs MPA deve ser bloqueado"

def test_creme_dental_mesma_linha_nao_bloqueia():
    """MPA vs MPA (mesmo produto) não deve ser bloqueado."""
    assert not _incompat(
        "CR DENT COLGATE MPA A/CARIE 90G",
        "CR DENT COLGATE MPA A CARIE 90G"
    ), "Mesma linha não deve ser bloqueada"

def test_pesos_diferentes_ja_bloqueiam():
    """70G vs 180G já é bloqueado pela trava de peso existente — regressão."""
    assert _incompat(
        "CR DENT COLGATE MPA A/CARIE 180G",
        "CR DENT COLGATE MPA A/CARIE 50G"
    ), "Pesos muito diferentes (50G vs 180G) devem ser bloqueados"

def test_creme_dental_total12_notacao_nao_bloqueia():
    """TOTAL 12 vs TOTAL12 são a mesma linha — normalização resolve."""
    assert not _incompat(
        "CR DENT COLGATE TOTAL 12 90G WHITE",
        "CR DENT COLGATE TOTAL12 90G WHITE"
    ), "TOTAL 12 vs TOTAL12 não deve bloquear"

def test_creme_dental_neutracucar_grafia_nao_bloqueia():
    """NEUTRACUCAR vs NEUTRAZUCAR são a mesma linha."""
    assert not _incompat(
        "CR DENT COLGATE NEUTRACUCAR 70G",
        "CR DENT COLGATE NEUTRAZUCAR 70G"
    ), "NEUTRACUCAR vs NEUTRAZUCAR não deve bloquear"

def test_creme_dental_sensitive_sensivel_nao_bloqueia():
    """SENSITIVE vs SENSIVEL são a mesma linha."""
    assert not _incompat(
        "CR DENT SENSODYNE SENSIVEL 90G",
        "CR DENT SENSODYNE SENSITIVE 90G"
    ), "SENSITIVE vs SENSIVEL não deve bloquear"

def test_azeite_tipo_unico_nao_casa_com_extra_virgem():
    assert _incompat(
        "AZEITE GALO 250ML TIPO UNICO",
        "AZEITE 250ML VD EXT VIRG GALLO",
    ), "Azeite tipo único/tradicional não deve casar com extra virgem"

def test_azeite_extra_virgem_abreviado_nao_bloqueia():
    assert not _incompat(
        "AZEITE GALO 250ML EXTRA VIRGEM",
        "AZEITE 250ML VD EXT VIRG GALLO",
    ), "EXT VIRG deve normalizar como extra virgem"

def test_maionese_200g_nao_casa_com_pack_2x500g():
    assert _incompat(
        "MAIONESE HELMANNS POTE 200G",
        "MAIONESE HELLMANNS 2X500G TRAD",
    ), "Peso em pack 2X500G deve bloquear item 200G"

def test_maionese_hellmanns_nao_casa_com_quero():
    assert _incompat(
        "MAIONESE HELMANNS POTE 200G",
        "MAIONESE QUERO 200G SACHET",
    ), "Marca Hellmanns não deve casar com Quero mesmo com o mesmo peso"

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.matching_engine import encontrar_preco, nomes_incompativeis_v4, normalizar_nome, ordenar_palavras

def _incompat(a, b):
    return nomes_incompativeis_v4(normalizar_nome(a), normalizar_nome(b))

def _price_item(nome, preco):
    norm = normalizar_nome(nome)
    return {
        "orig": nome,
        "norm": norm,
        "ord": ordenar_palavras(norm),
        "preco": preco,
    }

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

def test_achocolatado_toddy_nao_casa_com_nescau():
    assert _incompat(
        "ACHOC. TODD 370GR",
        "ACHOC NESCAU 350G",
    ), "Toddy/Todd nao deve casar com Nescau"

def test_acendedor_tupi_nao_casa_com_taka_fogo():
    assert _incompat(
        "ACENDEDOR EM GEL TUPI",
        "GEL ACENDEDOR TAKA FOGO 500G",
    ), "Acendedor Tupi nao deve herdar preco Taka Fogo"

def test_alcool_46_liquido_nao_casa_com_gel_70():
    assert _incompat(
        "ALCOOL COPERALCOOL 46 GRAUS 500ML",
        "ALCOOL GEL COPERALCOOL 500G 70",
    ), "Alcool liquido 46 graus nao deve casar com alcool gel 70"

def test_amaciante_500ml_nao_casa_com_1l_colado():
    assert _incompat(
        "AMACIANTE VIDA MACIA 500MLGLICERINA E AMENDOAS",
        "AMAC VIDA MACIA 1L AMENDOAS",
    ), "Medida colada 500MLGLICERINA deve ser reconhecida e bloquear 1L"

def test_papel_aluminio_dimensao_diferente_bloqueia():
    assert _incompat(
        "PAPEL ALUM. WYDA 7,5MTX30CM",
        "PAPEL ALUM WYDA 45X4M",
    ), "Papel aluminio 30x7,5 nao deve casar com 45x4"

def test_vinho_branco_nao_casa_com_tinto():
    assert _incompat(
        "VINHO SANGUE DE BOI BRANCO SUAVE",
        "VIN SANGUEDEBOI 4L TINTO SUAVE",
    ), "Vinho branco nao deve casar com tinto"

def test_shampoo_unitario_nao_casa_com_kit():
    assert _incompat(
        "SH SEDA BAMBU 300ML",
        "SHAMP PANT 400ML+COND 175ML BAMBU",
    ), "Shampoo unitario nao deve casar com kit shampoo+condicionador"

def test_bic_soleil_nao_casa_com_sensitive():
    assert _incompat(
        "APAR. BARB. BIC SOLEIL C/1",
        "APAR BIC SENSITIVE LV7 PG5",
    ), "BIC Soleil nao deve casar com BIC Sensitive"

def test_coco_do_vale_nao_casa_com_outra_marca():
    assert _incompat(
        "COCO RALADO COCO DO VALE 100G",
        "COCO RAL SOCOCO 100G",
    ), "Coco do Vale nao deve casar com outra marca de coco ralado"

def test_coco_nordeste_nao_casa_com_outra_marca():
    assert _incompat(
        "COCO RALADO NORDESTE UM ADOC 100G",
        "COCO RAL SOCOCO 100G",
    ), "Coco Nordeste nao deve casar com outra marca de coco ralado"

def test_coco_ralado_sococo_nao_casa_com_flococo():
    assert _incompat(
        "COCO RALADO SOCOCO 100G",
        "COCO RALADO EM FLOCOS FLOCOCO",
    ), "Coco ralado Sococo nao deve casar com coco em flocos Flococo"

def test_matching_nao_usa_preco_sococo_para_flococo():
    item_sococo = _price_item("COCO RALADO SOCOCO 100G", 4.99)

    preco, tipo = encontrar_preco(
        "",
        "COCO RALADO EM FLOCOS FLOCOCO",
        {},
        [item_sococo],
        [item_sococo["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_desodorante_corpo_a_corpo_nao_casa_com_outra_marca():
    assert _incompat(
        "DESOD ROLLON CORPO A CORPO 50ML FRESCOR",
        "DES ROLL REXONA 50ML COTTON DRY",
    ), "Desodorante Corpo a Corpo nao deve casar com outra marca"

def test_gelatina_royal_nao_casa_com_oetker():
    assert _incompat(
        "GELATINA ROYAL 25G MORANGO",
        "GELATINA OETKER 20G MORANGO",
    ), "Gelatina Royal nao deve casar com Oetker"

def test_fralda_tamanho_diferente_bloqueia():
    assert _incompat(
        "FRAL BABYSEC U G PINTAD MG C32 GD",
        "FRAL BABYSEC U G PINTAD MG C38 MD",
    ), "Fralda GD nao deve casar com MD"

def test_salgadinho_torcida_nao_casa_com_piraque():
    assert _incompat(
        "SALG LUCKY TORCIDA 60G BACON",
        "SALG PIRAQUE COMID BUT 50G BACON",
    ), "Salgadinho Torcida nao deve casar com Piraque"

def test_papel_manteiga_nao_casa_com_aluminio():
    assert _incompat(
        "PAPEL MANTEIGA WYDA",
        "PAPEL ALUM WYDA 30X4 MTS",
    ), "Papel manteiga nao deve casar com papel aluminio"

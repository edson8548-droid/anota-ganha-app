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

def test_caldo_knorr_bacon_costela_nao_casa_com_galinha_ou_carne():
    assert _incompat(
        "CALDO KNORR 57G BACON E COSTELA",
        "CALDO KNORR 57G GALINHA",
    ), "Caldo bacon e costela nao deve casar com galinha"
    assert _incompat(
        "CALDO KNORR 57G BACON E COSTELA",
        "CALDO KNORR 57G CARNE",
    ), "Caldo bacon e costela nao deve casar com carne"

def test_matching_nao_usa_preco_galinha_ou_carne_para_caldo_bacon_costela():
    item_galinha = _price_item("CALDO KNORR 57G GALINHA", 2.49)
    item_carne = _price_item("CALDO KNORR 57G CARNE", 2.59)

    preco, tipo = encontrar_preco(
        "",
        "CALDO KNORR 57G BACON E COSTELA",
        {},
        [item_galinha, item_carne],
        [item_galinha["norm"], item_carne["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_travas_muffato_bloqueiam_marca_categoria_fragrancia_e_embalagem():
    casos = [
        (
            "AGUA SANIT CANDURA 2L",
            "AGUA SAN ALPES 2L",
            "agua sanitaria com marcas diferentes nao deve casar",
        ),
        (
            "AGUA SANIT CANDURA 5L",
            "AGUA SAN DA ILHA FC 5L",
            "agua sanitaria com marca conhecida nao deve casar com item sem essa marca",
        ),
        (
            "ALCOOL COPERALCOOL 46 1L LAVANDA ORIENT",
            "ALCOOL COPERALCOOL EUCALIPTO 46 1L",
            "alcool com fragrancias diferentes nao deve casar",
        ),
        (
            "CREOLINA UFENOL 750ML",
            "VINHO COLLINA 750ML",
            "creolina nao deve casar com vinho pelo volume",
        ),
        (
            "DETERG LIQ YPE 500ML LIMAO",
            "LIMPA VID LIMPOL REF 500ML",
            "detergente de louca nao deve casar com limpa vidro",
        ),
        (
            "DESINF PINHO SOL 500ML LAVANDA",
            "DESINF PINHO SOL 500ML, LEMON, .",
            "desinfetante lavanda nao deve casar com lemon",
        ),
        (
            "DESINF PINHO SOL 500ML LAVANDA",
            "DESINF PINHO SOL 500ML, ORIG, .",
            "desinfetante com fragrancia nao deve casar com original",
        ),
        (
            "DESINF PINHO SOL 500ML LAVANDA",
            "DESINF PINHO SOL 500ML, CITRUS LAV, .",
            "desinfetante lavanda nao deve casar com combinacao citrus lavanda",
        ),
        (
            "FRALDA PAMPERS CONFORT SEC M C/26",
            "FRAL PAMPERS CONFORT SEC M C/24",
            "fralda com quantidade diferente nao deve casar",
        ),
        (
            "INSET RAID ELETRICO APARELHO + 4 PAST C/12",
            "INSET RAID 45 NOITES",
            "inseticida aparelho/pastilha nao deve casar com refil por noites",
        ),
    ]

    for cotacao, tabela, motivo in casos:
        assert _incompat(cotacao, tabela), motivo

def test_matching_muffato_nao_usa_preco_errado_em_casos_riscados():
    itens = [
        _price_item("AGUA SAN ALPES 2L", 4.99),
        _price_item("AGUA SAN DA ILHA FC 5L", 12.03),
        _price_item("ALCOOL COPERALCOOL EUCALIPTO 46 1L", 8.99),
        _price_item("VINHO COLLINA 750ML", 18.99),
        _price_item("LIMPA VID LIMPOL REF 500ML", 5.49),
        _price_item("DESINF PINHO SOL 500ML, LEMON, .", 6.67),
        _price_item("DESINF PINHO SOL 500ML, ORIG, .", 6.49),
        _price_item("DESINF PINHO SOL 500ML, CITRUS LAV, .", 6.89),
        _price_item("FRAL PAMPERS CONFORT SEC M C/24", 33.99),
        _price_item("INSET RAID 45 NOITES", 29.99),
    ]

    for nome in [
        "AGUA SANIT CANDURA 2L",
        "AGUA SANIT CANDURA 5L",
        "ALCOOL COPERALCOOL 46 1L LAVANDA ORIENT",
        "CREOLINA UFENOL 750ML",
        "DETERG LIQ YPE 500ML LIMAO",
        "DESINF PINHO SOL 500ML LAVANDA",
        "FRALDA PAMPERS CONFORT SEC M C/26",
        "INSET RAID ELETRICO APARELHO + 4 PAST C/12",
    ]:
        preco, tipo = encontrar_preco("", nome, {}, itens, [item["norm"] for item in itens])
        assert preco is None
        assert tipo is None

def test_caldo_knorr_114g_nao_cruza_sabores():
    sabores = ["CARNE", "COSTELA", "GALINHA", "LEGUMES"]
    for sabor_a in sabores:
        for sabor_b in sabores:
            if sabor_a == sabor_b:
                continue
            assert _incompat(
                f"CALDO KNORR 114G {sabor_a}",
                f"CALDO KNORR 114G {sabor_b}",
            ), f"Caldo Knorr 114G {sabor_a} nao deve casar com {sabor_b}"

def test_coco_ralado_copra_sem_acucar_nao_casa_com_comum_ou_outra_marca():
    assert _incompat(
        "COCO RALADO COPRA S/ADICAO DE ACUCAR",
        "COCO RALADO COPRA 100G",
    ), "Coco ralado Copra sem acucar nao deve casar com Copra comum"
    assert _incompat(
        "COCO RALADO COPRA S/ADICAO DE ACUCAR",
        "COCO RALADO SOCOCO 100G",
    ), "Coco ralado Copra nao deve casar com Sococo"

def test_matching_nao_usa_preco_generico_para_coco_ralado_copra_sem_acucar():
    itens = [
        _price_item("COCO RALADO COPRA 100G", 2.00),
        _price_item("COCO RALADO SOCOCO 100G", 4.99),
        _price_item("COCO RALADO 100G", 2.00),
    ]

    preco, tipo = encontrar_preco(
        "",
        "COCO RALADO COPRA S/ADICAO DE ACUCAR",
        {},
        itens,
        [item["norm"] for item in itens],
    )

    assert preco is None
    assert tipo is None

def test_creme_de_cebola_knorr_nao_casa_com_kisabor():
    assert _incompat(
        "CREME DE CEBOLA KNORR",
        "CREME DE CEBOLA KISABOR",
    ), "Creme de cebola Knorr nao deve casar com Kisabor"

def test_matching_nao_usa_preco_kisabor_para_creme_de_cebola_knorr():
    item_kisabor = _price_item("CREME DE CEBOLA KISABOR", 3.99)

    preco, tipo = encontrar_preco(
        "",
        "CREME DE CEBOLA KNORR",
        {},
        [item_kisabor],
        [item_kisabor["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_extrato_elefante_nao_cruza_variedades():
    assert not _incompat(
        "EXTRATO DE TOMATE ELEFANTE POTE 300G TRADICIONAL",
        "EXTRATO ELEFANTE POTE 300G",
    ), "Extrato Elefante sem variedade explicita deve equivaler ao tradicional"
    assert _incompat(
        "EXTRATO DE TOMATE ELEFANTE POTE 300G TRADICIONAL",
        "EXTRATO DE TOMATE ELEFANTE POTE 300G CARNE DE PANELA",
    ), "Extrato tradicional nao deve casar com carne de panela"
    assert _incompat(
        "EXTRATO ELEFANTE POTE 300G",
        "EXTRATO DE TOMATE ELEFANTE POTE 300G CEB/ALHO",
    ), "Extrato tradicional nao deve casar com cebola/alho"

def test_extrato_tomate_nao_cruza_pote_sache_ou_marca():
    assert _incompat(
        "EXTRATO DE TOMATE ELEFANTE SACHÊ 300G",
        "EXTRATO DE TOMATE ELEFANTE POTE 300G",
    ), "Extrato Elefante sache nao deve casar com pote"
    assert _incompat(
        "EXTRATO DE TOMATE FUGINI SACHÊ 300G",
        "EXTRATO DE TOMATE ELEFANTE SACHÊ 300G",
    ), "Extrato Fugini nao deve casar com Elefante"

def test_matching_nao_usa_preco_errado_para_extrato_tomate():
    itens = [
        _price_item("EXTRATO DE TOMATE ELEFANTE POTE 300G", 4.29),
        _price_item("EXTRATO DE TOMATE ELEFANTE POTE 300G CARNE DE PANELA", 4.49),
        _price_item("EXTRATO DE TOMATE FUGINI POTE 300G", 3.79),
    ]

    preco_sache, tipo_sache = encontrar_preco(
        "",
        "EXTRATO DE TOMATE ELEFANTE SACHÊ 300G",
        {},
        itens,
        [item["norm"] for item in itens],
    )
    preco_fugini, tipo_fugini = encontrar_preco(
        "",
        "EXTRATO DE TOMATE FUGINI SACHÊ 300G",
        {},
        itens,
        [item["norm"] for item in itens],
    )
    preco_trad, tipo_trad = encontrar_preco(
        "",
        "EXTRATO DE TOMATE ELEFANTE POTE 300G TRADICIONAL",
        {},
        itens,
        [item["norm"] for item in itens],
    )

    assert preco_sache is None
    assert tipo_sache is None
    assert preco_fugini is None
    assert tipo_fugini is None
    assert preco_trad == 4.29
    assert tipo_trad is not None

def test_matching_nao_usa_preco_errado_para_extrato_quero_sache():
    itens = [
        _price_item("EXTRATO DE TOMATE QUERO POTE 300G", 4.19),
        _price_item("MOLHO DE TOMATE QUERO SACHE 300G", 2.29),
        _price_item("POLPA DE TOMATE QUERO SACHE 300G", 3.19),
        _price_item("EXTRATO DE TOMATE ELEFANTE SACHE 300G", 4.39),
        _price_item("EXTRATO DE TOMATE FUGINI SACHE 300G", 3.89),
    ]

    preco, tipo = encontrar_preco(
        "",
        "EXTRATO DE TOMATE QUERO SACHÊ 300G",
        {},
        itens,
        [item["norm"] for item in itens],
    )

    assert preco is None
    assert tipo is None

def test_extrato_salseretti_pote_nao_casa_com_outras_marcas_ou_sache():
    assert _incompat(
        "EXTRATO TOMATE SALSERETTI POTE 300G",
        "EXTRATO TOMATE ELEFANTE POTE 300G",
    ), "Extrato Salseretti nao deve casar com Elefante"
    assert _incompat(
        "EXTRATO TOMATE SALSERETTI POTE 300G",
        "EXTRATO TOMATE QUERO POTE 300G",
    ), "Extrato Salseretti nao deve casar com Quero"
    assert _incompat(
        "EXTRATO TOMATE SALSERETTI POTE 300G",
        "EXTRATO TOMATE SALSARETTI SACHE 300G",
    ), "Extrato Salseretti pote nao deve casar com sache"

def test_matching_nao_usa_preco_errado_para_extrato_salseretti_pote():
    itens = [
        _price_item("EXTRATO TOMATE ELEFANTE POTE 300G", 4.29),
        _price_item("EXTRATO TOMATE QUERO POTE 300G", 4.19),
        _price_item("EXTRATO TOMATE FUGINI POTE 300G", 3.79),
        _price_item("EXTRATO TOMATE SALSARETTI SACHE 300G", 3.99),
        _price_item("EXTRATO TOMATE SALSARETTI POTE 340G", 4.59),
    ]

    preco, tipo = encontrar_preco(
        "",
        "EXTRATO TOMATE SALSERETTI POTE 300G",
        {},
        itens,
        [item["norm"] for item in itens],
    )

    assert preco is None
    assert tipo is None

def test_ketchup_cepera_nao_casa_com_outra_marca():
    assert _incompat(
        "KETCHUP CEPERA TRADICIONAL 1KG",
        "KETCHUP QUERO TRADICIONAL 1KG",
    ), "Ketchup Cepera nao deve casar com Quero"
    assert _incompat(
        "KETCHUP CEPERA TRADICIONAL 1KG",
        "KETCHUP HEINZ TRADICIONAL 1KG",
    ), "Ketchup Cepera nao deve casar com Heinz"

def test_matching_nao_usa_preco_de_outra_marca_para_ketchup_cepera():
    itens = [
        _price_item("KETCHUP QUERO TRADICIONAL 1KG", 8.99),
        _price_item("KETCHUP HEINZ TRADICIONAL 1KG", 14.99),
        _price_item("KETCHUP HELLMANNS TRADICIONAL 1KG", 11.49),
    ]

    preco, tipo = encontrar_preco(
        "",
        "Ketchup Cepêra Tradicional 1KG",
        {},
        itens,
        [item["norm"] for item in itens],
    )

    assert preco is None
    assert tipo is None

def test_ketchup_consumo_normaliza_para_konsumo_e_nao_casa_com_outra_marca():
    assert normalizar_nome("KETCHUP CONSUMO 200G") == "KETCHUP KONSUMO 200G"
    assert _incompat(
        "KETCHUP CONSUMO 200G",
        "KETCHUP QUERO 200G",
    ), "Ketchup Konsumo/Consumo nao deve casar com Quero"
    assert _incompat(
        "KETCHUP CONSUMO 200G",
        "KETCHUP HEINZ 200G",
    ), "Ketchup Konsumo/Consumo nao deve casar com Heinz"

def test_matching_nao_usa_preco_de_outra_marca_para_ketchup_consumo():
    itens = [
        _price_item("KETCHUP 200G", 2.99),
        _price_item("KETCHUP TRADICIONAL 200G", 3.19),
        _price_item("KETCHUP QUERO 200G", 3.49),
        _price_item("KETCHUP HEINZ 200G", 5.99),
        _price_item("KETCHUP CEPERA 200G", 4.49),
    ]

    preco, tipo = encontrar_preco(
        "",
        "KETCHUP CONSUMO 200G",
        {},
        itens,
        [item["norm"] for item in itens],
    )

    assert preco is None
    assert tipo is None

def test_maionese_hellmanns_limao_nao_casa_com_tradicional():
    assert _incompat(
        "MAIONESE HELLMANNS LIMAO 500G",
        "MAIONESE HELLMANNS 500G",
    ), "Maionese Hellmanns limao nao deve casar com versao sem limao"
    assert _incompat(
        "MAIONESE HELLMANNS LIMAO 500G",
        "MAIONESE HELLMANNS TRADICIONAL 500G",
    ), "Maionese Hellmanns limao nao deve casar com tradicional"

def test_matching_nao_usa_preco_tradicional_para_maionese_hellmanns_limao():
    itens = [
        _price_item("MAIONESE HELLMANNS 500G", 9.99),
        _price_item("MAIONESE HELLMANNS TRADICIONAL 500G", 10.49),
        _price_item("MAIONESE HELLMANNS LIGHT 500G", 11.49),
    ]

    preco, tipo = encontrar_preco(
        "",
        "MAIONESE HELLMANNS LIMAO 500G",
        {},
        itens,
        [item["norm"] for item in itens],
    )

    assert preco is None
    assert tipo is None

def test_maionese_suavit_nao_casa_com_outra_marca():
    assert _incompat(
        "MAIONESE SUAVIT 500G",
        "MAIONESE QUERO 500G",
    ), "Maionese Suavit nao deve casar com Quero"
    assert _incompat(
        "MAIONESE SUAVIT 500G",
        "MAIONESE HELLMANNS 500G",
    ), "Maionese Suavit nao deve casar com Hellmanns"

def test_matching_nao_usa_preco_de_outra_marca_para_maionese_suavit():
    itens = [
        _price_item("MAIONESE QUERO 500G", 7.99),
        _price_item("MAIONESE HELLMANNS 500G", 10.99),
        _price_item("MAIONESE HEINZ 500G", 11.49),
    ]

    preco, tipo = encontrar_preco(
        "",
        "MAIONESE SUAVIT 500G",
        {},
        itens,
        [item["norm"] for item in itens],
    )

    assert preco is None
    assert tipo is None

def test_maionese_saude_vigor_quero_respeita_marca():
    assert _incompat(
        "MAIONESE SAUDE 500G",
        "MAIONESE QUERO 500G",
    ), "Maionese Saude nao deve pegar preco de Quero"
    assert _incompat(
        "MAIONESE VIGOR 500G",
        "MAIONESE QUERO 500G",
    ), "Maionese Vigor nao deve pegar preco de Quero"
    assert _incompat(
        "MAIONESE QUERO 500G",
        "MAIONESE SAUDE 500G",
    ), "Maionese Quero nao deve pegar preco de Saude"

def test_matching_nao_usa_preco_quero_para_maionese_saude_ou_vigor():
    item_quero = _price_item("MAIONESE QUERO 500G", 7.99)

    for nome in ("MAIONESE SAUDE 500G", "MAIONESE VIGOR 500G"):
        preco, tipo = encontrar_preco(
            "",
            nome,
            {},
            [item_quero],
            [item_quero["norm"]],
        )

        assert preco is None
        assert tipo is None

def test_matching_mantem_preco_maionese_saude_e_vigor_quando_marca_confere():
    itens = [
        _price_item("MAIONESE SAUDE 500G", 8.49),
        _price_item("MAIONESE VIGOR 500G", 8.99),
    ]

    for item in itens:
        preco, tipo = encontrar_preco(
            "",
            item["orig"],
            {},
            itens,
            [i["norm"] for i in itens],
        )

        assert preco == item["preco"]
        assert tipo is not None

def test_molho_fugini_bolonhesa_nao_casa_com_quero_ou_tradicional():
    assert _incompat(
        "MOLHO FUGINI 300G BOLONHESA",
        "MOLHO QUERO 300G BOLONHESA",
    ), "Molho Fugini nao deve casar com Quero"
    assert _incompat(
        "MOLHO FUGINI 300G BOLONHESA",
        "MOLHO FUGINI TRADICIONAL 300G",
    ), "Molho Fugini bolonhesa nao deve casar com tradicional"
    assert _incompat(
        "MOLHO QUERO TRADICIONAL 300G",
        "MOLHO QUERO 300G BOLONHESA",
    ), "Molho Quero tradicional nao deve casar com bolonhesa"

def test_matching_nao_usa_preco_errado_para_molho_fugini_e_quero_tradicional():
    itens_fugini = [
        _price_item("MOLHO QUERO 300G BOLONHESA", 2.69),
        _price_item("MOLHO FUGINI TRADICIONAL 300G", 2.49),
        _price_item("MOLHO QUERO TRADICIONAL 300G", 2.59),
    ]
    preco_fugini, tipo_fugini = encontrar_preco(
        "",
        "MOLHO FUGINI 300G BOLONHESA",
        {},
        itens_fugini,
        [item["norm"] for item in itens_fugini],
    )

    itens_quero = [
        _price_item("MOLHO QUERO 300G BOLONHESA", 2.69),
        _price_item("MOLHO QUERO 300G PIZZA", 2.79),
        _price_item("MOLHO FUGINI TRADICIONAL 300G", 2.49),
    ]
    preco_quero, tipo_quero = encontrar_preco(
        "",
        "MOLHO QUERO TRADICIONAL 300G",
        {},
        itens_quero,
        [item["norm"] for item in itens_quero],
    )

    assert preco_fugini is None
    assert tipo_fugini is None
    assert preco_quero is None
    assert tipo_quero is None

def test_sardinha_nao_cruza_tipos_de_conserva_ou_sabor():
    tipos = ["DEFUMADO", "LIMAO", "MOLHO", "PICANTE", "OLEO"]
    for tipo_a in tipos:
        for tipo_b in tipos:
            if tipo_a == tipo_b:
                continue
            assert _incompat(
                f"SARDINHA GOMES DA COSTA {tipo_a} 125G",
                f"SARDINHA GOMES DA COSTA {tipo_b} 125G",
            ), f"Sardinha {tipo_a} nao deve casar com {tipo_b}"

def test_matching_nao_usa_mesmo_preco_para_todos_tipos_de_sardinha():
    itens = [
        _price_item("SARDINHA GOMES DA COSTA LIMAO 125G", 5.11),
        _price_item("SARDINHA GOMES DA COSTA MOLHO 125G", 5.11),
        _price_item("SARDINHA GOMES DA COSTA PICANTE 125G", 5.11),
        _price_item("SARDINHA GOMES DA COSTA OLEO 125G", 5.11),
    ]

    preco, tipo = encontrar_preco(
        "",
        "SARDINHA GOMES DA COSTA DEFUMADO 125G",
        {},
        itens,
        [item["norm"] for item in itens],
    )

    assert preco is None
    assert tipo is None

def test_base_conhecimento_bloqueia_sabores_tang_diferentes():
    assert _incompat(
        "REF PO TANG LARANJA 18G",
        "REF PO TANG UVA 18G",
    ), "Base externa deve bloquear sabores Tang diferentes"

def test_base_conhecimento_bloqueia_categoria_ype_diferente():
    assert _incompat(
        "DETERGENTE YPE NEUTRO 500ML",
        "DESINFETANTE YPE PINHO LAVANDA 500ML",
    ), "Base externa deve bloquear detergente contra desinfetante"

def test_base_conhecimento_bloqueia_fragrancia_multiuso_diferente():
    assert _incompat(
        "MULTIUSO VEJA LAVANDA 500ML",
        "MULTIUSO VEJA FLORAL 500ML",
    ), "Base externa deve bloquear fragrancias diferentes"

def test_base_conhecimento_nao_bloqueia_mesmo_produto():
    assert not _incompat(
        "DETERGENTE YPE NEUTRO 500ML",
        "DETERGENTE YPE NEUTRO 500 ML",
    ), "Base externa nao deve bloquear o mesmo produto"

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

def test_shampoo_seda_nao_casa_com_salon_line():
    assert _incompat(
        "SHAMPOO SEDA CERAMIDAS 325ML",
        "SHAMPOO SALON LINE CERAMIDAS 300ML",
    ), "Shampoo Seda nao deve casar com Salon Line mesmo com linha parecida"

def test_matching_nao_usa_preco_salon_line_para_shampoo_seda():
    item_salon_line = _price_item("SHAMPOO SALON LINE CERAMIDAS 300ML", 8.99)

    preco, tipo = encontrar_preco(
        "",
        "SHAMPOO SEDA CERAMIDAS 325ML",
        {},
        [item_salon_line],
        [item_salon_line["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_agua_sanitaria_qboa_nao_casa_com_outra_marca():
    assert "QBOA" in normalizar_nome("AGUA SANIT Q BOA 1 LT")
    assert _incompat(
        "AGUA SANIT Q BOA 1 LT",
        "AGUA SANITARIA BRILUX 1L",
    ), "Agua sanitaria Qboa nao deve casar com Brilux"
    assert _incompat(
        "AGUA SANIT QBOA 1L",
        "AGUA SANITARIA 1L",
    ), "Agua sanitaria com marca conhecida nao deve casar com item sem marca"

def test_matching_nao_usa_preco_outra_marca_para_agua_sanitaria_qboa():
    itens = [
        _price_item("AGUA SANITARIA BRILUX 1L", 2.49),
        _price_item("AGUA SANITARIA 1L", 2.19),
    ]

    preco, tipo = encontrar_preco(
        "",
        "AGUA SANIT Q BOA 1 LT",
        {},
        itens,
        [item["norm"] for item in itens],
    )

    assert preco is None
    assert tipo is None

def test_matching_mantem_preco_quando_marca_shampoo_confere():
    item_seda = _price_item("SHAMPOO SEDA CERAMIDAS 325ML", 8.99)

    preco, tipo = encontrar_preco(
        "",
        "SHAMPOO SEDA CERAMIDAS 325ML",
        {},
        [item_seda],
        [item_seda["norm"]],
    )

    assert preco == 8.99
    assert tipo is not None

def test_batata_pringles_original_nao_casa_com_outros_sabores():
    assert _incompat(
        "BATATA PRINGLES QUEIJO 109G",
        "BATATA PRINGLES ORIGINAL 109G",
    ), "Pringles queijo nao deve pegar preco do Original"
    assert _incompat(
        "BATATA PRINGLES CHURRASCO 109G",
        "BATATA PRINGLES ORIGINAL 109G",
    ), "Pringles churrasco nao deve pegar preco do Original"

def test_batata_pringles_nao_casa_com_marca_propria_muffato():
    assert _incompat(
        "BATATA PRINGLES QUEIJO 109G",
        "BATATA MUFFATO QUEIJO 100G",
    ), "Pringles nao deve pegar preco de marca propria Muffato"

def test_matching_nao_usa_preco_pringles_original_para_queijo():
    item_original = _price_item("BATATA PRINGLES ORIGINAL 109G", 11.90)

    preco, tipo = encontrar_preco(
        "",
        "BATATA PRINGLES QUEIJO 109G",
        {},
        [item_original],
        [item_original["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_matching_mantem_preco_quando_pringles_original_confere():
    item_original = _price_item("BATATA PRINGLES ORIGINAL 109G", 11.90)

    preco, tipo = encontrar_preco(
        "",
        "BATATA PRINGLES ORIGINAL 109G",
        {},
        [item_original],
        [item_original["norm"]],
    )

    assert preco == 11.90
    assert tipo is not None

def test_matching_corrige_pingles_e_mantem_preco_original():
    item_original = _price_item("BATATA PRINGLES 109G ORIGINAL", 11.90)

    preco, tipo = encontrar_preco(
        "",
        "BATATA PINGLES 109GR ORIGINAL",
        {},
        [item_original],
        [item_original["norm"]],
    )

    assert "PRINGLES" in normalizar_nome("BATATA PINGLES 109GR ORIGINAL")
    assert preco == 11.90
    assert tipo is not None

def test_acucar_uniao_fit_nao_casa_com_magro_400g():
    assert _incompat(
        "ACUCAR UNIAO FIT 400G",
        "ACUCAR MAGRO 400G",
    ), "Acucar Uniao Fit nao deve pegar preco de Magro 400g"

def test_matching_nao_usa_preco_magro_para_acucar_uniao_fit():
    item_magro = _price_item("ACUCAR MAGRO 400G", 6.90)

    preco, tipo = encontrar_preco(
        "",
        "ACUCAR UNIAO FIT 400G",
        {},
        [item_magro],
        [item_magro["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_agua_coco_campo_largo_nao_casa_com_sococo():
    assert _incompat(
        "AGUA DE COCO CAMPO LARGO 1L",
        "AGUA DE COCO SO COCO 1L",
    ), "Agua de coco Campo Largo nao deve pegar preco de So Coco"

def test_algodao_apolo_nao_casa_com_outra_marca():
    assert _incompat(
        "ALGODAO APOLO 50G",
        "ALGODAO FAROL 50G",
    ), "Algodao Apolo nao deve pegar preco de outra marca"

def test_alcool_gel_copera_nao_casa_com_outra_marca():
    assert "COPERALCOOL" in normalizar_nome("ALCOOL GEL COPERA 500G")
    assert _incompat(
        "ALCOOL GEL COPERA 500G",
        "ALCOOL GEL TUPI 500G",
    ), "Alcool gel Copera/Coperalcool nao deve pegar preco de outra marca"

def test_bombril_nao_casa_com_sabao_ou_detergente():
    assert _incompat(
        "BOMBRIL 8UN",
        "SABAO BRILHANTE 800G",
    ), "Bombril/la de aco nao deve pegar preco de sabao"
    assert _incompat(
        "BOMBRIL 8UN",
        "DETERGENTE BRILHANTE 500ML",
    ), "Bombril/la de aco nao deve pegar preco de detergente"

def test_amido_neilar_nao_casa_com_kimimo_ou_maizena():
    assert _incompat(
        "AMIDO NEILAR 500GR",
        "AMIDO KIMIMO 500G",
    ), "Amido Neilar nao deve pegar preco de Kimimo"
    assert _incompat(
        "AMIDO NEILAR 500GR",
        "AMIDO MAIZENA 500G",
    ), "Amido Neilar nao deve pegar preco de Maizena"

def test_matching_nao_usa_preco_kimimo_para_amido_neilar():
    item_kimimo = _price_item("AMIDO KIMIMO 500G", 4.99)

    preco, tipo = encontrar_preco(
        "",
        "AMIDO NEILAR 500GR",
        {},
        [item_kimimo],
        [item_kimimo["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_anil_liquido_colman_nao_casa_com_outra_marca():
    assert _incompat(
        "ANIL LIQUIDO COLMAN 200ML",
        "ANIL LIQUIDO GLOBO 200ML",
    ), "Anil liquido Colman nao deve pegar preco de outra marca"

def test_cafe_melitta_250g_nao_casa_com_500g():
    assert "MELITTA" in normalizar_nome("CAFE MELITA VACUO 250GR TRAD")
    assert _incompat(
        "CAFE MELITA VACUO 250GR TRAD",
        "CAFE MELLITA 500GR TRAD",
    ), "Cafe Melitta 250g nao deve pegar preco de 500g"

def test_matching_nao_usa_preco_cafe_melitta_500g_para_250g():
    item_500g = _price_item("CAFE MELLITA 500GR TRAD", 23.90)

    preco, tipo = encontrar_preco(
        "",
        "CAFE MELITA VACUO 250GR TRAD",
        {},
        [item_500g],
        [item_500g["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_matching_mantem_preco_cafe_melitta_250g_quando_peso_confere():
    item_250g = _price_item("CAFE MELITTA VACUO 250G TRAD", 12.90)

    preco, tipo = encontrar_preco(
        "",
        "CAFE MELITA VACUO 250GR TRAD",
        {},
        [item_250g],
        [item_250g["norm"]],
    )

    assert preco == 12.90
    assert tipo is not None

def test_catchup_quero_400g_nao_casa_com_outro_peso():
    assert normalizar_nome("CATCHUP QUERO 400GR TRAD").startswith("KETCHUP QUERO")
    assert _incompat(
        "CATCHUP QUERO 400GR TRAD",
        "KETCHUP QUERO 200G TRAD",
    ), "Ketchup Quero 400g nao deve pegar preco de 200g"
    assert _incompat(
        "CATCHUP QUERO 400GR TRAD",
        "KETCHUP QUERO 1KG TRAD",
    ), "Ketchup Quero 400g nao deve pegar preco de 1kg"

def test_matching_mantem_preco_catchup_quero_400g_quando_peso_confere():
    item_400g = _price_item("KETCHUP QUERO 400G TRAD", 5.49)

    preco, tipo = encontrar_preco(
        "",
        "CATCHUP QUERO 400GR TRAD",
        {},
        [item_400g],
        [item_400g["norm"]],
    )

    assert preco == 5.49
    assert tipo is not None

def test_catchup_quero_400g_picante_nao_casa_com_tradicional_ou_generico():
    assert _incompat(
        "CATCHUP QUERO 400GR PICANTE",
        "KETCHUP QUERO 400G TRAD",
    ), "Ketchup Quero picante nao deve pegar preco do tradicional"
    assert _incompat(
        "CATCHUP QUERO 400GR PICANTE",
        "KETCHUP QUERO 400G",
    ), "Ketchup Quero picante nao deve pegar preco de item sem variedade"

def test_matching_nao_usa_preco_ketchup_quero_trad_para_picante():
    item_trad = _price_item("KETCHUP QUERO 400G TRAD", 5.49)

    preco, tipo = encontrar_preco(
        "",
        "CATCHUP QUERO 400GR PICANTE",
        {},
        [item_trad],
        [item_trad["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_matching_mantem_preco_catchup_quero_picante_quando_variedade_confere():
    item_picante = _price_item("KETCHUP QUERO 400G PICANTE", 5.89)

    preco, tipo = encontrar_preco(
        "",
        "CATCHUP QUERO 400GR PICANTE",
        {},
        [item_picante],
        [item_picante["norm"]],
    )

    assert preco == 5.89
    assert tipo is not None

def test_copo_copobras_50ml_nao_casa_com_cristalcopo():
    assert _incompat(
        "COPO COPOBRAS 50ML",
        "COPO CRISTALCOPO 50ML",
    ), "Copo Copobras nao deve pegar preco de Cristalcopo"

def test_matching_nao_usa_preco_cristalcopo_para_copobras():
    item_cristal = _price_item("COPO CRISTALCOPO 50ML", 3.99)

    preco, tipo = encontrar_preco(
        "",
        "COPO COPOBRAS 50ML",
        {},
        [item_cristal],
        [item_cristal["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_matching_mantem_preco_copo_copobras_quando_marca_confere():
    item_copobras = _price_item("COPO COPOBRAS 50ML", 4.49)

    preco, tipo = encontrar_preco(
        "",
        "COPO COPOBRAS 50ML",
        {},
        [item_copobras],
        [item_copobras["norm"]],
    )

    assert preco == 4.49
    assert tipo is not None

def test_copo_copobras_180ml_nao_casa_com_50ml_ou_cristalcopo():
    assert _incompat(
        "COPO COPOBRAS 180ML",
        "COPO COPOBRAS 50ML",
    ), "Copo Copobras 180ml nao deve pegar preco de Copobras 50ml"
    assert _incompat(
        "COPO COPOBRAS 180ML",
        "COPO CRISTALCOPO 180ML",
    ), "Copo Copobras 180ml nao deve pegar preco de Cristalcopo"

def test_matching_nao_usa_preco_copobras_50ml_para_copobras_180ml():
    item_50ml = _price_item("COPO COPOBRAS 50ML", 4.49)

    preco, tipo = encontrar_preco(
        "",
        "COPO COPOBRAS 180ML",
        {},
        [item_50ml],
        [item_50ml["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_matching_mantem_preco_copo_copobras_180ml_quando_volume_confere():
    item_180ml = _price_item("COPO COPOBRAS 180ML", 7.99)

    preco, tipo = encontrar_preco(
        "",
        "COPO COPOBRAS 180ML",
        {},
        [item_180ml],
        [item_180ml["norm"]],
    )

    assert preco == 7.99
    assert tipo is not None

def test_copo_copobras_300ml_nao_casa_com_outro_volume_ou_cristalcopo():
    assert _incompat(
        "COPO COPOBRAS 300ML",
        "COPO COPOBRAS 180ML",
    ), "Copo Copobras 300ml nao deve pegar preco de Copobras 180ml"
    assert _incompat(
        "COPO COPOBRAS 300ML",
        "COPO COPOBRAS 50ML",
    ), "Copo Copobras 300ml nao deve pegar preco de Copobras 50ml"
    assert _incompat(
        "COPO COPOBRAS 300ML",
        "COPO CRISTALCOPO 300ML",
    ), "Copo Copobras 300ml nao deve pegar preco de Cristalcopo"

def test_matching_nao_usa_preco_copobras_180ml_para_copobras_300ml():
    item_180ml = _price_item("COPO COPOBRAS 180ML", 7.99)

    preco, tipo = encontrar_preco(
        "",
        "COPO COPOBRAS 300ML",
        {},
        [item_180ml],
        [item_180ml["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_matching_mantem_preco_copo_copobras_300ml_quando_volume_confere():
    item_300ml = _price_item("COPO COPOBRAS 300ML", 9.99)

    preco, tipo = encontrar_preco(
        "",
        "COPO COPOBRAS 300ML",
        {},
        [item_300ml],
        [item_300ml["norm"]],
    )

    assert preco == 9.99
    assert tipo is not None

def test_creme_de_leite_nestle_nao_casa_com_generico_ou_outra_marca():
    assert _incompat(
        "CREME DE LEITE NESTLE TP 200GR",
        "CREME DE LEITE TP 200G",
    ), "Creme de leite Nestle nao deve pegar preco de item sem marca"
    assert _incompat(
        "CREME DE LEITE NESTLE TP 200GR",
        "CREME DE LEITE ITALAC TP 200G",
    ), "Creme de leite Nestle nao deve pegar preco de outra marca"

def test_matching_nao_usa_preco_generico_para_creme_de_leite_nestle():
    item_generico = _price_item("CREME DE LEITE TP 200G", 1.54)

    preco, tipo = encontrar_preco(
        "",
        "CREME DE LEITE NESTLE TP 200GR",
        {},
        [item_generico],
        [item_generico["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_matching_mantem_preco_creme_de_leite_nestle_quando_marca_confere():
    item_nestle = _price_item("CREME DE LEITE NESTLE TP 200G", 3.99)

    preco, tipo = encontrar_preco(
        "",
        "CREME DE LEITE NESTLE TP 200GR",
        {},
        [item_nestle],
        [item_nestle["norm"]],
    )

    assert preco == 3.99
    assert tipo is not None

def test_ervilha_quero_lata_170g_nao_casa_com_generico_ou_outra_marca():
    assert _incompat(
        "ERVILHA QUERO LATA 170GR",
        "ERVILHA LATA 170G",
    ), "Ervilha Quero nao deve pegar preco de item sem marca"
    assert _incompat(
        "ERVILHA QUERO LATA 170GR",
        "ERVILHA PREDILECTA LATA 170G",
    ), "Ervilha Quero nao deve pegar preco de outra marca"
    assert _incompat(
        "ERVILHA QUERO LATA 170GR",
        "MILHO QUERO LATA 170G",
    ), "Ervilha Quero nao deve pegar preco de milho Quero"

def test_matching_nao_usa_preco_generico_para_ervilha_quero_lata_170g():
    item_generico = _price_item("ERVILHA LATA 170G", 2.79)

    preco, tipo = encontrar_preco(
        "",
        "ERVILHA QUERO LATA 170GR",
        {},
        [item_generico],
        [item_generico["norm"]],
    )

    assert preco is None
    assert tipo is None

def test_matching_mantem_preco_ervilha_quero_lata_170g_quando_marca_confere():
    item_quero = _price_item("ERVILHA QUERO LT 170G", 3.49)

    preco, tipo = encontrar_preco(
        "",
        "ERVILHA QUERO LATA 170GR",
        {},
        [item_quero],
        [item_quero["norm"]],
    )

    assert preco == 3.49
    assert tipo is not None

def test_matching_mantem_preco_ervilha_quero_lata_170g_com_unidade_cx():
    item_quero = _price_item("ERVILHA QUERO LT 170G", 3.49)

    preco, tipo = encontrar_preco(
        "",
        "ERVILHA QUERO LATA 170GR CX",
        {},
        [item_quero],
        [item_quero["norm"]],
    )

    assert preco == 3.49
    assert tipo is not None

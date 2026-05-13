import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.product_knowledge import normalize_text, recognize_product


def test_ref_po_tang_laranja_18g():
    result = recognize_product("ref po tang laranja 18g")

    assert result["descricao_normalizada"] == "ref po tang laranja 18g"
    assert result["categoria"] == "refresco em po"
    assert result["marca"] == "Tang"
    assert result["sabor"] == "laranja"
    assert result["peso"] == "18g"
    assert result["confianca"] >= 0.9


def test_tang_uva_pct():
    result = recognize_product("tang uva pct")

    assert result["categoria"] == "refresco em po"
    assert result["marca"] == "Tang"
    assert result["sabor"] == "uva"
    assert result["embalagem"] == "pacote"


def test_tang_morango_18g():
    result = recognize_product("tang morango 18g")

    assert result["categoria"] == "refresco em po"
    assert result["marca"] == "Tang"
    assert result["sabor"] == "morango"
    assert result["peso"] == "18g"


def test_refresco_po_tang_maracuja():
    result = recognize_product("refresco po tang maracuja")

    assert result["categoria"] == "refresco em po"
    assert result["marca"] == "Tang"
    assert result["sabor"] == "maracuja"


def test_limp_casa_perfume_lavanda_1l():
    result = recognize_product("limp casa perfume lavanda 1l")

    assert result["categoria"] == "limpador perfumado"
    assert result["fragrancia"] == "lavanda"
    assert result["volume"] == "1l"


def test_desinfetante_pinho_2l():
    result = recognize_product("desinfetante pinho 2l")

    assert result["categoria"] == "desinfetante"
    assert result["fragrancia"] == "pinho"
    assert result["volume"] == "2l"


def test_limpador_floral_500ml():
    result = recognize_product("limpador floral 500ml")

    assert result["categoria"] == "limpador multiuso"
    assert result["fragrancia"] == "floral"
    assert result["volume"] == "500ml"


def test_amaciante_concentrado_1l():
    result = recognize_product("amaciante concentrado 1 litro")

    assert result["categoria"] == "amaciante"
    assert result["linha"] in {"concentrado", None}
    assert result["volume"] == "1l"


def test_detergente_ype_neutro_500ml_sem_acento():
    result = recognize_product("detergente ype neutro 500 ml")

    assert result["categoria"] == "detergente"
    assert result["marca"] == "Ype"
    assert result["linha"] == "neutro"
    assert result["volume"] == "500ml"


def test_multiuso_veja_lavanda_500ml():
    result = recognize_product("multiuso veja lavanda 500ml")

    assert result["categoria"] == "limpador multiuso"
    assert result["marca"] == "Veja"
    assert result["fragrancia"] == "lavanda"
    assert result["volume"] == "500ml"


def test_descricao_com_erro_de_digitacao_tangue():
    result = recognize_product("ref po tangue uva 18 gr")

    assert result["categoria"] == "refresco em po"
    assert result["marca"] == "Tang"
    assert result["sabor"] == "uva"
    assert result["peso"] == "18g"


def test_normalize_units_and_package_aliases():
    assert normalize_text("  Refresco  PÓ Tang 18 GR PCT ") == "ref po tang 18g pct"
    assert recognize_product("tang laranja pct")["embalagem"] == "pacote"

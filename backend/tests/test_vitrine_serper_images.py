import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import vitrine


def test_serper_search_uses_only_confident_image(monkeypatch):
    monkeypatch.setattr(
        vitrine,
        "_serper_images",
        lambda product_name, limit=6: {
            "found": True,
            "image_url": "https://cdn.example.com/review.jpg",
            "match": "serper",
            "images": [
                {"image_url": "https://cdn.example.com/review.jpg", "needs_review": True},
                {"image_url": "https://cdn.example.com/ok.jpg", "needs_review": False},
            ],
        },
    )

    assert vitrine._serper_search("ACHOC MUKY 1KG PO") == {
        "found": True,
        "image_url": "https://cdn.example.com/ok.jpg",
        "match": "serper",
    }


def test_serper_search_returns_empty_when_all_images_need_review(monkeypatch):
    monkeypatch.setattr(
        vitrine,
        "_serper_images",
        lambda product_name, limit=6: {
            "found": True,
            "image_url": "https://cdn.example.com/review.jpg",
            "match": "serper",
            "images": [{"image_url": "https://cdn.example.com/review.jpg", "needs_review": True}],
        },
    )

    assert vitrine._serper_search("ACHOC MUKY 1KG PO") == {
        "found": False,
        "image_url": None,
        "match": None,
    }


def test_serper_blocks_social_and_stock_candidates():
    assert vitrine._serper_block_reason({"link": "https://br.pinterest.com/produto"}) == "pinterest"
    assert vitrine._serper_block_reason({"title": "Foto de produto segurado na mao"}) == "foto de"


def test_serper_flags_probable_brand_missing():
    flags = vitrine._serper_match_flags(
        "ACHOC MUKY 1KG PO",
        {"title": "Achocolatado Italac 1kg", "link": "https://loja.example.com/italac-1kg"},
    )

    assert "marca_nao_confirmada" in flags

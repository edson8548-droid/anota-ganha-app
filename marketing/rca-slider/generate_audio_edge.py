import asyncio
from pathlib import Path

import edge_tts


ROOT = Path(__file__).resolve().parent
VOICE = "pt-BR-FranciscaNeural"
RATE = "+22%"
VOLUME = "+0%"

TEXTS = [
    "Representante comercial, suba sua tabela de preço no Venpro e depois carregue a cotação do cliente. Em poucos segundos a plataforma compara os itens, encontra os produtos certos e organiza os preços para você responder. Um trabalho de horas vira minutos.",
    "A Cotação Pronta cruza os produtos, reduz digitação e evita erro de preço. Você ganha velocidade para responder melhor e fechar mais pedidos no mesmo dia.",
    "Monte sua vitrine de ofertas com produtos de giro, fotos e preços. Gere um link profissional e envie para o cliente comprar direto pelo WhatsApp.",
    "Divulgue no WhatsApp com mensagens curtas e ofertas claras. Fale primeiro com clientes parados e transforme conversa em pedido sem perder tempo.",
    "Acompanhe campanhas, positivação e oportunidades da carteira. O Venpro ajuda você a vender mais, recuperar clientes e melhorar seus resultados.",
]


async def main():
    for index, text in enumerate(TEXTS, start=1):
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE, volume=VOLUME)
        await communicate.save(str(ROOT / f"audio-slide-{index}.mp3"))


if __name__ == "__main__":
    asyncio.run(main())

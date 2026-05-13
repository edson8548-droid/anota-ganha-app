import asyncio
from pathlib import Path

import edge_tts


ROOT = Path(__file__).resolve().parent
VOICE = "pt-BR-FranciscaNeural"
RATE = "+12%"
VOLUME = "+0%"

TEXTS = [
    "RCA, você ainda perde tempo montando cotação na mão? Com o Venpro, você transforma lista, oferta e WhatsApp em pedido fechado, com muito mais agilidade.",
    "Primeiro passo: receba a lista do cliente. Pode ser planilha, PDF ou mensagem. Suba no Venpro e deixe a Cotação Pronta organizar os produtos para você.",
    "Segundo passo: monte sua vitrine de ofertas. Escolha os produtos de maior giro, coloque fotos, preços e envie um link profissional para o cliente comprar pelo WhatsApp.",
    "Terceiro passo: divulgue no WhatsApp. Use mensagens curtas, ofertas claras e fale primeiro com clientes parados. O Venpro ajuda você a vender sem perder tempo.",
    "Quarto passo: acompanhe campanhas e positivação. Veja oportunidades, recupere clientes e aumente seus resultados. Venpro: mais vendas, mais resultados.",
]


async def main():
    for index, text in enumerate(TEXTS, start=1):
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE, volume=VOLUME)
        await communicate.save(str(ROOT / f"audio-slide-{index}.mp3"))


if __name__ == "__main__":
    asyncio.run(main())

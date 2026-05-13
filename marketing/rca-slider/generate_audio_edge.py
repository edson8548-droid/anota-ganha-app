import asyncio
from pathlib import Path

import edge_tts


ROOT = Path(__file__).resolve().parent
VOICE = "pt-BR-FranciscaNeural"
RATE = "+12%"
VOLUME = "+0%"

TEXTS = [
    "RCA, suba a sua tabela de preço. Depois pegue a tabela de cotação do seu cliente e veja a mágica acontecer em segundos. Um trabalho que levaria horas acontece em minutos.",
    "A Cotação Pronta cruza os produtos, organiza as informações e ajuda você a responder o cliente com muito mais agilidade.",
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

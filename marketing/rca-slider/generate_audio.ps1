Add-Type -AssemblyName System.Speech

$voiceName = "Microsoft Maria Desktop"
$texts = @(
  "RCA, voce ainda perde tempo montando cotacao na mao? Com o Venpro, voce transforma lista, oferta e WhatsApp em pedido fechado, com muito mais agilidade.",
  "Primeiro passo: receba a lista do cliente. Pode ser planilha, PDF ou mensagem. Suba no Venpro e deixe a Cotacao Pronta organizar os produtos para voce.",
  "Segundo passo: monte sua vitrine de ofertas. Escolha os produtos de maior giro, coloque fotos, precos e envie um link profissional para o cliente comprar pelo WhatsApp.",
  "Terceiro passo: divulgue no WhatsApp. Use mensagens curtas, ofertas claras e fale primeiro com clientes parados. O Venpro ajuda voce a vender sem perder tempo.",
  "Quarto passo: acompanhe campanhas e positivacao. Veja oportunidades, recupere clientes e aumente seus resultados. Venpro: mais vendas, mais resultados."
)

for ($i = 0; $i -lt $texts.Count; $i++) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice($voiceName)
  $synth.Rate = 2
  $synth.Volume = 100
  $out = Join-Path $PSScriptRoot ("audio-slide-" + ($i + 1) + ".wav")
  $synth.SetOutputToWaveFile($out)
  $synth.Speak($texts[$i])
  $synth.Dispose()
}

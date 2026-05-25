$RepoRoot = Split-Path -Parent $PSScriptRoot
$PromptPath = Join-Path $RepoRoot "docs\atendimento-whatsapp\agente-respostas-rca.md"
$Prompt = Get-Content -LiteralPath $PromptPath -Raw

codex -C $RepoRoot $Prompt

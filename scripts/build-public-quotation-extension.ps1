param(
    [string]$Version = "1.0.82"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repoRoot = Split-Path -Parent $PSScriptRoot
$currentExtensionRoot = Join-Path $repoRoot "chrome-extension"
$publicRoot = Join-Path $repoRoot "frontend\public"
$temporaryParent = Join-Path $repoRoot "tmp"
$temporaryRoot = Join-Path $temporaryParent "public-quotation-extension-$Version"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$versionedOutputs = @(
    (Join-Path $publicRoot "venpro-preencher-cotacao-$Version.zip"),
    (Join-Path $publicRoot "venpro-cotatudo-extension-$Version.zip")
)
$aliasOutputs = @(
    (Join-Path $publicRoot "venpro-preencher-cotacao.zip"),
    (Join-Path $publicRoot "venpro-cotatudo-extension.zip")
)

$runtimeFiles = @(
    "background.js",
    "content.js",
    "content.css",
    "popup.html",
    "popup.js",
    "multi-table.js",
    "venpro-content.js",
    "smus-page-bridge.js",
    "hipcom-main-world.js",
    "arius-main-world.js",
    "bluesoft-main-world.js",
    "guiacotacao-main-world.js"
)
foreach ($runtimeFile in $runtimeFiles) {
    $runtimePath = Join-Path $currentExtensionRoot $runtimeFile
    if (-not (Test-Path -LiteralPath $runtimePath -PathType Leaf)) {
        throw "Arquivo atual da extensão não encontrado: $runtimePath"
    }
}

$resolvedTemporaryParent = (Resolve-Path -LiteralPath $temporaryParent).Path
if (-not $temporaryRoot.StartsWith($resolvedTemporaryParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Diretório temporário fora da pasta permitida: $temporaryRoot"
}
if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
Copy-Item -Path (Join-Path $currentExtensionRoot "*") -Destination $temporaryRoot -Recurse

foreach ($versionedScript in @("content.js", "popup.js")) {
    $versionedScriptPath = Join-Path $temporaryRoot $versionedScript
    $scriptText = [System.IO.File]::ReadAllText($versionedScriptPath, $utf8NoBom)
    $scriptText = [regex]::Replace(
        $scriptText,
        "const COTEFACIL_CONTENT_VERSION = '[^']+';",
        "const COTEFACIL_CONTENT_VERSION = '$Version';",
        1
    )
    [System.IO.File]::WriteAllText($versionedScriptPath, $scriptText, $utf8NoBom)
}

$manifestPath = Join-Path $temporaryRoot "manifest.json"
$manifestText = [System.IO.File]::ReadAllText($manifestPath, $utf8NoBom)
$manifestText = [regex]::Replace(
    $manifestText,
    '"version"\s*:\s*"[^"]+"',
    '"version": "' + $Version + '"',
    1
)
$genericAnchor = '        "https://www.cotacao.inplug.online/*",'
$genericAnchorIndex = $manifestText.LastIndexOf($genericAnchor, [System.StringComparison]::Ordinal)
if ($genericAnchorIndex -lt 0) {
    throw "Não encontrei o ponto seguro para adicionar a compatibilidade genérica."
}
$genericMatches = @(
    '        "https://*/fornecedores/*/cotacao/*",',
    '        "http://*/fornecedores/*/cotacao/*",',
    '        "https://*/cotacao/*",',
    '        "http://*/cotacao/*",'
) -join [Environment]::NewLine
$genericInsertAt = $genericAnchorIndex + $genericAnchor.Length
$manifestText = $manifestText.Insert(
    $genericInsertAt,
    [Environment]::NewLine + $genericMatches
)
[System.IO.File]::WriteAllText($manifestPath, $manifestText, $utf8NoBom)

$manifest = $manifestText | ConvertFrom-Json
if ($manifest.version -ne $Version) {
    throw "A versão do pacote público não foi atualizada."
}
$expectedName = "Venpro " + [char]0x2014 + " Preencher Cota" + [char]0x00E7 + [char]0x00E3 + "o"
if ($manifest.name -ne $expectedName) {
    throw "O manifesto público ficou com codificação de texto inválida."
}
$matches = @($manifest.content_scripts | ForEach-Object { $_.matches })
if ($matches -notcontains "https://*/cotacao/*" -or $matches -notcontains "https://*/fornecedores/*/cotacao/*") {
    throw "A compatibilidade genérica do pacote público foi alterada."
}
$generatedContent = [System.IO.File]::ReadAllText((Join-Path $temporaryRoot "content.js"), $utf8NoBom)
if ($generatedContent -notmatch "findEstanciaPackageQtyFromRow" -or $generatedContent -notmatch "packageQtyDetected") {
    throw "A correção do Estância não entrou no pacote público."
}
$generatedPopup = [System.IO.File]::ReadAllText((Join-Path $temporaryRoot "popup.js"), $utf8NoBom)
if ($generatedContent -notmatch "fillInplugPrices" -or $generatedPopup -notmatch "'inplug-cotacao': 'Inplug'") {
    throw "O suporte ao Inplug não entrou completo no pacote público."
}
$generatedPopupHtml = [System.IO.File]::ReadAllText((Join-Path $temporaryRoot "popup.html"), $utf8NoBom)
$generatedMultiTable = [System.IO.File]::ReadAllText((Join-Path $temporaryRoot "multi-table.js"), $utf8NoBom)
if ($generatedPopupHtml -notmatch '<script src="multi-table\.js"></script>' -or
    $generatedMultiTable -notmatch "mergeTableMatchResponses") {
    throw "A comparação de várias tabelas não entrou completa no pacote público."
}

$allOutputs = @($versionedOutputs + $aliasOutputs)
foreach ($outputPath in $allOutputs) {
    if (Test-Path -LiteralPath $outputPath) {
        Remove-Item -LiteralPath $outputPath -Force
    }
    Compress-Archive -Path (Join-Path $temporaryRoot "*") -DestinationPath $outputPath -CompressionLevel Optimal
}

foreach ($outputPath in $allOutputs) {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($outputPath)
    try {
        $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
        if ($entryNames -notcontains "manifest.json" -or $entryNames -notcontains "content.js") {
            throw "Pacote inválido: $outputPath"
        }
    } finally {
        $archive.Dispose()
    }
}

Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
foreach ($outputPath in $allOutputs) {
    $hash = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Output "$outputPath | SHA256 $hash"
}

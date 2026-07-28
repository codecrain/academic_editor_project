param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$ResavedPath,
  [Parameter(Mandatory = $true)][string]$PdfPath,
  [Parameter(Mandatory = $true)][string]$EvidencePath,
  [string]$PageImageDirectory = '',
  [switch]$SkipPdf,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot 'HwpxAcceptance.psm1'
Import-Module $modulePath -Force

$resolvedEvidence = [IO.Path]::GetFullPath($EvidencePath)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolvedEvidence)) | Out-Null

if ($DryRun) {
  $result = [ordered]@{
    status = 'dry-run'
    mode = if ($SkipPdf) { 'open-resave' } else { 'open-resave-pdf' }
    opened = $false
    repairDialog = $false
    resaved = $false
    pdfExported = $false
    ownedPids = @()
    remainingOwnedPids = @()
    pageCount = 0
    paginationStable = $false
    pageImages = @()
    inputPath = [IO.Path]::GetFullPath($InputPath)
    resavedPath = [IO.Path]::GetFullPath($ResavedPath)
    pdfPath = [IO.Path]::GetFullPath($PdfPath)
  }
}
else {
  $result = Invoke-HwpxOpenResavePdf `
    -InputPath $InputPath `
    -ResavedPath $ResavedPath `
    -PdfPath $PdfPath `
    -PageImageDirectory $PageImageDirectory `
    -SkipPdf:$SkipPdf
}

$json = $result | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText($resolvedEvidence, $json, (New-Object Text.UTF8Encoding($false)))
Write-Output $json
if ($result.status -eq 'failed') { exit 1 }

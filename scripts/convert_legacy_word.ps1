param(
  [Parameter(Mandatory = $true)]
  [string]$ManifestPath
)

$ErrorActionPreference = "Stop"
$items = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$word = $null

try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  foreach ($item in $items) {
    $inputPath = [System.IO.Path]::GetFullPath([string]$item.input)
    $outputPath = [System.IO.Path]::GetFullPath([string]$item.output)
    $outputDirectory = [System.IO.Path]::GetDirectoryName($outputPath)
    [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

    if ((Test-Path -LiteralPath $outputPath) -and
        ((Get-Item -LiteralPath $outputPath).LastWriteTimeUtc -ge
         (Get-Item -LiteralPath $inputPath).LastWriteTimeUtc)) {
      Write-Output "CACHED`t$inputPath"
      continue
    }

    $document = $null
    try {
      $document = $word.Documents.Open($inputPath, $false, $true, $false)
      # 16 = wdFormatDocumentDefault（DOCX）
      $format = 16
      $document.SaveAs([ref]$outputPath, [ref]$format)
      if (-not (Test-Path -LiteralPath $outputPath)) {
        throw "Word 未生成目标文件：$outputPath"
      }
      Write-Output "OK`t$inputPath"
    }
    catch {
      Write-Output "ERROR`t$inputPath`t$($_.Exception.Message)"
    }
    finally {
      if ($null -ne $document) {
        $document.Close($false)
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($document)
      }
    }
  }
}
finally {
  if ($null -ne $word) {
    $word.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

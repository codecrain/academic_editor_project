Set-StrictMode -Version Latest

function Get-HwpProcessIds {
  return @(
    Get-Process -Name 'Hwp' -ErrorAction SilentlyContinue |
      Sort-Object Id |
      ForEach-Object { [int]$_.Id }
  )
}

function Get-FileSha256 {
  param([Parameter(Mandatory = $true)][string]$LiteralPath)
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $LiteralPath).Hash.ToLowerInvariant()
}

function Resolve-HwpSecurityModuleName {
  if (-not [string]::IsNullOrWhiteSpace($env:HANCOM_FILE_PATH_CHECK_MODULE)) {
    return $env:HANCOM_FILE_PATH_CHECK_MODULE.Trim()
  }
  $modulesPath = 'Registry::HKEY_CURRENT_USER\Software\HNC\HwpAutomation\Modules'
  $registered = Get-ItemProperty -LiteralPath $modulesPath -ErrorAction SilentlyContinue
  if ($null -eq $registered) { return '' }
  $names = @(
    $registered.PSObject.Properties |
      Where-Object {
        $_.Name -notmatch '^PS' -and
        $_.Name -match 'FilePath' -and
        -not [string]::IsNullOrWhiteSpace([string]$_.Value)
      } |
      ForEach-Object { $_.Name }
  )
  foreach ($preferred in @('FilePathCheckerModule', 'FilePathCheckerModuleExample')) {
    if ($names -contains $preferred) { return $preferred }
  }
  return [string]($names | Select-Object -First 1)
}

function Close-OwnedHwpProcesses {
  param([int[]]$OwnedHwpProcessIds = @())
  $pending = @($OwnedHwpProcessIds | Sort-Object -Unique)
  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  while ($pending.Count -gt 0 -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 250
    $pending = @(
      $pending | Where-Object {
        $null -ne (Get-Process -Id $_ -ErrorAction SilentlyContinue)
      }
    )
  }
  foreach ($ownedPid in $pending) {
    $ownedProcess = Get-Process -Id $ownedPid -ErrorAction SilentlyContinue
    if ($null -ne $ownedProcess) {
      Stop-Process -Id $ownedPid -Force -ErrorAction SilentlyContinue
    }
  }
}

function Test-FilePrefix {
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][byte[]]$Prefix
  )
  $stream = [IO.File]::OpenRead($LiteralPath)
  try {
    foreach ($expected in $Prefix) {
      if ($stream.ReadByte() -ne $expected) { return $false }
    }
    return $true
  }
  finally {
    $stream.Dispose()
  }
}

function Get-HwpPageCountValue {
  param([Parameter(Mandatory = $true)]$HwpObject)
  try {
    $pageCount = [int]$HwpObject.PageCount
    if ($pageCount -gt 0) { return $pageCount }
  }
  catch {}
  try {
    $summaryAction = $HwpObject.CreateAction('DocSummaryInfo')
    $summarySet = $summaryAction.CreateSet()
    [void]$summaryAction.GetDefault($summarySet)
    [void]$summaryAction.Execute($summarySet)
    return [int]$summarySet.Item('Pages')
  }
  catch {
    return 0
  }
}

function Wait-HwpStablePageCount {
  param(
    [Parameter(Mandatory = $true)]$HwpObject,
    [int]$TimeoutSeconds = 10,
    [int]$RequiredStableReads = 3
  )
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $lastPageCount = 0
  $stableReads = 0
  while ([DateTime]::UtcNow -lt $deadline) {
    $candidate = Get-HwpPageCountValue -HwpObject $HwpObject
    if ($candidate -gt 0 -and $candidate -eq $lastPageCount) {
      $stableReads += 1
    }
    elseif ($candidate -gt 0) {
      $lastPageCount = $candidate
      $stableReads = 1
    }
    else {
      $stableReads = 0
    }
    if ($stableReads -ge $RequiredStableReads) {
      return [ordered]@{ pageCount = $lastPageCount; stable = $true }
    }
    Start-Sleep -Milliseconds 250
  }
  return [ordered]@{ pageCount = $lastPageCount; stable = $false }
}

function Invoke-HwpxOpenResavePdf {
  param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$ResavedPath,
    [Parameter(Mandatory = $true)][string]$PdfPath,
    [string]$PageImageDirectory = '',
    [switch]$SkipPdf
  )

  $resolvedInput = (Resolve-Path -LiteralPath $InputPath -ErrorAction Stop).Path
  $resolvedResaved = [IO.Path]::GetFullPath($ResavedPath)
  $resolvedPdf = [IO.Path]::GetFullPath($PdfPath)
  if ([IO.Path]::GetExtension($resolvedInput) -ine '.hwpx') {
    throw 'Hancom HWPX acceptance requires a .hwpx input file.'
  }
  if ($resolvedInput -ieq $resolvedResaved) {
    throw 'ResavedPath must not overwrite the input document.'
  }

  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolvedResaved)) | Out-Null
  if (-not $SkipPdf) {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolvedPdf)) | Out-Null
  }

  $beforePids = @(Get-HwpProcessIds)
  $ownedPids = @()
  $hwp = $null
  $opened = $false
  $resaved = $false
  $pdfExported = $false
  $pageCount = 0
  $paginationStable = $false
  $pageImages = @()
  $registeredSecurityModule = $false
  $securityModuleName = ''
  $failureMessage = ''

  try {
    $hwp = New-Object -ComObject 'HWPFrame.HwpObject'
    Start-Sleep -Milliseconds 500
    $ownedPids = @(
      Get-HwpProcessIds | Where-Object { $beforePids -notcontains $_ }
    )
    $securityModuleName = Resolve-HwpSecurityModuleName
    if (-not [string]::IsNullOrWhiteSpace($securityModuleName)) {
      try {
        $registeredSecurityModule = [bool]$hwp.RegisterModule('FilePathCheckDLL', $securityModuleName)
      }
      catch {
        $registeredSecurityModule = $false
      }
    }
    try {
      $hwp.XHwpWindows.Item(0).Visible = $false
    }
    catch {}

    $opened = [bool]$hwp.Open($resolvedInput, '', '')
    if (-not $opened) { throw 'Hancom Open returned False.' }
    try {
      [void]$hwp.HAction.Run('MoveDocEnd')
      [void]$hwp.HAction.Run('MoveDocBegin')
    }
    catch {}
    $pagination = Wait-HwpStablePageCount -HwpObject $hwp
    $pageCount = [int]$pagination.pageCount
    $paginationStable = [bool]$pagination.stable
    if (-not $paginationStable) { throw 'Hancom pagination did not stabilize before SaveAs.' }

    if (-not [string]::IsNullOrWhiteSpace($PageImageDirectory)) {
      $resolvedPageImageDirectory = [IO.Path]::GetFullPath($PageImageDirectory)
      [IO.Directory]::CreateDirectory($resolvedPageImageDirectory) | Out-Null
      for ($pageIndex = 0; $pageIndex -lt $pageCount; $pageIndex += 1) {
        $pageImagePath = Join-Path $resolvedPageImageDirectory ('page-{0:D3}.bmp' -f ($pageIndex + 1))
        $created = [bool]$hwp.CreatePageImage($pageImagePath, $pageIndex, 96, 24, 'bmp')
        if (-not $created -or -not (Test-Path -LiteralPath $pageImagePath)) {
          throw "Hancom CreatePageImage failed for page $($pageIndex + 1)."
        }
        $pageImages += [ordered]@{
          page = $pageIndex + 1
          path = $pageImagePath
          byteLength = (Get-Item -LiteralPath $pageImagePath).Length
          sha256 = Get-FileSha256 -LiteralPath $pageImagePath
        }
      }
    }

    $resaved = [bool]$hwp.SaveAs($resolvedResaved, 'HWPX', '')
    if (-not $resaved) { throw 'Hancom HWPX SaveAs returned False.' }
    if (-not (Test-Path -LiteralPath $resolvedResaved)) {
      throw 'Hancom did not create the resaved HWPX.'
    }
    if (-not (Test-FilePrefix -LiteralPath $resolvedResaved -Prefix ([byte[]](0x50, 0x4b)))) {
      throw 'Hancom resaved output does not have HWPX ZIP magic.'
    }

    if (-not $SkipPdf) {
      $pdfParameterSet = $hwp.HParameterSet.HFileOpenSave
      $null = $hwp.HAction.GetDefault('FileSaveAs_S', $pdfParameterSet.HSet)
      $pdfParameterSet.filename = $resolvedPdf
      $pdfParameterSet.Format = 'PDF'
      $pdfParameterSet.Attributes = 0
      $pdfExported = [bool]$hwp.HAction.Execute('FileSaveAs_S', $pdfParameterSet.HSet)
      if (-not $pdfExported) {
        $pdfExported = [bool]$hwp.SaveAs($resolvedPdf, 'PDF', '')
      }
      if (-not $pdfExported -or -not (Test-Path -LiteralPath $resolvedPdf)) {
        throw 'Hancom PDF export did not create an output file.'
      }
      if (-not (Test-FilePrefix -LiteralPath $resolvedPdf -Prefix ([Text.Encoding]::ASCII.GetBytes('%PDF-')))) {
        throw 'Hancom PDF output has an invalid signature.'
      }
    }
  }
  catch {
    $failureMessage = $_.Exception.Message
  }
  finally {
    if ($null -ne $hwp) {
      if ($opened) {
        try { [void]$hwp.XHwpDocuments.Item(0).Close($false) } catch {}
      }
      try { [void]$hwp.Quit() } catch {}
      try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($hwp) } catch {}
      $hwp = $null
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    Close-OwnedHwpProcesses -OwnedHwpProcessIds $ownedPids
    Start-Sleep -Milliseconds 500
  }

  $remainingOwnedPids = @(
    Get-HwpProcessIds | Where-Object { $ownedPids -contains $_ }
  )
  $passed = $opened -and $resaved -and ($SkipPdf -or $pdfExported) -and
    (Test-Path -LiteralPath $resolvedResaved) -and
    ($SkipPdf -or (Test-Path -LiteralPath $resolvedPdf)) -and
    $remainingOwnedPids.Count -eq 0

  return [ordered]@{
    status = if ($passed) { 'passed' } else { 'failed' }
    mode = if ($SkipPdf) { 'open-resave' } else { 'open-resave-pdf' }
    opened = $opened
    repairDialog = $false
    resaved = $resaved
    pdfExported = $pdfExported
    registeredSecurityModule = $registeredSecurityModule
    securityModuleName = $securityModuleName
    ownedPids = @($ownedPids)
    remainingOwnedPids = @($remainingOwnedPids)
    pageCount = $pageCount
    paginationStable = $paginationStable
    pageImages = @($pageImages)
    inputPath = $resolvedInput
    resavedPath = $resolvedResaved
    pdfPath = $resolvedPdf
    sourceSha256 = Get-FileSha256 -LiteralPath $resolvedInput
    resavedSha256 = if (Test-Path -LiteralPath $resolvedResaved) {
      Get-FileSha256 -LiteralPath $resolvedResaved
    } else { '' }
    pdfSha256 = if (Test-Path -LiteralPath $resolvedPdf) {
      Get-FileSha256 -LiteralPath $resolvedPdf
    } else { '' }
    resavedByteLength = if (Test-Path -LiteralPath $resolvedResaved) {
      (Get-Item -LiteralPath $resolvedResaved).Length
    } else { 0 }
    pdfByteLength = if (Test-Path -LiteralPath $resolvedPdf) {
      (Get-Item -LiteralPath $resolvedPdf).Length
    } else { 0 }
    error = $failureMessage
  }
}

Export-ModuleMember -Function Get-HwpProcessIds, Get-FileSha256, Resolve-HwpSecurityModuleName, Close-OwnedHwpProcesses, Invoke-HwpxOpenResavePdf

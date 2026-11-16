<#
.SYNOPSIS
    Runs the LCC E2E JMeter harness non-GUI and builds the HTML dashboard.

.DESCRIPTION
    Each run gets its own folder under results/<env>-<timestamp>/ containing:
      results.jtl    raw samples (open in the JMeter GUI Summary Report listener)
      transfers.csv  one row per user file: stage timings, retries, outcome
      report/        HTML dashboard (open report/index.html)
      jmeter.log     JMeter log (chunk retries and failures are logged here)

.EXAMPLE
    ./scripts/Run-PerfTest.ps1                              # 10 users / 30s ramp-up against staging
    ./scripts/Run-PerfTest.ps1 -Users 1 -Label smoke        # single-user sanity check
    ./scripts/Run-PerfTest.ps1 -FileSizesMb 2048            # every user uploads 2GB (ignores the CSV sizes)
    ./scripts/Run-PerfTest.ps1 -FileSizesMb 100,1024        # users alternate 100MB / 1GB
    ./scripts/Run-PerfTest.ps1 -Mode Upload -FileSizesMb 2048   # step 1: upload a 2GB file per case, no transfer
    ./scripts/Run-PerfTest.ps1 -Mode Transfer -RampUpSec 0      # step 2: transfer those files, all users at once
    ./scripts/Run-PerfTest.ps1 -Property transferTimeoutMin=90,maxChunkRetries=5
    ./scripts/Run-PerfTest.ps1 -Gui                         # open the plan in the GUI with the same config
#>
param(
    [string] $Environment = 'staging',
    [ValidateSet('E2E', 'Upload', 'Transfer')] [string] $Mode = 'E2E',
    [int] $Users,
    [int] $RampUpSec,
    [int] $Loops,
    [string] $CasesCsv,
    [int[]] $FileSizesMb,
    [string[]] $Property = @(),
    [string] $Label,
    [string] $JMeterHome = $env:JMETER_HOME,
    [switch] $Gui
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$plan = Join-Path $root 'lcc-e2e-perf.jmx'
$profileProps = Join-Path $root 'config\load-profile.properties'
$envProps = Join-Path $root "config\env-$Environment.properties"

if (-not (Test-Path $envProps)) {
    throw "Missing $envProps. Copy config\env.template.properties to env-$Environment.properties and fill it in."
}

$jmeter = if ($JMeterHome) { Join-Path $JMeterHome 'bin\jmeter.bat' } else { (Get-Command jmeter.bat, jmeter -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
if (-not $jmeter -or -not (Test-Path $jmeter)) {
    throw 'JMeter not found. Set JMETER_HOME (or pass -JMeterHome) to the JMeter install folder, or put its bin folder on PATH.'
}

$overrides = [ordered]@{ mode = $Mode.ToLower(); preparedCsv = "data/egress-files-$Environment.csv" }
if ($PSBoundParameters.ContainsKey('Users')) { $overrides.users = $Users }
if ($PSBoundParameters.ContainsKey('RampUpSec')) { $overrides.rampUpSec = $RampUpSec }
if ($PSBoundParameters.ContainsKey('Loops')) { $overrides.loops = $Loops }
if ($FileSizesMb) { $overrides.fileSizesMb = $FileSizesMb -join ',' }
if ($CasesCsv) { $overrides.casesCsv = $CasesCsv }
elseif (-not (Select-String -Path $profileProps -Pattern "^casesCsv=data/cases-$Environment\.csv" -Quiet)) {
    $overrides.casesCsv = "data/cases-$Environment.csv"
}
foreach ($p in $Property) {
    $name, $value = $p -split '=', 2
    $overrides[$name.Trim()] = $value
}

$jmeterArgs = @('-t', $plan, '-q', $profileProps, '-q', $envProps)
foreach ($k in $overrides.Keys) { $jmeterArgs += "-J$k=$($overrides[$k])" }

if ($Gui) {
    & $jmeter @jmeterArgs
    return
}

$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$modeTag = if ($Mode -ne 'E2E') { $Mode.ToLower() }
$name = (@($Environment, $modeTag, $Label, $runId) | Where-Object { $_ }) -join '-'
$runDir = Join-Path $root "results\$name"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$jmeterArgs = @('-n') + $jmeterArgs + @(
    "-JrunId=$runId",
    "-JresultsDir=$runDir",
    '-l', (Join-Path $runDir 'results.jtl'),
    '-j', (Join-Path $runDir 'jmeter.log'),
    '-e', '-o', (Join-Path $runDir 'report')
)

Write-Host "Run $name -> $runDir"
& $jmeter @jmeterArgs
$exitCode = $LASTEXITCODE

$transfers = Join-Path $runDir 'transfers.csv'
if (Test-Path $transfers) {
    $rows = @(Import-Csv $transfers)
    Write-Host ''
    Write-Host '=== Per-file outcome (transfers.csv) ==='
    $rows | Format-Table thread, caseId, fileSizeMb, result, failedStage,
        @{ n = 'search'; e = { $_.caseSearchCode } },
        @{ n = 'upload s'; e = { if ($_.uploadMs) { [math]::Round($_.uploadMs / 1000, 1) } } },
        @{ n = 'retries'; e = { $_.chunkRetries } },
        @{ n = 'file_id s'; e = { if ($_.egressProcessingMs) { [math]::Round($_.egressProcessingMs / 1000, 1) } } },
        @{ n = 'listed s'; e = { if ($_.egressListingMs) { [math]::Round($_.egressListingMs / 1000, 1) } } },
        @{ n = 'first poll'; e = { $_.firstPollStatus } },
        transferStatus,
        @{ n = 'transfer min'; e = { if ($_.transferMs) { [math]::Round($_.transferMs / 60000, 1) } } },
        @{ n = 'transient'; e = { $_.transientPolls } },
        transferMBps -AutoSize | Out-String -Width 250 | Write-Host
    $failed = @($rows | Where-Object result -ne 'PASS')
    Write-Host ("{0}/{1} files passed end to end. Retried chunks: {2}." -f ($rows.Count - $failed.Count), $rows.Count, (($rows | Measure-Object chunkRetries -Sum).Sum))
    $failed | ForEach-Object { Write-Host "  FAIL $($_.thread) case $($_.caseId) [$($_.failedStage)] $($_.message)" -ForegroundColor Yellow }
}
Write-Host ''
Write-Host "Dashboard: $(Join-Path $runDir 'report\index.html')"
exit $exitCode

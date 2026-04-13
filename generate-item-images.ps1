$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$inputFile = Join-Path $root "tmp\imagegen\catalog-items.jsonl"
$outputDir = Join-Path $root "output\imagegen\items"
$imageCli = "C:\Users\ASROCK\.codex\skills\.system\imagegen\scripts\image_gen.py"

if (-not (Test-Path $inputFile)) {
  throw "Missing input file: $inputFile"
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$dryRun = $false
if ($args -contains "-DryRun") {
  $dryRun = $true
}

$command = @(
  "run",
  "--with",
  "openai",
  "python",
  $imageCli,
  "generate-batch",
  "--input",
  $inputFile,
  "--out-dir",
  $outputDir,
  "--concurrency",
  "4",
  "--force",
  "--no-augment"
)

if ($dryRun) {
  $command += "--dry-run"
}

& uv @command

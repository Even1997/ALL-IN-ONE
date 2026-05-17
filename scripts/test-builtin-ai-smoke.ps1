param(
  [string]$AppOrigin = "http://localhost:1420",
  [string]$UserDataDir = "$env:LOCALAPPDATA\com.goodnight.app\EBWebView",
  [int]$Port = 1420,
  [switch]$LeaveDevServerRunning
)

$ErrorActionPreference = "Stop"

function Test-HttpReady {
  param([string]$Url)

  try {
    $null = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 3
    return $true
  } catch {
    return $false
  }
}

function Resolve-NodeExecutable {
  $candidates = @(
    "C:\Users\Even\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
    (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($candidates.Count -eq 0) {
    throw "Unable to find a usable node executable."
  }

  return $candidates[0]
}

function Resolve-PlaywrightNodePath {
  $candidates = @(
    "C:\Users\Even\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules",
    "C:\Users\Even\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\.pnpm\playwright@1.59.1\node_modules",
    "C:\Users\Even\.gstack\repos\gstack\node_modules",
    (Join-Path $PSScriptRoot "..\node_modules")
  ) | ForEach-Object {
    try {
      (Resolve-Path $_).Path
    } catch {
      $null
    }
  } | Where-Object { $_ }

  $completeCandidates = $candidates | Where-Object {
    (Test-Path (Join-Path $_ "playwright")) -and (Test-Path (Join-Path $_ "playwright-core"))
  }
  if ($completeCandidates.Count -gt 0) {
    return $completeCandidates[0]
  }

  $playwrightOnlyCandidates = $candidates | Where-Object {
    Test-Path (Join-Path $_ "playwright")
  }
  if ($playwrightOnlyCandidates.Count -eq 0) {
    throw "Unable to find playwright in bundled or workspace node_modules."
  }

  return $playwrightOnlyCandidates[0]
}

function Start-DevServerIfNeeded {
  param(
    [string]$Url,
    [int]$ListenPort
  )

  if (Test-HttpReady -Url $Url) {
    return @{
      Started = $false
      Process = $null
      OutLog = $null
      ErrLog = $null
    }
  }

  $outLog = Join-Path $PWD ".tmp-builtin-ai-smoke-vite.out.log"
  $errLog = Join-Path $PWD ".tmp-builtin-ai-smoke-vite.err.log"
  Remove-Item -LiteralPath $outLog, $errLog -Force -ErrorAction SilentlyContinue

  $process = Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev", "--", "--host", "localhost", "--port", "$ListenPort") `
    -WorkingDirectory $PWD `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Seconds 1
    if (Test-HttpReady -Url $Url) {
      return @{
        Started = $true
        Process = $process
        OutLog = $outLog
        ErrLog = $errLog
      }
    }
  }

  throw "Vite dev server did not become ready at $Url."
}

function New-IsolatedUserDataDir {
  param([string]$SourceDir)

  if (-not (Test-Path $SourceDir)) {
    throw "User data directory was not found: $SourceDir"
  }

  $targetDir = Join-Path $env:TEMP "goodnight-built-in-smoke-profile-$PID"
  Remove-Item -LiteralPath $targetDir -Recurse -Force -ErrorAction SilentlyContinue
  $null = New-Item -ItemType Directory -Path $targetDir -Force

  & robocopy $SourceDir $targetDir /E /R:0 /W:0 /NFL /NDL /NJH /NJS /NP | Out-Null
  $copiedEntryCount = (Get-ChildItem -LiteralPath $targetDir -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object).Count
  if ($LASTEXITCODE -gt 7 -and $copiedEntryCount -eq 0) {
    throw "Failed to stage browser user data directory for smoke test."
  }

  return $targetDir
}

$nodeExe = Resolve-NodeExecutable
$nodePath = Resolve-PlaywrightNodePath
$server = Start-DevServerIfNeeded -Url $AppOrigin -ListenPort $Port
$isolatedUserDataDir = New-IsolatedUserDataDir -SourceDir $UserDataDir

$env:NODE_PATH = $nodePath
$env:GN_NODE_PATH = $nodePath
$env:GN_APP_ORIGIN = $AppOrigin
$env:GN_USER_DATA_DIR = $isolatedUserDataDir

try {
  $tempStdout = [System.IO.Path]::Combine($env:TEMP, "goodnight-built-in-smoke-$PID.stdout.log")
  $tempStderr = [System.IO.Path]::Combine($env:TEMP, "goodnight-built-in-smoke-$PID.stderr.log")
  Remove-Item -LiteralPath $tempStdout -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tempStderr -Force -ErrorAction SilentlyContinue
  $nodeScript = (Join-Path $PSScriptRoot "test-builtin-ai-smoke.cjs")
  $command = "`"$nodeExe`" `"$nodeScript`" 1>`"$tempStdout`" 2>`"$tempStderr`""
  cmd /c $command | Out-Null
  if (Test-Path $tempStdout) {
    Get-Content -LiteralPath $tempStdout | Write-Output
  }
  if ($LASTEXITCODE -ne 0) {
    if (Test-Path $tempStderr) {
      Get-Content -LiteralPath $tempStderr | Write-Output
    }
    throw "Built-in AI smoke test failed."
  }
} finally {
  Remove-Item -LiteralPath $tempStdout -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tempStderr -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $isolatedUserDataDir -Recurse -Force -ErrorAction SilentlyContinue
  if ($server.Started -and -not $LeaveDevServerRunning) {
    Stop-Process -Id $server.Process.Id -Force -ErrorAction SilentlyContinue
  }
}

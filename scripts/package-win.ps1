$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$bundlePath = Join-Path $workspaceRoot 'src-tauri\target\release\bundle'
$cargoExe = $null

function Get-VsInstallPath {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (Test-Path $vswhere) {
    $path = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1
    if ($path) {
      return $path.Trim()
    }

    $path = & $vswhere -latest -products * -property installationPath 2>$null | Select-Object -First 1
    if ($path) {
      return $path.Trim()
    }
  }

  foreach ($candidate in @(
    'C:\BuildTools2022',
    'C:\Program Files\Microsoft Visual Studio\2022\BuildTools',
    'C:\Program Files\Microsoft Visual Studio\2022\Community'
  )) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

function Import-VcVarsEnvironment {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstallPath
  )

  $vcvars64 = Join-Path $InstallPath 'VC\Auxiliary\Build\vcvars64.bat'
  if (-not (Test-Path $vcvars64)) {
    return $false
  }

  $environmentDump = & cmd.exe /d /c "`"$vcvars64`" >nul && set"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to load Visual Studio build environment from $vcvars64"
  }

  foreach ($line in $environmentDump) {
    if ($line -match '^(.*?)=(.*)$') {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
  }

  return $true
}

$cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
if ($cargoCommand) {
  $cargoExe = $cargoCommand.Source
} else {
  $fallbackCargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
  if (Test-Path $fallbackCargo) {
    $cargoExe = $fallbackCargo
    $cargoBinDir = Split-Path -Parent $cargoExe
    if (-not (($env:PATH -split ';') -contains $cargoBinDir)) {
      $env:PATH = "$cargoBinDir;$env:PATH"
    }
  }
}

if (-not $cargoExe) {
  throw 'cargo.exe was not found. Install Rust and make sure cargo is available in PATH.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm was not found. Install Node.js first.'
}

$linkCommand = Get-Command link.exe -ErrorAction SilentlyContinue
if (-not $linkCommand) {
  $vsInstallPath = Get-VsInstallPath
  if ($vsInstallPath) {
    Write-Host "Loading MSVC environment from: $vsInstallPath"
    Import-VcVarsEnvironment -InstallPath $vsInstallPath | Out-Null
    $linkCommand = Get-Command link.exe -ErrorAction SilentlyContinue
  }
}

if (-not $linkCommand) {
  throw 'link.exe was not found. Install Visual Studio Build Tools with the C++ toolchain and Windows SDK.'
}

Push-Location $workspaceRoot
try {
  Write-Host "Using cargo: $cargoExe"
  Write-Host "Using linker: $($linkCommand.Source)"
  Write-Host 'Running npm run build...'
  npm run build

  Write-Host 'Running npx tauri build...'
  npx tauri build

  Write-Host 'Windows bundle output:'
  Write-Host $bundlePath
} finally {
  Pop-Location
}

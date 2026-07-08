#!/usr/bin/env pwsh
<#
.SYNOPSIS
  IMMEIT Hub — Lanceur universel
.DESCRIPTION
  - Si le serveur tourne deja : ouvre le navigateur
  - Sinon : demarre le serveur dans la console courante, attend le health check,
    ouvre le navigateur, puis reste actif jusqu'a l'arret du serveur
.PARAMETER NoBrowser
  N'ouvre pas le navigateur (mode service/headless)
#>
param([switch]$NoBrowser)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ServerScript = Join-Path $ProjectRoot "server.mjs"
$Url = "http://localhost:3000"

# ── Verifications ──
$nodeVer = node --version 2>$null
if (-not $nodeVer) {
  Write-Host "[ERREUR] Node.js n'est pas installe." -ForegroundColor Red
  pause; exit 1
}
if (-not (Test-Path $ServerScript)) {
  Write-Host "[ERREUR] server.mjs introuvable" -ForegroundColor Red
  pause; exit 1
}
if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
  Write-Host "[INFO] Installation des dependances..." -ForegroundColor Yellow
  Push-Location $ProjectRoot
  npm install --loglevel=error
  if ($LASTEXITCODE -ne 0) { Write-Host "[ERREUR] npm install echoue" -ForegroundColor Red; pause; exit 1 }
  Pop-Location
}
if (-not (Test-Path (Join-Path $ProjectRoot ".env"))) {
  if (Test-Path (Join-Path $ProjectRoot ".env.example")) {
    Copy-Item (Join-Path $ProjectRoot ".env.example") (Join-Path $ProjectRoot ".env")
    Write-Host "[INFO] .env cree -- configure tes cles API" -ForegroundColor Yellow
  }
}

# ── Health check helper ──
function Test-ServerRunning {
  try { $r = Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; return $r.StatusCode -eq 200 }
  catch { return $false }
}

# ── Si deja en cours, on ouvre juste le navigateur ──
if (Test-ServerRunning) {
  Write-Host "[OK] Serveur deja en cours d'execution sur $Url" -ForegroundColor Green
  if (-not $NoBrowser) { Start-Process $Url }
  exit 0
}

# ── Nettoyer les anciens processus ──
try {
  $connections = netstat -ano | Select-String ":3000\s"
  foreach ($conn in $connections) {
    $parts = $conn.ToString().Trim() -split '\s+'
    $pid = $parts[-1]
    if ($pid -and $pid -ne '0') {
      $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
      if ($proc -and $proc.ProcessName -eq 'node') {
        Write-Host "[INFO] Ancien processus sur le port 3000 (PID $pid) -- arret..." -ForegroundColor Yellow
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
      }
    }
  }
} catch {}

# ── Demarrer le serveur dans la console courante ──
Write-Host ""
Write-Host ">>> IMMEIT Hub -- Demarrage du serveur local" -ForegroundColor Cyan
Write-Host ""

$serverProcess = Start-Process -FilePath "node" -ArgumentList "server.mjs" `
  -WorkingDirectory $ProjectRoot -NoNewWindow -PassThru

# ── Attendre le health check (max 30s) ──
Write-Host "[INFO] Attente du demarrage" -NoNewline
$ready = $false
for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 1
  Write-Host "." -NoNewline
  if (Test-ServerRunning) { $ready = $true; break }
}
Write-Host ""

if (-not $ready) {
  Write-Host "[ERREUR] Le serveur n'a pas demarre apres 30 secondes." -ForegroundColor Red
  try { $serverProcess.Kill() } catch {}
  pause; exit 1
}

Write-Host "[OK] Serveur pret sur $Url" -ForegroundColor Green

# ── Ouvrir le navigateur ──
if (-not $NoBrowser) {
  Write-Host "-> Ouverture du navigateur..." -ForegroundColor Cyan
  Start-Process $Url
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " IMMEIT Hub est en cours d'execution" -ForegroundColor White
Write-Host " App   : $Url" -ForegroundColor White
Write-Host " Arret : ferme cette fenetre ou Ctrl+C" -ForegroundColor White
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── Attendre la fin du processus ──
try { $serverProcess.WaitForExit() } catch {}

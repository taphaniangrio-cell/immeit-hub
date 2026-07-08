#!/usr/bin/env pwsh
<#
.SYNOPSIS
  IMMEIT Hub — Installation/Désinstallation du démarrage automatique (Registry Run)
.DESCRIPTION
  Ajoute IMMEIT Hub au démarrage de Windows (HKCU:\...\Run).
  Le serveur démarre automatiquement à chaque connexion utilisateur.
  Le navigateur s'ouvre automatiquement dès que le serveur est prêt (health check).
  Aucune intervention manuelle nécessaire après installation.
.PARAMETER Install
  Installe le démarrage automatique et lance le serveur maintenant
.PARAMETER Uninstall
  Supprime le démarrage automatique et arrête le serveur
.PARAMETER Status
  Vérifie l'état de l'installation et du serveur
#>
param([switch]$Install, [switch]$Uninstall, [switch]$Status)

$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$regName = "IMMEIT-Hub"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $scriptPath
$launcher = Join-Path $projectRoot "start.ps1"

if ($Uninstall) {
  Write-Host "> Suppression du demarrage automatique..."
  try { Remove-ItemProperty -Path $regPath -Name $regName -ErrorAction Stop; Write-Host "> Fait." } catch { Write-Host "> Aucune entree trouvee." }
  Get-CimInstance -ClassName Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "server.mjs" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Write-Host "> Serveur arrete."
  exit 0
}

if ($Status) {
  $regVal = Get-ItemProperty -Path $regPath -Name $regName -ErrorAction SilentlyContinue
  if ($regVal) { Write-Host "> Demarrage automatique : INSTALLE" } else { Write-Host "> Demarrage automatique : NON INSTALLE" }
  $proc = Get-CimInstance -ClassName Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "server.mjs" } |
    Select-Object -First 1
  if ($proc) {
    $elapsed = [math]::Round(((Get-Date) - $proc.CreationDate).TotalMinutes)
    Write-Host "> Serveur en cours : PID $($proc.ProcessId) (actif depuis ${elapsed} min)"
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { Write-Host "> Health check : OK" }
    } catch { Write-Host "> Health check : PAS DE REPONSE" }
  } else { Write-Host "> Serveur en cours : ARRETE" }
  exit 0
}

if ($Install) {
  Write-Host "> Installation du demarrage automatique..."

  # Verifier que le launcher existe
  if (-not (Test-Path $launcher)) { Write-Host "[ERREUR] $launcher introuvable"; exit 1 }

  # Ajouter au registre : start.ps1 gere tout (health check + ouverture navigateur)
  $cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
  try {
    Set-ItemProperty -Path $regPath -Name $regName -Value $cmd -Type String -ErrorAction Stop
    Write-Host "> Ajoute au demarrage Windows (HKCU\...\Run)"
  } catch { Write-Host "[ERREUR] Echec ecriture registre: $($_.Exception.Message)"; exit 1 }

  # Demarrer le serveur maintenant
  Write-Host "> Demarrage du serveur..."
  Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`"" -WindowStyle Hidden
  Start-Sleep -Seconds 5
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { Write-Host "> Serveur lance sur http://localhost:3000" }
  } catch { Write-Host "> Serveur en cours de demarrage (health check pas encore pret)" }

  Write-Host "> Termine. Le navigateur s'ouvrira automatiquement dans quelques secondes."
  exit 0
}

# Aide
Write-Host ""
Write-Host "  IMMEIT Hub - Demarrage automatique Windows"
Write-Host "  =========================================="
Write-Host ""
Write-Host "  Le serveur demarre automatiquement a chaque connexion."
Write-Host "  Le navigateur s'ouvre des que le serveur est pret."
Write-Host "  Aucune intervention necessaire."
Write-Host ""
Write-Host "  Usage :"
Write-Host "    powershell -File scripts\install-service.ps1 -Install     Installer"
Write-Host "    powershell -File scripts\install-service.ps1 -Uninstall   Desinstaller"
Write-Host "    powershell -File scripts\install-service.ps1 -Status      Verifier"
Write-Host ""

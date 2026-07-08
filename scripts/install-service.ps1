#!/usr/bin/env pwsh
param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Status
)

$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$regName = "IMMEIT-Hub"
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$serverScript = Join-Path $projectRoot "server.mjs"
$logDir = Join-Path $env:TEMP "IMMEIT-Hub"
$logFile = Join-Path $logDir "server-out.log"
$logErrFile = Join-Path $logDir "server-err.log"
$launcherFile = Join-Path $projectRoot "scripts\launcher.ps1"

if ($Uninstall) {
    Write-Host "> Suppression du demarrage automatique..."
    try { Remove-ItemProperty -Path $regPath -Name $regName -ErrorAction Stop; Write-Host "> Fait." } catch { Write-Host "> Aucune entree trouvee." }
    try { $p = Get-CimInstance -ClassName Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "server.mjs" }; if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Host "> Serveur arrete." } } catch {}
    exit 0
}

if ($Status) {
    $regVal = Get-ItemProperty -Path $regPath -Name $regName -ErrorAction SilentlyContinue
    if ($regVal) { Write-Host "> Demarrage automatique : INSTALLE" } else { Write-Host "> Demarrage automatique : NON INSTALLE" }
    $proc = Get-CimInstance -ClassName Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "server.mjs" } | Select-Object -First 1
    if ($proc) {
        $elapsed = [math]::Round(((Get-Date) - $proc.CreationDate).TotalMinutes)
        Write-Host "> Serveur en cours : PID $($proc.ProcessId) (actif depuis ${elapsed} min)"
    } else {
        Write-Host "> Serveur en cours : ARRETE"
    }
    exit 0
}

if ($Install) {
    Write-Host "> Installation du demarrage automatique..."

    # Creer le launcher silencieux
    if (-not (Test-Path $launcherFile)) {
        @"
`$projectRoot = "$($projectRoot -replace '\\', '\\')"
`$serverScript = "$($serverScript -replace '\\', '\\')"
Start-Process -FilePath "node" -ArgumentList "`$serverScript" -WorkingDirectory "`$projectRoot" -WindowStyle Hidden
"@ | Set-Content -Path $launcherFile -Encoding ASCII
    }
    Write-Host "> Launcher cree : $launcherFile"

    # Ajouter au registre (demarrage connexion utilisateur)
    $cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$launcherFile`""
    try {
        Set-ItemProperty -Path $regPath -Name $regName -Value $cmd -Type String -ErrorAction Stop
        Write-Host "> Ajoute au demarrage Windows (Registry Run)"
    } catch {
        Write-Host "[ERREUR] Echec ecriture registre: $($_.Exception.Message)"
        exit 1
    }

    # Demarrer le serveur maintenant (Hidden sans redirection — le logger interne suffit)
    Write-Host "> Demarrage du serveur..."
    try {
        Start-Process -FilePath "node" -ArgumentList "`"$serverScript`"" -WorkingDirectory $projectRoot -WindowStyle Hidden
        Start-Sleep -Seconds 4
        # Verifier avec l'API health au lieu du process
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) {
                Write-Host "> Serveur lance. http://localhost:3000"
            }
        } catch {
            Write-Host "[AVERTISSEMENT] Le serveur semble ne pas repondre. Logs dans le dossier .immeit-logs/"
        }
    } catch {
        Write-Host "[ERREUR] Impossible de demarrer : $($_.Exception.Message)"
    }
    exit 0
}

# Aide
Write-Host ""
Write-Host "  IMMEIT Hub - Installation demarrage automatique"
Write-Host "  =============================================="
Write-Host ""
Write-Host "  Usage :"
Write-Host "    powershell -File scripts\install-service.ps1 -Install     Installer"
Write-Host "    powershell -File scripts\install-service.ps1 -Uninstall   Desinstaller"
Write-Host "    powershell -File scripts\install-service.ps1 -Status      Verifier"
Write-Host ""

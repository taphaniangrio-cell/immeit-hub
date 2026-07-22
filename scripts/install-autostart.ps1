# scripts/install-autostart.ps1
#
# Enregistre une tâche planifiée Windows qui démarre server.mjs
# automatiquement à la connexion de l'utilisateur.
#
# Usage: .\scripts\install-autostart.ps1
# Désinstallation: .\scripts\install-autostart.ps1 -Uninstall

param([switch]$Uninstall)

$TaskName = "IMMEIT Hub - Serveur Local"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$VbsScript = Join-Path $PSScriptRoot "start-server.vbs"

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "  Tache planifiee '$TaskName' supprimee." -ForegroundColor Yellow
    exit 0
}

# Vérifier que le script VBS existe
if (-not (Test-Path $VbsScript)) {
    Write-Host "  ERREUR: $VbsScript introuvable" -ForegroundColor Red
    exit 1
}

# Supprimer l'ancienne tâche si elle existe
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Créer l'action : lancer le VBS
$Action = New-ScheduledTaskAction `
    -Execute "wscript.exe" `
    -Argument "`"$VbsScript`"" `
    -WorkingDirectory $ProjectDir

# Déclencheur : à la connexion de l'utilisateur
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Paramètres : ne pas arrêter si l'utilisateur se déconnecte, redémarrer en cas d'échec
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Days 365) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# Enregistrer la tâche
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "IMMEIT Hub - Serveur local pour sync SharePoint continue (auto-demarre au login)" `
    -RunLevel Limited

Write-Host ""
Write-Host "  Tache planifiee '$TaskName' creee avec succes!" -ForegroundColor Green
Write-Host "  Le serveur demarrera automatiquement a la prochaine connexion." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Pour demarrer maintenant:  Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
Write-Host "  Pour supprimer:           .\scripts\install-autostart.ps1 -Uninstall" -ForegroundColor Gray
Write-Host ""

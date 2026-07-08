# IMMEIT Hub — Lanceur pour demarrage automatique (Registry Run)
# Utilise start.ps1 qui gere tout : demarrage serveur + ouverture navigateur
$projectRoot = $PSScriptRoot ? (Resolve-Path "$PSScriptRoot\..") : (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$startScript = Join-Path $projectRoot "start.ps1"
if (-not (Test-Path $startScript)) { throw "start.ps1 introuvable" }
& $startScript

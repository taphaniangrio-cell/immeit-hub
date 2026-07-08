# IMMEIT Hub — Lanceur manuel (double-clic depuis l'explorateur)
# Delegue a start.ps1 qui gere tout : demarrage + ouverture navigateur
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $scriptPath
& (Join-Path $projectRoot "start.ps1")

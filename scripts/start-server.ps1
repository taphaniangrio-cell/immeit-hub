<#
.SYNOPSIS
  IMMEIT Hub — Lanceur silencieux pour démarrage automatique (Registry Run / service)
.DESCRIPTION
  Version headless : démarre le serveur sans ouvrir le navigateur.
  Utilisé par la clé de Registre HKCU:\...\Run et par install-service.ps1.
#>
param(
  [switch]$NoBrowser
)

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $scriptPath

# Délègue à start.ps1 en mode headless
& (Join-Path $projectRoot "start.ps1") -NoBrowser

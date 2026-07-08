@echo off
title IMMEIT Hub — Serveur Local
cd /d "%~dp0"

echo.
echo  ^>^>^> IMMEIT Hub — Lancement du serveur local
echo.

:: Lancer le script PowerShell principal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"

:: Si le script PowerShell s'arrête, on affiche un message
echo.
echo  [INFO] Le serveur s'est arrete.
echo.
pause

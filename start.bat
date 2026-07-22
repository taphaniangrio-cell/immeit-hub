@echo off
title IMMEIT Hub — Serveur Local
cd /d "%~dp0"

echo.
echo  ^>^>^> IMMEIT Hub — Lancement du serveur local
echo.

:: Tuer les anciens processus node sur le port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 "') do (
  if %%a neq 0 (
    taskkill /f /pid %%a >nul 2>&1
  )
)
timeout /t 1 /nobreak >nul

:: Lancer le serveur avec auto-restart
:restart
echo  [INFO] Demarrage du serveur...
node server.mjs
echo.
echo  [INFO] Le serveur s'est arrete. Redemarrage dans 5 secondes...
echo.
timeout /t 5 /nobreak >nul
goto restart

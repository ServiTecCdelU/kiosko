@echo off
title Agente de impresion - MultiComercioPanel
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Instalalo desde https://nodejs.org (version LTS) y volve a abrir este archivo.
  pause
  exit /b 1
)
node agente.js
pause

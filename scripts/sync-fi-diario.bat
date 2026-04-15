@echo off
REM Sync diario de fondos de inversión CMF
REM Programado via Task Scheduler para correr cada día a las 21:00

cd /d "C:\Users\marti\onedrive\documentos\asesoria-financiera"

REM Log con fecha
set LOGFILE=logs\sync-fi-%date:~-4%%date:~3,2%%date:~0,2%.log
echo [%date% %time%] Iniciando sync FI... >> %LOGFILE%

call npx tsx scripts/sync-fi-diario.ts --continue-on-error >> %LOGFILE% 2>&1

echo [%date% %time%] Sync FI terminado. >> %LOGFILE%

@echo off
:: viandasWeb - lanzador de deploy.ps1 para el servidor Windows.
::
:: Uso:
::   deploy.bat              despliegue normal
::   deploy.bat -Setup       vuelve a correr el asistente de .env
::   deploy.bat -Rama dev    fuerza una rama
::
:: Existe para poder desplegar con doble clic, sin pelear con la politica de
:: ejecucion de PowerShell.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
if errorlevel 1 (
    echo.
    echo El despliegue termino con errores. Revisar deploy.log
    pause
)
endlocal

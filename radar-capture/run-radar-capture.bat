@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  py -m venv .venv || goto :error
)

call ".venv\Scripts\activate.bat" || goto :error
python -m pip install --upgrade pip >nul || goto :error
python -m pip install -r requirements.txt || goto :error
python main.py
goto :eof

:error
echo.
echo Echec du lancement de RadarCapture.
exit /b 1

@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  py -m venv .venv || goto :error
)

call ".venv\Scripts\activate.bat" || goto :error
python -m pip install --upgrade pip >nul || goto :error
python -m pip install -r requirements.txt || goto :error
python -m PyInstaller RadarCapture.spec --noconfirm --distpath pyinstaller-dist --workpath pyinstaller-build || goto :error

if not exist "dist" mkdir dist
copy /Y "pyinstaller-dist\RadarCapture.exe" "dist\RadarCapture.exe" >nul || goto :error

echo.
echo Build termine : "%cd%\dist\RadarCapture.exe"
goto :eof

:error
echo.
echo Echec du build de RadarCapture.
exit /b 1

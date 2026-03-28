@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  py -m venv .venv || goto :error
)

call ".venv\Scripts\activate.bat" || goto :error
python -m pip install --upgrade pip >nul || goto :error
python -m pip install -r requirements.txt || goto :error
python -m PyInstaller MixouVector24.spec --noconfirm --distpath pyinstaller-dist --workpath pyinstaller-build || goto :error

if not exist "dist" mkdir dist
copy /Y "pyinstaller-dist\MixouVector24.exe" "dist\MixouVector24.exe" >nul || goto :error

echo.
echo Build termine : "%cd%\dist\MixouVector24.exe"
goto :eof

:error
echo.
echo Echec du build de MixouVector24.
exit /b 1

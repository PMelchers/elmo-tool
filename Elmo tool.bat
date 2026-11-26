@echo off
setlocal enabledelayedexpansion
rem Starts Elmo tool: checks that Python works, installs Pillow once, starts the helper (server.py), opens the app window.
rem Without Python it explains how to install it, or opens the app in limited mode (index.html straight from disk).
set "PORT=47615"
set "HERE=%~dp0"

rem ---- find a Python that really works (the Microsoft Store "python" shortcut does not count) ----
set "PYC="
for %%P in (python py) do (
	if not defined PYC (
		%%P -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>&1 && set "PYC=%%P"
	)
)
if not defined PYC goto nopython

rem pythonw.exe = the same Python without a console window
set "PYW="
for /f "usebackq delims=" %%W in (`%PYC% -c "import sys, os; p = os.path.join(os.path.dirname(sys.executable), 'pythonw.exe'); print(p if os.path.exists(p) else sys.executable)"`) do set "PYW=%%W"
if not defined PYW set "PYW=%PYC%"

rem Pillow turns the game's .dds pictures into images the app can show. Installed once, the first time.
%PYC% -c "import PIL" >nul 2>&1 || (
	echo Installing Pillow for the game pictures. This happens only once...
	%PYC% -m pip install --user --quiet pillow
)

set "URL="
start "" /B "%PYW%" "%HERE%server.py"
for /L %%I in (1,1,20) do (
	if not defined URL (
		curl -s -o nul http://127.0.0.1:%PORT%/api/hello && set "URL=http://127.0.0.1:%PORT%/"
		if not defined URL ping -n 2 127.0.0.1 >nul
	)
)
if defined URL goto openapp
goto limited

:nopython
rem Yes = open the download page, No = start Elmo tool without Python, Cancel = do nothing
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName PresentationFramework; $n = [char]10; $t = 'Elmo tool needs Python (free) to open mod folders, show the game pictures and update itself.' + $n + $n + '1. Click Yes: the Python download page opens.' + $n + '2. Click the yellow Download Python button and run the installer.' + $n + '3. IMPORTANT: tick ''Add python.exe to PATH'' at the bottom of the first screen, then click Install Now.' + $n + '4. Start Elmo tool again.' + $n + $n + 'Click No to start Elmo tool without Python (limited: Steam workshop mods cannot be opened).'; $r = [System.Windows.MessageBox]::Show($t, 'Elmo tool: Python is missing', 'YesNoCancel', 'Warning'); exit [int]$r"
set "ANSWER=%errorlevel%"
if "%ANSWER%"=="6" (
	start "" "https://www.python.org/downloads/windows/"
	exit /b
)
if "%ANSWER%"=="7" goto limited
exit /b

:limited
set "URL=%HERE%index.html"
set "URL=file:///!URL:\=/!"
set "URL=!URL: =%%20!"

:openapp
for %%B in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do (
	if exist %%B (
		start "" %%B --app="!URL!" --window-size=1500,900
		exit /b
	)
)
start "" "!URL!"

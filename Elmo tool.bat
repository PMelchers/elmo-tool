@echo off
setlocal enabledelayedexpansion
rem Starts the Focus Builder helper (server.py) if Python is installed, then opens the app in its own window.
rem Without Python it falls back to opening index.html directly (folder access then needs the browser's folder picker).
set "PORT=47615"
set "HERE=%~dp0"
set "PYW="
where pythonw >nul 2>&1 && set "PYW=pythonw"
if not defined PYW where pyw >nul 2>&1 && set "PYW=pyw"
if not defined PYW where python >nul 2>&1 && set "PYW=python"

rem Pillow turns the game's .dds pictures into images the app can show. Installed once, the first time.
set "PYC="
where python >nul 2>&1 && set "PYC=python"
if not defined PYC where py >nul 2>&1 && set "PYC=py"
if defined PYC (
	%PYC% -c "import PIL" >nul 2>&1 || (
		echo Installing Pillow for the game pictures. This happens only once...
		%PYC% -m pip install --user --quiet pillow
	)
)

set "URL="
if defined PYW (
	start "" /B %PYW% "%HERE%server.py"
	for /L %%I in (1,1,20) do (
		if not defined URL (
			curl -s -o nul http://127.0.0.1:%PORT%/api/hello && set "URL=http://127.0.0.1:%PORT%/"
			if not defined URL ping -n 2 127.0.0.1 >nul
		)
	)
)
if not defined URL (
	set "URL=%HERE%index.html"
	set "URL=file:///!URL:\=/!"
	set "URL=!URL: =%%20!"
)

for %%B in ("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do (
	if exist %%B (
		start "" %%B --app="!URL!" --window-size=1500,900
		exit /b
	)
)
start "" "!URL!"

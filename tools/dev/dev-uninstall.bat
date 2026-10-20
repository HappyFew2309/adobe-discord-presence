@echo off
setlocal
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.happyfew.discordpresence"
if exist "%DEST%" (
  rmdir /s /q "%DEST%"
  echo   Removed the Discord Presence extension.
) else (
  echo   The extension is not installed.
)
echo.
echo   Your settings are kept in %APPDATA%\AdobeDiscordPresence - delete that folder to remove them too.
echo   Restart Premiere Pro / After Effects to finish.
echo.
pause

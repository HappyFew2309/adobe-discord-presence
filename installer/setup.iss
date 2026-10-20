; Windows installer for Discord Presence for Adobe (Inno Setup 6).
; Built by tools\build.ps1 — it passes AppVersion and SourceDir (the unpacked, signed .zxp).
;
; Installs per user (no admin prompt) into Adobe's own extensions folder:
;   %APPDATA%\Adobe\CEP\extensions\com.happyfew.discordpresence
; Because the package is signed, Adobe apps load it without any registry/debug-mode changes.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\build\com.happyfew.discordpresence"
#endif

[Setup]
AppId={{8F3C2A51-6B0E-4C7A-9A0E-2D5B7C1E4F90}
AppName=Discord Presence for Adobe
AppVersion={#AppVersion}
AppVerName=Discord Presence for Adobe {#AppVersion}
AppPublisher=happyfew
DefaultDirName={userappdata}\Adobe\CEP\extensions\com.happyfew.discordpresence
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=DiscordPresence-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Discord Presence for Adobe
CloseApplications=no
SetupLogging=yes

[Messages]
WelcomeLabel2=This adds your Adobe work to your Discord status: the project, sequence or comp you're in, render and export progress, and more.%n%nWorks with Premiere Pro, After Effects, Photoshop, Illustrator, Audition and Media Encoder (2021 and newer).
FinishedLabel=Discord Presence is installed.%n%nRestart any Adobe apps that are open. It starts by itself — open Window > Extensions > Discord Presence to change what's shown.

[InstallDelete]
; Start from a clean folder so leftovers from older versions can't break the signature.
Type: filesandordirs; Name: "{app}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[UninstallDelete]
; The auto-updater may have replaced files since install — remove whatever is there.
Type: filesandordirs; Name: "{app}"

[Code]
function IsAdobeRunning(): Boolean;
var
  ResultCode: Integer;
begin
  Result := False;
  if Exec(ExpandConstant('{cmd}'), '/C tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" | find /I "Adobe Premiere Pro.exe" >NUL || tasklist /FI "IMAGENAME eq AfterFX.exe" | find /I "AfterFX.exe" >NUL || tasklist /FI "IMAGENAME eq Photoshop.exe" | find /I "Photoshop.exe" >NUL || tasklist /FI "IMAGENAME eq Illustrator.exe" | find /I "Illustrator.exe" >NUL || tasklist /FI "IMAGENAME eq Adobe Audition.exe" | find /I "Adobe Audition.exe" >NUL || tasklist /FI "IMAGENAME eq Adobe Media Encoder.exe" | find /I "Adobe Media Encoder.exe" >NUL', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Result := (ResultCode = 0);
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if IsAdobeRunning() then
    Result := MsgBox('An Adobe app is open. You can keep it open, but you''ll need to restart it afterwards for Discord Presence to load.' + #13#10#13#10 + 'Continue?', mbConfirmation, MB_YESNO) = IDYES;
end;

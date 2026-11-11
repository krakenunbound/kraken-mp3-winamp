; Kraken MP3 3.x (native) installer
;
; Build:  makensis native\installer\KrakenMP3.nsi   (after `dotnet publish` to native\publish\folder)
;
; Upgrades Kraken MP3 2.x (Electron) in place: same folder, same Apps &
; Features entry (electron-builder's key for appId com.krakenunbound.mp3player.v2)
; and the same file-type ProgIDs, so defaults chosen in Windows keep working.
; v2's program files are removed; its settings folder is left alone.

Unicode true
SetCompressor /SOLID lzma

!define APPNAME   "Kraken MP3"
!ifndef VERSION
  !define VERSION "3.0.2"   ; build-release.ps1 passes the csproj version
!endif
!define EXE       "Kraken MP3.exe"
!define UNINST    "Uninstall Kraken MP3.exe"
!define GUID      "5409cd53-7121-5c05-90d4-9a9096eaa086"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${GUID}"
!define PUBDIR    "..\publish\folder"
!define ICON      "..\..\assets\icons\icon.ico"
!define CAPS      "Software\Kraken MP3\Capabilities"

Name "${APPNAME} ${VERSION}"
OutFile "..\publish\Kraken MP3 Setup ${VERSION}.exe"
InstallDir "$PROGRAMFILES64\${APPNAME}"
RequestExecutionLevel admin
BrandingText "Kraken Unbound"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "Kraken Unbound"
VIAddVersionKey "FileDescription" "${APPNAME} ${VERSION} Setup"
VIAddVersionKey "LegalCopyright" "Copyright (c) Kraken Unbound"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

!define MUI_ICON   "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING

Var OldDir        ; folder of an existing install (v2 or v3)
Var IsV2          ; "1" when the existing install is the Electron v2 build
Var Register      ; "1" to register as an audio app
Var RegisterBox

; ------------------------------------------------------------------ pages

!define MUI_WELCOMEPAGE_TITLE "Kraken MP3 ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "This installs Kraken MP3 ${VERSION}, the native Windows version of the player.$\r$\n$\r$\nIf Kraken MP3 2.x is installed it is replaced in the same folder. Your 2.x settings folder is not deleted, and file types you set Kraken MP3 to open stay set.$\r$\n$\r$\nPlease close Kraken MP3 before continuing."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom RegisterPageCreate RegisterPageLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Launch Kraken MP3"
!define MUI_FINISHPAGE_RUN_FUNCTION StartApp
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Open Windows Default Apps for Kraken MP3 (needed to make it the default player)"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION OpenDefaultApps
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ------------------------------------------------------------------ init

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Kraken MP3 ${VERSION} needs 64-bit Windows 10 or 11."
    Abort
  ${EndIf}
  SetRegView 64
  SetShellVarContext all
  StrCpy $Register "1"

  ; Where is an existing install? v3 writes InstallLocation; v2 (electron-builder)
  ; leaves it empty, so fall back to the uninstaller's folder.
  ReadRegStr $OldDir HKLM "${UNINSTKEY}" "InstallLocation"
  ${If} $OldDir == ""
    ReadRegStr $0 HKLM "${UNINSTKEY}" "UninstallString"
    ${If} $0 != ""
      Push $0
      Call FirstQuoted                   ; '"C:\Program Files\Kraken MP3\Uninstall Kraken MP3.exe" /allusers' -> the path
      Pop $1
      ${GetParent} $1 $OldDir
    ${EndIf}
  ${EndIf}
  ${If} $OldDir != ""
  ${AndIf} ${FileExists} "$OldDir\*.*"
    StrCpy $INSTDIR $OldDir
    ${If} ${FileExists} "$OldDir\resources\app.asar"
      StrCpy $IsV2 "1"
    ${EndIf}
  ${EndIf}
FunctionEnd

; Pops a command line; pushes the text inside its first pair of quotes
; (or the whole string if it does not start with a quote).
Function FirstQuoted
  Exch $0
  Push $1
  Push $2
  StrCpy $1 $0 1
  ${If} $1 == '"'
    StrCpy $0 $0 "" 1
    StrCpy $2 0
    ${Do}
      StrCpy $1 $0 1 $2
      ${If} $1 == '"'
      ${OrIf} $1 == ""
        ${Break}
      ${EndIf}
      IntOp $2 $2 + 1
    ${Loop}
    StrCpy $0 $0 $2
  ${EndIf}
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

Function RegisterPageCreate
  !insertmacro MUI_HEADER_TEXT "Audio file handling" "Choose whether Kraken MP3 can open your music files."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 36u "Register Kraken MP3 as an app that can open MP3, FLAC, WAV, OGG, M4A, AAC, WMA and Opus files. Windows asks you to confirm the actual default in Settings; the last page can open it for you."
  Pop $0
  ${NSD_CreateCheckbox} 0 44u 100% 14u "Register Kraken MP3 for these audio types"
  Pop $RegisterBox
  ${If} $Register == "1"
    ${NSD_Check} $RegisterBox
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function RegisterPageLeave
  ${NSD_GetState} $RegisterBox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $Register "1"
  ${Else}
    StrCpy $Register "0"
  ${EndIf}
FunctionEnd

; Waits until no "Kraken MP3.exe" is running (v2 and v3 share the name).
!macro WaitForClose UN
Function ${UN}WaitForClose
  ${Do}
    ; find exits 0 only when the process list contains the player.
    nsExec::Exec 'cmd /c tasklist /FI "IMAGENAME eq ${EXE}" /NH | find /I "${EXE}"'
    Pop $0
    ${If} $0 != 0
      ${Break}
    ${EndIf}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Kraken MP3 is running. Please close it, then click Retry." /SD IDCANCEL IDRETRY +2
    Abort
  ${Loop}
FunctionEnd
!macroend
!insertmacro WaitForClose ""
!insertmacro WaitForClose "un."

; ------------------------------------------------------------------ associations

!macro Associate EXT LABEL
  ; Windows protects the per-user default (UserChoice), so only offer Kraken MP3
  ; as a handler; never take over .ext's default value. The ProgID names are
  ; the ones v2 used, so a default the user already chose keeps working.
  WriteRegStr HKLM "Software\Classes\.${EXT}\OpenWithProgids" "KrakenMP3V2.${EXT}" ""
  WriteRegStr HKLM "Software\Classes\KrakenMP3V2.${EXT}" "" "${LABEL} (Kraken MP3)"
  WriteRegStr HKLM "Software\Classes\KrakenMP3V2.${EXT}\DefaultIcon" "" '"$INSTDIR\${EXE}",0'
  WriteRegStr HKLM "Software\Classes\KrakenMP3V2.${EXT}\shell" "" "open"
  WriteRegStr HKLM "Software\Classes\KrakenMP3V2.${EXT}\shell\open" "" "Open with Kraken MP3"
  WriteRegStr HKLM "Software\Classes\KrakenMP3V2.${EXT}\shell\open\command" "" '"$INSTDIR\${EXE}" "%1"'
  WriteRegStr HKLM "${CAPS}\FileAssociations" ".${EXT}" "KrakenMP3V2.${EXT}"
  WriteRegStr HKLM "Software\Classes\Applications\${EXE}\SupportedTypes" ".${EXT}" ""
!macroend

!macro Unassociate EXT
  DeleteRegKey HKLM "Software\Classes\KrakenMP3V2.${EXT}"
  DeleteRegValue HKLM "Software\Classes\.${EXT}\OpenWithProgids" "KrakenMP3V2.${EXT}"
!macroend

Function RegisterAudio
  WriteRegStr HKLM "Software\RegisteredApplications" "${APPNAME}" "${CAPS}"
  WriteRegStr HKLM "${CAPS}" "ApplicationName" "${APPNAME}"
  WriteRegStr HKLM "${CAPS}" "ApplicationDescription" "Kraken MP3 audio player"
  WriteRegStr HKLM "${CAPS}" "ApplicationIcon" '"$INSTDIR\${EXE}",0'
  WriteRegStr HKLM "Software\Classes\Applications\${EXE}\shell\open\command" "" '"$INSTDIR\${EXE}" "%1"'
  WriteRegStr HKLM "Software\Classes\Applications\${EXE}" "FriendlyAppName" "${APPNAME}"
  !insertmacro Associate "mp3"  "MP3 Audio"
  !insertmacro Associate "flac" "FLAC Audio"
  !insertmacro Associate "wav"  "WAV Audio"
  !insertmacro Associate "ogg"  "OGG Audio"
  !insertmacro Associate "m4a"  "M4A Audio"
  !insertmacro Associate "aac"  "AAC Audio"
  !insertmacro Associate "wma"  "WMA Audio"
  !insertmacro Associate "opus" "Opus Audio"
  !insertmacro Associate "m3u"  "M3U Playlist"
  !insertmacro Associate "m3u8" "M3U8 Playlist"
FunctionEnd

; ------------------------------------------------------------------ install

Section "Kraken MP3" Main
  SectionIn RO
  SetRegView 64
  SetShellVarContext all
  Call WaitForClose

  ; Remove the Electron v2 program files (guarded: only a folder that really
  ; holds v2's app.asar). Its settings in %APPDATA% are left untouched.
  ${If} $IsV2 == "1"
  ${AndIf} ${FileExists} "$OldDir\resources\app.asar"
    DetailPrint "Removing Kraken MP3 2.x program files from $OldDir"
    RMDir /r "$OldDir"
    DeleteRegKey HKLM "Software\${GUID}"
    Delete "$SMPROGRAMS\Kraken MP3.lnk"
    Delete "$DESKTOP\Kraken MP3.lnk"
  ${EndIf}

  ; Upgrading v3 over v3: clear the old runtime files first (only in a folder
  ; named "Kraken MP3" that holds our app).
  ${GetFileName} $INSTDIR $0
  ${If} $0 == "Kraken MP3"
  ${AndIf} ${FileExists} "$INSTDIR\Kraken MP3.dll"
    RMDir /r "$INSTDIR"
  ${EndIf}

  SetOutPath "$INSTDIR"
  File /r /x "*.pdb" "${PUBDIR}\*.*"
  WriteUninstaller "$INSTDIR\${UNINST}"

  CreateShortcut "$SMPROGRAMS\Kraken MP3.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortcut "$DESKTOP\Kraken MP3.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0

  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\${EXE}" "" "$INSTDIR\${EXE}"

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegStr   HKLM "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr   HKLM "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr   HKLM "${UNINSTKEY}" "Publisher" "Kraken Unbound"
  WriteRegStr   HKLM "${UNINSTKEY}" "DisplayIcon" '"$INSTDIR\${EXE}",0'
  WriteRegStr   HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKLM "${UNINSTKEY}" "UninstallString" '"$INSTDIR\${UNINST}"'
  WriteRegStr   HKLM "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\${UNINST}" /S'
  WriteRegStr   HKLM "${UNINSTKEY}" "URLInfoAbout" "https://github.com/krakenunbound/kraken-mp3-winamp"
  WriteRegDWORD HKLM "${UNINSTKEY}" "EstimatedSize" $0
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1

  ${If} $Register == "1"
    Call RegisterAudio
  ${EndIf}
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"
SectionEnd

Function StartApp
  ; Through Explorer so the player runs as the user, not elevated.
  Exec '"$WINDIR\explorer.exe" "$INSTDIR\${EXE}"'
FunctionEnd

Function OpenDefaultApps
  ExecShell "open" "ms-settings:defaultapps?registeredAppMachine=Kraken%20MP3"
FunctionEnd

; ------------------------------------------------------------------ uninstall

Section "Uninstall"
  SetRegView 64
  SetShellVarContext all
  Call un.WaitForClose

  ${GetFileName} $INSTDIR $0
  ${If} $0 == "Kraken MP3"
    RMDir /r "$INSTDIR"
  ${Else}
    ; Not our own folder name: remove only what we install.
    Delete "$INSTDIR\*.dll"
    Delete "$INSTDIR\*.exe"
    Delete "$INSTDIR\*.json"
    RMDir "$INSTDIR"
  ${EndIf}

  Delete "$SMPROGRAMS\Kraken MP3.lnk"
  Delete "$DESKTOP\Kraken MP3.lnk"
  DeleteRegKey HKLM "${UNINSTKEY}"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\${EXE}"
  DeleteRegKey HKLM "Software\Classes\Applications\${EXE}"
  DeleteRegValue HKLM "Software\RegisteredApplications" "${APPNAME}"
  DeleteRegKey HKLM "Software\Kraken MP3"
  !insertmacro Unassociate "mp3"
  !insertmacro Unassociate "flac"
  !insertmacro Unassociate "wav"
  !insertmacro Unassociate "ogg"
  !insertmacro Unassociate "m4a"
  !insertmacro Unassociate "aac"
  !insertmacro Unassociate "wma"
  !insertmacro Unassociate "opus"
  !insertmacro Unassociate "m3u"
  !insertmacro Unassociate "m3u8"
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"

  ; Settings live per user; ask before deleting (kept on a silent uninstall).
  SetShellVarContext current
  ${If} ${FileExists} "$APPDATA\Kraken MP3 Native\*.*"
    MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONQUESTION "Also delete your Kraken MP3 settings and saved playlist?" /SD IDNO IDNO +2
    RMDir /r "$APPDATA\Kraken MP3 Native"
  ${EndIf}
SectionEnd

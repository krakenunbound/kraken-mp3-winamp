; Kraken MP3 v2 — optional default-player page + file associations

!include "file-association.nsh"

!ifndef BUILD_UNINSTALLER
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

Var KrakenSetDefault
Var KrakenDefaultCheckbox
Var KrakenDefaultDialog

!macro KrakenV2Associate EXT LABEL
  !insertmacro APP_ASSOCIATE "${EXT}" "KrakenMP3V2.${EXT}" "${LABEL} (Kraken MP3)" '"$INSTDIR\${PRODUCT_FILENAME}.exe,0"' "Open with Kraken MP3" '"$INSTDIR\${PRODUCT_FILENAME}.exe" "%1"'
!macroend

!macro customPageAfterChangeDir
  Page custom KrakenDefaultPageCreate KrakenDefaultPageLeave
!macroend

Function KrakenDefaultPageCreate
  nsDialogs::Create 1018
  Pop $KrakenDefaultDialog
  ${If} $KrakenDefaultDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "Default music player (optional)"
  Pop $0
  ${NSD_CreateLabel} 0 22u 100% 40u "Do you want Kraken MP3 to open your audio files by default? You can change this later in Windows Settings."
  Pop $0

  ${NSD_CreateCheckbox} 0 68u 100% 14u "Yes — default for MP3, FLAC, WAV, OGG, M4A, AAC, WMA, and Opus"
  Pop $KrakenDefaultCheckbox
  ${NSD_Uncheck} $KrakenDefaultCheckbox

  nsDialogs::Show
FunctionEnd

Function KrakenDefaultPageLeave
  ${NSD_GetState} $KrakenDefaultCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $KrakenSetDefault "1"
  ${Else}
    StrCpy $KrakenSetDefault "0"
  ${EndIf}
FunctionEnd

Function KrakenV2RegisterFileAssociations
  !insertmacro KrakenV2Associate "mp3" "MP3 Audio"
  !insertmacro KrakenV2Associate "flac" "FLAC Audio"
  !insertmacro KrakenV2Associate "wav" "WAV Audio"
  !insertmacro KrakenV2Associate "ogg" "OGG Audio"
  !insertmacro KrakenV2Associate "m4a" "M4A Audio"
  !insertmacro KrakenV2Associate "aac" "AAC Audio"
  !insertmacro KrakenV2Associate "wma" "WMA Audio"
  !insertmacro KrakenV2Associate "opus" "Opus Audio"
  !insertmacro UPDATEFILEASSOC
FunctionEnd

!macro customInstall
  StrCmp $KrakenSetDefault "1" 0 kraken_skip_default
    Call KrakenV2RegisterFileAssociations
  kraken_skip_default:
!macroend
!endif

!macro KrakenV2Unassociate EXT
  !insertmacro APP_UNASSOCIATE "${EXT}" "KrakenMP3V2.${EXT}"
!macroend

!macro customUnInstall
  !insertmacro KrakenV2Unassociate "mp3"
  !insertmacro KrakenV2Unassociate "flac"
  !insertmacro KrakenV2Unassociate "wav"
  !insertmacro KrakenV2Unassociate "ogg"
  !insertmacro KrakenV2Unassociate "m4a"
  !insertmacro KrakenV2Unassociate "aac"
  !insertmacro KrakenV2Unassociate "wma"
  !insertmacro KrakenV2Unassociate "opus"

  DeleteRegKey SHELL_CONTEXT "Software\Classes\.mp3\OpenWithProgids\Kraken MP3.mp3"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\.flac\OpenWithProgids\Kraken MP3.flac"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\.wav\OpenWithProgids\Kraken MP3.wav"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\.ogg\OpenWithProgids\Kraken MP3.ogg"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\.m4a\OpenWithProgids\Kraken MP3.m4a"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\.aac\OpenWithProgids\Kraken MP3.aac"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Kraken MP3.mp3"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Kraken MP3.flac"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Kraken MP3.wav"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Kraken MP3.ogg"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Kraken MP3.m4a"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Kraken MP3.aac"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\KrakenMP3WinampV2.mp3"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\KrakenMP3WinampV2.flac"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\KrakenMP3WinampV2.wav"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\KrakenMP3WinampV2.ogg"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\KrakenMP3WinampV2.m4a"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\KrakenMP3WinampV2.aac"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\KrakenMP3WinampV2.wma"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\KrakenMP3WinampV2.opus"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\Kraken MP3.exe"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\Kraken MP3 Winamp v2.exe"
  DeleteRegKey SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Paths\Kraken MP3.exe"
  DeleteRegKey SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\App Paths\Kraken MP3 Winamp v2.exe"

  RMDir /r "$APPDATA\kraken-mp3"
  RMDir /r "$LOCALAPPDATA\kraken-mp3"
  RMDir /r "$LOCALAPPDATA\Kraken MP3"
  RMDir /r "$APPDATA\Kraken MP3 Winamp v2"
  RMDir /r "$LOCALAPPDATA\Kraken MP3 Winamp v2"

  !insertmacro UPDATEFILEASSOC
!macroend

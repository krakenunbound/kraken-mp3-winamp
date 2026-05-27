!include "file-association.nsh"

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

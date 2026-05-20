!macro customUnInstall
  ; Clean up file associations from registry
  DeleteRegKey HKCU "Software\Classes\.mp3\OpenWithProgids\Kraken MP3.mp3"
  DeleteRegKey HKCU "Software\Classes\.flac\OpenWithProgids\Kraken MP3.flac"
  DeleteRegKey HKCU "Software\Classes\.wav\OpenWithProgids\Kraken MP3.wav"
  DeleteRegKey HKCU "Software\Classes\.ogg\OpenWithProgids\Kraken MP3.ogg"
  DeleteRegKey HKCU "Software\Classes\.m4a\OpenWithProgids\Kraken MP3.m4a"
  DeleteRegKey HKCU "Software\Classes\.aac\OpenWithProgids\Kraken MP3.aac"

  ; Clean up ProgIds
  DeleteRegKey HKCU "Software\Classes\Kraken MP3.mp3"
  DeleteRegKey HKCU "Software\Classes\Kraken MP3.flac"
  DeleteRegKey HKCU "Software\Classes\Kraken MP3.wav"
  DeleteRegKey HKCU "Software\Classes\Kraken MP3.ogg"
  DeleteRegKey HKCU "Software\Classes\Kraken MP3.m4a"
  DeleteRegKey HKCU "Software\Classes\Kraken MP3.aac"

  ; Clean up application registration
  DeleteRegKey HKCU "Software\Classes\Applications\Kraken MP3.exe"
  DeleteRegKey HKLM "Software\Classes\Applications\Kraken MP3.exe"

  ; Clean up app paths
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\Kraken MP3.exe"

  ; Clean up any leftover app data
  RMDir /r "$APPDATA\kraken-mp3"
  RMDir /r "$LOCALAPPDATA\kraken-mp3"
  RMDir /r "$LOCALAPPDATA\Kraken MP3"

  ; Refresh shell icons
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, p 0, p 0)'
!macroend

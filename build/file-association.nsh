; File association helpers (NSIS; adapted from electron-builder FileAssociation.nsh)

!ifndef KRAKEN_FILE_ASSOCIATION_NSH
!define KRAKEN_FILE_ASSOCIATION_NSH

!macro APP_ASSOCIATE EXT FILECLASS DESCRIPTION ICON COMMANDTEXT COMMAND
  ; Windows 8+ protects the per-user default in UserChoice. Do not overwrite
  ; the machine-wide extension default: it changes Explorer's type label but
  ; cannot make this app the actual opener. Repair that value if an older
  ; Kraken installer wrote it, then register only as an available handler.
  ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\.${EXT}" ""
  ${If} $R0 == "${FILECLASS}"
    ReadRegStr $R1 SHELL_CONTEXT "Software\Classes\.${EXT}" "${FILECLASS}_backup"
    WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "" "$R1"
  ${EndIf}
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}" "${FILECLASS}_backup"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "${FILECLASS}" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}" "" `${DESCRIPTION}`
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\DefaultIcon" "" `${ICON}`
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell" "" "open"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell\open" "" `${COMMANDTEXT}`
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell\open\command" "" `${COMMAND}`
!macroend

!macro APP_UNASSOCIATE EXT FILECLASS
  DeleteRegKey SHELL_CONTEXT `Software\Classes\${FILECLASS}`
  DeleteRegValue SHELL_CONTEXT `Software\Classes\.${EXT}\OpenWithProgids` `${FILECLASS}`
  DeleteRegValue SHELL_CONTEXT `Software\Classes\.${EXT}` `${FILECLASS}_backup`
!macroend

!define SHCNE_ASSOCCHANGED 0x08000000
!define SHCNF_FLUSH        0x1000

!macro UPDATEFILEASSOC
  System::Call "shell32::SHChangeNotify(i,i,i,i) (${SHCNE_ASSOCCHANGED}, ${SHCNF_FLUSH}, 0, 0)"
!macroend

!endif

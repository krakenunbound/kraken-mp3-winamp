; File association helpers (NSIS; adapted from electron-builder FileAssociation.nsh)

!ifndef KRAKEN_FILE_ASSOCIATION_NSH
!define KRAKEN_FILE_ASSOCIATION_NSH

!macro APP_ASSOCIATE EXT FILECLASS DESCRIPTION ICON COMMANDTEXT COMMAND
  ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\.${EXT}" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "${FILECLASS}_backup" "$R0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "" "${FILECLASS}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "${FILECLASS}" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}" "" `${DESCRIPTION}`
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\DefaultIcon" "" `${ICON}`
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell" "" "open"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell\open" "" `${COMMANDTEXT}`
  WriteRegStr SHELL_CONTEXT "Software\Classes\${FILECLASS}\shell\open\command" "" `${COMMAND}`
!macroend

!macro APP_UNASSOCIATE EXT FILECLASS
  ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\.${EXT}" `${FILECLASS}_backup`
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "" "$R0"
  DeleteRegKey SHELL_CONTEXT `Software\Classes\${FILECLASS}`
  DeleteRegValue SHELL_CONTEXT `Software\Classes\.${EXT}\OpenWithProgids` `${FILECLASS}`
!macroend

!define SHCNE_ASSOCCHANGED 0x08000000
!define SHCNF_FLUSH        0x1000

!macro UPDATEFILEASSOC
  System::Call "shell32::SHChangeNotify(i,i,i,i) (${SHCNE_ASSOCCHANGED}, ${SHCNF_FLUSH}, 0, 0)"
!macroend

!endif

' scripts/start-server.vbs
'
' Lance server.mjs en arrière-plan (sans fenêtre console visible).
' Utilisé par la tâche planifiée Windows pour démarrer le serveur au login.
'
' Usage: wscript.exe "C:\path\to\scripts\start-server.vbs"

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Chemin vers le répertoire du projet
projectDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))

' Tuer les anciens processus node sur le port 3000
Set colProcesses = GetObject("winmgmts:\\.\root\cimv2").ExecQuery( _
    "SELECT ProcessId FROM Win32_Process WHERE Name = 'node.exe'")
For Each proc In colProcesses
    WshShell.Run "cmd /c taskkill /f /pid " & proc.ProcessId, 0, True
Next
WScript.Sleep 1000

' Lancer server.mjs via node (fenêtre cachée)
WshShell.CurrentDirectory = projectDir
WshShell.Run "cmd /c node server.mjs >> """ & projectDir & "\logs\server-auto.log"" 2>&1", 0, False

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Moustapha\mes-projets\articles-immeit"
WshShell.Run "node server.mjs", 0, False

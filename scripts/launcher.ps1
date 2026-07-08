$projectRoot = $PSScriptRoot ? (Resolve-Path "$PSScriptRoot\..") : throw "PSScriptRoot not set"
$serverScript = Join-Path $projectRoot "server.mjs"
if (!(Test-Path (Join-Path $projectRoot "node_modules"))) {
  throw "node_modules introuvable — lance 'npm install' depuis $projectRoot"
}
Start-Process -FilePath "node" -ArgumentList $serverScript -WorkingDirectory $projectRoot -WindowStyle Hidden

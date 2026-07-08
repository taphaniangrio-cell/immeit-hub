param(
    [switch]$NoBrowser
)

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $scriptPath
$serverScript = Join-Path $projectRoot "server.mjs"

# Check node
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "[ERREUR] Node.js n'est pas installe."
    pause
    exit 1
}

# Install deps if needed
if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
    Write-Host "[INFO] Installation des dependances..."
    Push-Location $projectRoot
    npm install
    Pop-Location
}

# Create .env if missing
if (-not (Test-Path (Join-Path $projectRoot ".env"))) {
    Copy-Item (Join-Path $projectRoot ".env.example") (Join-Path $projectRoot ".env")
    Write-Host "[INFO] Fichier .env cree depuis .env.example"
    Write-Host "[INFO] Configure tes cles API dans .env"
}

# Open browser
if (-not $NoBrowser) {
    Start-Process "http://localhost:3000"
}

Write-Host "[INFO] Demarrage du serveur..."
Push-Location $projectRoot
node server.mjs
Pop-Location

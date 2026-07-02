# MVP Financiero - script de tests (Windows PowerShell)
# Ejecuta vitest (frontend) y cargo test (backend) en orden.
# Pensado para uso local y CI en slices futuros (T-X02).

$ErrorActionPreference = "Stop"

Write-Host "==> pnpm test (Vitest + jsdom)" -ForegroundColor Cyan
pnpm test
if ($LASTEXITCODE -ne 0) { throw "pnpm test falló" }

Write-Host "==> cargo test (Rust)" -ForegroundColor Cyan
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
Push-Location src-tauri
try {
    cargo test
    if ($LASTEXITCODE -ne 0) { throw "cargo test falló" }
} finally {
    Pop-Location
}

Write-Host "==> Todos los tests pasaron." -ForegroundColor Green

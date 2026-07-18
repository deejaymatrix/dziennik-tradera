#Requires -Version 5.1

Set-Location -Path $PSScriptRoot

function Test-Command {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Wait-BeforeClose {
    Write-Host ""
    Write-Host "Naciśnij Enter, aby zamknąć to okno..." -ForegroundColor Yellow
    Read-Host | Out-Null
}

try {
    if (-not (Test-Command "pnpm")) {
        Write-Host "BŁĄD: pnpm nie jest zainstalowany. Zainstaluj go (np. 'corepack enable') i uruchom ponownie." -ForegroundColor Red
        Wait-BeforeClose
        exit 1
    }

    if (-not (Test-Command "cargo")) {
        Write-Host "BŁĄD: Rust/cargo nie jest zainstalowany. Zainstaluj toolchain Rust (https://rustup.rs) i uruchom ponownie." -ForegroundColor Red
        Wait-BeforeClose
        exit 1
    }

    if (-not (Test-Path "$PSScriptRoot\node_modules")) {
        Write-Host "Instaluję zależności (pnpm install)..."
        pnpm install
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm install zakończyło się błędem (kod $LASTEXITCODE)."
        }
    }

    Write-Host "Uruchamiam podgląd deweloperski (Vite + Tauri)..."
    pnpm run dev
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm run dev zakończyło się błędem (kod $LASTEXITCODE)."
    }
}
catch {
    Write-Host ""
    Write-Host "BŁĄD:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Pełne szczegóły:" -ForegroundColor Red
    Write-Host ($_ | Out-String)
    Wait-BeforeClose
    exit 1
}

Wait-BeforeClose

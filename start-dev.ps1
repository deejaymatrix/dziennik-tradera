#Requires -Version 5.1
$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

function Test-Command {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command "pnpm")) {
    Write-Error "pnpm nie jest zainstalowany. Zainstaluj go (np. 'corepack enable') i uruchom ponownie."
    exit 1
}

if (-not (Test-Command "cargo")) {
    Write-Error "Rust/cargo nie jest zainstalowany. Zainstaluj toolchain Rust (https://rustup.rs) i uruchom ponownie."
    exit 1
}

if (-not (Test-Path "$PSScriptRoot\node_modules")) {
    Write-Host "Instaluję zależności (pnpm install)..."
    pnpm install
}

Write-Host "Uruchamiam podgląd deweloperski (Vite + Tauri)..."
pnpm run dev

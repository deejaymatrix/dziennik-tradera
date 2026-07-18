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

function Update-SessionPath {
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

try {
    if (-not (Test-Command "node")) {
        Write-Host "BŁĄD: Node.js nie jest zainstalowany na tym koncie Windows." -ForegroundColor Red
        Write-Host ""
        Write-Host "Zainstaluj Node.js (wersja LTS):" -ForegroundColor Yellow
        Write-Host "  1. Wejdź na https://nodejs.org" -ForegroundColor Yellow
        Write-Host "  2. Pobierz i uruchom instalator oznaczony 'LTS'" -ForegroundColor Yellow
        Write-Host "  3. Klikaj Dalej / Zainstaluj z domyślnymi ustawieniami" -ForegroundColor Yellow
        Write-Host "  4. Uruchom ten skrypt ponownie" -ForegroundColor Yellow
        Wait-BeforeClose
        exit 1
    }

    if (-not (Test-Command "pnpm")) {
        Write-Host "pnpm nie jest zainstalowany - próbuję zainstalować automatycznie (npm install -g pnpm)..." -ForegroundColor Yellow
        try {
            npm install -g pnpm 2>&1 | ForEach-Object { Write-Host $_ }
        } catch {
            Write-Host "Automatyczna instalacja napotkała błąd: $($_.Exception.Message)" -ForegroundColor Yellow
        }

        Update-SessionPath

        if (-not (Test-Command "pnpm")) {
            Write-Host "BŁĄD: automatyczna instalacja pnpm nie powiodła się." -ForegroundColor Red
            Write-Host ""
            Write-Host "Spróbuj jednego z tych rozwiązań:" -ForegroundColor Yellow
            Write-Host "  A) Zamknij to okno i uruchom start-dev.bat jeszcze raz (czasem PATH aktualizuje się dopiero po ponownym uruchomieniu)." -ForegroundColor Yellow
            Write-Host "  B) Uruchom komputer ponownie i spróbuj jeszcze raz." -ForegroundColor Yellow
            Write-Host "  C) Kliknij prawym przyciskiem na start-dev.bat i wybierz 'Uruchom jako administrator'." -ForegroundColor Yellow
            Wait-BeforeClose
            exit 1
        }
        Write-Host "pnpm zainstalowany pomyślnie." -ForegroundColor Green
    }

    if (-not (Test-Command "cargo")) {
        Write-Host "BŁĄD: Rust/cargo nie jest zainstalowany na tym koncie Windows." -ForegroundColor Red
        Write-Host ""
        Write-Host "Zainstaluj Rust:" -ForegroundColor Yellow
        Write-Host "  1. Wejdź na https://rustup.rs" -ForegroundColor Yellow
        Write-Host "  2. Pobierz i uruchom 'rustup-init.exe'" -ForegroundColor Yellow
        Write-Host "  3. Naciśnij Enter, żeby zaakceptować domyślne opcje instalacji" -ForegroundColor Yellow
        Write-Host "  4. Zamknij i otwórz ponownie to okno / uruchom ten skrypt ponownie" -ForegroundColor Yellow
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

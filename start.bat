@echo off
echo ============================================
echo   DEM COIN - Layer 1 Blockchain Baslatiliyor
echo ============================================
echo.

where go >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Go yuklu degil! https://go.dev/dl adresinden yukleyin.
    pause
    exit /b 1
)

if not exist go.sum (
    echo [*] Bagimliliklar indiriliyor...
    go mod tidy
    if %errorlevel% neq 0 (
        echo [HATA] go mod tidy basarisiz!
        pause
        exit /b 1
    )
)

echo [*] Sunucu derleniyor ve baslatiliyor...
echo [*] Tarayici: http://localhost:8080
echo.
go run .

pause

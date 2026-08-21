@echo off
echo ============================================
echo   O3 Car Spa Studio — Production Server
echo ============================================
echo.

:: Copy production env file
copy /Y ".env.production" ".env" >nul

echo [*] Starting O3 Car Spa production server on port 5000...
echo [*] App will be available at: http://localhost:5000
echo.
echo     Admin Login : 7225030303
echo     Password    : Test1234
echo.
echo [*] Press Ctrl+C to stop the server
echo.

node src/app.js

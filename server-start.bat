@echo off
REM ============================================================================
REM Local Development Server Launcher for Windows
REM ============================================================================
REM 
REM PURPOSE:
REM   Automated server startup for testing 3D product viewer
REM   Handles Python detection, error cases, and user guidance
REM
REM EXECUTION STRATEGY:
REM   1. Validate Python installation
REM   2. Navigate to correct directory
REM   3. Launch Python HTTP server
REM   4. Provide clear user feedback at each stage
REM
REM ERROR HANDLING PHILOSOPHY:
REM   Fail fast with actionable error messages
REM   Never leave user wondering "what went wrong?"
REM   Provide specific next steps for each error scenario
REM ============================================================================

SETLOCAL EnableDelayedExpansion

REM Color codes for better visibility (works on Windows 10+)
REM Note: Some older Windows versions may not support ANSI colors

echo.
echo ============================================================================
echo        3D Product Viewer - Local Development Server
echo ============================================================================
echo.

REM ----------------------------------------------------------------------------
REM STEP 1: Python Installation Detection
REM ----------------------------------------------------------------------------
REM 
REM DETECTION LOGIC:
REM   Try multiple Python command variations because:
REM   - Windows Store Python installs as "python"
REM   - Traditional installer uses "python" or "py"
REM   - Some systems have "python3" symlink
REM   - System PATH might be misconfigured
REM 
REM DECISION TREE:
REM   IF "python --version" succeeds
REM     THEN use "python"
REM   ELSE IF "py --version" succeeds
REM     THEN use "py"
REM   ELSE IF "python3 --version" succeeds
REM     THEN use "python3"
REM   ELSE
REM     Display installation instructions
REM     Exit with error
REM   END IF

echo [1/3] Checking Python installation...

REM Attempt 1: Standard "python" command
python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=python
    goto :python_found
)

REM Attempt 2: Python launcher (py.exe)
py --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=py
    goto :python_found
)

REM Attempt 3: Explicit python3 command
python3 --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=python3
    goto :python_found
)

REM No Python found - provide installation guidance
echo.
echo [ERROR] Python is not installed or not in PATH!
echo.
echo TROUBLESHOOTING STEPS:
echo   1. Install Python from: https://www.python.org/downloads/
echo   2. During installation, CHECK "Add Python to PATH"
echo   3. Restart this script after installation
echo.
echo ALTERNATIVE: Use Python Launcher
echo   If Python is installed but not detected:
echo   - Open Command Prompt as Administrator
echo   - Run: py --version
echo   - If that works, Python is installed but PATH needs fixing
echo.
pause
exit /b 1

:python_found
REM Get Python version for display
for /f "tokens=2" %%i in ('%PYTHON_CMD% --version 2^>^&1') do set PYTHON_VERSION=%%i
echo    SUCCESS: Found Python %PYTHON_VERSION%
echo.

REM ----------------------------------------------------------------------------
REM STEP 2: Directory Navigation
REM ----------------------------------------------------------------------------
REM
REM DIRECTORY STRATEGY:
REM   Problem: User might run batch file from any location
REM   Solution: Navigate to batch file's directory
REM   
REM WHY %~dp0?
REM   %0 = full path to batch file
REM   %~dp0 = drive + path of batch file (no filename)
REM   Result: Always serves files from correct location

echo [2/3] Setting up server directory...

REM Save current directory in case we need to restore
set ORIGINAL_DIR=%CD%

REM Navigate to the directory containing this batch file
cd /d "%~dp0"

echo    Server directory: %CD%
echo.

REM ----------------------------------------------------------------------------
REM STEP 3: Server Launch Sequence
REM ----------------------------------------------------------------------------
REM
REM LAUNCH LOGIC:
REM   Execute Python server script
REM   Server runs in foreground (user sees logs)
REM   Ctrl+C will gracefully stop server
REM
REM FOREGROUND vs BACKGROUND:
REM   CHOSEN: Foreground execution
REM   REASON: User needs to see:
REM     - Request logs for debugging
REM     - Error messages if files missing
REM     - Clear indication server is running
REM   TRADE-OFF: Ties up command prompt window

echo [3/3] Starting server...
echo.
echo ============================================================================
echo                          SERVER STARTING
echo ============================================================================
echo.
echo The server will start in a moment and open your browser automatically.
echo.
echo IMPORTANT:
echo   - Keep this window open while testing
echo   - Press Ctrl+C to stop the server
echo   - Browser will open at http://localhost:8000
echo.
echo ============================================================================
echo.

REM Small delay for user to read instructions
timeout /t 2 /nobreak >nul

REM Launch the Python server
REM Server script handles:
REM   - Port binding
REM   - CORS headers
REM   - Browser opening
REM   - Graceful shutdown
%PYTHON_CMD% server.py

REM ----------------------------------------------------------------------------
REM STEP 4: Post-Shutdown Cleanup
REM ----------------------------------------------------------------------------
REM
REM CLEANUP LOGIC:
REM   Server has stopped (Ctrl+C or error)
REM   Check exit code to determine why
REM   Provide appropriate feedback

echo.
echo ============================================================================
echo                        SERVER STOPPED
echo ============================================================================
echo.

REM Check if server exited with error
if %ERRORLEVEL% NEQ 0 (
    echo Server stopped with an error (exit code: %ERRORLEVEL%^)
    echo.
    echo COMMON ISSUES:
    echo   - Port 8000 already in use by another program
    echo   - server.py file is missing or corrupted
    echo   - Insufficient permissions
    echo.
    echo Check the error message above for details.
) else (
    echo Server stopped normally.
)

echo.
echo Press any key to close this window...
pause >nul

REM Return to original directory (good practice)
cd /d "%ORIGINAL_DIR%"

ENDLOCAL

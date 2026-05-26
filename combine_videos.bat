@echo off
REM ============================================
REM  Combine MP4 Videos using FFmpeg
REM  Usage: combine_videos.bat [output_name]
REM
REM  Place your MP4 files in the "video" folder,
REM  then run this script. It will combine them
REM  in alphabetical order.
REM ============================================

setlocal enabledelayedexpansion

set "FFMPEG=C:\Users\user\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
set "VIDEO_DIR=%~dp0video"
set "TEMP_DIR=%~dp0temp"
set "TEMP_DIR=%~dp0temp"
set "TEMP_DIR=%~dp0temp"
set "OUTPUT_NAME=%~1"

if "%OUTPUT_NAME%"=="" set "OUTPUT_NAME=combined_output"

if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

REM Create the file list
echo Creating file list...
if exist "%VIDEO_DIR%\filelist.txt" del "%VIDEO_DIR%\filelist.txt"

set count=0
for %%f in ("%VIDEO_DIR%\*.mp4") do (
    if /I not "%%~nf"=="%OUTPUT_NAME%" (
        echo file '%%f'>> "%VIDEO_DIR%\filelist.txt"
        set /a count+=1
        echo   [!count!] %%~nxf
    )
)

if %count%==0 (
    echo ERROR: No MP4 files found in %VIDEO_DIR%
    pause
    exit /b 1
)

echo.
echo Found %count% video files to combine.
echo Output: %TEMP_DIR%\%OUTPUT_NAME%.mp4
echo.

REM First, re-encode all videos to ensure same format
echo Step 1: Normalizing video formats...
set idx=0
if exist "%VIDEO_DIR%\temp_list.txt" del "%VIDEO_DIR%\temp_list.txt"

for %%f in ("%VIDEO_DIR%\*.mp4") do (
    if /I not "%%~nf"=="%OUTPUT_NAME%" (
        set /a idx+=1
        echo   Re-encoding [!idx!/%count%]: %%~nxf
        "%FFMPEG%" -y -i "%%f" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -r 30 -s 1920x1080 -pix_fmt yuv420p "%VIDEO_DIR%\temp_!idx!.mp4" -loglevel warning
        echo file '%VIDEO_DIR%\temp_!idx!.mp4'>> "%VIDEO_DIR%\temp_list.txt"
    )
)

echo.
echo Step 2: Combining videos...
"%FFMPEG%" -y -f concat -safe 0 -i "%VIDEO_DIR%\temp_list.txt" -c copy "%TEMP_DIR%\%OUTPUT_NAME%.mp4" -loglevel warning

if %ERRORLEVEL%==0 (
    echo.
    echo SUCCESS! Combined video saved to:
    echo   %TEMP_DIR%\%OUTPUT_NAME%.mp4
    echo.
    REM Clean up temp files
    for /L %%i in (1,1,%count%) do (
        if exist "%VIDEO_DIR%\temp_%%i.mp4" del "%VIDEO_DIR%\temp_%%i.mp4"
    )
    if exist "%VIDEO_DIR%\filelist.txt" del "%VIDEO_DIR%\filelist.txt"
    if exist "%VIDEO_DIR%\temp_list.txt" del "%VIDEO_DIR%\temp_list.txt"
) else (
    echo.
    echo ERROR: FFmpeg failed to combine videos.
)

pause

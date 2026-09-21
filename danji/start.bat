@echo off
setlocal
cd /d "%~dp0"
title 单机小站 · 本地启动器
chcp 936 >nul 2>&1

rem ============================================================
rem  单机小站 · Windows 一键启动器
rem  双击出菜单；也支持   start.bat build / new / serve
rem ============================================================

rem ---------- 1. 找到 Node.js ----------
set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%~fI"
)

if not defined NODE_EXE (
    set "PF86=%ProgramFiles(x86)%"
    for %%P in (
        "%ProgramFiles%\nodejs\node.exe"
        "%PF86%\nodejs\node.exe"
        "%LOCALAPPDATA%\Programs\nodejs\node.exe"
        "%LOCALAPPDATA%\nvm\nodejs\node.exe"
        "%APPDATA%\nvm\nodejs\node.exe"
        "%NVM_SYMLINK%\node.exe"
        "C:\nvm\nodejs\node.exe"
        "D:\nvm\nodejs\node.exe"
        "E:\nvm\nodejs\node.exe"
        "C:\nvm\node.js\nodejs\node.exe"
        "D:\nvm\node.js\nodejs\node.exe"
        "E:\nvm\node.js\nodejs\node.exe"
    ) do (
        if not defined NODE_EXE if exist "%%~P" set "NODE_EXE=%%~P"
    )
)

if not defined NODE_EXE (
    echo.
    echo   ==========================================================
    echo     错误：没有检测到 Node.js
    echo   ==========================================================
    echo.
    echo     这个网站需要一个叫 Node.js 的运行环境，免费，约 30 MB。
    echo     打开下面这个网址，下载写着 LTS 的那个版本，
    echo     安装时一路点「下一步」即可。装完后关掉本窗口，
    echo     再重新双击本文件就行。
    echo.
    echo     https://nodejs.org/zh-cn/download
    echo.
    start "" "https://nodejs.org/zh-cn/download"
    pause
    exit /b 1
)

rem ---------- 2. 决定做什么 ----------
set "ARGS="

if not "%~1"=="" (
    set "ARGS=%*"
    goto run
)

echo.
echo   ==========================================================
echo     单机小站 · 本地启动器
echo   ==========================================================
echo.
echo     1  启动预览（构建后自动打开浏览器）    ^<- 直接回车
echo     2  新建一款游戏（问答式）
echo.
set "SEL="
set /p "SEL=    你的选择 [1] : "

if not defined SEL set "SEL=1"
if "%SEL%"=="2" set "ARGS=new"

:run
echo.

rem ---------- 3. 交给构建器 ----------
"%NODE_EXE%" "%~dp0build.mjs" %ARGS%
set "CODE=%ERRORLEVEL%"

if not "%CODE%"=="0" (
    echo.
    echo   构建器退出码 %CODE%。如果上面的报错看不懂，截图发给我就行。
    echo.
    pause
    goto :done
)

rem 新建游戏是问答流程，跑完停一下，方便看清结果
if "%ARGS%"=="new" (
    echo.
    pause
)

:done
endlocal

@echo off
chcp 65001 >nul
echo 启动 Deepfake 检测平台前端...
echo.
set FRONTEND_HOST=%FRONTEND_HOST%
if "%FRONTEND_HOST%"=="" set FRONTEND_HOST=0.0.0.0
set FRONTEND_PORT=%FRONTEND_PORT%
if "%FRONTEND_PORT%"=="" set FRONTEND_PORT=3000
echo 前端服务地址: http://localhost:%FRONTEND_PORT%
echo 后端 API 默认地址由 config.js 控制
echo.
call npm run dev

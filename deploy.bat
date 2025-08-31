@echo off
chcp 65001 >nul
echo ========================================
echo     云收账系统 - Netlify 部署助手
echo ========================================
echo.

echo [1] 检查部署文件...
if not exist "index.html" (
    echo ❌ 错误：找不到 index.html 文件
    pause
    exit /b 1
)

if not exist "login.html" (
    echo ❌ 错误：找不到 login.html 文件
    pause
    exit /b 1
)

if not exist "netlify.toml" (
    echo ❌ 错误：找不到 netlify.toml 配置文件
    pause
    exit /b 1
)

echo ✅ 所有必需文件检查完成
echo.

echo [2] 初始化Git仓库...
if not exist ".git" (
    git init
    echo ✅ Git仓库初始化完成
) else (
    echo ✅ Git仓库已存在
)
echo.

echo [3] 添加文件到Git...
git add .
echo ✅ 文件添加完成
echo.

echo [4] 提交更改...
set /p commit_msg="请输入提交信息 (默认: Deploy to Netlify): "
if "%commit_msg%"=="" set commit_msg=Deploy to Netlify
git commit -m "%commit_msg%"
echo ✅ 提交完成
echo.

echo [5] 部署选项:
echo    1. 手动部署 (拖拽文件夹到 Netlify)
echo    2. 连接Git仓库部署
echo    3. 查看部署指南
echo.
set /p choice="请选择部署方式 (1-3): "

if "%choice%"=="1" (
    echo.
    echo 📁 手动部署步骤:
    echo 1. 打开 https://netlify.com
    echo 2. 登录您的账户
    echo 3. 将当前文件夹拖拽到部署区域
    echo 4. 等待部署完成
    echo.
    echo 按任意键打开Netlify网站...
    pause >nul
    start https://netlify.com
) else if "%choice%"=="2" (
    echo.
    echo 🔗 Git仓库部署步骤:
    echo 1. 在GitHub/GitLab创建新仓库
    echo 2. 复制仓库URL
    set /p repo_url="请输入仓库URL: "
    if not "%repo_url%"=="" (
        git remote add origin %repo_url%
        git branch -M main
        echo 正在推送到远程仓库...
        git push -u origin main
        echo ✅ 代码推送完成
        echo.
        echo 现在请到Netlify连接您的Git仓库:
        echo 1. 打开 https://netlify.com
        echo 2. 点击 "New site from Git"
        echo 3. 选择您的Git提供商
        echo 4. 选择刚才创建的仓库
        echo 5. 点击 "Deploy site"
        echo.
        echo 按任意键打开Netlify网站...
        pause >nul
        start https://netlify.com
    )
) else if "%choice%"=="3" (
    echo.
    echo 📖 正在打开部署指南...
    if exist "NETLIFY_部署指南.md" (
        start "" "NETLIFY_部署指南.md"
    ) else (
        echo ❌ 找不到部署指南文件
    )
) else (
    echo ❌ 无效选择
)

echo.
echo ========================================
echo           部署助手运行完成
echo ========================================
echo 如需帮助，请查看 NETLIFY_部署指南.md
echo.
pause
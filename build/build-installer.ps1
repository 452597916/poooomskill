# PoooomSkill 一键打包：类型检查 → 构建前端 → 生成图标 → 编译启动器并暂存 → 编译安装包 → 出校验单
#
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File build\build-installer.ps1
#      （或在项目根目录执行 npm run dist:installer）

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Step($n, $t) { Write-Host "`n[$n/6] $t" -ForegroundColor Cyan }
function Die($m) { Write-Host "`n失败：$m" -ForegroundColor Red; exit 1 }

# ---------- 0. 环境检查 ----------
$iscc = @(
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  "C:\Program Files\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { Die '未找到 Inno Setup 的编译器 ISCC.exe，请先安装 Inno Setup 6（winget install JRSoftware.InnoSetup）' }
Write-Host "Inno Setup 编译器：$iscc"

# ---------- 1. 类型检查 ----------
Step 1 'TypeScript 类型检查'
npm run typecheck
if ($LASTEXITCODE -ne 0) { Die '类型检查未通过，已中止打包' }
Write-Host '类型检查通过' -ForegroundColor Green

# ---------- 2. 构建前端 ----------
Step 2 '构建前端界面（vite）'
npm run build
if ($LASTEXITCODE -ne 0) { Die '前端构建失败' }
if (-not (Test-Path "$Root\dist\index.html")) { Die '未生成 dist\index.html' }
Write-Host '前端构建完成' -ForegroundColor Green

# ---------- 3. 生成图标 ----------
Step 3 '生成 Windows 图标（由主站品牌标记渲染）'
if (Test-Path "$Root\build\icon.ico") {
  Write-Host '已存在 build\icon.ico，跳过（如需重做请先删除该文件）'
} else {
  node build\make-icon.mjs
  if ($LASTEXITCODE -ne 0) { Die '图标生成失败' }
}

# ---------- 4. 暂存 + 编译启动器 ----------
Step 4 '编译启动器并暂存安装内容'
node build\prepare-runtime.mjs
if ($LASTEXITCODE -ne 0) { Die '暂存失败' }

# ---------- 5. 编译安装包 ----------
Step 5 '编译安装包（Inno Setup）'
Push-Location "$Root\build"
& $iscc "installer.iss"
$isccCode = $LASTEXITCODE
Pop-Location
if ($isccCode -ne 0) { Die 'Inno Setup 编译失败' }

$setup = Get-ChildItem "$Root\release\PoooomSkill-Setup-*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { Die '未找到生成的安装包' }

# ---------- 6. 校验单 ----------
Step 6 '生成 SHA-256 校验单'
$version = node -p "require('./package.json').version"
# certutil 比 Get-FileHash 兼容性更好（CI 环境里 PowerShell 版本不一）
$certLine = (certutil -hashfile $setup.FullName SHA256 | Select-Object -Index 1)
$hash = ($certLine -replace '\s', '').ToUpper()
$size = [math]::Round($setup.Length / 1MB, 2)
$sumFile = "$($setup.FullName).sha256.txt"
@"
PoooomSkill 安装包校验信息
────────────────────────────────────────────
文件名      : $($setup.Name)
大小        : $size MB
SHA-256     : $hash
构建时间    : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
版本        : $version
发行方      : 万智云集 · https://poooom.com · contact@poooom.com

校验方法（PowerShell）：
  Get-FileHash "$($setup.Name)" -Algorithm SHA256

注意：本安装包未做数字签名（Authenticode），Windows SmartScreen 首次运行
      可能提示「未知发布者」。核对上面的 SHA-256 与官方发布值一致即可确认文件未被篡改。
"@ | Set-Content -Path $sumFile -Encoding UTF8

Write-Host "`n打包完成 ✅" -ForegroundColor Green
Write-Host "  安装包：$($setup.FullName)"
Write-Host "  大小  ：$size MB"
Write-Host "  SHA256：$hash"
Write-Host "  校验单：$sumFile"
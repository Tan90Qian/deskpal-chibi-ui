param(
  [ValidateSet("install", "restore")]
  [string]$Mode = "install",
  [string]$TargetDir = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkgRoot = Split-Path -Parent $scriptRoot
$sourceWeb = Join-Path $pkgRoot "web"

function Resolve-DeskPalCurrentDir {
  param([string]$InputPath)

  $candidates = New-Object System.Collections.Generic.List[string]
  if ($InputPath) {
    $clean = $InputPath.Trim().Trim('"')
    $candidates.Add($clean)
    $candidates.Add((Join-Path $clean "current"))
  }

  # 1. Running DeskPal.exe process
  try {
    $proc = Get-Process DeskPal -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc -and $proc.Path) {
      $candidates.Add((Split-Path -Parent $proc.Path))
    }
  } catch {}

  # 2. HKCU Uninstall registry (Inno Setup / Velopack)
  try {
    $regPaths = @(
      "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
      "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    foreach ($rp in $regPaths) {
      $items = Get-ItemProperty $rp -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*DeskPal*" }
      foreach ($it in $items) {
        if ($it.InstallLocation) {
          $candidates.Add($it.InstallLocation)
          $candidates.Add((Join-Path $it.InstallLocation "current"))
        }
      }
    }
  } catch {}

  # 3. Common installation locations
  $common = @(
    (Join-Path $env:LOCALAPPDATA "Programs\DeskPal\current"),
    (Join-Path $env:LOCALAPPDATA "DeskPal\current"),
    "C:\DeskPal\current",
    "D:\DeskPal\current",
    "E:\DeskPal\current",
    "F:\DeskPal\current"
  )
  foreach ($c in $common) { $candidates.Add($c) }

  foreach ($cand in $candidates) {
    if (-not $cand) { continue }
    $p = $cand.TrimEnd('\', '/')
    if ((Split-Path -Leaf $p) -ieq "web") {
      $parent = Split-Path -Parent $p
      if (Test-Path (Join-Path $parent "DeskPal.exe")) { return $parent }
      if (Test-Path $p) { return $parent }
    }
    if (Test-Path (Join-Path $p "web")) { return $p }
    if (Test-Path (Join-Path $p "current\web")) { return (Join-Path $p "current") }
  }
  return $null
}

Write-Host "========================================" -ForegroundColor Cyan
if ($Mode -eq "install") {
  Write-Host "  DeskPal Chibi UI - 双主题手游风皮肤安装" -ForegroundColor Cyan
} else {
  Write-Host "  DeskPal Chibi UI - 还原官方原版界面" -ForegroundColor Cyan
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$currentDir = Resolve-DeskPalCurrentDir -InputPath $TargetDir
while (-not $currentDir) {
  Write-Host "未自动检测到 DeskPal 安装目录。" -ForegroundColor Yellow
  Write-Host "请把 DeskPal 安装文件夹（例如 E:\DeskPal 或 %LocalAppData%\Programs\DeskPal）拖进本窗口后回车："
  $manual = Read-Host "安装目录"
  if (-not $manual) {
    Write-Host "已取消操作。" -ForegroundColor Yellow
    exit 1
  }
  $currentDir = Resolve-DeskPalCurrentDir -InputPath $manual
  if (-not $currentDir) {
    Write-Host "该目录下未找到 web 文件夹，请确认路径后重试。" -ForegroundColor Red
  }
}

$webDir = Join-Path $currentDir "web"
$backupDir = Join-Path $currentDir "web.official.bak"
$exePath = Join-Path $currentDir "DeskPal.exe"

Write-Host "检测到 DeskPal 目录: $currentDir" -ForegroundColor Green

if ($Mode -eq "restore" -and -not (Test-Path $backupDir)) {
  Write-Host "未找到官方备份目录：$backupDir" -ForegroundColor Red
  Write-Host "可能尚未安装过此皮肤，或 DeskPal 已更新为新版。" -ForegroundColor Yellow
  exit 1
}
if ($Mode -eq "install" -and -not (Test-Path (Join-Path $sourceWeb "index.html"))) {
  Write-Host "皮肤包损坏：未找到 $sourceWeb\index.html" -ForegroundColor Red
  exit 1
}

# Check DeskPal client version compatibility against tools/manifest.json
$manifestPath = Join-Path $scriptRoot "manifest.json"
if ($Mode -eq "install" -and (Test-Path $manifestPath) -and (Test-Path $exePath)) {
  try {
    $manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $expectedVer = ($manifest.compatibleDeskPalVersion | Out-String).Trim()
    $vi = (Get-Item $exePath).VersionInfo
    $actualVer = if ($vi.ProductVersion) { $vi.ProductVersion.Trim() } elseif ($vi.FileVersion) { $vi.FileVersion.Trim() } else { "" }
    if ($expectedVer -and $actualVer) {
      $normExpected = $expectedVer -replace '^v', ''
      $normActual = ($actualVer -replace '^v', '') -replace '\+.*$', ''
      if ($normActual -eq $normExpected) {
        Write-Host "DeskPal 版本校验通过: $normActual" -ForegroundColor Green
      } else {
        Write-Host ""
        Write-Host "[版本兼容性提示]" -ForegroundColor Yellow
        Write-Host "  当前本机 DeskPal 版本 : $normActual" -ForegroundColor Yellow
        Write-Host "  本皮肤包已验证适配版本: $normExpected" -ForegroundColor Yellow
        Write-Host "  DeskPal 迭代期间界面协议可能变动，跨版本安装可能出现异常（随时可用 一键还原原版.cmd 恢复）。" -ForegroundColor Yellow
        if (-not $Force) {
          $cont = Read-Host "是否仍要继续安装此版本皮肤？[y/N]"
          if ($cont -notin @("y", "Y", "yes", "YES")) {
            Write-Host "已取消安装，建议前往皮肤仓库 Releases 页面下载匹配版本。" -ForegroundColor Yellow
            exit 0
          }
        }
      }
    }
  } catch {}
}

function Remove-DirWithRetry {
  param([string]$PathToRemove)
  for ($i = 1; $i -le 5; $i++) {
    if (-not (Test-Path $PathToRemove)) { return }
    try {
      Remove-Item -Path $PathToRemove -Recurse -Force -ErrorAction Stop
      if (-not (Test-Path $PathToRemove)) { return }
    } catch {
      if ($i -eq 5) {
        throw "无法清理旧目录 $PathToRemove（可能有文件被占用），请手动关闭 DeskPal 后重试。"
      }
      Start-Sleep -Milliseconds 350
    }
  }
}

$wasRunning = $false
$normCurrent = $currentDir.TrimEnd('\', '/')
$procs = @(Get-Process DeskPal -ErrorAction SilentlyContinue | Where-Object {
  (-not $_.Path) -or ($_.Path.StartsWith($normCurrent, [System.StringComparison]::OrdinalIgnoreCase))
})
if ($procs.Count -gt 0) {
  $wasRunning = $true
  Write-Host ""
  Write-Host "检测到 DeskPal 正在运行，需要先关闭后再替换界面文件（完成后会自动重新启动）。" -ForegroundColor Yellow
  $ans = Read-Host "是否现在关闭 DeskPal 并继续？[Y/n]"
  if ($ans -and $ans -notin @("y", "Y", "yes", "YES")) {
    Write-Host "已取消操作。" -ForegroundColor Yellow
    exit 0
  }
  $procs | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 900
}

if ($Mode -eq "restore") {
  Remove-DirWithRetry -PathToRemove $webDir
  Copy-Item -Path $backupDir -Destination $webDir -Recurse -Force
  Write-Host ""
  Write-Host "已成功还原 DeskPal 官方原版界面！" -ForegroundColor Green
} else {
  if (-not (Test-Path $backupDir)) {
    Copy-Item -Path $webDir -Destination $backupDir -Recurse -Force
    Write-Host "已备份官方原版界面 -> $backupDir" -ForegroundColor DarkGray
  }
  Remove-DirWithRetry -PathToRemove $webDir
  Copy-Item -Path $sourceWeb -Destination $webDir -Recurse -Force
  Write-Host ""
  Write-Host "安装成功！DeskPal 双主题 Q 版手游皮肤已生效。" -ForegroundColor Green
  Write-Host "提示：点击标题栏右上角的月亮/太阳图标可一键切换浅色(奶油手账)/深色(星夜大厅)，点击角色头像可自由换装。" -ForegroundColor Cyan
}

if ($wasRunning -and (Test-Path $exePath)) {
  Write-Host "正在重新启动 DeskPal..." -ForegroundColor DarkGray
  Start-Process -FilePath $exePath | Out-Null
}

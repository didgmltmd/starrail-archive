# Starts the StarRail Archive friend server (with Cloudflare tunnel) in the background.
# Safe to run twice: does nothing if it is already running.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:8787/api/health" -TimeoutSec 2
  if ($r.app -eq "starrail-archive") { Write-Output "이미 실행 중이에요."; exit 0 }
} catch { }

$node = (Get-Command node -ErrorAction Stop).Source
Start-Process -FilePath $node -ArgumentList "`"$here\index.mjs`"", "--tunnel" -WorkingDirectory $here -WindowStyle Hidden
Write-Output "친구 서버를 켰어요. 로그: $env:LOCALAPPDATA\StarRailArchiveServer\server.log"

# Stops the friend server and its Cloudflare tunnel.
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like "*server\index.mjs*--tunnel*" -or $_.CommandLine -like "*server\index.mjs*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq "cloudflared.exe" -and $_.CommandLine -like "*127.0.0.1:8787*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Output "친구 서버를 껐어요."

param(
  [Parameter(Mandatory=$true)][string]$HostName,
  [Parameter(Mandatory=$true)][string]$User,
  [string]$Port = "22",
  [string]$Target = "/var/www/ori-lin-site"
)

$ErrorActionPreference = "Stop"
$source = Split-Path -Parent $PSScriptRoot

ssh -p $Port "$User@$HostName" "mkdir -p '$Target'"
scp -P $Port -r `
  "$source/index.html" `
  "$source/day-*.html" `
  "$source/styles.css" `
  "$source/script.js" `
  "$source/CNAME" `
  "$source/vercel.json" `
  "$User@$HostName:$Target/"

Write-Host "Deployed ORI-LIN site to $User@$HostName:$Target"

# Fills real down_revision into a new migration file.
#
# The placeholder breaks "alembic heads" itself (alembic parses the whole
# versions folder), so we move the file out first, ask for the head, then put
# it back already fixed.
#
# Usage from D:\neon-stack-stage1\neon-stack\backend :
#   powershell -ExecutionPolicy Bypass -File ..\tools\set_down_revision.ps1 -Name add_reading_counters.py

param(
    [Parameter(Mandatory = $true)]
    [string]$Name
)

$ErrorActionPreference = "Stop"

$target = Join-Path "alembic\versions" $Name
$temp = "migration_pending.tmp.py"

if (-not (Test-Path $target) -and -not (Test-Path $temp)) {
    throw "Not found: $target"
}

if (Test-Path $target) {
    Move-Item $target $temp -Force
}

$heads = & .\.venv\Scripts\alembic heads 2>&1 | Out-String

$match = [regex]::Match($heads, '(?m)^([0-9a-zA-Z_]+)\s*\(head\)')
if (-not $match.Success) {
    Move-Item $temp $target -Force
    throw "Cannot parse alembic heads output: $heads"
}

$head = $match.Groups[1].Value
Write-Host "Current head: $head"

$content = Get-Content $temp -Raw -Encoding UTF8
if ($content -notmatch 'PUT_CURRENT_HEAD_HERE') {
    Move-Item $temp $target -Force
    Write-Host "Placeholder not found - nothing to do."
    exit 0
}
$content = $content -replace 'PUT_CURRENT_HEAD_HERE', $head
Set-Content $target $content -Encoding UTF8 -NoNewline
Remove-Item $temp -Force

Write-Host "down_revision set. Next:"
Write-Host "  .\.venv\Scripts\alembic upgrade head"
Write-Host "  .\.venv\Scripts\alembic check"

# Fills real down_revision into the new migration.
#
# The placeholder file breaks "alembic heads" itself (alembic parses the whole
# versions folder), so we move it out first, ask for the head, then put it back
# already fixed.
#
# Run from D:\neon-stack-stage1\neon-stack\backend

$ErrorActionPreference = "Stop"

$target = "alembic\versions\uq_certificates_user_category.py"
$temp   = "uq_cert_migration.tmp.py"

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
$content = $content -replace 'PUT_CURRENT_HEAD_HERE', $head
Set-Content $target $content -Encoding UTF8 -NoNewline
Remove-Item $temp -Force

Write-Host "down_revision set. Next:"
Write-Host "  .\.venv\Scripts\alembic upgrade head"
Write-Host "  .\.venv\Scripts\alembic check"
Write-Host "  .\.venv\Scripts\pytest -q --tb=line"

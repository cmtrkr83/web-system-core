# Usage: run from repository root in PowerShell
# This script moves large uploaded assets out of the repo into archived_assets

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $repoRoot

$files = @(
    "attached_assets\7-kutuk_1772624990452.XLS"
)

New-Item -ItemType Directory -Force -Path archived_assets | Out-Null

foreach ($f in $files) {
    if (Test-Path $f) {
        $dest = Join-Path $repoRoot 'archived_assets' (Split-Path $f -Leaf)
        Write-Host "Moving $f -> $dest"
        Move-Item -Force $f $dest
        Write-Host "Staging git removal for $f"
        git rm --cached --ignore-unmatch $f
    } else {
        Write-Host "File not found: $f"
    }
}

Write-Host "Ensure .gitignore contains 'attached_assets/*.XLS' and commit the changes."

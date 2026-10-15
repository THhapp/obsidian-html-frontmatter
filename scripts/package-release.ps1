$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw | ConvertFrom-Json
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne $package.version) { throw 'Package and manifest versions differ.' }
if ($manifest.id -ne 'html-frontmatter' -or $manifest.version -notmatch '^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$') {
    throw 'Unexpected plugin id or version.'
}

# The bundled runtime dependencies keep their upstream license text intact.
$notices = "# Third-party notices`n`nThe release bundle includes the following libraries. These notices apply to third-party code only.`n"
foreach ($dependency in @('parse5', 'entities')) {
    $directory = Join-Path $projectRoot "node_modules\$dependency"
    $info = Get-Content -LiteralPath (Join-Path $directory 'package.json') -Raw | ConvertFrom-Json
    $licenseText = [IO.File]::ReadAllText((Join-Path $directory 'LICENSE'))
    $notices += "`n## $dependency $($info.version) ($($info.license))`n`n$licenseText`n"
}
$utf8 = [Text.UTF8Encoding]::new($false)
$noticePath = Join-Path $projectRoot 'THIRD_PARTY_NOTICES.md'
[IO.File]::WriteAllText($noticePath, $notices.TrimEnd([char[]]"`r`n") + "`n", $utf8)

$dist = Join-Path $projectRoot 'dist'
$pluginDirectory = Join-Path $dist $manifest.id
$files = @('main.js', 'manifest.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md')
if (Test-Path -LiteralPath $pluginDirectory) {
    foreach ($item in Get-ChildItem -LiteralPath $pluginDirectory -Force -Recurse) {
        if ($item.PSIsContainer -or $item.DirectoryName -ne $pluginDirectory -or $item.Name -notin $files) {
            throw "Unexpected release staging file: $($item.FullName)"
        }
    }
}
New-Item -ItemType Directory -Path $pluginDirectory -Force | Out-Null
foreach ($name in @('main.js', 'manifest.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination (Join-Path $pluginDirectory $name) -Force
}
$install = @"
# HTML Frontmatter $($manifest.version)

Vibe-coded preview: developed through human-AI collaboration and AI-assisted coding.

Copy this entire html-frontmatter folder into your vault's .obsidian/plugins/ folder.
Restart Obsidian and enable HTML Frontmatter in Community plugins.
Open the command palette, search for HTML Frontmatter and choose an HTML/HTM file.

This preview supports desktop Obsidian 1.14.4 only. HTML rendering, search and graph support are not included.
Global rename/delete involving HTML are blocked; edit those properties in the single-file panel.
Released under the MIT License. See LICENSE and THIRD_PARTY_NOTICES.md.
"@
[IO.File]::WriteAllText((Join-Path $pluginDirectory 'README.md'), $install, $utf8)
$archiveName = "html-frontmatter-$($manifest.version).zip"
$archive = Join-Path $dist $archiveName
Compress-Archive -LiteralPath $pluginDirectory -DestinationPath $archive -Force
$hasher = [Security.Cryptography.SHA256]::Create()
try { $hash = [BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($archive))).Replace('-', '').ToLowerInvariant() }
finally { $hasher.Dispose() }
[IO.File]::WriteAllText("$archive.sha256", "$hash  $archiveName`n", $utf8)
Write-Output "Release folder: $pluginDirectory"
Write-Output "Archive: $archive"
Write-Output "SHA256: $hash"

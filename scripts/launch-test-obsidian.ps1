param(
    [string]$ObsidianExe,
    [int]$DebugPort = 19327
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$vaultPath = Join-Path $projectRoot 'test-vault'
$profilePath = Join-Path $projectRoot 'tmp\obsidian-profile'
$profileMarker = Join-Path $profilePath '.html-frontmatter-test-profile'
if (!(Test-Path -LiteralPath (Join-Path $vaultPath '.html-frontmatter-test-vault'))) {
    throw 'Run npm run test-vault first.'
}
if (!$ObsidianExe) {
    $command = Get-Command Obsidian.exe -ErrorAction SilentlyContinue
    if ($command) { $ObsidianExe = $command.Source }
    if (!$ObsidianExe) {
        $candidates = @(
            (Join-Path $env:LOCALAPPDATA 'Programs\Obsidian\Obsidian.exe'),
            (Join-Path $env:ProgramFiles 'Obsidian\Obsidian.exe')
        )
        $ObsidianExe = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    }
}
if (!$ObsidianExe -or !(Test-Path -LiteralPath $ObsidianExe)) {
    throw 'Obsidian was not found. Pass -ObsidianExe with your installation path.'
}
if (Get-NetTCPConnection -LocalPort $DebugPort -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $DebugPort is already in use. An isolated test instance may already be running."
}
if ((Test-Path -LiteralPath $profilePath) -and !(Test-Path -LiteralPath $profileMarker)) {
    throw 'Refusing to reuse an unmarked application profile.'
}
New-Item -ItemType Directory -Path $profilePath -Force | Out-Null
Set-Content -LiteralPath $profileMarker -Value 'Synthetic isolated Obsidian profile.' -Encoding utf8
$cachedApp = Join-Path $env:APPDATA 'obsidian\obsidian-1.14.4.asar'
if (!(Test-Path -LiteralPath $cachedApp)) { throw 'The locally validated Obsidian 1.14.4 ASAR is missing.' }
Copy-Item -LiteralPath $cachedApp -Destination (Join-Path $profilePath 'obsidian-1.14.4.asar') -Force
$profileConfig = Join-Path $profilePath 'obsidian.json'
if (!(Test-Path -LiteralPath $profileConfig)) {
    $config = @{ vaults = @{ f47693008a43fe71 = @{ open = $true; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); path = $vaultPath } }; cli = $true }
    [IO.File]::WriteAllText($profileConfig, ($config | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
} else {
    $config = Get-Content -LiteralPath $profileConfig -Raw | ConvertFrom-Json
    $vaults = @($config.vaults.PSObject.Properties)
    if ($vaults.Count -ne 1 -or [IO.Path]::GetFullPath($vaults[0].Value.path) -ne $vaultPath) {
        throw 'The test profile must contain only the project test vault.'
    }
}
$process = Start-Process -FilePath $ObsidianExe -ArgumentList @("--user-data-dir=$profilePath", "--remote-debugging-port=$DebugPort", '--remote-debugging-address=127.0.0.1') -WindowStyle Hidden -PassThru
@{ profile = $profilePath; pid = $process.Id; port = $DebugPort } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot 'tmp\test-app-process.json') -Encoding utf8
Write-Output "Started isolated Obsidian test instance; vault=$vaultPath; debugging=127.0.0.1:$DebugPort"

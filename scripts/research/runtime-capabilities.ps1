param(
    [Parameter(Mandatory = $true)]
    [string]$Vault,
    [string]$ObsidianCli = 'obsidian'
)

$ErrorActionPreference = 'Stop'

# Inspect only method names, method source signatures and the registered HTML
# handler. Do not enumerate note paths, read note content, or change app state.
$probeCode = @'
(() => {
  const cache = app.metadataCache;
  const method = (name) => typeof cache[name] === 'function';
  const cacheSource = cache.getCache.toString();
  const extensionSource = app.viewRegistry.registerExtensions.toString();
  return JSON.stringify({
    metadata: {
      getCache: method('getCache'),
      getFileCache: method('getFileCache'),
      getTags: method('getTags'),
      getCachedFiles: method('getCachedFiles'),
      resolveLinks: method('resolveLinks'),
      queueFileForLinkResolution: method('queueFileForLinkResolution'),
      iterateAllRefs: method('iterateAllRefs'),
      iterateRefsForFile: method('iterateRefsForFile'),
      linkUpdaters: typeof cache.linkUpdaters === 'object',
      nonMarkdownEmptyCacheGuardObserved: cacheSource.includes('"md"!==') && cacheSource.includes('return{}'),
      resolvedLinksAvailable: typeof cache.resolvedLinks === 'object',
      unresolvedLinksAvailable: typeof cache.unresolvedLinks === 'object'
    },
    reader: {
      htmlViewType: app.viewRegistry.typeByExtension.html ?? null,
      htmViewType: app.viewRegistry.typeByExtension.htm ?? null,
      installedLocalPageViewerVersion: app.plugins.plugins['local-web-page-viewer']?.manifest.version ?? null,
      duplicateExtensionGuardObserved: extensionSource.includes('Attempting to register an existing file extension')
    },
    limitations: 'Read-only presence/signature probe; no adapter installation, cache injection, graph rendering or rename test.'
  }, null, 2);
})()
'@

$probeOutput = & $ObsidianCli "vault=$Vault" eval "code=$probeCode"
if ($LASTEXITCODE -ne 0) {
    throw "Obsidian CLI exited with code $LASTEXITCODE"
}
# Some eval errors return process exit code 0; require a valid JSON result.
$probeText = ($probeOutput -join "`n") -replace '^=>\s*', ''
try {
    $null = $probeText | ConvertFrom-Json -ErrorAction Stop
}
catch {
    throw 'Obsidian eval did not return the expected JSON capability report.'
}
Write-Output $probeText

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputDir = Join-Path $projectRoot 'release'
[IO.Directory]::CreateDirectory($outputDir) | Out-Null
$archivePath = Join-Path $outputDir ('FudanHistoryDigitalPlatform-share-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.zip')
$excludedDirs = @('node_modules','dist','.git','.qa','data','coverage','release','.cache')
function Get-ShareFiles([string]$directory) {
  foreach ($item in Get-ChildItem -LiteralPath $directory -Force) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
    if ($item.PSIsContainer) {
      if ($excludedDirs -notcontains $item.Name) { Get-ShareFiles $item.FullName }
    } elseif (
      ($item.Name -notlike '.env*' -or $item.Name -eq '.env.example') -and
      $item.Name -notmatch '(?i)(\.sqlite(?:-wal|-shm)?|\.db|\.log|\.zip|\.pem|\.key)$' -and
      $item.Name -ne 'dev-accounts.txt'
    ) { $item }
  }
}
# Only these source trees/root file types are eligible. Local folders are not shipped.
$files = @()
foreach ($folder in @('frontend','backend','docs','scripts')) {
  $directory = Join-Path $projectRoot $folder
  if (Test-Path -LiteralPath $directory) { $files += @(Get-ShareFiles $directory) }
}
$files += @(Get-ChildItem -LiteralPath $projectRoot -File -Force | Where-Object {
  $_.Extension -in @('.md','.docx') -or $_.Name -in @('package.json','.gitignore','.editorconfig')
})
$zip = [IO.Compression.ZipFile]::Open($archivePath, 'Create')
try {
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName,
      ('FudanHistoryDigitalPlatform/' + $relative), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $zip.Dispose() }
Write-Output ('Archive: ' + $archivePath)
Write-Output ('Files: ' + $files.Count)

$stream = [IO.File]::OpenRead($archivePath)
$hasher = [Security.Cryptography.SHA256]::Create()
try { Write-Output ('SHA256: ' + [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-','')) }
finally { $stream.Dispose(); $hasher.Dispose() }
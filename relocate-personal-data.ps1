$ErrorActionPreference = 'Stop'
$sourceBase = 'C:\Users\蔡雅筑'
$destinationBase = 'D:\PersonalData-20261007\蔡雅筑'
$log = Join-Path (Get-Location) 'relocation-results.jsonl'
$expectedSourceBase = [IO.Path]::GetFullPath($sourceBase).TrimEnd('\') + '\'
$expectedDestinationBase = [IO.Path]::GetFullPath($destinationBase).TrimEnd('\') + '\'
function Get-Sha256([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }
foreach ($name in @('Videos', 'Pictures', 'Music')) {
    $source = [IO.Path]::GetFullPath((Join-Path $sourceBase $name))
    $destination = [IO.Path]::GetFullPath((Join-Path $destinationBase $name))
    $backup = $source + '.relocation-original-20261007'
    $handles = [Collections.Generic.List[IO.FileStream]]::new()
    $switched = $false
    try {
        if (-not $source.StartsWith($expectedSourceBase, [StringComparison]::OrdinalIgnoreCase) -or -not $destination.StartsWith($expectedDestinationBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside intended personal folders' }
        if (Test-Path -LiteralPath $destination) { throw 'Destination already exists; refusing to overwrite' }
        if (Test-Path -LiteralPath $backup) { throw 'Backup already exists' }
        $root = Get-Item -LiteralPath $source -Force
        $entries = @(Get-ChildItem -LiteralPath $source -Recurse -Force)
        if ((@($root) + $entries | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }).Count -gt 0) { throw 'Contains reparse points; skipping' }
        $files = @($entries | Where-Object { -not $_.PSIsContainer })
        $bytes = ($files | Measure-Object Length -Sum).Sum
        if ([IO.DriveInfo]::new('D').AvailableFreeSpace -lt ($bytes + 5GB)) { throw 'Insufficient destination free space' }
        foreach ($file in $files) { $handles.Add([IO.File]::Open($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)) }
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
        Write-Output "COPYING $name : $($files.Count) files, $([math]::Round($bytes/1GB,2)) GB"
        & robocopy.exe $source $destination /E /COPY:DAT /DCOPY:DAT /R:0 /W:0 /XJ /NP /NFL /NDL /NJH /NJS
        if ($LASTEXITCODE -ge 8) { throw "Copy failed: robocopy code $LASTEXITCODE" }
        $manifest = @()
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($source.Length + 1)
            $target = Join-Path $destination $relative
            $hash = Get-Sha256 $file.FullName
            if ((Get-Item -LiteralPath $target).Length -ne $file.Length -or (Get-Sha256 $target) -ne $hash) { throw "Verification failed: $relative" }
            $manifest += [pscustomobject]@{RelativePath=$relative;Length=$file.Length;SHA256=$hash}
        }
        if (@(Get-ChildItem -LiteralPath $destination -File -Recurse -Force).Count -ne $files.Count) { throw 'File count mismatch' }
        $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $destinationBase ($name + '-manifest.json')) -Encoding UTF8
        foreach ($handle in $handles) { $handle.Dispose() }; $handles.Clear()
        $now = @(Get-ChildItem -LiteralPath $source -File -Recurse -Force)
        if ($now.Count -ne $files.Count) { throw 'Source changed during copy' }
        Rename-Item -LiteralPath $source -NewName ([IO.Path]::GetFileName($backup))
        try {
            New-Item -ItemType Junction -Path $source -Target $destination | Out-Null
            $junction = Get-Item -LiteralPath $source -Force
            if ($junction.LinkType -ne 'Junction' -or [IO.Path]::GetFullPath([string]$junction.Target[0]).TrimEnd('\') -ne $destination.TrimEnd('\')) { throw 'Junction verification failed' }
            $switched = $true
        } catch {
            if (-not (Test-Path -LiteralPath $source)) { Rename-Item -LiteralPath $backup -NewName $name }
            throw
        }
        Write-Output "VERIFIED AND LINKED $name; removing verified originals"
        $expectedBackup = [IO.Path]::GetFullPath($backup).TrimEnd('\') + '\'
        foreach ($record in $manifest) {
            $old = [IO.Path]::GetFullPath((Join-Path $backup $record.RelativePath))
            if (-not $old.StartsWith($expectedBackup, [StringComparison]::OrdinalIgnoreCase)) { throw 'Original removal path outside backup' }
            if ((Get-Sha256 $old) -ne $record.SHA256 -or (Get-Sha256 (Join-Path $source $record.RelativePath)) -ne $record.SHA256) { throw 'Post-switch hash mismatch; keeping originals' }
        }
        foreach ($record in $manifest) {
            $old = Join-Path $backup $record.RelativePath
            $guard = [IO.File]::Open($old, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::Read -bor [IO.FileShare]::Delete))
            try {
                $sha = [Security.Cryptography.SHA256]::Create()
                try { $currentHash = [BitConverter]::ToString($sha.ComputeHash($guard)).Replace('-', '') } finally { $sha.Dispose() }
                if ($currentHash -ne $record.SHA256) { throw 'Original changed; keeping file' }
                [IO.File]::SetAttributes($old, [IO.FileAttributes]::Normal)
                [IO.File]::Delete($old)
            } finally { $guard.Dispose() }
        }
        $directories = @(Get-ChildItem -LiteralPath $backup -Directory -Recurse -Force | Sort-Object { $_.FullName.Length } -Descending)
        foreach ($directory in $directories) {
            if (-not $directory.FullName.StartsWith($expectedBackup, [StringComparison]::OrdinalIgnoreCase) -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe directory removal path' }
            [IO.Directory]::Delete($directory.FullName, $false)
        }
        [IO.Directory]::Delete($backup, $false)
        $result = [pscustomobject]@{Folder=$name;Status='Completed';Bytes=$bytes;Files=$files.Count;Source=$source;Destination=$destination;SHA256Verified=$true}
    } catch {
        $result = [pscustomobject]@{Folder=$name;Status='Stopped';Switched=$switched;Error=$_.Exception.Message;Source=$source;Destination=$destination}
    } finally {
        foreach ($handle in $handles) { $handle.Dispose() }
    }
    $result | ConvertTo-Json -Compress | Tee-Object -FilePath $log -Append
}
[IO.DriveInfo]::GetDrives() | Select-Object Name,TotalSize,AvailableFreeSpace | ConvertTo-Json

param()
$adaptersA = Get-NetAdapterStatistics | Select-Object Name, ReceivedBytes
Start-Sleep -Seconds 2
$adaptersB = Get-NetAdapterStatistics | Select-Object Name, ReceivedBytes

for ($i = 0; $i -lt $adaptersA.Count; $i++) {
    $diff = ($adaptersB[$i].ReceivedBytes - $adaptersA[$i].ReceivedBytes) / 2
    $mb = [math]::Round($diff / 1MB, 2)
    $mbps = [math]::Round($diff * 8 / 1MB, 2)
    Write-Output "$($adaptersA[$i].Name): $mb MB/s ($mbps Mbps)"
}

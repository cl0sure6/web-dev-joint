param(
    [string]$Php = 'D:\php\php.exe',
    [string]$Database = 'form_club',
    [string]$Server = '127.0.0.1',
    [int]$Port = 5432,
    [string]$AdminUser = 'postgres'
)
$ErrorActionPreference = 'Stop'
$previousOutputEncoding = $OutputEncoding
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$securePassword = Read-Host "PostgreSQL password for $AdminUser (hidden)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $payload = @{host=$Server;port=$Port;database=$Database;user=$AdminUser;password=$plainPassword} | ConvertTo-Json -Compress
    $payload | & $Php (Join-Path $PSScriptRoot 'setup-postgres.php')
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL setup did not finish. See the message above.' }
} finally {
    $OutputEncoding = $previousOutputEncoding
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $plainPassword = $null
    $payload = $null
    $securePassword.Dispose()
}

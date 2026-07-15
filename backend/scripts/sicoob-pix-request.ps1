param(
  [Parameter(Mandatory = $true)][string]$ClientId,
  [Parameter(Mandatory = $true)][string]$CertificateBase64,
  [Parameter(Mandatory = $true)][string]$CertificatePassword,
  [Parameter(Mandatory = $true)][string]$Scope,
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$Method,
  [string]$BodyBase64
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Security

$authUrl = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token'
$cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
  [Convert]::FromBase64String($CertificateBase64),
  $CertificatePassword,
  [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
)
$handler = [System.Net.Http.HttpClientHandler]::new()
$null = $handler.ClientCertificates.Add($cert)
$handler.SslProtocols = [System.Security.Authentication.SslProtocols]::Tls12
$client = [System.Net.Http.HttpClient]::new($handler)

$form = [System.Collections.Generic.List[System.Collections.Generic.KeyValuePair[string,string]]]::new()
$form.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('grant_type', 'client_credentials'))
$form.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('client_id', $ClientId))
$form.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('scope', $Scope))
$tokenResponse = $client.PostAsync($authUrl, [System.Net.Http.FormUrlEncodedContent]::new($form)).Result
$tokenText = $tokenResponse.Content.ReadAsStringAsync().Result

if (-not $tokenResponse.IsSuccessStatusCode) {
  [pscustomobject]@{ statusCode = [int]$tokenResponse.StatusCode; body = $tokenText } | ConvertTo-Json -Compress -Depth 6
  exit 1
}

$request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), $Url)
$request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', ($tokenText | ConvertFrom-Json).access_token)
$request.Headers.Add('x-sicoob-clientid', $ClientId)
if ($BodyBase64) {
  $bodyJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($BodyBase64))
  $request.Content = [System.Net.Http.StringContent]::new($bodyJson, [System.Text.Encoding]::UTF8, 'application/json')
}

$response = $client.SendAsync($request).Result
[pscustomobject]@{
  statusCode = [int]$response.StatusCode
  body = $response.Content.ReadAsStringAsync().Result
} | ConvertTo-Json -Compress -Depth 6

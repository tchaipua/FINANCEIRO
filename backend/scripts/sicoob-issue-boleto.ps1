param(
  [Parameter(Mandatory = $true)][string]$ClientId,
  [Parameter(Mandatory = $true)][string]$CertificateBase64,
  [Parameter(Mandatory = $true)][string]$CertificatePassword,
  [Parameter(Mandatory = $true)][string]$Scope,
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$BodyBase64
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Security

$authUrl = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token'
$certBytes = [Convert]::FromBase64String($CertificateBase64)
$bodyJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($BodyBase64))

$cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
  $certBytes,
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

$tokenContent = [System.Net.Http.FormUrlEncodedContent]::new($form)
$tokenResponse = $client.PostAsync($authUrl, $tokenContent).Result
$tokenText = $tokenResponse.Content.ReadAsStringAsync().Result

if (-not $tokenResponse.IsSuccessStatusCode) {
  [pscustomobject]@{
    statusCode = [int]$tokenResponse.StatusCode
    body = $tokenText
  } | ConvertTo-Json -Compress -Depth 6
  exit 1
}

$accessToken = ($tokenText | ConvertFrom-Json).access_token

$request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, $Url)
$request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $accessToken)
$request.Headers.Add('x-sicoob-clientid', $ClientId)
$request.Content = [System.Net.Http.StringContent]::new(
  $bodyJson,
  [System.Text.Encoding]::UTF8,
  'application/json'
)

$response = $client.SendAsync($request).Result
$responseText = $response.Content.ReadAsStringAsync().Result

[pscustomobject]@{
  statusCode = [int]$response.StatusCode
  body = $responseText
} | ConvertTo-Json -Compress -Depth 6

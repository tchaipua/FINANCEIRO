param(
  [Parameter(Mandatory = $true)][string]$ClientId,
  [Parameter(Mandatory = $true)][string]$CertificateBase64,
  [Parameter(Mandatory = $true)][string]$CertificatePassword,
  [Parameter(Mandatory = $true)][int]$NumeroCliente,
  [Parameter(Mandatory = $true)][int]$TipoMovimento,
  [Parameter(Mandatory = $true)][string]$DataInicial,
  [Parameter(Mandatory = $true)][string]$DataFinal,
  [Parameter(Mandatory = $false)][int]$MaxAttempts = 10,
  [Parameter(Mandatory = $false)][int]$SleepMilliseconds = 700
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Write-JsonAndExit {
  param(
    [Parameter(Mandatory = $true)][object]$Payload,
    [Parameter(Mandatory = $false)][int]$Code = 0
  )

  $Payload | ConvertTo-Json -Compress -Depth 16
  exit $Code
}

function New-HttpClient {
  param(
    [Parameter(Mandatory = $true)][System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate
  )

  $handler = [System.Net.Http.HttpClientHandler]::new()
  $null = $handler.ClientCertificates.Add($Certificate)
  $handler.SslProtocols = [System.Security.Authentication.SslProtocols]::Tls12
  return [System.Net.Http.HttpClient]::new($handler)
}

function Get-ApiMessage {
  param([string]$Body)

  try {
    $parsed = $Body | ConvertFrom-Json
    if ($parsed.mensagens -and $parsed.mensagens.Count -gt 0) {
      return [string]$parsed.mensagens[0].mensagem
    }
  } catch {
    return $null
  }

  return $null
}

try {
  $authUrl = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token'
  $apiBaseUrl = 'https://api.sicoob.com.br/cobranca-bancaria/v3'
  $certBytes = [Convert]::FromBase64String($CertificateBase64)
  $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
    $certBytes,
    $CertificatePassword,
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
  )

  $client = New-HttpClient -Certificate $certificate
  $form = [System.Collections.Generic.List[System.Collections.Generic.KeyValuePair[string,string]]]::new()
  $form.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('grant_type', 'client_credentials'))
  $form.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('client_id', $ClientId))
  $form.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('scope', 'boletos_consulta'))

  $tokenContent = [System.Net.Http.FormUrlEncodedContent]::new($form)
  $tokenResponse = $client.PostAsync($authUrl, $tokenContent).Result
  $tokenText = $tokenResponse.Content.ReadAsStringAsync().Result

  if (-not $tokenResponse.IsSuccessStatusCode) {
    Write-JsonAndExit @{
      statusCode = [int]$tokenResponse.StatusCode
      kind = 'TOKEN_ERROR'
      body = $tokenText
      message = 'Falha ao obter o token do Sicoob.'
    } 1
  }

  $accessToken = ($tokenText | ConvertFrom-Json).access_token

  $requestPayload = @{
    numeroCliente = $NumeroCliente
    tipoMovimento = $TipoMovimento
    dataInicial = $DataInicial
    dataFinal = $DataFinal
  } | ConvertTo-Json -Compress

  $request = [System.Net.Http.HttpRequestMessage]::new(
    [System.Net.Http.HttpMethod]::Post,
    "$apiBaseUrl/boletos/movimentacoes"
  )
  $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $accessToken)
  $request.Headers.Add('x-sicoob-clientid', $ClientId)
  $request.Content = [System.Net.Http.StringContent]::new(
    $requestPayload,
    [System.Text.Encoding]::UTF8,
    'application/json'
  )

  $solicitationResponse = $client.SendAsync($request).Result
  $solicitationBody = $solicitationResponse.Content.ReadAsStringAsync().Result

  if (-not $solicitationResponse.IsSuccessStatusCode) {
    $requestErrorMessage = Get-ApiMessage -Body $solicitationBody
    if (-not $requestErrorMessage) {
      $requestErrorMessage = 'Falha ao solicitar as movimentações do Sicoob.'
    }
    Write-JsonAndExit @{
      statusCode = [int]$solicitationResponse.StatusCode
      kind = 'REQUEST_ERROR'
      body = $solicitationBody
      message = $requestErrorMessage
    } 1
  }

  $codigoSolicitacao = ($solicitationBody | ConvertFrom-Json).resultado.codigoSolicitacao
  if (-not $codigoSolicitacao) {
    Write-JsonAndExit @{
      statusCode = [int]$solicitationResponse.StatusCode
      kind = 'REQUEST_ERROR'
      body = $solicitationBody
      message = 'Código da solicitação não retornado pelo Sicoob.'
    } 1
  }

  $summaryBody = $null
  $summaryParsed = $null

  for ($attempt = 0; $attempt -lt $MaxAttempts; $attempt++) {
    $summaryRequest = [System.Net.Http.HttpRequestMessage]::new(
      [System.Net.Http.HttpMethod]::Get,
      "$apiBaseUrl/boletos/movimentacoes?numeroCliente=$NumeroCliente&codigoSolicitacao=$codigoSolicitacao"
    )
    $summaryRequest.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $accessToken)
    $summaryRequest.Headers.Add('x-sicoob-clientid', $ClientId)

    $summaryResponse = $client.SendAsync($summaryRequest).Result
    $summaryBody = $summaryResponse.Content.ReadAsStringAsync().Result

    if ($summaryResponse.IsSuccessStatusCode) {
      $summaryParsed = $summaryBody | ConvertFrom-Json
      break
    }

    $summaryMessage = Get-ApiMessage -Body $summaryBody

    if ($summaryMessage -and $summaryMessage -match 'NENHUM REGISTRO') {
      Write-JsonAndExit @{
        statusCode = [int]$summaryResponse.StatusCode
        kind = 'SUCCESS'
        codigoSolicitacao = [int]$codigoSolicitacao
        totalRegistros = 0
        idArquivos = @()
        records = @()
      }
    }

    if ([int]$summaryResponse.StatusCode -eq 204 -or ($summaryMessage -and $summaryMessage -match 'PROCESSAMENTO')) {
      Start-Sleep -Milliseconds $SleepMilliseconds
      continue
    }

    if (-not $summaryMessage) {
      $summaryMessage = 'Falha ao consultar a solicitação de movimentações do Sicoob.'
    }
    Write-JsonAndExit @{
      statusCode = [int]$summaryResponse.StatusCode
      kind = 'SUMMARY_ERROR'
      body = $summaryBody
      message = $summaryMessage
    } 1
  }

  if (-not $summaryParsed) {
    Write-JsonAndExit @{
      statusCode = 504
      kind = 'SUMMARY_TIMEOUT'
      body = $summaryBody
      message = 'A solicitação de movimentações ainda está em processamento no Sicoob.'
    } 1
  }

  $records = New-Object System.Collections.Generic.List[object]
  $idArquivos = @($summaryParsed.resultado.idArquivos)
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
  [System.IO.Directory]::CreateDirectory($tempRoot) | Out-Null

  try {
    foreach ($idArquivo in $idArquivos) {
      $downloadRequest = [System.Net.Http.HttpRequestMessage]::new(
        [System.Net.Http.HttpMethod]::Get,
        "$apiBaseUrl/boletos/movimentacoes/download?numeroCliente=$NumeroCliente&codigoSolicitacao=$codigoSolicitacao&idArquivo=$idArquivo"
      )
      $downloadRequest.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $accessToken)
      $downloadRequest.Headers.Add('x-sicoob-clientid', $ClientId)

      $downloadResponse = $client.SendAsync($downloadRequest).Result
      $downloadBody = $downloadResponse.Content.ReadAsStringAsync().Result

      if (-not $downloadResponse.IsSuccessStatusCode) {
        $downloadMessage = Get-ApiMessage -Body $downloadBody
        if (-not $downloadMessage) {
          $downloadMessage = 'Falha ao baixar o arquivo de movimentações do Sicoob.'
        }
        Write-JsonAndExit @{
          statusCode = [int]$downloadResponse.StatusCode
          kind = 'DOWNLOAD_ERROR'
          body = $downloadBody
          message = $downloadMessage
        } 1
      }

      $downloadParsed = $downloadBody | ConvertFrom-Json
      $zipPath = Join-Path $tempRoot ([string]$downloadParsed.resultado.nomeArquivo)
      $extractDir = Join-Path $tempRoot ([System.Guid]::NewGuid().ToString())
      [System.IO.Directory]::CreateDirectory($extractDir) | Out-Null
      [System.IO.File]::WriteAllBytes(
        $zipPath,
        [Convert]::FromBase64String([string]$downloadParsed.resultado.arquivo)
      )
      [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractDir)

      Get-ChildItem -Path $extractDir -Filter *.json -File | ForEach-Object {
        $jsonText = [System.IO.File]::ReadAllText($_.FullName)
        $jsonArray = $jsonText | ConvertFrom-Json
        foreach ($record in @($jsonArray)) {
          $records.Add($record)
        }
      }
    }
  } finally {
    if (Test-Path $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }

  Write-JsonAndExit @{
    statusCode = 200
    kind = 'SUCCESS'
    codigoSolicitacao = [int]$codigoSolicitacao
    totalRegistros = [int]($summaryParsed.resultado.quantidadeTotalRegistros)
    idArquivos = @($idArquivos)
    records = @($records.ToArray())
  }
} catch {
  Write-JsonAndExit @{
    statusCode = 500
    kind = 'SCRIPT_ERROR'
    message = $_.Exception.Message
    lineNumber = $_.InvocationInfo.ScriptLineNumber
    position = $_.InvocationInfo.PositionMessage
  } 1
}

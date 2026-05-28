param(
  [Parameter(Mandatory = $true)][string]$ClientId,
  [Parameter(Mandatory = $true)][string]$CertificateBase64,
  [Parameter(Mandatory = $true)][string]$CertificatePassword,
  [Parameter(Mandatory = $true)][int]$NumeroContaCorrente,
  [Parameter(Mandatory = $true)][string]$PeriodStart,
  [Parameter(Mandatory = $true)][string]$PeriodEnd
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Security

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
    if ($parsed.message) {
      return [string]$parsed.message
    }
    if ($parsed.error_description) {
      return [string]$parsed.error_description
    }
  } catch {
    return $null
  }

  return $null
}

function Read-Property {
  param(
    [Parameter(Mandatory = $true)][object]$Object,
    [Parameter(Mandatory = $true)][string[]]$Names
  )

  foreach ($name in $Names) {
    if ($null -eq $Object) {
      continue
    }
    if ($Object.PSObject.Properties.Name -contains $name) {
      return $Object.$name
    }
  }

  return $null
}

try {
  $periodStartDate = [DateTime]::ParseExact($PeriodStart, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
  $periodEndDate = [DateTime]::ParseExact($PeriodEnd, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)

  if ($periodStartDate -gt $periodEndDate) {
    Write-JsonAndExit @{
      statusCode = 400
      kind = 'VALIDATION_ERROR'
      message = 'A data inicial do extrato bancario nao pode ser maior que a data final.'
    } 1
  }

  $authUrl = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token'
  $apiBaseUrl = 'https://api.sicoob.com.br'
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
  $form.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('scope', 'openid cco_extrato'))

  $tokenContent = [System.Net.Http.FormUrlEncodedContent]::new($form)
  $tokenResponse = $client.PostAsync($authUrl, $tokenContent).Result
  $tokenText = $tokenResponse.Content.ReadAsStringAsync().Result

  if (-not $tokenResponse.IsSuccessStatusCode) {
    $tokenMessage = Get-ApiMessage -Body $tokenText
    if (-not $tokenMessage) {
      $tokenMessage = 'Falha ao obter o token do Sicoob para extrato bancario.'
    }
    Write-JsonAndExit @{
      statusCode = [int]$tokenResponse.StatusCode
      kind = 'TOKEN_ERROR'
      body = $tokenText
      message = $tokenMessage
    } 1
  }

  $accessToken = ($tokenText | ConvertFrom-Json).access_token
  $transactions = New-Object System.Collections.Generic.List[object]
  $months = New-Object System.Collections.Generic.List[object]
  $balance = $null
  $cursor = Get-Date -Year $periodStartDate.Year -Month $periodStartDate.Month -Day 1
  $lastMonth = Get-Date -Year $periodEndDate.Year -Month $periodEndDate.Month -Day 1

  while ($cursor -le $lastMonth) {
    $month = [int]$cursor.Month
    $year = [int]$cursor.Year
    $requestUrl = "$apiBaseUrl/conta-corrente/v2/extrato/$month/$year`?numeroContaCorrente=$NumeroContaCorrente"
    $request = [System.Net.Http.HttpRequestMessage]::new(
      [System.Net.Http.HttpMethod]::Get,
      $requestUrl
    )
    $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $accessToken)
    $request.Headers.Add('x-sicoob-clientid', $ClientId)

    $response = $client.SendAsync($request).Result
    $body = $response.Content.ReadAsStringAsync().Result

    if (-not $response.IsSuccessStatusCode) {
      $statementMessage = Get-ApiMessage -Body $body
      if (-not $statementMessage) {
        $statementMessage = 'Falha ao consultar o extrato bancario no Sicoob.'
      }
      Write-JsonAndExit @{
        statusCode = [int]$response.StatusCode
        kind = 'STATEMENT_ERROR'
        accountNumber = $NumeroContaCorrente
        month = $month
        year = $year
        body = $body
        message = $statementMessage
      } 1
    }

    $parsed = $null
    try {
      $parsed = $body | ConvertFrom-Json
    } catch {
      $parsed = $null
    }

    $result = Read-Property -Object $parsed -Names @('resultado', 'result')
    if ($null -eq $result) {
      $result = $parsed
    }

    $monthBalance = Read-Property -Object $result -Names @('saldo', 'Saldo')
    if ($null -ne $monthBalance) {
      $balance = [decimal]$monthBalance
    }

    $monthTransactions = Read-Property -Object $result -Names @('transacoes', 'Transacoes', 'transactions')
    foreach ($transaction in @($monthTransactions)) {
      if ($null -eq $transaction) {
        continue
      }

      $dateValue = Read-Property -Object $transaction -Names @('data', 'Data')
      if ($dateValue) {
        $parsedDate = [DateTime]$dateValue
        if ($parsedDate.Date -lt $periodStartDate.Date -or $parsedDate.Date -gt $periodEndDate.Date) {
          continue
        }
      }

      $transactions.Add([pscustomobject]@{
        tipo = Read-Property -Object $transaction -Names @('tipo', 'Tipo')
        valor = Read-Property -Object $transaction -Names @('valor', 'Valor')
        data = Read-Property -Object $transaction -Names @('data', 'Data')
        dataLote = Read-Property -Object $transaction -Names @('dataLote', 'DataLote')
        descricao = Read-Property -Object $transaction -Names @('descricao', 'Descricao')
        numeroDocumento = Read-Property -Object $transaction -Names @('numeroDocumento', 'NumeroDocumento')
        cpfCnpj = Read-Property -Object $transaction -Names @('cpfCnpj', 'CpfCnpj')
        descInfComplementar = Read-Property -Object $transaction -Names @('descInfComplementar', 'DescInfComplementar')
      })
    }

    $months.Add([pscustomobject]@{
      month = $month
      year = $year
      statusCode = [int]$response.StatusCode
    })

    $cursor = $cursor.AddMonths(1)
  }

  Write-JsonAndExit @{
    statusCode = 200
    kind = 'SUCCESS'
    accountNumber = $NumeroContaCorrente
    periodStart = $PeriodStart
    periodEnd = $PeriodEnd
    balance = $balance
    months = @($months.ToArray())
    transactions = @($transactions.ToArray())
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

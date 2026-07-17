param(
  [Parameter(Mandatory = $true)][string]$ClientId,
  [Parameter(Mandatory = $true)][string]$CertificateBase64,
  [Parameter(Mandatory = $true)][string]$CertificatePassword,
  [Parameter(Mandatory = $true)][int]$NumeroContaCorrente
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

  $Payload | ConvertTo-Json -Compress -Depth 24
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
    if ($parsed.error) {
      return [string]$parsed.error
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

  if ($null -eq $Object) {
    return $null
  }

  foreach ($name in $Names) {
    foreach ($property in $Object.PSObject.Properties) {
      if ([string]::Equals($property.Name, $name, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $property.Value
      }
    }
  }

  return $null
}

function Resolve-ItemCollection {
  param([object]$Object)

  if ($null -eq $Object) {
    return @()
  }

  if ($Object -is [System.Array]) {
    return @($Object)
  }

  $candidate = Read-Property -Object $Object -Names @(
    'boletos',
    'items',
    'registros',
    'dados',
    'lista',
    'conteudo',
    'content'
  )

  if ($null -ne $candidate) {
    return Resolve-ItemCollection -Object $candidate
  }

  $result = Read-Property -Object $Object -Names @('resultado', 'result', 'data')
  if ($null -ne $result -and -not [object]::ReferenceEquals($result, $Object)) {
    return Resolve-ItemCollection -Object $result
  }

  return @()
}

function Normalize-Text {
  param([object]$Value)

  return [string]$Value -replace '^\s+|\s+$', ''
}

function Convert-ToDecimal {
  param([object]$Value)

  if ($null -eq $Value) {
    return 0
  }

  if ($Value -is [decimal] -or $Value -is [double] -or $Value -is [int] -or $Value -is [long]) {
    return [decimal]$Value
  }

  $normalized = ([string]$Value).Trim()
  if (-not $normalized) {
    return 0
  }

  $normalized = $normalized -replace '[^\d,.-]', ''
  if ($normalized.Contains(',') -and $normalized.Contains('.')) {
    $normalized = $normalized -replace '\.', ''
  }
  $normalized = $normalized -replace ',', '.'

  $parsed = 0
  if ([decimal]::TryParse($normalized, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
    return $parsed
  }

  return 0
}

function Test-IsOpenDdaStatus {
  param([object]$Value)

  $status = (Normalize-Text $Value).ToUpperInvariant()
  if (-not $status) {
    return $true
  }

  $closedMarkers = @(
    'PAGO',
    'PAGA',
    'LIQUIDADO',
    'LIQUIDADA',
    'BAIXADO',
    'BAIXADA',
    'CANCELADO',
    'CANCELADA',
    'EXCLUIDO',
    'EXCLUIDA',
    'REMOVIDO',
    'REMOVIDA'
  )

  foreach ($marker in $closedMarkers) {
    if ($status.Contains($marker)) {
      return $false
    }
  }

  return $true
}

function Convert-DdaItem {
  param([object]$Item)

  $status = Read-Property -Object $Item -Names @(
    'situacaoBoleto',
    'situacao',
    'status',
    'codigoTipoSituacaoBoleto',
    'descricaoSituacaoBoleto',
    'descricaoSituacao',
    'descricaoStatus'
  )

  return [pscustomobject]@{
    id = Read-Property -Object $Item -Names @('id', 'idBoleto', 'idTitulo', 'numeroIdentificadorBoletoCip', 'nossoNumero', 'numeroNossoNumero', 'numeroDocumento', 'codigoBarras', 'numeroCodigoBarras', 'linhaDigitavel', 'numeroLinhaDigitavel')
    dueDate = Read-Property -Object $Item -Names @('dataVencimentoBoleto', 'dataVencimento', 'vencimento', 'dueDate')
    issueDate = Read-Property -Object $Item -Names @('dataEmissao', 'emissao', 'issueDate')
    beneficiaryName = Read-Property -Object $Item -Names @('nomeBeneficiario', 'beneficiario', 'nomeCedente', 'cedente', 'razaoSocialBeneficiario', 'nomeRazaoSocialBeneficiario', 'nomeFantasiaBeneficiario')
    beneficiaryDocument = Read-Property -Object $Item -Names @('cpfCnpjBeneficiario', 'numeroCpfCnpjBeneficiario', 'documentoBeneficiario', 'cnpjBeneficiario', 'cpfCnpjCedente', 'documentoCedente')
    payerName = Read-Property -Object $Item -Names @('nomePagador', 'pagador', 'nomeSacado', 'sacado', 'nomeRazaoSocialPagador', 'nomeFantasiaPagador')
    payerDocument = Read-Property -Object $Item -Names @('cpfCnpjPagador', 'numeroCpfCnpjPagador', 'documentoPagador', 'cpfCnpjSacado', 'documentoSacado')
    documentNumber = Read-Property -Object $Item -Names @('numeroDocumento', 'seuNumero', 'identificacaoBoletoEmpresa', 'nossoNumero', 'numeroNossoNumero')
    digitableLine = Read-Property -Object $Item -Names @('linhaDigitavel', 'numeroLinhaDigitavel', 'linhaDigitavelBoleto')
    barcode = Read-Property -Object $Item -Names @('codigoBarras', 'numeroCodigoBarras', 'codigoBarrasBoleto')
    amount = Convert-ToDecimal (Read-Property -Object $Item -Names @('valor', 'valorBoleto', 'valorDocumento', 'valorTitulo', 'valorNominal', 'valorOriginal'))
    status = if ($status) { $status } else { 'EM ABERTO' }
    rawPayloadJson = ($Item | ConvertTo-Json -Compress -Depth 16)
  }
}

try {
  if ($NumeroContaCorrente -le 0) {
    Write-JsonAndExit @{
      statusCode = 400
      kind = 'VALIDATION_ERROR'
      message = 'Conta corrente invalida para consultar DDA no Sicoob.'
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
  # O endpoint do Sicoob aceita no maximo 60 dias por consulta.
  # A janela inclui 30 dias anteriores, o dia atual e 29 dias futuros.
  $referenceDate = (Get-Date).Date
  $dataInicial = $referenceDate.AddDays(-30).ToString('yyyy-MM-dd')
  $dataFinal = $referenceDate.AddDays(29).ToString('yyyy-MM-dd')
  $scopeCandidates = @(
    'pagamentos_boletos_consultar',
    'openid pagamentos',
    'openid pagamentos_consulta',
    'openid pagamentos_boletos_consultar',
    'openid cco_consulta',
    'openid boletos_consulta',
    'pagamentos_boletos_consulta',
    'pagamentos',
    'pagamentos_consulta',
    'cco_consulta',
    'boletos_consulta'
  )
  $attempts = New-Object System.Collections.Generic.List[object]

  foreach ($scope in $scopeCandidates) {
    $form = [System.Collections.Generic.List[System.Collections.Generic.KeyValuePair[string,string]]]::new()
    $form.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('grant_type', 'client_credentials'))
    $form.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('client_id', $ClientId))
    $form.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('scope', $scope))

    $tokenContent = [System.Net.Http.FormUrlEncodedContent]::new($form)
    $tokenResponse = $client.PostAsync($authUrl, $tokenContent).Result
    $tokenText = $tokenResponse.Content.ReadAsStringAsync().Result

    if (-not $tokenResponse.IsSuccessStatusCode) {
      $attempts.Add([pscustomobject]@{
        scope = $scope
        step = 'TOKEN'
        statusCode = [int]$tokenResponse.StatusCode
        message = Get-ApiMessage -Body $tokenText
      })
      continue
    }

    $accessToken = ($tokenText | ConvertFrom-Json).access_token
    $requestUrl = "$apiBaseUrl/pagamentos/v3/boletos?numeroConta=$NumeroContaCorrente&dataInicial=$dataInicial&dataFinal=$dataFinal&situacao=1&tipoData=1"
    $request = [System.Net.Http.HttpRequestMessage]::new(
      [System.Net.Http.HttpMethod]::Get,
      $requestUrl
    )
    $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $accessToken)
    $request.Headers.Add('x-sicoob-clientid', $ClientId)
    $request.Headers.Add('client_id', $ClientId)

    $response = $client.SendAsync($request).Result
    $body = $response.Content.ReadAsStringAsync().Result

    if (-not $response.IsSuccessStatusCode) {
      $ddaMessage = Get-ApiMessage -Body $body
      $attempts.Add([pscustomobject]@{
        scope = $scope
        step = 'DDA'
        statusCode = [int]$response.StatusCode
        message = $ddaMessage
      })

      if ([int]$response.StatusCode -eq 401 -or [int]$response.StatusCode -eq 403 -or [int]$response.StatusCode -eq 404) {
        continue
      }

      if (-not $ddaMessage) {
        $ddaMessage = 'Falha ao consultar boletos DDA no Sicoob.'
      }
      Write-JsonAndExit @{
        statusCode = [int]$response.StatusCode
        kind = 'DDA_ERROR'
        accountNumber = $NumeroContaCorrente
        scope = $scope
        body = $body
        message = $ddaMessage
      } 1
    }

    $parsed = $null
    try {
      $parsed = $body | ConvertFrom-Json
    } catch {
      $parsed = $null
    }

    $allItems = Resolve-ItemCollection -Object $parsed
    $openItems = New-Object System.Collections.Generic.List[object]

    foreach ($item in @($allItems)) {
      if ($null -eq $item) {
        continue
      }

      $status = Read-Property -Object $item -Names @(
        'situacaoBoleto',
        'situacao',
        'status',
        'codigoTipoSituacaoBoleto',
        'descricaoSituacaoBoleto',
        'descricaoSituacao',
        'descricaoStatus'
      )

      if (Test-IsOpenDdaStatus -Value $status) {
        $openItems.Add((Convert-DdaItem -Item $item))
      }
    }

    Write-JsonAndExit @{
      statusCode = 200
      kind = 'SUCCESS'
      accountNumber = $NumeroContaCorrente
      scope = $scope
      rawCount = @($allItems).Count
      openCount = $openItems.Count
      pulledAt = (Get-Date).ToUniversalTime().ToString('o')
      items = @($openItems.ToArray())
    }
  }

  $lastAttempt = $attempts | Select-Object -Last 1
  $message = 'A API de DDA/Pagamentos do Sicoob rejeitou a consulta. Verifique se a aplicacao possui a API de pagamentos/DDA liberada na cooperativa.'
  if ($lastAttempt -and $lastAttempt.message) {
    $message = [string]$lastAttempt.message
  }

  Write-JsonAndExit @{
    statusCode = if ($lastAttempt) { [int]$lastAttempt.statusCode } else { 400 }
    kind = 'DDA_ERROR'
    accountNumber = $NumeroContaCorrente
    attempts = @($attempts.ToArray())
    body = ($attempts | ConvertTo-Json -Compress -Depth 8)
    message = $message
  } 1
} catch {
  Write-JsonAndExit @{
    statusCode = 500
    kind = 'SCRIPT_ERROR'
    message = $_.Exception.Message
    lineNumber = $_.InvocationInfo.ScriptLineNumber
    position = $_.InvocationInfo.PositionMessage
  } 1
}

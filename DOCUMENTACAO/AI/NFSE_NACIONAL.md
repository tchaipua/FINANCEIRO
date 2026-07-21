# NFS-E NACIONAL

## Escopo entregue

Motor de NFS-e Nacional no sistema `Financeiro`, isolado por empresa e filial,
sem reutilizar o agregado da NF-e. A interface fica em uma única tela,
organizada em seis abas, acessada pelo card `NOTA FISCAL DE SERVIÇO` da central
de parâmetros fiscais.

## Checklist funcional

- [x] emitente fiscal compartilhado com a filial da NF-e;
- [x] certificado A1 do mesmo CNPJ;
- [x] inscrição municipal consultada no CNC e gravada na filial;
- [x] perfil por filial/ambiente/série;
- [x] catálogo de serviços com CNAE, tributação nacional/municipal, NBS e ISS;
- [x] múltiplas descrições reutilizáveis por serviço, com uma descrição padrão;
- [x] consulta de convênio e parâmetros municipais oficiais;
- [x] tomador reutilizando `Party`, inclusive o pagador de duplicata;
- [x] emissão manual idempotente;
- [x] opção de emissão automática para venda de serviço;
- [x] DPS XML 1.01 e assinatura XMLDSig com A1;
- [x] compactação GZip/Base64 e comunicação mTLS com SEFIN Nacional;
- [x] persistência de snapshots, tentativas, retornos e auditoria;
- [x] obtenção do XML autorizado e DANFSe oficial pela chave;
- [x] envio SMTP automático/manual do XML e PDF após autorização;
- [x] homologação com destinatário fixo de e-mail;
- [x] soft delete e isolamento por tenant/filial;
- [ ] ativação externa do convênio de Ipuã no ambiente restrito.

## Cenário MSINFOR validado em 18 e 19/07/2026

- filial: `4 - MSINFOR`;
- município: Ipuã/SP, IBGE `3521309`;
- inscrição municipal: `1299`, localizada no CNC oficial de produção;
- serviço: suporte técnico em informática;
- código nacional: `010701`;
- CNAE: `6209100`;
- NBS: `115013000`;
- tomador: o mesmo `Party` usado como destinatário da NF-e;
- valor: R$ 10,00;
- ambiente: produção restrita.

A DPS série 1 número 2 foi gerada, assinada e transmitida. A SEFIN retornou:

`E0037 - O CÓDIGO DO MUNICÍPIO EMISSOR INFORMADO NA DPS É INEXISTENTE NO CADASTRO DE CONVÊNIO MUNICIPAL DO SISTEMA NACIONAL.`

Antes da transmissão, o XML assinado dessa DPS foi validado com sucesso contra
o `DPS_v1.01.xsd` do pacote oficial de 09/02/2026, e a assinatura incorporada
foi verificada com o certificado público presente no próprio XML.

O endpoint oficial de convênio também informa que Ipuã ainda não está ativo no
ambiente restrito. Por isso não há NFS-e autorizada, XML oficial ou DANFSe para
enviar. O sistema mantém a tentativa e não cria PDF/XML fictício.

Em 19/07/2026, o convênio foi consultado novamente e continuou inativo. A DPS
série 1 número 3 foi assinada com o certificado A1 do CNPJ
`69342038000149`, teve sua assinatura XML validada e foi transmitida por mTLS.
A SEFIN repetiu a rejeição `E0037`. A tentativa ficou persistida sem título no
Contas a Receber, sem XML autorizado, sem DANFSe e sem envio de e-mail.

## CNPJ alfanumérico

O utilitário comum do Financeiro já normaliza e valida o CNPJ alfanumérico pelo
algoritmo oficial. Entretanto, o XSD NFS-e 1.01 vigente ainda define `TSCNPJ`
como 14 dígitos numéricos. Assim, a DPS bloqueia CNPJ alfanumérico até que o
Sistema Nacional publique um leiaute compatível; alterar isso antes produziria
XML inválido.

## Condição para concluir a homologação

A Prefeitura de Ipuã ou a administração do Sistema Nacional deve ativar o
convênio do município no ambiente restrito e carregar o contribuinte no CNC de
homologação. Depois disso basta usar a própria tela para consultar novamente e
reemitir; quando houver autorização, o Financeiro obterá o DANFSe e enviará XML
e PDF ao e-mail fixo configurado.

## Fontes oficiais

- Documentação atual: `https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual`
- APIs de produção restrita e produção: `https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao`
- Produção restrita: `https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita`
- Monitoramento municipal: `https://www.gov.br/nfse/pt-br/municipios/monitoramento-adesoes/municipios-aderentes`

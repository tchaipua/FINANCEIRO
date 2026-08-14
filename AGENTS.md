# Regra permanente de propriedade de clientes

O Financeiro e sempre um modulo consumidor incorporado a outro sistema e nunca
opera sozinho.

- E proibido cadastrar, alterar, ativar ou inativar clientes diretamente no
  Financeiro.
- O cadastro mestre do cliente pertence sempre ao sistema de origem.
- Clientes chegam exclusivamente pela API autenticada de sincronizacao e devem
  conservar identificadores externos idempotentes.
- No Projeto Inicial/Petshop, a pessoa com papel `CLIENTE` e enviada ao
  Financeiro; quando possui animal, ela e o tutor e continua sendo o cliente e
  pagador. O animal nunca e cliente financeiro.
- Na Escola, aluno ou responsavel definido como pagador e enviado pela
  integracao; nenhum deles e mantido localmente no Financeiro.
- Registros historicos locais eventualmente existentes podem ser consultados,
  mas nunca autorizam novas mutacoes locais.

Esta regra e arquitetural e nao pode ser flexibilizada por vertical, tenant,
filial, interface ou modo de execucao.

## Regra permanente de empresa e filial

- O Financeiro nao possui cadastro nem grade propria de empresas/filiais.
- O card EMPRESA apenas abre a tela unica implementada no MSINFOR Central.
- Essa tela deve abrir incorporada na propria area do Financeiro; e proibido
  usar nova janela, nova aba ou pop-up.
- A Central exibe todas as empresas em sua sessao administrativa e somente a
  empresa logada quando a chamada vier do Financeiro.
- O isolamento deve ser imposto no backend da Central pela sessao tecnica; um
  filtro apenas visual nunca e suficiente.

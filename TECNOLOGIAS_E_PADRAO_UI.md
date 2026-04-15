# TECNOLOGIAS E PADRAO UI

## Objetivo

Registrar a stack oficial inicial do projeto `Financeiro` e a diretriz visual que sera usada nas telas consumidoras desse nucleo nas outras verticais.

## Stack oficial

- Linguagem backend: `TypeScript`
- Framework backend: `NestJS`
- ORM: `Prisma`
- Banco oficial para modelagem e producao: `PostgreSQL`
- Documentacao de API: `Swagger`
- Validacao backend: `class-validator` + `class-transformer` + `ValidationPipe`

## Escopo inicial

- O `Financeiro` nascera inicialmente como nucleo `backend` sem `frontend` proprio
- Nao havera login humano no projeto `Financeiro`
- O consumo operacional sera feito pelos outros sistemas por `API`

## Arquitetura inicial

- Projeto separado dos outros sistemas
- Estrutura base inicial em `backend/`
- Backend em monolito modular por dominio
- Sem login humano proprio
- Integracao com escola, petshop, lojas, oficinas e outros por `API`
- Sem acoplamento de regra de negocio do core financeiro com entidades especificas como `aluno`, `professor`, `pet`, `animal` ou `cliente da loja`
- Multiempresa obrigatorio
- Auditoria obrigatoria em mutacoes
- Soft delete para dados de negocio, salvo decisoes futuras e documentadas para excecoes tecnicas especificas

## Regra de banco

- O banco oficial do `Financeiro` sera proprio e separado dos bancos das verticais
- O projeto deve ser modelado pensando em `PostgreSQL` desde o inicio
- `SQLite` so pode ser usado em testes locais ou prototipos temporarios, nunca como referencia de modelagem definitiva

## Regra visual

- Como o `Financeiro` nao tera interface humana propria no escopo inicial, a regra visual se aplica as telas das verticais consumidoras
- Regra pratica:
  - as telas financeiras da escola continuam com o layout da escola
  - as telas financeiras do petshop continuam com o layout do petshop
  - a experiencia pode reaproveitar os mesmos padroes estruturais aprovados, sem criar uma marca visual unica obrigatoria do `Financeiro`

## Diretriz de consistencia

- Sempre que for possivel, reaproveitar os padroes documentados em `C:\Sistemas\IA\Escola\DOCUMENTACAO\AI\UI_PATTERNS.md`
- O objetivo e manter familiaridade para o usuario e velocidade de desenvolvimento, sem acoplar o visual do `Financeiro` a uma vertical especifica

## Padrao de grid aprovado

- A tela de bancos passou a ser a referencia visual para futuras telas de listagem em grid no `Financeiro`
- O padrao aprovado inclui:
  - cabecalho com faixa azul em gradiente, titulo principal e acao de retorno ao menu
  - barra de acoes com `Incluir` no canto esquerdo
  - campo de busca central
  - `Pesquisar` e `Limpar Consulta` na mesma linha
  - `Limpar Consulta` visivel somente quando houver filtro preenchido
  - botoes em formato icone quando fizer sentido
  - cards brancos com borda suave e sombra discreta
  - grid/tabela em card proprio, com cabecalho sutil e estado vazio padronizado
  - rodape da grid com `Colunas` a esquerda, acao de exportacao/impressao e identificacao da tela com copiar a direita
  - modal de colunas com overlay escurecido, painel grande, contagem de colunas visiveis, restaurar padrao, salvar/fechar, reordenacao, visibilidade e arraste
  - persistencia por `sourceTenantId`, sem misturar empresas entre tenants
  - exportacao respeitando filtros atuais e configuracao de colunas
- O layout base reutilizavel foi documentado no frontend em `frontend/src/app/lib/grid-page-standards.ts`
- Novas telas de grid devem seguir esse padrão, salvo se houver excecao explicita aprovada pelo usuario

## Regra de acesso

- O `Financeiro` nao tera login humano proprio
- O uso operacional acontecera a partir dos sistemas consumidores, como escola, petshop, loja e oficina
- O `Financeiro` atuara como nucleo tecnico e integrador por `API`

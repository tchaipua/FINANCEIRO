# Financeiro Frontend

Painel operacional do core financeiro, seguindo a linguagem visual da `Escola`.

## Como rodar

1. Rode `npm install`
2. Configure `NEXT_PUBLIC_FINANCEIRO_ORIGIN_API_URL=/api/financeiro`; deve ser
   sempre um caminho same-origin para o BFF da Escola/Projeto
3. Rode `npm run dev`

O navegador nunca recebe a chave HMAC nem acessa diretamente o backend
Financeiro.

# App Finanças

Aplicação de finanças pessoais em português do Brasil, com Next.js 16, React, TypeScript, Tailwind CSS e Supabase Auth/Postgres. O visual original foi preservado.

## Executar

Use Node.js 22 ou superior (validado com Node.js 24) e npm.

1. Instale as dependências com `npm ci`.
2. Configure `.env.local` a partir de `.env.example`, usando somente URL e chave publicável do Supabase.
3. Aplique as migrações, em ordem, seguindo [o guia do MVP financeiro](docs/financial-mvp.md).
4. Confira as configurações de e-mail e redirecionamento no [guia de autenticação](docs/supabase.md).
5. Execute `npm run dev` e abra http://localhost:3000.

O projeto não aplica migrações nem publica infraestrutura automaticamente. Sem as tabelas, o aplicativo exibe um erro de configuração; não usa valores fictícios como fallback.

## Funcionalidades

- Cadastro, login, logout, confirmação de e-mail e recuperação de senha.
- Configuração inicial editável: renda base, despesas fixas base e orçamento variável.
- Categorias por usuário com criação, edição, arquivamento e reativação.
- Receitas e despesas com criação, edição, exclusão confirmada e situação prevista/realizada.
- Histórico por mês, intervalo dentro do mês, tipo, categoria, situação e descrição.
- CSV dos registros filtrados com BOM UTF-8, separador `;`, vírgula decimal e proteção contra fórmulas.
- Regras mensais de receitas/despesas e geração idempotente de ocorrências ao consultar o período. Receitas recorrentes até hoje passam a realizadas pela data do perfil.
- Orçamentos variáveis por mês, gerais e por categoria.
- Dashboard real e avisos internos em 70%, 85% e 100% do orçamento variável.
- Perfil e fuso horário persistidos.
- Tema claro/escuro com preferência do navegador e espaçamento ajustado entre os blocos.

Não há integração bancária, cartões/parcelamento, push, investimentos, aplicativos nativos ou execução agendada de recorrências.

## Regras financeiras

Valores são centavos inteiros, entre R$ 0,01 e R$ 999.999.999,99 por lançamento. O orçamento pode ser zero. Em branco significa orçamento não configurado.

- Saldo realizado do mês = receitas realizadas − despesas realizadas.
- Disponível no orçamento = limite variável − despesas variáveis realizadas.
- Despesas fixas entram no saldo, mas não consomem o orçamento variável.
- Previsões aparecem separadas e não alteram os totais realizados.
- O período é mês calendário; não há início personalizado nem transporte automático de saldo/limites.
- O fuso do perfil define a data atual. Lançamentos usam `date`, sem deslocamento por conversão de UTC.
- Receitas recorrentes são realizadas na data programada ao consultar o mês; as futuras ficam previstas. Ajustes manuais no histórico mantêm a situação escolhida.
- Confirmar pagamento/recebimento altera a mesma ocorrência.
- Editar uma regra preserva realizados e modifica previsões a partir do mês de vigência escolhido.
- Regras mantêm versões para meses ainda não consultados. Um novo ajuste substitui as versões futuras a partir de sua vigência.
- Excluir pela interface mantém uma marca de exclusão, impedindo regeneração da mesma ocorrência.

## Verificação

| Comando | Finalidade |
| --- | --- |
| `npm run lint` | ESLint. |
| `npm run typecheck` | Geração de tipos de rotas e TypeScript sem emissão. |
| `npm run test:unit` | Dinheiro, calendário, fuso, cálculos, CSV, validação e utilitários de autenticação; dispensa build/servidor. |
| `npm run test:db` | Migrações, constraints, RLS e recorrências em PostgreSQL local em memória (PGlite). |
| `npm run build` | Build de produção e tipos. |
| `npm test` | Unitários e navegador; execute build antes. |
| `npm run test:rls:remote` | Teste opcional com duas contas reais de teste e visitante, via API pública. |

Playwright usa o Google Chrome local em modo headless, desktop e celular. O servidor temporário usa `127.0.0.1:3100`; deixe a porta livre. Artefatos ficam em `test-results/`.

Os testes de autenticação pública interceptam o provedor e não enviam e-mails. Os testes financeiros de navegador exigem `E2E_EMAIL` e `E2E_PASSWORD`, de um projeto de testes com as migrações aplicadas. Sem essas variáveis, ficam explicitamente ignorados. O teste remoto de RLS exige ainda opt-in `RUN_REMOTE_RLS=1`; não é disparado por `npm test`.

## Organização

| Local | Responsabilidade |
| --- | --- |
| `supabase/migrations/` | Schema, RLS, inicialização e funções financeiras versionadas. |
| `src/lib/finance-server.ts` | Consultas e gravações com usuário validado, validação e RLS. |
| `src/app/api/finance/route.ts` | API autenticada, sem cache compartilhado, com verificação de origem em gravações. |
| `src/lib/finance.ts` | Regras puras de dinheiro, calendário, resumo, filtros e CSV. |
| `src/lib/finance-validation.ts` | Validação de campos aceitos pelo servidor. |
| `src/lib/supabase/`, `src/proxy.ts` | Clientes separados e sessão em cookies. |
| `src/components/finance-provider.tsx` | Carregamento, recarga e estado das consultas; sem dados simulados. |
| `src/components/` | Telas e formulários, mantendo as classes e navegação existentes. |
| `src/app/(protected)/` | Rotas financeiras com validação de sessão no servidor. |
| `scripts/database.test.mjs` | Testes locais de Postgres, com operações sob papéis sujeitos a RLS. |
| `scripts/rls-remote.test.mjs` | Verificação opcional de duas contas via Supabase Auth e Data API. |
| `docs/financial-mvp.md` | Ordem dos SQLs, decisões, limitações e roteiro de validação. |
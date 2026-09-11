# Verificação da entrega financeira e ajustes de interface

Resultados executados localmente, incluindo os ajustes de espaçamento, tema escuro e receitas por data (11/09/2026):

| Comando | Resultado |
| --- | --- |
| `npm run lint` | Passou, sem erros ou avisos de lint. |
| `npm run typecheck` | Passou: tipos de rotas e TypeScript. |
| `npm run test:unit` | 12 testes passaram. |
| `npm run test:db` | 12 testes passaram, incluindo o teste agrupador e 11 cenários de banco. |
| `npm run build` | Passou: build de produção e tipos. |
| Suite completa com `.env.e2e.local` | 34 testes passaram, incluindo os 6 E2E autenticados em desktop e celular; nenhum ignorado. |
| `npm run test:rls:remote` | 1 teste ignorado, pois o opt-in e as duas contas não foram configurados. |
| `git diff --check` | Sem erros de espaços em branco. |

Os 12 testes unitários e os 6 E2E autenticados fazem parte dos 34 aprovados; os números não devem ser somados como testes distintos. A última execução completa terminou em aproximadamente 1,6 minuto:

```powershell
node --env-file=.env.e2e.local ./node_modules/@playwright/test/cli.js test --workers=1 --trace=off
```

As credenciais atualizadas foram aceitas pelo Supabase. Os testes revelaram dois problemas corrigidos: navegação após login que reutilizava redirecionamento anônimo, e comparação de origem que confundia `127.0.0.1` com a normalização para `localhost` do NextURL. A autenticação agora inicia uma navegação completa após salvar a sessão; a API compara a origem com o Host real e o protocolo, preservando o bloqueio de outras origens. O problema de pré-carregamento de rotas e sessão está descrito no [guia oficial do Supabase](https://supabase.com/docs/guides/auth/server-side/advanced-guide#no-session-on-the-server-side-with-nextjs-route-prefetching).

Os seletores de valor e categoria dos testes foram corrigidos para usar o nome acessível dos controles. A preparação aguarda explicitamente a resposta do Auth e dá tempo às consultas remotas, mantendo falhas explícitas para login rejeitado e ações que não terminam.

## O que os resultados comprovam

- Conversão de valores brasileiros para centavos, datas e meses válidos, ano bissexto e virada de mês no fuso do perfil.
- Separação de previstos/realizados e despesas fixas/variáveis, orçamento ausente versus zero e avisos em 70/85/100%.
- Filtros compartilhados com CSV e neutralização de fórmulas.
- Compilação dos componentes, handlers e consultas.
- Com a conta configurada: login, recarga de sessão, logout e proteção de rotas; lançamento, persistência, edição, CSV e exclusão confirmada; criação, edição e arquivamento de categorias em desktop e celular.
- Tema inicial conforme o sistema, alternância claro/escuro e preferência persistida entre páginas e recargas em desktop/celular; screenshots de login/cadastro escuros revisados visualmente.
- Migração incremental sobre receitas já existentes: preservação de IDs, realizados e exclusões, sem alterar receitas de outra conta ao gerar um mês.
- Receitas recorrentes passadas e de hoje realizadas, futuras previstas, transição na mesma ocorrência conforme o fuso do perfil, correção manual preservada e despesas vencidas ainda previstas.
- Edição de regra preserva o valor de receitas automáticas já vencidas.
- Bloqueio de visitantes nas rotas financeiras/API, recusa de POST de outra origem e manutenção dos formulários públicos em desktop/celular.
- Aplicação das três migrações em PostgreSQL local, inicialização de usuários novos/antigos e repetição sem duplicação.
- RLS local com dois usuários e papel visitante, sem BYPASSRLS nas operações testadas: leitura, inserção, edição, exclusão, mudança de proprietário e referências alheias.
- Validações de banco, ocorrência única por regra/mês em geração repetida, confirmação da mesma ocorrência, versões futuras e preservação de realizados/exclusões.

O PGlite usa uma conexão local e helpers de identidade preparados pelo teste. Ele não comprova concorrência entre conexões reais nem integração remota do Auth/PostgREST.

## Pendências explícitas

1. Inspecionar se há schema financeiro remoto não documentado no repositório.
2. Aplicar manualmente a migração `202609100003_income_by_date.sql` se 001/002 já estiverem instaladas; para um banco novo, aplicar as três em ordem conforme [o guia financeiro](financial-mvp.md).
3. Ampliar a validação remota para configuração inicial, regras recorrentes e orçamentos; o CRUD de lançamentos/categorias e as consultas usadas pelos seis E2E já passaram.
4. Conferir visualmente todas as telas financeiras nos dois temas; os testes autenticados verificam os fluxos de `tests/app.spec.ts` em desktop e celular.
5. Executar o script remoto com duas contas de teste e visitante, incluindo as seis chamadas concorrentes de geração.
6. Conferir o CSV no Excel e concluir o roteiro manual documentado.

Nenhuma migração foi aplicada ao banco remoto, nenhuma infraestrutura foi publicada e as operações autenticadas descritas acima foram verificadas no Supabase configurado, sem presumir cobertura dos demais fluxos. A autenticação por e-mail manteve seu fluxo; os testes públicos interceptam envios para não criar contas ou disparar mensagens.
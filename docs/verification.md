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
| RLS remoto com `.env.rls.local` | 1 teste integrado passou em 14/09/2026, com duas contas reais e visitante; nenhuma falha ou teste ignorado. |
| `git diff --check` | Sem erros de espaços em branco. |

Os 12 testes unitários e os 6 E2E autenticados fazem parte dos 34 aprovados; os números não devem ser somados como testes distintos. A última execução completa terminou em aproximadamente 1,6 minuto:

```powershell
node --env-file=.env.e2e.local ./node_modules/@playwright/test/cli.js test --workers=1 --trace=off
```

As credenciais atualizadas foram aceitas pelo Supabase. Os testes revelaram dois problemas corrigidos: navegação após login que reutilizava redirecionamento anônimo, e comparação de origem que confundia `127.0.0.1` com a normalização para `localhost` do NextURL. A autenticação agora inicia uma navegação completa após salvar a sessão; a API compara a origem com o Host real e o protocolo, preservando o bloqueio de outras origens. O problema de pré-carregamento de rotas e sessão está descrito no [guia oficial do Supabase](https://supabase.com/docs/guides/auth/server-side/advanced-guide#no-session-on-the-server-side-with-nextjs-route-prefetching).

Os seletores de valor e categoria dos testes foram corrigidos para usar o nome acessível dos controles. A preparação aguarda explicitamente a resposta do Auth e dá tempo às consultas remotas, mantendo falhas explícitas para login rejeitado e ações que não terminam.

## RLS remoto executado em 14/09/2026

```powershell
node --env-file=.env.rls.local --test scripts/rls-remote.test.mjs
```

O teste integrado passou em aproximadamente 31 segundos. Usou Supabase Auth e a Data API com a chave publicável e duas contas distintas, sem SQL Editor administrativo ou service_role. Verificou leitura, inserção, edição e exclusão permitidas ou negadas; IDs e categorias alheios; proprietário imutável; vínculo com recorrência de outra conta; bloqueio de visitante nas tabelas e RPCs; seis gerações HTTP simultâneas com uma única ocorrência; ajuste de fevereiro para o dia 28; e preservação do valor realizado após editar a regra.

As consultas e tentativas de edição/exclusão do visitante foram restringidas aos IDs usados pelo teste, evitando operações sem filtro se houver uma regressão nas políticas. `npm run lint` também passou após esse ajuste. O teste integrado reúne vários cenários, mas é contabilizado pelo Node como um único teste. Este resultado cobre as operações presentes no script; não equivale a uma auditoria completa de segurança.

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
5. Conferir o CSV no Excel e concluir o roteiro manual documentado.

Nenhuma migração foi aplicada ao banco remoto, nenhuma infraestrutura foi publicada e as operações autenticadas descritas acima foram verificadas no Supabase configurado, sem presumir cobertura dos demais fluxos. A autenticação por e-mail manteve seu fluxo; os testes públicos interceptam envios para não criar contas ou disparar mensagens.
## Correção da confirmação de e-mail — 14/09/2026

Validações executadas após a correção do callback:

| Comando | Resultado |
| --- | --- |
| `npm run lint` | Passou. |
| `npm run typecheck` | Passou. |
| `npm run build` | Passou. |
| `npm run test:unit` | 19 testes passaram, incluindo 7 novos cenários de confirmação. |
| `node ./node_modules/@playwright/test/cli.js test tests/auth.spec.ts --workers=1 --trace=off` | 24 testes passaram em desktop e celular. |

Os novos casos verificam `type=email`/`signup`/`recovery`, código PKCE, ausência do verificador, confirmação sem sessão, separação entre link consumido e falha de conexão, destinos internos, preservação de `127.0.0.1`, processamento e remoção do fragmento da URL, instalação de cookies e rejeição de erros do provedor. Nenhum token ou mensagem bruta é refletido nas URLs de erro.

As verificações de token hash e código usam um cliente de Auth simulado nos testes unitários. Os testes de fragmento interceptam o Auth e a página de destino: não comprovam a validade de um JWT real nem o template remoto. Nenhum e-mail foi enviado nem consumido nesta rodada. Os 6 E2E financeiros e o RLS remoto não foram repetidos nesta correção; os resultados anteriores permanecem registrados acima. Falta validar um novo e-mail real com o template do painel conforme `docs/supabase.md`.

## Exclusão definitiva de conta — 14/09/2026

| Comando executado | Resultado |
| --- | --- |
| `npm run lint` | Passou. |
| `npm run typecheck` | Passou. |
| `npm run test:unit` | 30 testes passaram, incluindo 11 cenários de exclusão. |
| `npm run test:db` | 16 testes passaram: teste principal e 15 subtestes, com as quatro migrações no PGlite. |
| `npm run build` | Passou; inclui `/api/account/delete` e `/api/account/export`. |
| `npm test -- --workers=1 --trace=off` | 58 testes passaram (30 unitários e 28 públicos desktop/celular); 6 E2E financeiros autenticados foram ignorados, pois as credenciais opcionais não foram carregadas nesta execução. Saída final 0. |
| Inspeção de `.next/static` | Nenhuma referência a `SUPABASE_SERVICE_ROLE_KEY`, `createAdminClient` ou à RPC administrativa no código entregue ao navegador. |

Os cenários novos cobrem sessão ausente, confirmação/senha incorretas, IDs/e-mail de terceiros enviados no corpo, divergência da identidade reautenticada, bloqueio de confirmação incompleta para MFA, configuração administrativa ausente, exclusão definitiva (`false` para soft delete), ordem Storage → Auth, lotes, inventário indisponível, remoção sem progresso, falhas parciais e repetição. Auth e Storage nesses testes unitários são dependências simuladas.

No PostgreSQL local, as duas contas têm perfil, categorias, transações, recorrências e orçamentos. Remover A de Auth apaga todas as suas linhas por cascade, incluindo histórico e linhas ocultas, preservando integralmente os registros de B. A identidade antiga de A não consegue recriar o perfil por RPC/INSERT. A remoção de Auth nesse teste é administrativa, separada da verificação de RLS; acesso `anon`/`authenticated` ao inventário Storage e à exclusão direta de Auth é negado. O inventário usa proprietário, respeita `owner_id` atual e legado, e não confunde pastas com propriedade. A migração é repetível e interrompe a instalação diante de convites extras sem `user_id`.

Os testes públicos verificam 401 nas novas rotas sem sessão, 403 para POST de outra origem, 405 para GET de exclusão e a mensagem de conclusão no login. No Windows, o servidor Next criado pelo Playwright ficou aberto na finalização; somente esse processo foi encerrado para permitir a conclusão da suíte, que reportou todos os resultados acima com saída 0.

**Pendências desta funcionalidade:** aplicar manualmente `supabase/migrations/202609140004_account_deletion.sql` depois de 001–003; configurar `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no servidor; revisar eventuais tabelas/arquivos remotos fora do schema versionado; testar o fluxo autenticado da Zona de perigo, download da exportação, cookies e exclusão Auth/Storage real com contas descartáveis conforme [o roteiro de exclusão](account-deletion.md). Não foi excluída nenhuma conta remota, não foram carregadas credenciais administrativas para teste, e nenhuma migração foi aplicada remotamente nesta entrega. A aparência/interação da nova seção em uma sessão real e a remoção de bytes no Storage remoto ainda não foram verificadas por E2E autenticado.

## Compras parceladas — 16/09/2026

| Verificação executada | Resultado |
| --- | --- |
| `npm run lint` | Passou. |
| `npm run typecheck` | Passou. |
| `npm run test:unit` | 37 testes passaram, incluindo 7 cenários de valores, calendário, validação, totais e CSV de parcelas. |
| `npm run test:db` | 28 testes passaram: 16 do schema anterior e 12 da migração/fluxos de parcelamento (contagem inclui os testes principais). |
| `npm run build` | Passou, preservando as rotas existentes. |
| `node ./node_modules/@playwright/test/cli.js test tests/installments-ui.spec.ts --workers=1 --trace=off` | 6 testes de interface passaram em desktop/celular. |
| `node ./node_modules/@playwright/test/cli.js test --workers=1 --trace=off` | 71 testes passaram em 19,1 segundos; 6 E2E autenticados remotos ignorados, sem carregar as credenciais opcionais. |
| Capturas da prévia de parcelas no tema escuro | Revisadas em desktop/celular, com ajuste de centavos, vencimentos e sem transbordamento horizontal da página. São capturas do harness dos componentes, sem o shell autenticado remoto. |

O banco local aplica 005 sobre um lançamento existente e comprova preservação de seus dados. Testa R$ 100,00 em 3x e R$ 0,05 em 2x, janeiro com dia 31, fevereiro bissexto/não bissexto, valores/datas inválidos, soma exata e reenvios. Uma falha injetada na segunda parcela reverte plano, parcelas e registro da solicitação; a mesma falha durante edição preserva a programação anterior. A exclusão de um plano não pago mantém a chave mínima de idempotência, impedindo que um retry atrasado recrie a compra.

Pagamento preserva ID, número, valor previsto e vencimento; a data e o valor efetivos entram nos realizados. Regeneração/exclusão de planos pagos e alterações diretas do histórico são recusadas. Edição segura e cancelamento mantêm a parcela paga intacta. RLS é verificado com duas contas sob `authenticated` e com `anon`, incluindo categorias/IDs alheios, tabelas e RPCs. A cascade da conta é testada separadamente com um papel restrito a SELECT/DELETE em `auth.users`, sem grants nas tabelas financeiras, removendo também as duas tabelas novas e preservando B.

Os testes de navegador renderizam os componentes reais com a API interceptada: dois submits no mesmo instante produzem uma solicitação; falha mantém o UUID para retry; sucesso aparece somente após salvar; pagamento muda os totais do mês correto; edição e cancelamento exigem os controles esperados; CSV preserva vencimento, pagamento e valores. Isso não constitui E2E autenticado contra Supabase. `tests/fixtures` não adiciona rotas de teste nem bypass de autenticação ao aplicativo. O esbuild é uma dependência exclusiva de desenvolvimento usada para montar esse harness.

Na primeira execução de interface, a restrição de leitura do ambiente bloqueou o esbuild; a execução autorizada fora dessa restrição resolveu o acesso. Os seletores de categoria e métrica foram corrigidos para usar o controle/nome exato. A suíte completa final passou, sem falhas pendentes.

**Pendências remotas:** aplicar manualmente `supabase/migrations/202609160005_installments.sql` após 001–004; validar os fluxos autenticados e duas requisições HTTP concorrentes com a mesma chave em um projeto de testes; conferir o CSV no Excel. O PGlite tem uma conexão e não comprova concorrência HTTP real. Não foram aplicadas migrações, criadas compras ou excluídas contas no Supabase remoto nesta entrega. Consulte [o roteiro de instalação e testes](installments.md).

## Auditoria defensiva — 17/09/2026

Relatório completo, inventário, achados e passos locais: [security-audit.md](security-audit.md).

| Verificação executada | Resultado |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; CSP com nonce e renderização dinâmica. |
| `npm run test:unit` | PASS — 37 testes. |
| `npm run test:db` | PASS — 28 testes. |
| `node --test scripts/security-db.test.mjs scripts/security-app.test.mjs` | PASS — 174 testes, incluindo principais, 158 asserções SQL e 13 cenários de integração. |
| `node ./node_modules/@playwright/test/cli.js test tests/auth.spec.ts tests/installments-ui.spec.ts tests/security-browser.spec.ts` | PASS — 38 testes de navegador local. |
| `node scripts/security-scan.mjs --bundles` | PASS — nenhum indício de segredo nos arquivos/bundles examinados; saída sem valores. |
| `npm audit --json` | PASS — zero vulnerabilidades conhecidas. |
| `git diff --check` | PASS — sem erros de whitespace. |

Foram adicionados headers defensivos, CSP e limites de corpo durante a leitura. Matriz de RLS cobre sete tabelas com A/B/anon, inclusive IDs existentes, propriedade, vínculos e originais intactos depois das tentativas. Integrações executam handlers reais com adaptadores de infraestrutura e PostgreSQL/PGlite; não são E2E do Supabase completo. CSV, HTML como texto, descarte de cache por identidade e logout também passaram no navegador.

**NÃO EXECUTADO:** runner `supabase test db`, lint SQL do Supabase e Security Advisor completo por ausência de CLI/Docker; Auth/PostgREST/Storage reais, expiração de URLs assinadas e concorrência entre conexões independentes; testes autenticados remotos. O wrapper pgTAP está em `supabase/tests/security.test.sql`; sua matriz SQL compartilhada foi executada em PGlite. Nenhum SQL, conta ou infraestrutura remota foi alterado. Não foi necessário gerar migração nova.

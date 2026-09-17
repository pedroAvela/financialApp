# Auditoria defensiva — 17/09/2026

A auditoria encontrou duas lacunas defensivas na camada HTTP: ausência de CSP/cabeçalhos de proteção e limite do corpo das APIs aplicado depois de carregá-lo integralmente. Ambas foram corrigidas. Os testes locais não reproduziram acesso cruzado entre usuários nas sete tabelas pessoais. Isso não constitui certificação do ambiente remoto.

Os riscos foram apresentados antes das correções. Não houve aplicação de migrações, criação/exclusão de contas, scanner ativo ou alteração de infraestrutura remota. Arquivos de credenciais locais não foram abertos para inspeção; nenhum valor secreto foi incluído no relatório. O build usa a configuração normal do Next, sem imprimir os valores. O único acesso de auditoria a um serviço externo foi a consulta de avisos de dependências ao registro npm; referências técnicas oficiais também foram consultadas.

**Inventário examinado**

As cinco migrações foram analisadas e executadas em bancos PostgreSQL/PGlite descartáveis, na ordem abaixo. Nenhuma migração existente foi editada e esta auditoria não exige novo SQL em produção.

| Ordem | Arquivo | Responsabilidade |
| --- | --- | --- |
| 1 | `supabase/migrations/202609100001_financial_schema.sql` | Cinco tabelas financeiras, constraints, índices, grants, RLS e proteção de proprietário. |
| 2 | `supabase/migrations/202609100002_financial_functions.sql` | Inicialização, trigger Auth, versões de recorrências, geração, orçamento e configuração inicial. |
| 3 | `supabase/migrations/202609100003_income_by_date.sql` | Realização de receitas recorrentes pela data e preservação do histórico. |
| 4 | `supabase/migrations/202609140004_account_deletion.sql` | FKs diretas com cascade, detecção de tabelas extras e inventário administrativo de Storage. |
| 5 | `supabase/migrations/202609160005_installments.sql` | Planos, recibos de idempotência, parcelas, RPCs e consistência diferida. |

Não reaplique 004 depois de 005: a detecção de tabelas extras dessa migração anterior interrompe esse uso fora de ordem. Não foram encontrados convites ou outras tabelas de aplicação além das sete abaixo. Tabelas criadas somente no painel remoto não são verificáveis pelo inventário do repositório.

| Tabela | Dados do usuário | Operações normais permitidas |
| --- | --- | --- |
| `profiles` | Nome, fuso e preferências; proprietário em `user_id`. | SELECT, INSERT, UPDATE próprios. DELETE somente pela exclusão Auth/cascade. |
| `categories` | Categorias próprias, inclusive arquivadas. | SELECT, INSERT, UPDATE; arquivar, sem DELETE direto. |
| `transactions` | Receitas, despesas, ocorrências, parcelas, pagamentos e marcas de exclusão. | CRUD próprio sujeito a constraints; histórico de parcelas pagas protegido. |
| `recurrences` | Regras e versões em JSON, sem dados de outro usuário. | SELECT, INSERT, UPDATE; arquivar, sem DELETE direto. |
| `budgets` | Limites gerais e por categoria/mês. | CRUD próprio. |
| `installment_plans` | Compra, categoria, valor, contagem, datas e estado. | CRUD próprio sujeito à programação completa e proteção de pagamentos. |
| `installment_requests` | UUID da solicitação/plano e hash do conteúdo para idempotência. | SELECT e INSERT próprios; UPDATE/DELETE negados. |

Todas possuem RLS e referência direta `user_id → auth.users(id) ON DELETE CASCADE`. As referências compostas de categorias, recorrências, planos e recibos incluem o proprietário. A exclusão Auth remove as sete tabelas, incluindo versões, parcelas pagas/canceladas, registros ocultos e recibos. `auth.users` pertence ao Supabase Auth; a aplicação não armazena senhas em suas tabelas.

O inventário de funções contém:

- RPCs financeiras `SECURITY INVOKER`: `initialize_finance`, `generate_occurrences`, `save_budget`, `save_initial_setup`, `create_installment_plan`, `edit_installment_plan`, `pay_installment`, `cancel_installment_plan`, `delete_installment_plan`. Identidade derivada de `auth.uid()`; EXECUTE concedido a `authenticated`.
- Auxiliares `SECURITY INVOKER`: `finance_due_date` não lê dados pessoais; `finance_installment_rows` seleciona planos pelo `auth.uid()` e continua sujeito a RLS. EXECUTE somente autenticado.
- `account_owned_storage_objects`: INVOKER, EXECUTE exclusivo de `service_role`; o UUID vem do backend após sessão validada e reautenticação. Não é uma RPC financeira de uso comum.
- `finance_new_user`: único `SECURITY DEFINER`. Necessário para inicializar perfil/categorias no trigger de inserção de `auth.users`, antes de existir sessão. Usa `NEW.id`, não um argumento do cliente; não usa `auth.uid()` porque é acionado pelo Auth. `search_path=''` e EXECUTE revogado de PUBLIC, anon e authenticated.
- Funções de trigger INVOKER: `finance_guard`, `finance_rule_revision`, `finance_recurrence_changed`, `finance_settle_income_before_rule_change`, `installment_plan_guard`, `installment_transaction_guard`, `installment_consistency`. EXECUTE revogado para clientes; nomes de objetos qualificados e `search_path=''`.

Os triggers são `finance_guard` nas cinco tabelas iniciais e em planos; `finance_user_created` em Auth; `finance_rule_revision`, `recurrence_changed` e `finance_income_settle` nas regras; `installment_plan_guard` e `installment_transaction_guard`; `installment_plan_complete` e `installment_rows_complete`, diferidos até a validação transacional. Não há views, materialized views ou funções de agregação financeira expostas. Totais são calculados sobre o snapshot autorizado; os testes também consultam agregações SQL sob RLS.

| Superfície de aplicação | Autorização / dados |
| --- | --- |
| `src/app/api/finance/route.ts` | GET/POST, `auth.getUser()` no servidor, identidade validada, operações financeiras sob RLS. GET pode gerar as próprias ocorrências previstas ao consultar o mês. |
| `src/app/api/account/export/route.ts` | GET autenticado; exporta JSON completo somente do usuário, incluindo registros arquivados/ocultos. |
| `src/app/api/account/delete/route.ts` | POST, origem validada, EXCLUIR, nova verificação de senha e correspondência de UUID; remove Storage antes de Auth. Rejeita `user_id`, `id` e demais campos extras. |
| `src/app/auth/confirm/route.ts` | Callback público com validação de código/token e destino interno permitido; mensagens sem refletir credenciais. |
| `src/proxy.ts`, layout protegido | Sessão validada, redirecionamento, CSP e ausência de cache compartilhado. |
| `src/lib/supabase/client.ts`, `server.ts` | Cliente público do navegador e SSR autenticado com cookies; configuração compartilhada contém somente URL e chave publicável. |
| `src/lib/supabase/admin.ts`, `account-server.ts` | `server-only`; chave administrativa somente no servidor e somente no fluxo de exclusão. Nunca usada nas operações financeiras normais. |

Não existem Server Actions (`use server`). O estado do `FinanceProvider` fica em memória e é recriado pela chave do usuário no layout protegido. Fetch do servidor/navegador e respostas pessoais usam `no-store`; logout faz navegação completa. `localStorage` guarda apenas preferência de tema. Não há cache persistente financeiro, service worker ou dados fictícios nas telas conectadas. Fixtures estão somente em `tests`/`scripts`, sem rotas de teste na aplicação.

O histórico gera CSV no navegador a partir dos lançamentos autorizados e filtrados; protege células iniciadas por `=`, `+`, `-`, `@` e prefixos de controle, escapa aspas, usa BOM UTF-8 e ponto e vírgula. O outro formato de exportação é o JSON autenticado da conta.

**Achados e regressões**

PASS significa que a verificação descrita foi executada e passou no escopo indicado. As linhas de controles existentes representam tentativas bloqueadas, não vulnerabilidades confirmadas. Gravidade de uma lacuna defensiva não pressupõe exploração já demonstrada.

| ID / vulnerabilidade ou controle | Gravidade | Evidência sem dados sensíveis e arquivo afetado | Correção aplicada / recomendada | Teste de regressão | Resultado |
| --- | --- | --- | --- | --- | --- |
| S01 — Ausência de CSP e proteção contra enquadramento | Moderada, defesa em profundidade | `next.config.ts` não definia headers; `src/proxy.ts` não emitia CSP. | CSP com nonce novo por requisição, sobrescrita de nonce/CSP recebidos, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`. `nosniff`, DENY e `no-referrer` globais. | `security-browser.spec.ts`: cabeçalhos reais, nonce diferente, hidratação sem violações; `security-app.test.mjs`: cabeçalho forjado. | PASS |
| S02 — Limite de corpo aplicado após buffer integral | Moderada, disponibilidade | `src/app/api/finance/route.ts` e `api/account/delete/route.ts` usavam `request.text()` antes de medir tamanho em caracteres. | `src/lib/request-body.ts` limita bytes durante leitura, cancela stream excedente, valida tipo exato de JSON e UTF-8; 64 KiB/8 KiB. Limites de conexão/timeout continuam responsabilidade do servidor de hospedagem. | Integração: Content-Length excessivo, corpo multibyte, chunks sem tamanho, JSON/UTF-8 inválidos; banco intacto. | PASS |
| S03 — Ausência de matriz pgTAP e cobertura incompleta por tabela | Baixa, risco de regressão | Não existia `supabase/tests`; recibos e operações negadas não tinham matriz uniforme. | Wrapper pgTAP e matriz SQL compartilhada, sete tabelas, A/B/anon, grants, FKs, RPCs, agregações e confirmação de estado. | `security-db.test.mjs`: 158 asserções SQL. | PASS no PGlite; runner pgTAP NÃO EXECUTADO |
| S04 — Exposição de segredos estáticos | Não observada | Varredura de arquivos rastreados/novos não ignorados e `.next/static`; `.env*` ignorado exceto exemplo. Nenhum indício detectado. | Scanner reexecutável que emite apenas arquivo/linha para achados. Configuração administrativa mantém `server-only`. | `security-scan.mjs --bundles` e teste com padrões sintéticos. | PASS, detecção heurística |
| S05 — IDOR, alteração de proprietário e vínculo entre contas | Não observada | Migrações 001–005 e `finance-server.ts`: operações com IDs realmente existentes de A/B foram bloqueadas e originais comparados integralmente. | Preservados RLS, grants mínimos e FKs compostas. Não foi necessário ampliar grants nem alterar schema. | Matriz SQL, integrações de transações/categorias/regras/orçamento/perfil/planos e testes anteriores de banco. | PASS local |
| S06 — Bypass por RPC/DEFINER/view | Não observado | Catálogo local verifica RLS, FKs Auth, ausência de views inseguras, `search_path`, grants e DEFINER único. | Preservada exceção documentada do trigger Auth e da RPC administrativa de inventário. | Matriz SQL: anon não executa RPCs; geradores de B não afetam A; trigger e inventário negados a clientes. | PASS local |
| S07 — Exclusão de conta alheia / falha parcial | Não observada | `account-server.ts`, `account-deletion.ts`: cliente administrativo não exclui quando identidade/confirmação divergem; falha Storage preserva Auth. | Mantido fluxo Storage → Auth hard delete → cascade → limpeza de cookies. | Integração real do handler com Auth/Storage simulados e banco real local; sete tabelas desaparecem só para A. Testes unitários cobrem lotes, falha Auth e retry. | PASS no escopo local |
| S08 — CSV injection, HTML/JS persistido e vazamento por cache | Não observados | `finance.ts`, `history.tsx`, `transaction-list.tsx`, provider/layout. React trata campos como texto; exportações não incluem B. | Mantidas codificação React, neutralização CSV, escopo por identidade e no-store. | Navegador: payload literal, nenhum elemento executável, CSV baixado/filtrado, troca de conta e logout; APIs A/B intercaladas. | PASS local |
| S09 — Duplicação / inconsistência financeira por falha | Não observadas | Transações usam UUID estável; planos usam recibos, constraints e RPC transacional. | Proteções existentes preservadas. | Reenvios concorrentes ao handler, duplo submit na UI; falha na segunda parcela reverte plano, recibo e parcelas; testes de edição/pagamentos anteriores. | PASS com conexão DB serializada |
| S10 — Dependências com avisos conhecidos | Não observadas | `npm audit --json`: zero vulnerabilidades nas dependências resolvidas. | Nenhuma atualização incompatível ou `audit fix --force`. | Auditoria npm executada. | PASS |

HSTS é emitido pelo proxy somente em produção e em requisições HTTPS, com duração de um ano, sem ampliar a política para subdomínios. Foi testado com requisição HTTPS sintética ao proxy; o servidor de testes real usa HTTP local e corretamente não o recebe. Validação de TLS/HSTS do domínio publicado não foi realizada. CSP aplica nonce aos scripts Next e ao script fixo de tema; páginas passam a renderizar dinamicamente. `style-src 'unsafe-inline'` permanece necessário para cores e estilos inline existentes, sem liberar scripts inline arbitrários. `unsafe-eval` é permitido apenas no desenvolvimento. A política preservou formulários, callback, tema e responsividade nos testes de produção locais. Referência: [CSP com nonce no Next.js](https://nextjs.org/docs/app/guides/content-security-policy).

A varredura não abre `.env.local`, `.env.e2e.local` ou `.env.rls.local` e não compara nem imprime suas credenciais. Inspeciona arquivos versionados/novos não ignorados e bundles públicos por padrões de chaves privadas, tokens, credenciais SMTP, URLs com senha, JWTs não anônimos e referências administrativas no frontend. Não varreu todo o histórico Git, arquivos ignorados, dependências internas ou formatos desconhecidos de segredo; zero achados não é garantia universal. Se surgir indício futuro, a saída será somente `arquivo:linha`: revogue/rotacione a credencial no provedor, examine o histórico e remova a exposição, sem reutilizar a chave detectada. Tokens de sessão em tempo de execução são parte da autenticação do navegador; não são uma chave administrativa embutida no bundle.

**Storage e limites de cobertura**

Não há buckets, políticas de upload ou uso de arquivos privados definidos pelo aplicativo. A única integração Storage é a remoção administrativa de objetos pertencentes ao usuário durante exclusão. A consulta existente usa `owner_id`/`owner`, não o prefixo do caminho nem metadata enviada pelo cliente. Testes anteriores de SQL verificam essa propriedade e grants; os novos testes verificam falha/repetição da remoção e preservação de arquivos de B com API simulada.

Leitura, listagem, envio, substituição e exclusão pela API Storage real, falsificação de metadata em upload, expiração de URLs assinadas e configuração dos buckets remotos: **NÃO EXECUTADO**. Não existe recurso equivalente definido no projeto para exercitar. O teste SQL local falha se encontrar bucket público inesperado, mas isso não atesta o painel remoto. Se houver buckets criados fora das migrações, primeiro inclua seu inventário e políticas no projeto; então acrescente fixtures de A/B/anon e valide essas operações no Storage local, inclusive GET antes/depois de uma expiração curta. Objetos do Storage não devem ser removidos por DELETE SQL.

O Supabase CLI e o Docker não estão instalados/disponíveis nesta máquina. Por isso, `supabase test db`, `supabase db lint --local` e o Security Advisor completo: **NÃO EXECUTADO**. A matriz executa verificações locais de catálogo relacionadas a RLS/search_path/DEFINER/grants/views; não é uma execução integral do Advisor. O lint SQL também não equivale ao Advisor. Referências: [testes de banco com pgTAP](https://supabase.com/docs/guides/database/testing) e [Security/Performance Advisors](https://supabase.com/docs/guides/database/database-advisors).

O PGlite executa PostgreSQL real em memória, mas Auth e schemas de infraestrutura são fixtures. As integrações executam os Route Handlers e os módulos financeiros/de exclusão reais, substituindo somente clientes de infraestrutura e cookies por adaptadores locais. O adaptador transforma operações do cliente em SQL sujeito a RLS. Não valida JWT criptográfico, GoTrue, PostgREST, renovação/revogação real de tokens, Storage HTTP ou transmissão real de cookies de uma sessão autenticada. O teste de logout no navegador usa o componente real com o provedor interceptado. A matriz pgTAP usa papéis efetivos `authenticated`/`anon` com claims de teste; setup e leitura de comparação são administrativos, separados dos acessos em teste. Nenhum usuário comum é simulado usando service_role.

Há uma conexão PostgreSQL por fixture: chamadas simultâneas ao handler são serializadas pelo adaptador. Isso valida idempotência do fluxo, não contenção entre conexões/processos independentes. Contenção real e E2E com Auth/PostgREST devem ser verificados no Supabase local completo. Os testes remotos anteriores do repositório não foram executados nesta auditoria.

**Verificações executadas**

| Comando | Resultado nesta auditoria |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; páginas dinâmicas compatíveis com nonce |
| `npm run test:unit` | PASS — 37 testes |
| `npm run test:db` | PASS — 28 testes, incluindo os dois testes principais |
| `node --test scripts/security-db.test.mjs scripts/security-app.test.mjs` | PASS — 174 testes: 158 asserções SQL + principal; 13 cenários de integração + principal; 1 scanner |
| `node ./node_modules/@playwright/test/cli.js test tests/auth.spec.ts tests/installments-ui.spec.ts tests/security-browser.spec.ts` | PASS — 38 testes: 4 de segurança, 28 de autenticação pública desktop/celular, 6 de parcelamentos desktop/celular |
| `node scripts/security-scan.mjs --bundles` | PASS — nenhum indício de segredo nos arquivos examinados |
| `npm audit --json` | PASS — 0 vulnerabilidades conhecidas |

O esbuild precisou executar fora da restrição de leitura do sandbox, com aprovação, para resolver caminhos no Windows. Uma falha inicial de idempotência no harness foi corrigida no adaptador: DATE do PGlite precisava ser serializado como `YYYY-MM-DD`, como no PostgREST. Não exigiu mudança na lógica financeira. Não ficaram testes locais falhando na execução final.

**Reprodução e próximo passo**

Os testes que dispensam Supabase/Docker podem ser repetidos com `npm run test:security`. Para o navegador: `npm run build` e `npm run test:security:browser`. A varredura completa precisa do build antes de `npm run security:scan`. As fixtures têm dados sintéticos, não carregam arquivos de contas e não precisam de senhas reais.

Instale/inicie Docker e Supabase CLI e use exclusivamente o projeto local descartável definido em `supabase/config.toml`. O reset abaixo apaga somente esse banco local de testes; não use `--linked` nem `--db-url` apontando para outro ambiente:

```powershell
supabase start
supabase db reset --local
supabase test db
supabase db lint --local --level warning
```

O reset aplica as cinco migrações na ordem listada. `supabase test db` executa `supabase/tests/security.test.sql`, que inclui `fixtures/security-cases.inc`, em transação com rollback de fixtures e helpers. A mesma matriz foi executada via PGlite; o wrapper/extensão pgTAP ainda precisa desta execução no stack completo. Use um banco descartável: os UUIDs de fixture são fixos e uma colisão interrompe o teste, sem apagar registros existentes. Não aplique os arquivos de testes como migrações.

Próximo passo que depende do ambiente: disponibilizar Docker/Supabase local e executar pgTAP/lint e os fluxos reais de Auth/Storage aplicáveis. Nenhuma mudança de SQL remoto é necessária por causa desta auditoria. Qualquer divergência entre o schema remoto e o versionado precisa de inventário separado e autorizado.

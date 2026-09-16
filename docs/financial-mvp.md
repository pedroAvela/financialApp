# MVP financeiro: instalação e validação

## O que foi encontrado e alterado

A base usava Next.js App Router, React, TypeScript, Tailwind e Supabase Auth. A sessão já era validada pelo proxy e pelo layout protegido. Não havia migrações nem tabelas financeiras documentadas. Os números, categorias e limites vinham de `src/data/mock-data.ts` e do estado React; esse arquivo foi removido.

O layout, a identidade visual, as rotas e os fluxos de autenticação foram mantidos. Os componentes financeiros agora consultam uma API autenticada em `/api/finance`, com os clientes existentes do Supabase. O contexto React armazena o resultado das consultas, não uma segunda base financeira.

## Aplicar o banco manualmente

Nenhum SQL foi aplicado ao Supabase remoto por esta entrega. Antes de aplicar, confira se o seu projeto possui tabelas financeiras criadas fora do repositório. Você pode inspecionar o Table Editor ou executar esta consulta de leitura:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles','categories','transactions','recurrences','budgets')
order by table_name, ordinal_position;
```

Se já houver tabelas com esses nomes, compare o schema antes de aplicar. A primeira migração aborta integralmente nesse caso, sem apagar, recriar ou adaptar silenciosamente estruturas desconhecidas. Será necessário preparar uma migração incremental compatível com o schema encontrado.

Se não houver tabelas financeiras, execute uma vez, no SQL Editor do projeto correto, **nesta ordem**:

1. `supabase/migrations/202609100001_financial_schema.sql`
2. `supabase/migrations/202609100002_financial_functions.sql`
3. `supabase/migrations/202609100003_income_by_date.sql`

**Se as migrações 001 e 002 já foram aplicadas, execute somente `202609100003_income_by_date.sql`.** Não repita as anteriores. A terceira é incremental: adiciona o controle de realização por data e atualiza a geração de ocorrências, preservando tabelas, IDs e histórico realizado. Após aplicá-la, reabra o mês no aplicativo para atualizar as receitas previstas existentes.

Cada arquivo usa uma transação. A primeira cria tabelas, índices, constraints, grants, RLS e validações. A segunda cria as funções, o trigger de novos usuários e preenche perfis/categorias de usuários existentes. Os nomes versionados também permitem usar o fluxo normal de migrações da CLI; a aplicação não executa esse fluxo automaticamente.

A estrutura usa PostgreSQL 15+ (`UNIQUE NULLS NOT DISTINCT`), compatível com os projetos Supabase atuais. Não crie uma tabela de senhas. As operações financeiras nunca usam chave administrativa; a exceção isolada no servidor é a [exclusão definitiva da própria conta](account-deletion.md), após reautenticação.

## Estrutura e segurança

- **profiles**: nome, fuso IANA, idioma, moeda e configuração inicial concluída.
- **categories**: UUID, usuário, nome, tipo, cor, estado ativo e chave de inicialização.
- **transactions**: centavos, tipo, categoria, descrição opcional, data, situação, classificação fixa/variável e vínculo opcional com a ocorrência recorrente.
- **recurrences**: regra mensal, início/fim, dia de vencimento, vigência de alterações e versões internas em JSONB.
- **budgets**: limite variável de um mês, geral quando a categoria é nula, ou por categoria. O índice trata a categoria nula como uma única chave por mês/usuário.

Todas as tabelas habilitam RLS. Visitantes não têm grants de dados. Usuários autenticados podem ler, inserir e editar somente registros próprios. DELETE é permitido para transações e orçamentos próprios; categorias e regras são arquivadas, e o perfil não pode ser excluído pela Data API.

Grants e políticas são complementados por triggers que tornam proprietário/identidade imutáveis e por chaves estrangeiras compostas que incluem o usuário e o tipo. Isso bloqueia associações a categorias e recorrências alheias mesmo por requisição direta. Alterar o tipo de uma categoria ou regra existente é recusado; crie outra quando necessário.

A API valida a sessão com `auth.getUser()`, deriva o usuário da sessão e aceita apenas campos conhecidos. Um `user_id` enviado pelo formulário não é utilizado. As operações normais e RPCs usam `SECURITY INVOKER` e o contexto autenticado. Não há `service_role` nas operações financeiras nem views/agregações administrativas. O cliente administrativo separado atende somente à exclusão definitiva da própria conta e à remoção prévia de seus arquivos. As consultas são paginadas em blocos de 500 para não truncar silenciosamente o histórico no limite padrão da API.

A única função `SECURITY DEFINER` é o trigger de inicialização de novos usuários do Auth: usa exclusivamente `NEW.id`, tem `search_path` fixado e não possui EXECUTE público. O preenchimento de usuários existentes é feito na migração. A RPC `initialize_finance()`, sujeita a RLS, permite repetir a inicialização sem duplicar nem sobrescrever preferências ou reativar categorias arquivadas.

As respostas da API usam `private, no-store`, e o cliente de servidor faz consultas sem cache. Requisições POST também verificam a origem. Nenhuma chave privada é necessária: mantenha somente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em `.env.local`. Consulte [o guia de autenticação](supabase.md) para e-mails e URLs autorizadas.

Referências de implementação: [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api) e [INSERT/ON CONFLICT do PostgreSQL](https://www.postgresql.org/docs/18/sql-insert.html).

## Comportamento financeiro

O calendário usa meses inteiros, sem período personalizado. A data atual usa o fuso do perfil (`America/Sao_Paulo` inicialmente). Datas financeiras são armazenadas como `date`; não mudam de dia ao formatar em outro fuso.

Valores aceitam `1,00` e `1.234,56`; são validados no servidor e armazenados em centavos inteiros. Descrições são opcionais. No lançamento rápido, o padrão é despesa variável realizada com a data atual; o usuário pode alterar tipo, situação, classificação e data.

- **Saldo realizado** = receitas realizadas − despesas realizadas do mês.
- **Disponível no orçamento** = limite variável − despesas variáveis realizadas.
- Fixas são descontadas somente no saldo realizado, sem consumir novamente o orçamento variável.
- Receitas/despesas previstas são exibidas à parte.
- Limite em branco significa **não configurado**. Limite zero significa **configurado em zero**.
- Com limite zero, a interface não divide por zero: indica “Limite zero” e avisa quando existe gasto.
- Os avisos de 70%, 85% e 100% são internos, para o limite geral e os de categoria.
- Não há saldo inicial artificial, reserva subtraída do orçamento, transporte automático de saldo ou cópia automática de limites entre meses.

A configuração inicial cria/atualiza até duas **regras base agrupadas**, uma de renda e outra de despesas fixas, além do orçamento variável do mês escolhido. É uma operação atômica e repetível. Use zero para desativar uma regra base. Para detalhar várias rendas/despesas, utilize Planejamento; se substituir a regra agrupada por regras detalhadas, zere a base correspondente para não cadastrar a mesma previsão duas vezes.

## Recorrências

Regra e ocorrência são entidades distintas. A aplicação chama `generate_occurrences(mês)` ao consultar o mês. Não há agendador, execução em segundo plano ou promessa de geração automática em datas nas quais ninguém abriu a aplicação.

A geração usa bloqueios em ordem consistente e uma constraint única em `(user_id, recurrence_id, occurrence_month)`, além de `ON CONFLICT DO NOTHING`. Recarregar ou fazer chamadas simultâneas não deve duplicar a ocorrência. Vencimentos como dia 31 em fevereiro são ajustados ao último dia do mês.

Receitas recorrentes (inclusive a renda da configuração inicial) com data de recebimento **até hoje**, no fuso do perfil, são realizadas ao consultar o período. As futuras permanecem previstas. Exemplo: ao consultar setembro no dia 10, a receita mensal do dia 5 já entra nas receitas realizadas e aparece no histórico como **Realizada pela data**. Essa classificação segue a data programada; não é uma confirmação bancária.

A coluna `auto_realize` identifica receitas recorrentes que seguem essa regra. Previsões antigas dessas receitas são adaptadas pela migração 003. Uma edição manual da ocorrência desativa esse comportamento para ela, mantendo a situação escolhida mesmo após recarregar. Lançamentos avulsos respeitam a situação informada; despesas recorrentes continuam dependendo da confirmação de pagamento.

Confirmar pagamento/recebimento altera `status` da mesma transação. Edição avulsa altera somente aquela ocorrência; a regra é editada em Planejamento.

Antes de alterar a regra, receitas automáticas já vencidas são realizadas para preservar seu valor histórico. Alterar a regra exige vigência no mês atual ou posterior, segundo o fuso do perfil. Apenas previsões desse mês em diante são atualizadas. Realizados e ocorrências excluídas não são alterados. Versões da regra preservam os meses anteriores ainda não gerados. Uma nova edição substitui versões futuras já programadas a partir da vigência escolhida.

Encerrar uma regra remove suas previsões não realizadas a partir do mês informado, preservando ocorrências realizadas e a versão anterior para os meses precedentes. Categorias arquivadas impedem novas associações e geração de novas previsões; os registros históricos continuam disponíveis.

A exclusão confirmada pela interface grava `deleted_at`. Essa marca mantém a chave da ocorrência e impede sua recriação. Exclusão física manual pela Data API, permitida para transações próprias, remove essa proteção; para reproduzir o comportamento da interface, atualize a marca de exclusão.

## Espaçamento e temas

Os blocos financeiros compartilham espaçamento vertical, com ajustes entre cartões, limites, campos e ações para desktop e celular. A estrutura das telas e o fluxo de autenticação foram preservados.

O botão de sol/lua fica no cabeçalho das telas internas, da configuração inicial e das telas de autenticação. Na primeira visita o tema acompanha o sistema; depois de escolher, a preferência é salva neste navegador e vale entre páginas e recargas. A escolha de tema não modifica o perfil financeiro nem exige configuração no Supabase. Os controles nativos também acompanham o tema usando [os recursos de preferência de cores do navegador](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme).

## CSV

A exportação contém exatamente os lançamentos filtrados na tela, com BOM UTF-8, separador ponto e vírgula, fim de linha CRLF, datas brasileiras e vírgula decimal. Todas as células são delimitadas por aspas e aspas internas são escapadas. Conteúdos que poderiam iniciar fórmulas, inclusive após espaços/controles, recebem um apóstrofo. Valores são positivos; a coluna Tipo distingue receita/despesa.

## Verificações disponíveis

```text
npm run lint
npm run typecheck
npm run test:unit
npm run test:db
npm run build
npm test
npm run test:rls:remote
```

**Testes locais de banco:** `scripts/database.test.mjs` executa as três migrações no PostgreSQL em memória do PGlite. Cria um usuário antes da migração e outro depois. Somente a preparação usa o proprietário do banco; as operações financeiras mudam para `authenticated` sem BYPASSRLS ou para `anon`. Os helpers de identidade do Supabase são simulados localmente. Esses testes não verificam emissão de JWT, PostgREST, configuração remota nem concorrência real entre conexões.

**Testes unitários:** dinheiro, datas inválidas/bissextos, fuso e virada de mês, previsões, saldo, fixas/variáveis, ausência de limite versus zero, alertas, validação de entrada, recorrências e CSV.

**Navegador sem conta:** autenticação pública, proteção das rotas/API, origem de gravações, formulários, responsividade e tema claro/escuro com persistência da escolha. As chamadas de envio de e-mail são interceptadas.

**Navegador autenticado:** `tests/app.spec.ts` exige `E2E_EMAIL` e `E2E_PASSWORD` definidos localmente. Use uma conta confirmada de um **projeto dedicado a testes**, com estas migrações, e gere o build com URL/chave desse mesmo projeto. Esses testes gravam lançamentos e categorias de teste, verificam persistência, edição, CSV, exclusão e logout. Sem as variáveis, ficam explicitamente ignorados. Se um teste falhar antes da limpeza, registros identificados como teste podem permanecer.

Para executar somente os testes autenticados, crie `.env.e2e.local` na raiz (já ignorado pelo Git), preenchendo `E2E_EMAIL` e `E2E_PASSWORD` com essa conta. Não use o prefixo `NEXT_PUBLIC_` para credenciais. O Playwright não lê esse arquivo automaticamente; execute:

```powershell
npm run build
node --env-file=.env.e2e.local ./node_modules/@playwright/test/cli.js test tests/app.spec.ts --workers=1 --trace=off
```

O worker único evita interferência entre testes da mesma conta. O build precisa usar o mesmo projeto de `.env.local`. O trace é desativado nessa execução para evitar gravar tokens e credenciais em um arquivo de diagnóstico de rede.
**RLS remoto e concorrência:** `scripts/rls-remote.test.mjs` usa dois logins reais via Auth e a chave publicável. Não usa SQL Editor administrativo, service_role ou criação de contas administrativa. Testa leitura, inserção, alteração, exclusão, mudança de proprietário, IDs/categorias/recorrências alheios, RPCs de visitante e seis requisições HTTP concorrentes de geração.

Para habilitar esse teste, crie duas contas confirmadas no projeto dedicado a testes e configure localmente, sem enviar credenciais pelo chat, um arquivo ignorado pelo Git chamado `.env.rls.local`:

```dotenv
RUN_REMOTE_RLS=1
RLS_URL=
RLS_PUBLISHABLE_KEY=
RLS_A_EMAIL=
RLS_A_PASSWORD=
RLS_B_EMAIL=
RLS_B_PASSWORD=
```

Preencha os valores somente no seu computador e execute:

```text
node --env-file=.env.rls.local --test scripts/rls-remote.test.mjs
```

Ou use `npm run test:rls:remote` quando essas variáveis já estiverem no ambiente do terminal. O teste usa fevereiro de 2099, remove transações/orçamentos de teste e arquiva categorias/regras próprias ao terminar. Não execute com contas pessoais ou de produção.

## Roteiro manual após aplicar as migrações

1. Entre com um usuário antigo e confira que há perfil/categorias, sem movimentações inventadas.
2. Crie uma conta nova, confirme o e-mail e confira o estado vazio com botão para começar.
3. Configure renda, fixas e orçamento. Reabra a configuração, salve novamente e confira que as regras e ocorrências não duplicaram.
4. Cadastre uma despesa variável realizada de R$ 1,00 sem descrição. Recarregue e confira o histórico, saldo e orçamento.
5. Cadastre uma despesa fixa: ela deve reduzir o saldo, sem reduzir o disponível variável.
6. Cadastre uma receita/despesa prevista: os totais realizados não devem mudar. Confirme no histórico e confira a atualização da mesma ocorrência.
7. Edite e exclua com confirmação; confira a atualização do dashboard e dos limites.
8. Crie/edite/arquive uma categoria e confira que registros antigos permanecem legíveis.
9. Crie uma regra no dia 31, abra fevereiro e recarregue. Confira ajuste de data, ausência de duplicatas e histórico realizado preservado após editar a regra.
10. Exclua uma ocorrência pela interface e reabra o mês; ela não deve reaparecer.
11. Teste limites ausentes, zero e valores que atinjam 70%, 85% e 100%; teste também limites por categoria.
12. Filtre o histórico e abra o CSV no Excel. Teste uma descrição iniciada por `=1+1`: deve permanecer texto.
13. Execute o teste remoto de duas contas. Uma resposta vazia em SELECT/UPDATE/DELETE de ID alheio é um bloqueio válido do RLS; não basta observar que o botão não aparece.
14. Confira desktop e celular e simule falha de rede: a interface deve mostrar erro, sem substituir consultas por zeros ou exemplos.
15. Cadastre renda recorrente com dia de recebimento anterior ou igual a hoje e consulte o mês: deve aparecer realizada. Uma renda do mês seguinte deve permanecer prevista. Recarregue e confirme que o ID e a quantidade de ocorrências não mudam.
16. Corrija uma dessas receitas para prevista no histórico e recarregue: a escolha manual deve permanecer. Confira que despesas vencidas continuam previstas até confirmar o pagamento.
17. Alterne sol/lua, navegue e recarregue. Verifique contraste, campos, espaçamento e ausência de rolagem horizontal indevida nos dois temas.

## Pendências externas

A aplicação do SQL, a inspeção de um possível schema remoto preexistente e a validação com contas reais dependem de acesso ao seu painel/projeto. Consulte `docs/verification.md` para os resultados efetivamente executados nesta entrega. O uso do SQL Editor para instalar as migrações não conta como teste de RLS do usuário.
## Compras parceladas — 16/09/2026

O suporte a compromissos finitos de 2 a 60 parcelas foi adicionado em uma etapa posterior ao MVP original. Siga [o guia de parcelamentos](installments.md) e aplique a migração 005 após 001–004. Faturas completas, fechamento e integração de cartão continuam fora do escopo. As parcelas pagas usam a data efetiva do pagamento nos totais; previstas usam o vencimento.

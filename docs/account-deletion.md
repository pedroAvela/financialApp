# Exclusão definitiva de conta

## Ativação manual

Nenhuma migração nem exclusão foi executada no Supabase remoto nesta entrega.

1. Com as migrações 001, 002 e 003 já instaladas, execute **somente** `supabase/migrations/202609140004_account_deletion.sql` no SQL Editor do projeto correto. O arquivo contém uma transação: uma falha reverte as alterações da migração. Ele valida as referências existentes e pode exigir uma janela de menor uso em tabelas grandes.
2. Em um banco novo, a ordem completa é:
   - `supabase/migrations/202609100001_financial_schema.sql`
   - `supabase/migrations/202609100002_financial_functions.sql`
   - `supabase/migrations/202609100003_income_by_date.sql`
   - `supabase/migrations/202609140004_account_deletion.sql`
3. Em **Project Settings → API Keys**, obtenha a chave administrativa `service_role`. Adicione `SUPABASE_SERVICE_ROLE_KEY` ao `.env.local` e, quando for publicar por sua iniciativa, ao ambiente privado do servidor. Reinicie o processo Next.js. Nunca use `NEXT_PUBLIC_` para essa chave; não a envie pelo chat, não a versione e não a use nos testes de RLS. `.env.example` contém somente o nome, sem valor.
4. Faça o roteiro abaixo com duas contas descartáveis de um projeto de testes. Não use sua conta principal para validar exclusão.

Não é necessário mudar templates de e-mail ou redirecionamentos do Auth. Login, recuperação e operações financeiras continuam funcionando sem a chave administrativa; somente excluir a conta exige essa configuração e a nova migração.

## Inventário e cascatas

Foram inspecionadas integralmente as três migrações anteriores, os handlers, clientes e componentes. O schema pessoal versionado contém estas cinco tabelas:

| Tabela | Dados removidos | Referências após 004 |
| --- | --- | --- |
| `profiles` | Nome, preferências, fuso e configuração inicial concluída | `user_id → auth.users(id) ON DELETE CASCADE` |
| `categories` | Categorias padrão, personalizadas e arquivadas | FK direta para Auth e FK existente para `profiles`, ambas CASCADE |
| `transactions` | Receitas, despesas, previstos, realizados e ocorrências ocultas com `deleted_at` | FK direta para Auth e FK existente para `profiles`, ambas CASCADE |
| `recurrences` | Regras ativas/arquivadas e todas as revisões no JSON | FK direta para Auth e FK existente para `profiles`, ambas CASCADE |
| `budgets` | Limites gerais e por categoria, de todos os meses | FK direta para Auth e FK existente para `profiles`, ambas CASCADE |

As referências compostas entre categorias, transações, recorrências e orçamentos são preservadas. Elas continuam impedindo associações a outro proprietário. O aplicativo não executa DELETE nessas tabelas durante a exclusão de conta: a remoção de `auth.users` dispara as cascatas. A nova migração não apaga dados, não recria tabelas e não modifica as políticas nem amplia grants das tabelas financeiras. Todas mantêm RLS ativo.

Os nomes das FKs são descobertos em `pg_constraint`/`pg_attribute`. Uma FK direta já existente é validada ou corrigida para CASCADE usando o nome encontrado; referências ausentes são adicionadas. A repetição foi testada sem duplicar FKs nem remover registros.

Não há tabelas de convites, membros, compartilhamentos, anexos ou outras tabelas pessoais no repositório. A migração interrompe a instalação se encontrar tabelas adicionais em `public` com `user_id`, nome de convite ou FK para Auth/tabelas financeiras. Isso também detecta a primeira dependência de uma cadeia indireta, mesmo sem `user_id`. Nesse caso, revise quem é o proprietário e o que deve acontecer com convites enviados/recebidos antes de adaptar a migração; não apague convites de terceiros por coincidência de e-mail. Tabelas remotas sem vínculos declarados ou em outros schemas exigem inventário manual: não é possível deduzir sua propriedade a partir deste repositório.

## Storage

Não existem buckets, uploads ou referências a arquivos nas migrações e no código atuais. O avatar é composto por iniciais. Mesmo assim, o fluxo consulta o inventário de objetos antes de excluir Auth, para cobrir arquivos enviados fora da interface que tenham proprietário registrado.

`account_owned_storage_objects(uuid)` é uma função de **somente leitura**, `SECURITY INVOKER`, com `search_path` fixo. Apenas `service_role` recebe EXECUTE; visitantes e usuários autenticados não podem consultá-la. Ela retorna até 500 objetos por consulta, de qualquer bucket, usando `storage.objects.owner_id`; em versões antigas, usa `owner`. Quando ambos existem, `owner_id` não vazio prevalece. Prefixos e nomes de pastas não são prova de propriedade. Schema de Storage sem coluna reconhecida interrompe a operação.

O servidor remove objetos pela **API do Supabase Storage**, em grupos de até 100 caminhos por bucket. Repete a consulta dos objetos restantes, sem offset, até esvaziar. Não há DELETE SQL de metadados do Storage. Erros de consulta, remoção ou ausência de progresso interrompem o fluxo antes de excluir Auth. Novos uploads concorrentes podem fazer o Auth recusar a exclusão; a operação informa falha e pode ser repetida.

Objetos criados administrativamente sem proprietário não podem ser atribuídos com segurança a uma pessoa. Antes de ativar a funcionalidade, confira se há esse tipo de arquivo remoto; se houver dados pessoais assim, documente e implemente seu vínculo antes de permitir a exclusão. Não foi inventado um vínculo por nome de pasta. A exportação oferecida é dos dados financeiros em JSON; ela não baixa arquivos binários do Storage.

## Fluxo e segurança

Em **Configurações → Zona de perigo**, a pessoa pode exportar todos os seus dados financeiros, abrir a confirmação, digitar `EXCLUIR` e informar a senha atual. Cancelar não altera nada. A tela bloqueia envios simultâneos e só retorna ao login com mensagem de conclusão após resposta de sucesso do servidor.

`POST /api/account/delete` exige origem igual à aplicação e JSON limitado, valida a sessão com `auth.getUser()` e rejeita campos extras, inclusive `user_id`, `id` ou `email`. A senha é conferida com um cliente público isolado de Auth e a identidade resultante precisa coincidir com o UUID da sessão. A sessão temporária é encerrada; ela não substitui os cookies do navegador. Contas com MFA verificado são bloqueadas nesta tela para não reduzir a confirmação a senha; o aplicativo atual oferece autenticação por e-mail/senha.

Somente depois dessas validações o servidor cria o cliente administrativo, remove os objetos e chama `auth.admin.deleteUser(user.id, false)`, explicitamente sem soft delete. Uma resposta `user_not_found` nessa etapa é tratada como operação já concluída por outra requisição validada. Não existe endpoint que aceite livremente o UUID de outra pessoa.

Após o sucesso, o servidor tenta encerrar a sessão local e expira os cookies do Auth deste projeto, incluindo fragmentos e verificador PKCE. O navegador faz navegação completa para `/login?notice=conta_excluida`, descartando o estado financeiro em memória. Acesso posterior às rotas protegidas volta a exigir um usuário válido. Se uma repetição encontrar a sessão já inválida, a resposta 401 limpa os cookies e a interface retorna ao login sem afirmar um resultado que não conseguiu verificar.

O cliente em `src/lib/supabase/admin.ts` importa `server-only`, não persiste sessão e usa fetch sem cache. A chave é lida somente no servidor. Nenhuma credencial, senha ou resposta bruta do provedor é registrada ou enviada nas mensagens de erro. As demais operações usam a chave publicável, sessão validada e RLS.

`GET /api/account/export` usa o cliente autenticado normal, RLS e o UUID validado. Exporta perfil, categorias, transações, regras/revisões e orçamentos de todos os períodos, incluindo arquivados e ocorrências ocultas, paginando 500 registros por consulta. Não exporta senhas, tokens ou segredos. Valores monetários permanecem em centavos. Respostas de exportação e exclusão são privadas e sem cache compartilhado. Evite editar os dados em outro dispositivo enquanto exporta: a paginação não constitui um snapshot transacional único.

## Falhas e repetição

- Senha ou confirmação incorreta: nada é removido.
- Configuração administrativa/migração ausente: a exclusão para antes de apagar dados.
- Falha no Storage: Auth e dados financeiros permanecem; arquivos removidos antes da falha não são restaurados. Corrija a causa e repita a confirmação.
- Falha do Auth após remover arquivos: a conta pode permanecer; não recriamos arquivos nem executamos DELETE financeiro manual. Repita após corrigir a causa.
- Queda de conexão após Auth concluir: uma tentativa posterior pode receber sessão inválida. Volte ao login e confira a conta no painel usando a conta descartável de teste. Não se presume rollback de uma chamada cujo resultado não chegou.

## Verificação local e roteiro remoto pendente

Comandos: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:db`, `npm run build` e `npm test`. Resultados desta entrega estão em [verification.md](verification.md).

Os testes unitários simulam Auth/Storage para validar ordem, reautenticação, rejeição de IDs alheios, lotes, ausência de progresso e repetição após falhas. Os testes PGlite aplicam as quatro migrações sobre dados existentes, testam roles `anon`/`authenticated` sem bypass e o inventário exclusivo de serviço. A remoção SQL de Auth é uma simulação local do efeito administrativo, separada dos testes RLS: não comprova a integração do endpoint Auth remoto nem a remoção de bytes no Storage remoto.

Roteiro manual, depois de instalar 004 e configurar a variável privada:

1. Com duas contas descartáveis A e B, crie categorias, transações realizadas/previstas, recorrências e limites nas duas. Inclua dados antigos e arquivados. Anote IDs de B para conferir preservação.
2. Como A, exporte os dados e confira todos os períodos. Tente senha errada, confirmação diferente e um POST com `user_id` de B: todas as tentativas devem falhar sem excluir nada. Sem sessão, a rota deve responder 401; outra origem deve receber 403.
3. Se houver Storage no projeto de testes, envie arquivos autenticados como A e B (assim têm proprietário), inclusive em subpastas/buckets diferentes. Simule falha de Storage no ambiente de testes: a conta A e os registros financeiros devem continuar existindo, com mensagem de falha e opção de tentar novamente. Essa falha também já é reproduzida em testes locais com dependências simuladas.
4. Como A, digite EXCLUIR e a senha correta. Confira o retorno ao login, cookies expirados e bloqueio das rotas internas.
5. Confira no painel que A saiu de Authentication e que as cinco tabelas não têm mais seu UUID, inclusive linhas arquivadas/ocultas. Confira a remoção dos objetos de A pela API/painel Storage. Como B, confira que seus dados e arquivos continuam acessíveis e intactos.
6. Reabra a tela antiga de A em outro dispositivo e repita: a sessão inválida deve voltar ao login. O painel administrativo ajuda a conferir a cascade; **não é um teste de RLS**. O teste RLS usa as sessões reais de A/B e a chave publicável.

Referências oficiais: [exclusão administrativa](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [dados do usuário e Storage](https://supabase.com/docs/guides/auth/managing-user-data) e [propriedade de objetos Storage](https://supabase.com/docs/guides/storage/security/ownership).

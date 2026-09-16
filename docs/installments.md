# Compras parceladas

Esta entrega adiciona compromissos finitos de 2 a 60 parcelas, preservando lançamentos avulsos, recorrências, autenticação e o mês calendário. Não há faturas, fechamento, limite ou integração de cartão. A forma de pagamento é somente um rótulo opcional.

## Aplicar manualmente no Supabase

Nenhuma migração foi aplicada ao banco remoto durante o desenvolvimento.

Se as migrações 001 a 004 já estão instaladas, execute **somente**:

`supabase/migrations/202609160005_installments.sql`

No painel do projeto correto, abra **SQL Editor → New query**, copie o conteúdo completo desse arquivo e clique em **Run**. O arquivo inclui `BEGIN`/`COMMIT`; falhas revertem a migração. Ele cria duas tabelas, adiciona colunas opcionais aos lançamentos existentes e instala constraints, triggers, funções e políticas. Não recria tabelas existentes nem remove seus dados. A validação das constraints pode bloquear gravações durante a instalação; escolha um horário adequado ao volume do projeto.

Em um banco novo, a ordem completa é:

1. `supabase/migrations/202609100001_financial_schema.sql`
2. `supabase/migrations/202609100002_financial_functions.sql`
3. `supabase/migrations/202609100003_income_by_date.sql`
4. `supabase/migrations/202609140004_account_deletion.sql`
5. `supabase/migrations/202609160005_installments.sql`

Não repita migrações já instaladas. Em particular, não reaplique 004 depois de 005: a verificação de inventário da versão 004 conhece somente as cinco tabelas daquela versão. O arquivo 005 declara explicitamente os novos vínculos de exclusão para Auth. Se já houver tabelas de parcelamentos criadas fora do repositório, a migração falha de forma transacional; compare os schemas antes de adaptar o SQL.

Depois da instalação, reinicie ou atualize a aplicação e valide os fluxos abaixo. Não há novas variáveis de ambiente ou chaves para as operações de parcelamento. Elas usam a sessão autenticada e RLS; a chave administrativa continua limitada à exclusão definitiva da conta.

Sem 005 instalada, as consultas financeiras exibem erro de configuração do banco. Não substituem os parcelamentos por dados fictícios ou zeros.

## Como usar

Em **Novo lançamento → Despesa**, ative **Compra parcelada**, informe total, quantidade, data da compra, primeiro vencimento, categoria e descrição. A classificação padrão é variável; fixa também está disponível. Confira a prévia de todos os vencimentos e valores antes de salvar.

Exemplos: R$ 100,00 em 3 parcelas produz R$ 33,33 + R$ 33,33 + R$ 33,34. R$ 0,05 em 2 parcelas produz R$ 0,02 + R$ 0,03. Todas precisam ter pelo menos um centavo: R$ 0,01 em 2 parcelas é recusado. O primeiro vencimento não pode anteceder a compra. As datas, incluindo a última parcela, devem estar no intervalo já usado pelo aplicativo, de 2000 a 2100.

O dia do primeiro vencimento é a referência permanente: 31/01 → 28/02 ou 29/02 → 31/03. Um primeiro vencimento em 28/02 segue o dia 28 nos meses seguintes. Não há conversão de fuso das datas de calendário. O fuso do perfil define a data atual sugerida e o limite da data efetiva de pagamento.

Todas as parcelas começam previstas, inclusive vencimentos passados. Diferentemente da receita recorrente automática, despesas parceladas exigem confirmação de pagamento.

O histórico mostra **Parcela X/Y**, descrição, vencimento e situação. Clique no número da parcela ou em **Ver compra** para abrir o plano completo. As seções **Compras parceladas** do Histórico e Planejamento incluem planos de todos os períodos, permitindo localizar uma compra mesmo se não houver parcela no mês selecionado.

Em **Pagar**, informe o valor efetivamente pago e a data. A data pode ser diferente do vencimento, mas não anteceder a compra nem estar no futuro. O pagamento mantém o ID, o número da parcela e o vencimento original. O valor pago pode diferir do previsto; ambos aparecem nos detalhes. Depois de confirmado, o pagamento é histórico imutável nesta versão.

Sem parcelas pagas, é possível editar o plano inteiro ou excluí-lo, com confirmação. Mudanças no total, quantidade, data da compra ou primeiro vencimento regeneram todas as parcelas atomicamente. Se somente descrição, categoria, classificação ou forma de pagamento mudar, a programação é preservada.

Com alguma parcela paga, somente essas informações seguras podem ser alteradas; a alteração afeta as parcelas ainda previstas. O histórico pago conserva sua descrição, categoria, classificação, valor e datas. **Cancelar parcelas futuras** cancela todas as parcelas ainda não pagas, inclusive vencidas, preservando as pagas. A confirmação descreve esse alcance. Um plano cancelado não pode ser reativado; se não tem pagamentos, ainda pode ser excluído por inteiro.

## Modelo e regras financeiras

| Dado | Significado |
| --- | --- |
| `installment_plans` | Compra: proprietário, categoria, descrição, total em centavos, quantidade, datas, forma de pagamento, classificação, estado e identificação da solicitação |
| `installment_requests` | Registro mínimo da solicitação: proprietário, UUID da requisição, UUID original do plano, hash SHA-256 dos parâmetros e data; não guarda uma cópia dos valores/descrição da compra |
| `transactions.installment_plan_id` | Vínculo ao plano, validado junto com `user_id` por FK composta |
| `installment_number` / `total_installments` | Número e quantidade original da programação |
| `due_date` | Vencimento original, preservado depois do pagamento |
| `scheduled_amount_cents` | Valor originalmente previsto para a parcela, em centavos |
| `payment_date` | Data efetiva, preenchida ao pagar |
| `transactions.date` | Data do período financeiro: vencimento enquanto prevista; data do pagamento quando realizada |
| `transactions.amount` | Valor previsto enquanto pendente; valor efetivamente pago quando realizada |
| `transactions.deleted_at` | Nas parcelas, registra cancelamento das não pagas; elas permanecem visíveis nos detalhes e fora dos totais |

Lançamentos avulsos e recorrências mantêm as regras e colunas anteriores; os campos novos ficam nulos. Uma transação não pode pertencer simultaneamente a uma recorrência e a um parcelamento.

Os cálculos de divisão usam centavos inteiros: divisão inteira e resto na última parcela, em JavaScript com `BigInt` e em PostgreSQL com `bigint`. O total da compra aparece como informação do plano, nunca como uma despesa adicional. Há somente uma ocorrência financeira por parcela.

O dashboard soma parcelas pagas no mês do pagamento, junto às despesas realizadas existentes. Previstas aparecem separadamente. O orçamento variável desconta apenas parcelas variáveis pagas no período; despesas fixas não são descontadas novamente. O resumo de três meses considera os meses seguintes ao mês selecionado, usa vencimentos e exclui parcelas pagas/canceladas. Ele não é adicionado aos totais realizados.

As consultas de planos e parcelas de todos os períodos são separadas da lista mensal; o dashboard não junta as duas listas para calcular realizados. Todas são paginadas com o contexto autenticado, sem cache compartilhado.

## Atomicidade, reenvios e proteção do banco

As funções `create_installment_plan`, `edit_installment_plan`, `pay_installment`, `cancel_installment_plan` e `delete_installment_plan` usam `SECURITY INVOKER`, `search_path` fixo e `auth.uid()`. Nenhuma recebe um proprietário livremente informado. O servidor valida a sessão com `getUser()`, aceita campos conhecidos e chama as RPCs no contexto do usuário, sem `service_role`.

As operações travam o perfil do próprio usuário para serializar criação, pagamento e edição. Constraints únicas garantem `(user_id, client_request_id)` e `(installment_plan_id, installment_number)`. A interface bloqueia envio simultâneo e mantém o mesmo UUID de solicitação depois de um erro, sem gerar uma nova compra no retry. Se uma resposta for perdida depois de o servidor salvar, repetir os mesmos dados retorna o plano original. Reutilizar a chave com dados diferentes é recusado.

O registro mínimo em `installment_requests` permanece mesmo depois da exclusão de um plano sem pagamentos. Assim, uma requisição atrasada não recria uma compra excluída. O plano e suas parcelas são efetivamente removidos; permanece somente esse registro técnico, sem o conteúdo financeiro. A exclusão definitiva da conta também remove esse registro por cascade.

Triggers de validação diferida exigem, no commit, o conjunto completo de parcelas com os valores, quantidades, datas e estados corretos. Isso também impede persistir uma compra incompleta por gravações diretas na Data API. Uma falha em qualquer parcela reverte plano, parcelas e registro da solicitação. Edições com regeneração também são transacionais.

RLS está ativo nas duas tabelas novas. Planos têm políticas de leitura, inserção, atualização e exclusão próprias; o registro de solicitação só permite leitura/inserção próprias, sem UPDATE/DELETE pelo usuário. Proprietário e identidade de parcelas são imutáveis. Referências compostas impedem categorias e planos alheios. Parcelas pagas não podem ser reescritas, apagadas individualmente nem removidas por exclusão direta do plano. As operações genéricas de transação recusam linhas de parcelamentos, encaminhadas aos fluxos próprios.

As duas tabelas novas referenciam diretamente `auth.users(id) ON DELETE CASCADE`. Transações mantêm seus vínculos anteriores com usuário/perfil e passam a ter FK composta para o plano com CASCADE. A exclusão de Auth remove também planos, parcelas pagas/canceladas e registros de solicitações. A exceção dos triggers para DELETE encadeado atende às cascatas referenciais; não concede ao usuário permissão de excluir Auth ou criar triggers. O teste local reproduz a remoção com um papel que só tem leitura/exclusão em Auth, sem grants nas tabelas financeiras.

## Exportação

O CSV do histórico mantém BOM UTF-8, separador `;`, vírgula decimal e proteção contra fórmulas. Inclui descrição da compra, número/total de parcelas, vencimento, data de pagamento, valor previsto, valor efetivo e situação. Usa os mesmos filtros e período da tela: parcelas pagas são filtradas pela data de pagamento; previstas, pelo vencimento. Parcelas canceladas ficam nos detalhes, sem aparecer como despesas do período.

A exportação completa em JSON de Configurações inclui os planos e registros mínimos das solicitações; suas parcelas já estão na coleção `transactions`, incluindo canceladas. Não há uma segunda coleção de parcelas na exportação que duplique lançamentos.

## Verificação e próximos passos

Comandos: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:db`, `npm run build` e `npm test -- --workers=1 --trace=off`. Resultados executados estão em [verification.md](verification.md).

Os testes PostgreSQL locais aplicam a nova migração sobre um lançamento já existente, usam duas contas e roles `authenticated`/`anon`, verificam atomicidade com falha injetada na segunda parcela, regeneração, pagamento, cancelamento, tentativas diretas com IDs alheios e cascatas. Os testes de navegador renderizam os componentes reais e o FinanceProvider com a API financeira interceptada, em desktop/celular. Não acessam contas remotas nem substituem autenticação no aplicativo; o harness fica em `tests/fixtures`, fora das rotas da aplicação. `esbuild` foi adicionado somente como dependência de desenvolvimento para esses testes.

O PostgreSQL embutido usa uma conexão: a proteção por lock/unique foi implementada, mas concorrência HTTP real contra Supabase ainda precisa ser validada. Depois de aplicar o SQL, use um projeto de testes e duas contas descartáveis:

1. Como A, crie R$ 100,00 em 3 parcelas iniciando em 31/01 e confira centavos, fevereiro e março. Repita o POST com o mesmo `client_request_id`: deve continuar uma compra com três linhas. Envie duas chamadas simultâneas com a mesma chave e confirme o mesmo resultado.
2. Pague a primeira parcela no mês seguinte com um valor diferente. Confira o vencimento preservado, o valor efetivo no dashboard daquele mês e o CSV com ambas as datas.
3. Edite um plano não pago, exclua com confirmação e repita sua requisição original: a compra não deve reaparecer.
4. No plano com pagamento, tente regenerar/excluir: deve falhar. Edite descrição/categoria das futuras e depois cancele as não pagas; a primeira parcela deve permanecer intacta.
5. Como B, tente leitura e operações de A pela Data API/RPC, usando os IDs anotados e a sessão de B. Nenhuma deve revelar ou alterar registros de A. Sem sessão, acesso às novas tabelas/RPCs deve ser negado. O SQL Editor administrativo não é um teste de RLS.
6. Exclua definitivamente a conta descartável A pelo fluxo existente e confira ausência do UUID nas sete tabelas pessoais. Confirme que B conserva seus dados. Não exclua uma conta real para testar.

Nenhuma validação remota, publicação ou alteração de infraestrutura foi executada nesta entrega.

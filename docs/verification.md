# Verificação da entrega financeira

Resultados executados localmente nesta entrega:

| Comando | Resultado |
| --- | --- |
| `npm run lint` | Passou, sem erros ou avisos de lint. |
| `npm run typecheck` | Passou: tipos de rotas e TypeScript. |
| `npm run test:unit` | 11 testes passaram. |
| `npm run test:db` | 10 testes passaram, incluindo o teste agrupador e 9 cenários de banco. |
| `npm run build` | Passou: build de produção e tipos. |
| `npm test` | 25 passaram; 6 testes de navegador autenticado foram ignorados por falta de credenciais de teste. |
| `npm run test:rls:remote` | 1 teste ignorado, pois o opt-in e as duas contas não foram configurados. |
| `git diff --check` | Sem erros de espaços em branco. |

Os 11 testes unitários também fazem parte dos 25 aprovados por `npm test`; os números não devem ser somados como testes distintos.

## O que os resultados comprovam

- Conversão de valores brasileiros para centavos, datas e meses válidos, ano bissexto e virada de mês no fuso do perfil.
- Separação de previstos/realizados e despesas fixas/variáveis, orçamento ausente versus zero e avisos em 70/85/100%.
- Filtros compartilhados com CSV e neutralização de fórmulas.
- Compilação dos componentes, handlers e consultas.
- Bloqueio de visitantes nas rotas financeiras/API, recusa de POST de outra origem e manutenção dos formulários públicos em desktop/celular.
- Aplicação das duas migrações em PostgreSQL local, inicialização de usuários novos/antigos e repetição sem duplicação.
- RLS local com dois usuários e papel visitante, sem BYPASSRLS nas operações testadas: leitura, inserção, edição, exclusão, mudança de proprietário e referências alheias.
- Validações de banco, ocorrência única por regra/mês em geração repetida, confirmação da mesma ocorrência, versões futuras e preservação de realizados/exclusões.

O PGlite usa uma conexão local e helpers de identidade preparados pelo teste. Ele não comprova concorrência entre conexões reais nem integração remota do Auth/PostgREST.

## Pendências explícitas

1. Inspecionar se há schema financeiro remoto não documentado no repositório.
2. Aplicar manualmente as duas migrações conforme [o guia financeiro](financial-mvp.md).
3. Validar consultas e gravações pelo projeto Supabase real.
4. Executar `tests/app.spec.ts` com uma conta de teste confirmada para verificar visualmente e funcionalmente as telas financeiras autenticadas, inclusive no celular.
5. Executar o script remoto com duas contas de teste e visitante, incluindo as seis chamadas concorrentes de geração.
6. Conferir o CSV no Excel e concluir o roteiro manual documentado.

Nenhuma migração foi aplicada ao banco remoto, nenhuma infraestrutura foi publicada e nenhum resultado remoto foi presumido. A autenticação por e-mail manteve seu fluxo; os testes públicos interceptam envios para não criar contas ou disparar mensagens.
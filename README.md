# App Finanças

Protótipo de controle financeiro em português do Brasil, criado com Next.js App Router, React, TypeScript, Tailwind CSS, ESLint e npm.

## Executar localmente

Use Node.js 22 ou superior e npm. O projeto foi validado com Node.js 24.

```bash
npm ci
npm run dev
```

Abra http://localhost:3000. A página inicial leva ao dashboard.

| Comando | Função |
| --- | --- |
| `npm run dev` | Inicia o servidor de desenvolvimento. |
| `npm run lint` | Executa o ESLint com regras do Next.js, React e TypeScript. |
| `npm run build` | Gera a versão de produção e verifica os tipos. |
| `npm start` | Serve a versão de produção após o build. |
| `npm test` | Executa testes de cálculos e dos fluxos no navegador, em desktop e celular. |
| `npm run test:unit` | Executa somente os testes de cálculos. |

Os testes usam Playwright e o **Google Chrome instalado localmente**, em modo headless. Execute `npm run build` antes de `npm test`. A configuração inicia e encerra um servidor de produção em `127.0.0.1:3100`; deixe essa porta livre. Para instalar o Chrome pelo Playwright, quando necessário: `npx playwright install chrome`. Os relatórios, capturas e traces ficam em `test-results/`.

## Telas e comportamento

- `/login`: entrada simulada com e-mail e senha fictícios.
- `/cadastro`: perfil demonstrativo, com confirmação de senha.
- `/configuracao-inicial`: receita prevista, saldo inicial, reserva e limite.
- `/dashboard`: resumo do mês, despesas por categoria, utilização do limite e últimas movimentações.
- `/historico`: movimentações com busca e filtros por tipo, categoria e mês.
- `/lancamento`: registro de despesa ou receita, com validação e confirmação.
- `/planejamento`: edição do planejamento e dos limites por categoria.
- `/configuracoes`: edição do perfil demonstrativo e acesso às preferências financeiras.

No celular, a navegação fica na parte inferior e o botão flutuante abre um lançamento de despesa. O seletor de mês é compartilhado entre as telas internas. Um lançamento em outro mês seleciona automaticamente esse período.

**Não há Supabase, autenticação real, banco de dados ou persistência.** As rotas são públicas. Nenhuma senha é armazenada. Os valores ficam no contexto React e voltam ao exemplo inicial ao recarregar a página. Use dados fictícios. A demonstração começa em setembro de 2026.

## Regras do resumo financeiro

Todos os valores são armazenados em centavos inteiros e exibidos com `Intl.NumberFormat("pt-BR")`, em reais.

- Receitas e despesas consideram apenas as movimentações do mês selecionado.
- Saldo = saldo inicial + receitas − despesas.
- Disponível = saldo − valor reservado; pode ser negativo.
- Utilização = despesas ÷ limite mensal × 100. O texto pode ultrapassar 100%; a barra visual termina em 100%.
- Receita prevista é uma referência de planejamento e não aumenta o total recebido.
- Limites por categoria são independentes do limite mensal; zero significa categoria sem limite.
- Nesta etapa, as preferências financeiras são compartilhadas por todos os meses, sem transporte automático de saldo entre períodos.
- Entradas monetárias usam o padrão brasileiro: `125,90` ou `1.250,00`. O limite mensal precisa ser positivo.
- Datas usam `YYYY-MM-DD`, com apresentação em português sem mudança de dia por fuso horário.

## Arquivos do projeto

### Rotas e apresentação global

Os grupos `(app)` e `(auth)` organizam layouts e não aparecem nas URLs.

| Arquivo | Responsabilidade |
| --- | --- |
| `src/app/layout.tsx` | Define idioma, metadados e o provedor de dados compartilhado. |
| `src/app/page.tsx` | Redireciona a raiz para `/dashboard`. |
| `src/app/globals.css` | Importa Tailwind e define cores, componentes visuais, foco e layouts responsivos. |
| `src/app/icon.svg` | Ícone próprio do aplicativo, usado pelo Next.js nos metadados. |
| `src/app/not-found.tsx` | Página em português para endereços inexistentes. |
| `src/app/(app)/layout.tsx` | Aplica a navegação e a estrutura das telas financeiras. |
| `src/app/(app)/dashboard/page.tsx` | Rota e título da visão geral. |
| `src/app/(app)/historico/page.tsx` | Rota e título do histórico. |
| `src/app/(app)/lancamento/page.tsx` | Cabeçalho e formulário de lançamento rápido. |
| `src/app/(app)/planejamento/page.tsx` | Cabeçalho e edição do planejamento. |
| `src/app/(app)/configuracoes/page.tsx` | Rota e título das configurações. |
| `src/app/(auth)/layout.tsx` | Layout visual compartilhado entre login e cadastro. |
| `src/app/(auth)/login/page.tsx` | Exibe o formulário em modo login. |
| `src/app/(auth)/cadastro/page.tsx` | Exibe o formulário em modo cadastro. |
| `src/app/configuracao-inicial/page.tsx` | Tela independente para configurar os valores iniciais. |

### Componentes, tipos e dados

| Arquivo | Responsabilidade |
| --- | --- |
| `src/components/app-shell.tsx` | Menu lateral, navegação móvel, seletor de mês, perfil e botão flutuante. |
| `src/components/auth-form.tsx` | Login/cadastro simulados, validação e navegação para a próxima tela. |
| `src/components/dashboard.tsx` | Indicadores, gráfico por categoria, limite e últimas movimentações. |
| `src/components/finance-provider.tsx` | Estado em memória, inclusão de lançamentos e atualização de preferências. |
| `src/components/financial-form.tsx` | Formulário compartilhado entre configuração inicial e planejamento. |
| `src/components/history.tsx` | Busca, filtros e totais do histórico. |
| `src/components/icon.tsx` | Ícones SVG reutilizáveis sem dependência de biblioteca de ícones. |
| `src/components/settings.tsx` | Edição do perfil e acesso às configurações financeiras. |
| `src/components/transaction-form.tsx` | Validação, registro e confirmação de receitas e despesas. |
| `src/components/transaction-list.tsx` | Tabela responsiva ordenada por data, com estado vazio. |
| `src/components/ui.tsx` | Marca, cabeçalhos e barras de progresso acessíveis. |
| `src/data/mock-data.ts` | Categorias, perfil, limites e movimentações de exemplo. |
| `src/lib/finance.ts` | Conversão monetária, apresentação de datas e cálculos do resumo. |
| `src/types/finance.ts` | Contratos TypeScript para categorias, lançamentos e configurações. |

### Ferramentas, documentação e testes

| Arquivo | Responsabilidade |
| --- | --- |
| `package.json` | Nome, scripts, dependências e versão mínima de Node.js do projeto. |
| `package-lock.json` | Versões resolvidas para instalações reproduzíveis com npm. |
| `next.config.ts` | Ponto de configuração do Next.js; mantém os padrões do scaffold. |
| `tsconfig.json` | TypeScript estrito e alias `@/*` para `src/*`. |
| `eslint.config.mjs` | Regras de qualidade do Next.js e TypeScript. |
| `postcss.config.mjs` | Integração do Tailwind CSS com PostCSS. |
| `.gitignore` | Exclui dependências, builds, variáveis locais e artefatos dos testes. |
| `playwright.config.ts` | Projetos de testes, navegador e servidor de validação. |
| `tests/finance.spec.ts` | Testes de conversão, saldo, reserva, seleção de mês e limites. |
| `tests/app.spec.ts` | Testes dos formulários, navegação, filtros, estado e responsividade. |
| `README.md` | Instruções de execução, escopo, regras e descrição de todos os arquivos. |

### Arquivos gerados e limpeza do template

- `next-env.d.ts`: referências de tipos geradas pelo Next.js; não editar manualmente.
- `.next/`: saída e cache do desenvolvimento/build, gerados automaticamente.
- `node_modules/`: dependências instaladas pelo npm.
- `test-results/`: capturas e traces gerados pelos testes.
- `*.tsbuildinfo`: cache incremental do TypeScript, quando gerado.
- Os cinco SVGs de exemplo de `public/` e o favicon padrão foram removidos; a marca usa `src/app/icon.svg`. A pasta `public/` permanece disponível para futuros arquivos estáticos.
- `AGENTS.md` não foi recriado.

O projeto foi gerado na própria pasta do repositório com o [create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app). No Windows, foi usado o caminho equivalente `financialapp` em minúsculas para atender à validação de nomes npm, sem renomear ou mover a pasta original.

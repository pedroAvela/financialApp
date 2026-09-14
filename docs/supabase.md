# Autenticação com Supabase

Este guia descreve a autenticação existente, preservada na integração financeira. Para instalar tabelas, RLS e funções do MVP, siga também [o guia financeiro](financial-mvp.md).

## Ambiente local

Os pacotes oficiais são `@supabase/supabase-js` e `@supabase/ssr`. O Next.js carrega `.env.local` automaticamente no desenvolvimento e no build. O arquivo existente foi preservado e está ignorado pelo Git.

Para um novo checkout, copie `.env.example` para `.env.local` e preencha:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICAVEL
```

Obtenha esses valores no diálogo **Connect** ou em **Project Settings → API Keys**. Use a chave **Publishable** (`sb_publishable_`). As operações normais usam somente a chave publicável e a sessão autenticada. A exclusão definitiva de conta utiliza `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no servidor, após reautenticação, conforme [o guia de exclusão](account-deletion.md). Não configure senha do banco nem segredo de assinatura JWT na aplicação. Variáveis `NEXT_PUBLIC_*` são incluídas no navegador: nunca coloque uma chave privada nelas. Em produção, configure as variáveis públicas no serviço de hospedagem antes do build e gere um novo build ao alterá-las. Configure também a variável administrativa privada no servidor se ativar a exclusão de conta.

## Configurações manuais no painel

1. Em **Authentication → Sign In / Providers → Email**, habilite o provedor de e-mail, o cadastro de novos usuários e **Confirm email**. O código também trata projetos com confirmação desativada: nesse caso, o cadastro inicia a sessão imediatamente. A interface exige pelo menos seis caracteres no cadastro e na redefinição; políticas mais fortes configuradas no Supabase também serão aplicadas pelo serviço.
2. Em **Authentication → URL Configuration**, configure o **Site URL** como `http://localhost:3000` durante o desenvolvimento; no ambiente publicado, use a origem HTTPS da aplicação.
3. Cadastre estas **Redirect URLs**, incluindo o parâmetro `next`:

   ```text
   http://localhost:3000/auth/confirm?next=/configuracao-inicial
   http://localhost:3000/auth/confirm?next=/redefinir-senha
   ```

   Adicione as duas URLs equivalentes com o domínio de produção. Se usar outra porta ou `127.0.0.1`, cadastre também a origem exata usada no navegador. Os testes opcionais autenticados usam `http://127.0.0.1:3100`.

4. Em **Authentication → Email Templates**, configure os links abaixo. Eles usam `RedirectTo`, definido pelo aplicativo e permitido pelas URLs anteriores. Como o destino já contém `?next=...`, os novos parâmetros são acrescentados com `&amp;`.

   **Confirm signup**:

   ```html
   <a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">Confirmar meu e-mail</a>
   ```

   **Reset password**:

   ```html
   <a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">Redefinir minha senha</a>
   ```

   O aplicativo aceita `type=email` e os links antigos com `type=signup`, verifica o token no servidor e grava os cookies diretamente na resposta de redirecionamento antes de abrir a próxima tela. Esses templates permitem abrir o e-mail em outro navegador. O callback também aceita `code`, para o fluxo PKCE dos templates padrão com `ConfirmationURL`; nesse fluxo, abra o link no mesmo navegador que fez a solicitação. Para estes templates personalizados, inicie cadastro e recuperação pelas telas do aplicativo, que informam `RedirectTo`.

5. Configure **Authentication → Email / SMTP Settings** com seu provedor de envio para usar endereços reais fora da equipe do projeto. O envio padrão do Supabase tem restrições de destinatários e limites baixos. Verifique remetente, domínio e caixa de spam ao validar os fluxos.

Referências oficiais: [clientes SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [autenticação por senha](https://supabase.com/docs/guides/auth/passwords), [URLs de redirecionamento](https://supabase.com/docs/guides/auth/redirect-urls), [templates de e-mail](https://supabase.com/docs/guides/auth/auth-email-templates) e [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Fluxos implementados

- Cadastro: envia nome em `user_metadata.name`, e-mail e senha para Supabase Auth. Com confirmação ativa, mostra uma mensagem para verificar o e-mail. A confirmação abre `/configuracao-inicial`.
- Login: autentica e retorna ao destino interno solicitado, ou a `/dashboard`. URLs externas e destinos desconhecidos são recusados.
- Logout: disponível na barra lateral e em Configurações, inclusive no celular. Encerra a sessão deste navegador e volta ao login, descartando o cache local das consultas. Não desconecta outros dispositivos.
- Recuperação: `/recuperar-senha` solicita o link sem revelar se a conta existe. `/auth/confirm` valida o link; `/redefinir-senha` exige sessão autenticada e salva a nova senha. Após salvar, o usuário pode continuar ao painel.
- Links inválidos, expirados ou já utilizados: voltam ao login ou à recuperação com mensagem em português. Ausência do verificador PKCE e falhas de conexão têm mensagens próprias, sem afirmar incorretamente que o e-mail expirou.
- Templates que retornam `#access_token=...&refresh_token=...`: passam pela página `/confirmar-email`, que remove o fragmento do histórico, instala a sessão e valida o usuário antes de navegar. Não verifica novamente um token de e-mail já consumido pelo Supabase.
- Proteção: `src/proxy.ts` renova cookies e valida o usuário com `getUser()`. O layout protegido e a página de redefinição validam novamente no servidor. Respostas do proxy e callback usam `private, no-store`.

O nome inicial vem da conta e é persistido em profiles. Configurações salva nome e fuso do perfil financeiro; o e-mail exibido vem da conta autenticada e é somente leitura.

## Arquivos principais

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/supabase/config.ts` | Lê apenas URL e chave publicável. |
| `src/lib/supabase/client.ts` | Cliente do navegador com cookies. |
| `src/lib/supabase/server.ts` | Cliente por requisição, restrito ao servidor. |
| `src/proxy.ts` | Renovação de sessão e bloqueio de rotas internas. |
| `src/lib/auth.ts` | Destinos permitidos e tradução de erros. |
| `src/app/(protected)/layout.tsx` | Validação no servidor e provedor de consultas por usuário. |
| `src/app/auth/confirm/route.ts` | Confirmação por token/código, gravação explícita dos cookies e preservação da origem local. |
| `src/lib/auth-confirm.ts` | Validação dos tipos aceitos, destinos internos e classificação dos erros do callback. |
| `src/components/email-confirmation.tsx` | Conclusão no navegador para sessões recebidas no fragmento da URL. |
| `src/components/auth-form.tsx` | Cadastro e login. |
| `src/components/password-form.tsx` | Solicitação de recuperação e nova senha. |
| `src/components/logout-button.tsx` | Saída com carregamento e erro. |

## Validação

```bash
npm run lint
npm run build
npm test
```

Os testes padrão verificam cálculos, destinos seguros, bloqueio de visitantes, callback sem credenciais, formulários, carregamento, mensagens e responsividade em desktop e celular. As chamadas dos formulários ao Supabase são interceptadas nesses testes; eles não criam contas nem enviam e-mails.

Os testes de telas autenticadas em `tests/app.spec.ts` são opcionais e ficam marcados como ignorados sem `E2E_EMAIL` e `E2E_PASSWORD`. Para executá-los, configure essas variáveis no terminal com uma conta confirmada de um projeto Supabase dedicado a testes. A URL e a chave de `.env.local` devem apontar para esse mesmo projeto antes de gerar o build. Não use uma conta pessoal ou de produção. Esses testes fazem login real e incluem persistência da sessão após recarregar e logout; as operações financeiras persistem no projeto de testes; consulte o guia financeiro para preparação e limpeza.

Depois de configurar o painel, valide manualmente com uma conta de teste:

1. Abra uma rota interna sem sessão: ela deve levar ao login com `next`.
2. Cadastre nome, e-mail e senha; confirme o e-mail e verifique a configuração inicial.
3. Saia, tente uma senha incorreta e depois entre com a senha correta; recarregue a página para conferir a sessão.
4. Solicite recuperação, abra o e-mail, salve uma nova senha e confirme que consegue entrar com ela.
5. Tente reutilizar o link consumido: ele não deve criar outra sessão. A mensagem deve orientar login se o e-mail já foi confirmado; o código PKCE sem estado local orienta abrir no navegador original ou entrar com senha.
6. Saia pelo celular em Configurações e confirme que `/dashboard` voltou a exigir login.

## E-mail confirmado, mas acesso pelo link não concluído

Confirmar o endereço no Supabase e iniciar uma sessão no navegador são etapas distintas. O callback anterior tratava todas as falhas como link expirado e não processava o fragmento da URL nem `type=email`.

A correção de 14/09/2026 trata os três formatos: token hash no servidor, código PKCE e sessão no fragmento. Tokens e mensagens brutas do provedor não são copiados para as URLs de erro. Links inválidos não liberam rotas internas e a recuperação mantém seu destino específico.

Se o link padrão com `ConfirmationURL` for aberto em outro navegador, o verificador PKCE criado no cadastro pode não existir ali. O aplicativo agora orienta entrar com senha quando o e-mail já tiver sido confirmado, sem dizer que a confirmação expirou. Para permitir confirmação e sessão em outro navegador, configure **Confirm signup** com o template `token_hash` mostrado acima. Isso é uma alteração manual no painel; não exige migração SQL. Gere um novo e-mail pelo cadastro para testar o template atualizado, pois e-mails já enviados mantêm o link antigo.

Links também podem ser consumidos previamente por ferramentas de verificação do provedor de e-mail. A aplicação não pode validar novamente um token de uso único já consumido. Se esse comportamento persistir, confira as orientações oficiais sobre [pré-carregamento de e-mails e templates](https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching).

Os testes automatizados cobrem os formatos e as mensagens com respostas simuladas; a entrega do e-mail e o template efetivamente configurado no painel ainda devem ser validados manualmente. Não envie links completos com tokens nem credenciais pelo chat.

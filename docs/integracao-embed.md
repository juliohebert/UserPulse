# Integração do embed UserPulse

Este documento descreve como sistemas externos devem integrar o UserPulse para exibir campanhas de comunicação aos seus usuários.

---

## O que é o embed

O UserPulse é um widget JavaScript que roda no navegador do usuário final. Ele consulta a API do UserPulse para verificar se existe uma campanha ativa e, se houver, exibe um modal automaticamente.

O embed é um arquivo JavaScript único (`widget.js`) que deve ser incluído em qualquer tela onde você queira que campanhas possam ser exibidas.

---

## Dois modos de embed

### Modo por sistema/tela (automático)

O widget busca qualquer campanha elegível cadastrada para aquele `sistema` + `tela`. Bom para campanha "de disparo amplo" — qualquer campanha ativa para aquela tela será exibida.

```js
window.UserPulse.init({
  sistema: "QuarkClinic",
  tela: "agenda",
  usuario_id: "...",
  usuario_nome: "...",
  usuario_email: "..."
});
```

### Modo por slug (campanha específica)

O widget busca uma campanha específica pelo slug. Bom para campanhas direcionadas — o embed exibirá **exatamente** aquela campanha (se estiver ativa e elegível para o usuário).

```js
window.UserPulse.init({
  slug: "pesquisa-satisfacao-q4",
  usuario_id: "...",
  usuario_nome: "...",
  usuario_email: "..."
});
```

> O slug é gerado automaticamente a partir do título ao criar a campanha no painel UserPulse. Ele fica disponível no botão **Embed** da listagem de campanhas.

**Regra de prioridade:** se `slug` for informado, `sistema` e `tela` são ignorados.

---

## Instalação

Adicione dois blocos de script antes do fechamento do `</body>`:

```html
<script src="https://userpulse.seudominio.com/widget.js"></script>
<script>
  window.UserPulse.init({
    sistema: "QuarkClinic",
    tela: "agenda",
    usuario_id: usuarioLogado.id,
    usuario_nome: usuarioLogado.nome,
    usuario_email: usuarioLogado.email
  });
</script>
```

O primeiro script carrega o widget. O segundo inicializa e dispara a busca por campanha para o sistema e tela informados.

---

## Exemplo completo — QuarkClinic / Agenda

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>QuarkClinic — Agenda</title>
  </head>
  <body>
    <!-- conteúdo da tela -->

    <script src="https://userpulse.seudominio.com/widget.js"></script>
    <script>
      window.UserPulse.init({
        sistema: "QuarkClinic",
        tela: "agenda",
        usuario_id: usuarioLogado.id,
        usuario_nome: usuarioLogado.nome,
        usuario_email: usuarioLogado.email
      });
    </script>
  </body>
</html>
```

---

## Parâmetros de `window.UserPulse.init()`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `slug` | string | Sim ¹ | Slug da campanha específica (modo por slug) |
| `sistema` | string | Sim ¹ | Identificador do sistema hospedeiro (ex: `"QuarkClinic"`) |
| `tela` | string | Sim ¹ | Identificador da tela atual (ex: `"agenda"`, `"financeiro"`) |
| `usuario_id` | string | Recomendado | ID único do usuário no sistema hospedeiro |
| `usuario_nome` | string | Opcional | Nome completo do usuário |
| `usuario_email` | string | Opcional | E-mail do usuário |

¹ Informe **`slug`** OU **`sistema` + `tela`** — nunca ambos ao mesmo tempo. Se `slug` estiver presente, `sistema` e `tela` são ignorados.

---

## O UserPulse não descobre o usuário sozinho

O widget não tem acesso à sessão, cookies ou banco de dados do sistema hospedeiro. **O sistema hospedeiro é responsável por informar o usuário logado** no momento em que chama `window.UserPulse.init()`.

```js
// Correto: passando o usuário já autenticado pelo seu sistema
window.UserPulse.init({
  sistema: "QuarkClinic",
  tela: "agenda",
  usuario_id: session.user.id,       // id interno do seu sistema
  usuario_nome: session.user.nome,
  usuario_email: session.user.email,
});

// Errado: widget não consegue descobrir por conta própria
window.UserPulse.init({
  sistema: "QuarkClinic",
  tela: "agenda",
  // usuario_id ausente — eventos e feedbacks não terão autoria
});
```

Se `usuario_id` não for passado, o widget ainda funciona, mas feedbacks e eventos de clique ficam sem identificação de usuário no painel.

---

## Como identificar sistema e tela

Os valores de `sistema` e `tela` são strings livres definidas por você no painel UserPulse ao criar uma campanha. Recomendações:

- Use o mesmo valor em todos os ambientes (dev, staging, prod) para facilitar o teste.
- Use lowercase sem espaços ou acentos: `"quarkclinic"`, `"agenda"`.
- Seja consistente: `tela: "agenda"` e `tela: "Agenda"` são valores diferentes.

---

## Comportamento da modal automática

Quando `window.UserPulse.init()` é chamado, o widget:

1. Faz uma requisição para o servidor UserPulse:
   - Modo por slug: `GET /api/widget/campanha?slug=<slug>&usuario_id=...`
   - Modo por sistema/tela: `GET /api/widget/campanha?sistema=...&tela=...&usuario_id=...`
2. Se encontrar uma campanha ativa, aguarda o `atraso_ms` configurado (padrão: 800 ms).
3. Exibe o modal de forma automática.
4. Registra um evento de `visualizacao` no banco de dados.

O modal pode ser fechado pelo usuário a qualquer momento. Se a campanha estiver configurada com `mostrar_uma_vez: false`, o modal voltará a aparecer na próxima vez que o usuário carregar a tela.

---

## Como funciona o feedback

Se a campanha tiver `feedback_habilitado: true`, o modal exibe uma escala NPS (0–10) e, opcionalmente, um campo de texto (quando `observacao_obrigatoria: true`, o texto se torna obrigatório para enviar).

Ao confirmar, o widget envia:

```
POST /api/widget/feedback
{
  "campanha_id": "...",
  "nota": 9,
  "observacao": "Muito útil!",
  "usuario_id": "123",
  "usuario_nome": "Maria Silva",
  "usuario_email": "maria@quarkclinic.com",
  "sistema": "QuarkClinic",
  "tela": "agenda"
}
```

Os dados do usuário passados no `init()` são incluídos automaticamente — sem nenhuma ação adicional do sistema hospedeiro.

---

## Como funcionam os eventos de visualização e clique CTA

O widget registra dois tipos de evento automaticamente:

| Evento | Quando é disparado |
|---|---|
| `visualizacao` | Modal exibido pela primeira vez na sessão |
| `clique_cta` | Usuário clica no botão de CTA do modal |

Esses eventos são enviados como:

```
POST /api/widget/evento
{
  "campanha_id": "...",
  "tipo_evento": "visualizacao",
  "usuario_id": "123",
  "sistema": "QuarkClinic",
  "tela": "agenda"
}
```

Os totais ficam disponíveis no dashboard da campanha: **Visualizações**, **Cliques CTA** e **Taxa de Clique**.

---

## Ambiente local (desenvolvimento)

Durante o desenvolvimento, o servidor UserPulse roda na porta `3333`. Use:

```html
<script src="http://localhost:3333/widget.js"></script>
```

O arquivo `test-embed.html` na raiz do projeto já está configurado com essa URL e simula a tela de Agenda do QuarkClinic. Para testar:

1. Rode `npm start` na raiz do projeto.
2. Certifique-se de que existe uma campanha ativa para `QuarkClinic / agenda` no painel (`http://localhost:5173`).
3. Abra `test-embed.html` diretamente no navegador (clique duplo).
4. O modal deve aparecer automaticamente após ~800 ms.

---

## Ambiente de produção

Em produção, o servidor UserPulse serve o `widget.js` na mesma URL base da aplicação:

```html
<script src="https://userpulse.seudominio.com/widget.js"></script>
```

O Express serve o widget em `GET /widget.js` com `Content-Type: application/javascript`. Não é necessário CDN ou configuração adicional — o widget é servido pelo mesmo processo que serve a API.

---

## Boas práticas de segurança

**Nunca envie dados sensíveis no `init()`.**
Os parâmetros `usuario_id`, `usuario_nome` e `usuario_email` ficam visíveis no código-fonte da página e nos logs de rede do navegador. Não passe tokens de autenticação, senhas ou dados financeiros.

**Use HTTPS em produção.**
A comunicação entre o widget e a API deve ocorrer sempre por HTTPS para evitar interceptação dos dados do usuário e do feedback.

**O widget não autentica o usuário.**
Qualquer página que saiba o `sistema` e `tela` corretos pode chamar `init()`. Se precisar restringir quem vê campanhas, implemente essa lógica no servidor (ex: retornar campanha apenas se `usuario_id` estiver em uma lista permitida).

**O `usuario_id` deve ser o ID interno do seu sistema.**
Não use o e-mail como identificador primário — e-mails mudam. Use o ID imutável do usuário no banco de dados do sistema hospedeiro.

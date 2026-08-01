# Integração UserPulse — QuarkClinic

Este documento descreve como o QuarkClinic deve integrar o widget UserPulse em suas telas.

---

## Snippet Padrão

Cole os dois blocos abaixo antes do `</body>` em cada tela onde campanhas devem ser exibidas:

```html
<!-- UserPulse widget -->
<script src="https://userpulse.quarkclinic.com/widget.js"></script>
<script>
  window.UserPulse.init({
    sistema: "QuarkClinic",
    tela: "agenda",                   // nome da tela atual
    usuario_id: String(usuario.id),   // ID do usuário logado
    usuario_nome: usuario.nome,
    usuario_email: usuario.email
  });
</script>
```

> Substitua `userpulse.quarkclinic.com` pelo domínio onde o UserPulse está hospedado.

### Alternativa: embed por campanha específica (slug)

Use `slug` para exibir **uma campanha específica** em vez de qualquer elegível para aquela tela. O slug é gerado automaticamente a partir do título no painel UserPulse e fica disponível no botão **Embed** da listagem:

```html
<script src="https://userpulse.quarkclinic.com/widget.js"></script>
<script>
  window.UserPulse.init({
    slug: "pesquisa-satisfacao-agenda-q4",
    usuario_id: String(usuario.id),
    usuario_nome: usuario.nome,
    usuario_email: usuario.email
  });
</script>
```

| Modo | Quando usar |
|---|---|
| `sistema + tela` | Campanha dinâmica — exibe qualquer campanha elegível para aquela tela |
| `slug` | Campanha fixa — exibe exatamente aquela campanha, em qualquer tela |

---

## Exemplo Real — Tela de Agenda

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>QuarkClinic — Agenda</title>
</head>
<body>

  <!-- ... conteúdo da agenda ... -->

  <!-- UserPulse: incluir ao final do body, após carregar o usuário logado -->
  <script src="https://userpulse.quarkclinic.com/widget.js"></script>
  <script>
    // Exemplo com objeto de sessão do QuarkClinic
    var sessao = QuarkClinic.getSessaoAtual();  // adaptar para a API real

    window.UserPulse.init({
      sistema: "QuarkClinic",
      tela: "agenda",
      usuario_id: String(sessao.usuarioId),
      usuario_nome: sessao.usuarioNome,
      usuario_email: sessao.usuarioEmail
    });
  </script>

</body>
</html>
```

---

## Mapeamento de Telas

O par `sistema + tela` deve corresponder exatamente ao que está cadastrado no painel UserPulse.

| Tela no QuarkClinic | `sistema` | `tela` |
|---|---|---|
| Agenda | `QuarkClinic` | `agenda` |
| Dashboard | `QuarkClinic` | `dashboard` |
| Pacientes | `QuarkClinic` | `pacientes` |
| Financeiro | `QuarkClinic` | `financeiro` |
| Relatórios | `QuarkClinic` | `relatorios` |

> Os valores são case-sensitive. `"Agenda"` e `"agenda"` são telas diferentes.

---

## Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `sistema` | string | Sim | Sempre `"QuarkClinic"` |
| `tela` | string | Sim | Nome da tela atual (ver tabela acima) |
| `usuario_id` | string | Recomendado | ID único e imutável do usuário no banco QuarkClinic |
| `usuario_nome` | string | Opcional | Nome completo — aparece nos relatórios |
| `usuario_email` | string | Opcional | E-mail — aparece nos relatórios |

**Por que `usuario_id` é importante:**

Sem `usuario_id`, o widget funciona mas:
- Feedbacks ficam sem autoria
- Campanhas com "exibir apenas uma vez" não controlam por usuário (apenas por `localStorage`)
- Campanhas com reexibição periódica não rastreiam por usuário
- Campanhas obrigatórias ("Li e entendi") não registram quem confirmou

---

## Como o Widget Funciona

```
1. Página carrega
      ↓
2. window.UserPulse.init({ sistema, tela, usuario_id })
      ↓
3. Widget busca: GET /api/widget/campanha?sistema=QuarkClinic&tela=agenda&usuario_id=123
      ↓                               ↓
   Campanha ativa                 404 (sem campanha ou já respondida)
      ↓                               ↓
4. Aguarda atraso_ms           Widget não exibe nada
      ↓
5. Modal abre automaticamente
      ↓
6. Usuário interage (feedback / "Li e entendi" / fecha)
      ↓
7. Widget registra feedback ou confirmação na API
```

---

## Tipos de Campanha

### Campanha de Pesquisa (NPS)

Modal com escala 0–10 e campo de observação.

```js
// Campanha criada no painel com:
// tipo: "pesquisa", feedback_habilitado: true
// O widget exibe automaticamente a escala NPS.
```

### Campanha Obrigatória (Confirmação de Leitura)

Modal com botão "Li e entendi" no lugar do NPS.

```js
// Campanha criada com: exige_confirmacao_leitura: true
// Reaparece enquanto o usuario_id não confirmar.
// Sem usuario_id: reaparece a cada carregamento de página.
```

### Reexibição Periódica

Campanha que reaparece N dias após o usuário ter respondido.

```js
// Campanha criada com: intervalo_reexibicao_dias: 60
// Reaparece 60 dias após a última resposta do mesmo usuario_id.
```

---

## Recarregar em Troca de Tela (SPA)

Se o QuarkClinic for uma SPA (Single Page Application), chame `init()` novamente a cada troca de tela:

```js
// React — em useEffect ou equivalente
useEffect(() => {
  if (window.UserPulse && sessao) {
    window.UserPulse.init({
      sistema: "QuarkClinic",
      tela: rotaAtual,   // ex: "agenda", "pacientes"
      usuario_id: String(sessao.usuarioId),
      usuario_nome: sessao.usuarioNome,
      usuario_email: sessao.usuarioEmail
    });
  }
}, [rotaAtual]);
```

`init()` é seguro para chamadas múltiplas: cancela o timer anterior, fecha modal aberto, e busca a campanha da nova tela.

---

## Troubleshooting

### Modal não abre

1. **Verifique se a campanha existe e está ativa:**
   ```
   GET https://userpulse.quarkclinic.com/api/widget/campanha?sistema=QuarkClinic&tela=agenda
   ```
   Deve retornar JSON com os dados da campanha. Se retornar 404, a campanha não existe ou está inativa.

2. **Verifique o sistema e a tela:**  
   O par `sistema=QuarkClinic&tela=agenda` deve ser exatamente o que está cadastrado. Acesse o painel e confira.

3. **Verifique o console do navegador:**  
   O widget falha silenciosamente, mas erros de CORS ou de rede aparecem no console como `Failed to fetch`.

4. **Verifique CORS:**  
   Se o domínio do QuarkClinic não estiver em `CORS_ORIGINS` no UserPulse, a requisição `/api/widget/campanha` será bloqueada.  
   `/api/widget/*` é sempre aberto — qualquer origem pode chamar. Se o bloqueio persistir, é um problema de configuração de proxy.

5. **Campanha com `mostrar_uma_vez: true` já foi exibida:**  
   O widget grava `userpulse:shown:<id>` no `localStorage`. Limpe o `localStorage` do navegador para redefinir.

### Modal some imediatamente

O `atraso_ms` pode estar em `0`. Verifique no painel da campanha.

### Feedback não aparece no dashboard

1. Verifique se a campanha tem `feedback_habilitado: true`
2. Confirme que o `POST /api/widget/feedback` retornou 201 (inspecione a aba Network)
3. O `campanha_id` no payload deve corresponder ao id retornado em `/api/widget/campanha`

### Campanha reaparece quando não deveria

- Se `mostrar_uma_vez: false` e sem `intervalo_reexibicao_dias`: comportamento esperado — a campanha sempre reaparece
- Se `usuario_id` não é passado: o controle de exibição é feito por `localStorage`, que é por dispositivo/browser
- Para controle por usuário, sempre passe `usuario_id`

### Campanha não reaparece quando deveria (reexibição periódica)

1. Confirme que `intervalo_reexibicao_dias` está preenchido na campanha
2. Verifique a data do último feedback no banco:
   ```sql
   SELECT criado_em FROM feedbacks
   WHERE campanha_id = '<id>' AND usuario_id = '<usuario>'
   ORDER BY criado_em DESC LIMIT 1;
   ```
3. O intervalo começa a contar a partir de `criado_em` do último feedback

### `window.UserPulse is not defined`

O `<script src=".../widget.js">` foi carregado depois do `<script>` que chama `init()`. Garanta que o script do widget venha primeiro:

```html
<!-- CORRETO: widget antes do init -->
<script src=".../widget.js"></script>
<script>window.UserPulse.init({...})</script>

<!-- ERRADO: init antes do widget carregar -->
<script>window.UserPulse.init({...})</script>
<script src=".../widget.js"></script>
```

---

## Ambiente Local (desenvolvimento)

Durante desenvolvimento, o servidor UserPulse roda em `http://localhost:3333`:

```html
<script src="http://localhost:3333/widget.js"></script>
<script>
  window.UserPulse.init({
    sistema: "QuarkClinic",
    tela: "agenda",
    usuario_id: "dev-usuario-001",
    usuario_nome: "Dev User",
    usuario_email: "dev@quarkclinic.com"
  });
</script>
```

O arquivo `test-embed.html` na raiz do UserPulse já tem essa configuração pronta. Para usá-lo:

1. `npm start` na raiz do UserPulse
2. Criar campanha para `QuarkClinic / agenda` no painel (`http://localhost:5173`)
3. Abrir `test-embed.html` no navegador (clique duplo no arquivo)

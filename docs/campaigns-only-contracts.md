# Contratos mínimos — Campanhas Only

Este documento registra o comportamento atual necessário para extrair Campanhas para um repositório próprio sem mudar o contrato do UserPulse completo. Ele é uma referência de compatibilidade, não uma proposta de remoção de Tours ou Jornadas.

## Escopo

O recorte inclui administração de campanhas, catálogo de telas quando preservado, dashboard e CSV, widget público, feedback de 0 a 10 (usado como NPS/CSAT conforme a interpretação da campanha), confirmação de leitura, reexibição, segmentação, eventos de campanha e histórico global em `eventos_usuario`.

As rotas administrativas usam `Authorization: Bearer <ADMIN_TOKEN>` quando `ADMIN_TOKEN` está configurado. As rotas `/api/widget/*` são públicas e usam CORS aberto porque são chamadas pelo QuarkClinic embarcado.

## 1. Endpoints administrativos

| Método | Endpoint | Contrato mínimo |
|---|---|---|
| `GET` | `/api/campanhas` | Lista campanhas por `criado_em desc`, incluindo `_count.feedbacks`. |
| `POST` | `/api/campanhas` | Cria campanha e gera slug único. Campos-base: `titulo`, `descricao`, `tipo`, `sistema`; exige `tela`, `data_cy` ou `url_contem` conforme `modo_identificacao`. |
| `GET` | `/api/campanhas/:id` | Retorna campanha com `_count.feedbacks`; `404` quando ausente. |
| `PUT` | `/api/campanhas/:id` | Atualização parcial; recalcula slug quando o título muda e reaplica validações sensíveis. |
| `DELETE` | `/api/campanhas/:id` | Remoção lógica: define `ativo=false`; não apaga respostas ou eventos. |
| `POST` | `/api/campanhas/:id/testar-elegibilidade` | Simula sem persistir dados. Body: `sistema`, `tela`, `url`, `usuario_id`, `evento`, `cliente_id`, `unidade_id`, `perfil`, `usuario_tipo`, `estado`. |
| `GET` | `/api/campanhas/:id/respostas.csv` | Exporta feedbacks e confirmações. Aceita filtros `data_inicio`, `data_fim`, `cliente_id`, `cliente_nome`, `unidade_id`, `unidade_nome`, `perfil`, `usuario_tipo`, `estado`, `nota`, `nps`, `tem_telefone`, `busca`. |
| `GET` | `/api/dashboard/campanhas/:id` | Retorna campanha, média/distribuição das notas, respostas recentes, visualizações, cliques, confirmações, usuários únicos e taxas. |

Validações que devem continuar equivalentes:

- Modal não fechável exige feedback ou confirmação de leitura.
- `politica_reexibicao` aceita `uma_vez_apos_visualizacao`, `ate_responder_ou_confirmar` ou `reexibir_apos_dias`.
- `reexibir_apos_dias` exige quantidade positiva.
- `encerrar_apos_evento=true` exige `evento_conclusao`.
- Arrays de segmentação são: cliente, unidade, perfil, tipo de usuário e estado.

### Catálogo de telas, se mantido

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/api/catalogo-telas?ativo=true` | Alimenta a escolha de destino no formulário. |
| `POST` | `/api/catalogo-telas` | Cria uma tela catalogada. |
| `PUT` | `/api/catalogo-telas/:id` | Atualiza uma tela. |
| `DELETE` | `/api/catalogo-telas/:id` | Inativa a tela (`ativo=false`). |

## 2. Endpoints públicos do widget

| Método | Endpoint | Entrada mínima e resultado |
|---|---|---|
| `GET` | `/api/widget/campanha` | Query `slug` ou `sistema+tela`; opcionais `usuario_id`, `evento`, `cliente_id`, `unidade_id`, `perfil`, `usuario_tipo`, `estado`. Retorna uma campanha elegível ou `404`. |
| `GET` | `/api/widget/candidatas` | Query obrigatória `sistema`; opcionais `tela`, `gatilho`, `evento`, identidade e segmentação. Retorna candidatas em prioridade decrescente; `data_cy` e `url_contem` são validados no navegador. |
| `POST` | `/api/widget/evento` | Body `campanha_id`, `tipo_evento` (`visualizacao` ou `clique_cta`), mais identidade, ambiente e `contexto`. |
| `POST` | `/api/widget/feedback` | Body obrigatório `campanha_id`, `usuario_id`, `nota` inteira de 0 a 10; opcionais `observacao`, identidade, ambiente e `contexto`. Respeita `observacao_obrigatoria`. |
| `PATCH` | `/api/widget/feedback/:id/telefone` | Body `{ telefone_contato }`, obrigatório e com no máximo 20 caracteres. |
| `POST` | `/api/widget/confirmacao` | Body obrigatório `campanha_id`, `usuario_id`; opcionais `usuario_nome`, `usuario_email`, `contexto`. |
| `POST` | `/api/widget/conclusao-evento` | Body obrigatório `evento`, `sistema`, `usuario_id`; `contexto` opcional. Registra `conclusao` nas campanhas ativas e segmentadas configuradas para esse evento. |
| `POST` | `/api/widget/eventos` | Body obrigatório `evento`, `sistema`, `usuario_id`; aceita contexto/segmentação. Persiste histórico global e deduplica evento idêntico de usuário/cliente/unidade numa janela de 5 segundos. |

## 3. `window.UserPulse.init`

Contrato observado:

```js
window.UserPulse.init({
  // Informe slug OU sistema. No fluxo normal do QuarkClinic, use sistema+tela.
  slug: "campanha-especifica",
  sistema: "QuarkClinic",
  tela: "agenda",

  usuario_id: String(usuario.id),
  usuario_nome: usuario.nome,
  usuario_email: usuario.email,

  cliente_id: String(cliente.id),
  cliente_nome: cliente.nome,
  unidade_id: String(unidade.id),
  unidade_nome: unidade.nome,
  usuario_tipo: usuario.tipo,
  Estado: cliente.estado,
  Perfil: usuario.perfil,

  // Alternativa para contexto dinâmico em SPA.
  contextProvider: function () {
    return { cliente_id: clienteAtualId(), unidade_id: unidadeAtualId() };
  }
});
```

Também são normalizados no contexto: `organizacao_id`, `clinica_id`, `usuario_local_id`, `cliente_local_id`, `unidade_local_id`, `organizacao_nome` e `clinica_nome`.

Regras de compatibilidade:

- `slug` tem prioridade na busca direta.
- Sem `slug`, o widget precisa de `sistema`; `tela` é necessária para campanhas `sistema_tela`.
- `usuario_id` é necessário para feedback, confirmação, reexibição confiável e eventos globais. Sem ele, parte da descoberta ainda funciona, mas os fluxos sensíveis ficam incompletos.
- `contextProvider` é consultado antes das avaliações e seu retorno é mesclado ao contexto atual.
- Em SPA, nova tela/usuário deve chamar `init` novamente; mudança apenas de contexto pode usar `updateContext`.

## 4. `window.UserPulse.updateContext`

```js
window.UserPulse.updateContext({
  cliente_id: "123",
  cliente_nome: "Clínica Exemplo",
  unidade_id: "456",
  unidade_nome: "Unidade Centro",
  Perfil: "Administrador",
  usuario_tipo: "gestor",
  Estado: "SP"
});
```

Aceita um objeto, faz merge raso no contexto vigente e suporta chamada antes de `init` por meio de contexto pendente. O chamador deve preservar as chaves com a capitalização atual: a segmentação enviada à API deriva `Perfil` para `perfil` e `Estado` para `estado`.

## 5. `window.UserPulse.track`

```js
window.UserPulse.track("paciente_agendado", {
  cliente_id: "123",
  unidade_id: "456",
  origem: "agenda"
});
```

- Primeiro argumento: nome não vazio do evento.
- Segundo argumento: metadata opcional em objeto, mesclada ao contexto somente para a campanha disparada nessa chamada.
- Exige um `init` anterior com `sistema`.
- Com `usuario_id`, registra o evento em `/api/widget/eventos` para bloqueio retroativo e histórico.
- Busca campanhas com `gatilho=apos_evento` e o mesmo nome de evento.
- O contrato público atual também precisa preservar o registro de conclusão para campanhas com `encerrar_apos_evento`; este fluxo deve ser coberto no smoke test porque envolve `/eventos`, candidatas e eventos de conclusão.

## 6. Contexto esperado do QuarkClinic

Campos canônicos para produção:

| Campo | Obrigatoriedade operacional | Finalidade |
|---|---|---|
| `sistema` | Obrigatório | Valor estável, atualmente `QuarkClinic`, com igualdade sensível a maiúsculas/minúsculas. |
| `tela` | Obrigatório para `sistema_tela` | Identificador estável da rota/tela. |
| `usuario_id` | Obrigatório para fluxo completo | Autoria, feedback, confirmação, reexibição e eventos. Sempre converter para string. |
| `usuario_nome`, `usuario_email` | Recomendados | Relatórios e exportação. |
| `cliente_id`, `unidade_id` | Obrigatórios quando houver segmentação correspondente | Elegibilidade multi-tenant. |
| `cliente_nome`, `unidade_nome` | Recomendados | Dashboard e CSV legíveis. |
| `Perfil`, `usuario_tipo`, `Estado` | Obrigatórios quando usados na segmentação | Correspondência exata com arrays configurados na campanha. |
| `navegador`, `dispositivo` | Derivados pelo widget | Auditoria dos eventos e respostas. |

O widget não deve tentar descobrir sessão, tenant ou usuário por cookies próprios. Esses valores pertencem ao QuarkClinic e precisam ser fornecidos após autenticação e atualizados quando o contexto da SPA mudar.

## 7. Models e tabelas

| Model Prisma | Tabela | Necessidade |
|---|---|---|
| `Campanha` | `campanhas` | Configuração, conteúdo, destino, gatilhos, datas, prioridade, segmentação e reexibição. |
| `Feedback` | `feedbacks` | Nota 0–10, observação, telefone, identidade, contexto e ambiente. |
| `EventoCampanha` | `eventos_campanha` | Visualização, clique CTA e conclusão; alimenta regras e dashboard. |
| `ConfirmacaoLeitura` | `confirmacoes_leitura` | Confirmação obrigatória e política de reexibição. |
| `EventoUsuario` | `eventos_usuario` | Histórico global usado por gatilhos e conclusão retroativa. |
| `TelaCatalogo` | `telas_catalogo` | Necessário somente se o catálogo continuar no admin. |

Na futura separação do schema, remover a relação reversa `Campanha.etapasJornada` somente junto dos models de Jornada. Não copiar migrations históricas seletivamente para um banco novo sem gerar e validar uma baseline coerente.

## 8. Variáveis de ambiente

| Variável | Momento | Contrato |
|---|---|---|
| `DATABASE_URL` | Runtime/build de migration | Obrigatória; conexão PostgreSQL usada pelo Prisma. |
| `NODE_ENV` | Runtime | `production` em produção. |
| `PORT` | Runtime | Opcional; padrão `3333`, normalmente injetada pela plataforma. |
| `CORS_ORIGINS` | Runtime | Lista separada por vírgula para admin. Não restringe `/api/widget/*`, que usa CORS aberto. |
| `ADMIN_TOKEN` | Runtime | Bearer token do admin; sem valor, a proteção é ignorada. |
| `VITE_ADMIN_TOKEN` | Build web | Mesmo valor do token do servidor; fica incorporado ao bundle. |
| `VITE_USERPULSE_WIDGET_URL` | Build web | URL do loader usada nos snippets quando widget e admin não compartilham origem. |
| `WIDGET_VERSION` | Runtime | Cache busting do loader; preservar o valor vigente durante a extração. |
| `USERPULSE_ALWAYS_SHOW_USER_IDS` | Runtime | IDs separados por vírgula que ignoram histórico de reexibição, mas não conclusão global. |
| `DIRECT_URL` | Migration, se Neon | Está documentada, mas o schema atual não declara `directUrl`; revisar na futura criação do schema, sem mudar agora. |

## 9. Smoke tests críticos

1. Health check, SPA admin, `widget-loader.js` sem cache e `widget.js` carregável.
2. CRUD completo, incluindo remoção lógica e regeneração de slug por mudança de título.
3. Destinos `sistema_tela`, `data_cy` e `url_contem`, inclusive navegação SPA.
4. Prioridade entre duas campanhas elegíveis e janelas `data_inicio`/`data_fim`.
5. Segmentação positiva e negativa por cliente, unidade, perfil, tipo de usuário e estado.
6. Campanha automática com atraso, fechamento permitido e evento único de visualização.
7. Feedback com notas 0 e 10, observação opcional/obrigatória e telefone posterior.
8. Confirmação de leitura, inclusive modal não fechável.
9. Cada política de reexibição, usando o mesmo `usuario_id` e outro usuário como controle.
10. `track` dispara campanha `apos_evento`, grava `eventos_usuario` e não duplica o evento em até 5 segundos.
11. `encerrar_apos_evento` bloqueia nova exibição, inclusive para usuário de always-show.
12. `updateContext` em SPA troca tenant/unidade sem reload e reavalia segmentação.
13. Dashboard confere visualizações, cliques, confirmações, respondentes únicos e distribuição.
14. CSV respeita filtros e inclui feedbacks e confirmações sem feedback.
15. Admin sem token recebe `401`; origem admin não permitida é bloqueada; widget funciona a partir da origem do QuarkClinic.

## 10. Riscos da extração

- `web/public/widget.js` mistura Campanhas, Tours, gravador e Jornadas em estado, CSS, timers e navegação SPA; remoção textual é insegura.
- `server/src/controllers/widget.ts` e `server/src/routes/widget.ts` misturam os três domínios.
- `server/prisma/schema.prisma` liga `Campanha` a `EtapaJornada`; excluir apenas um lado quebra a geração do Prisma.
- `web/src/types.ts`, `web/src/App.tsx`, Sidebar e Dashboard inicial também são compartilhados.
- `usuario_id` é opcional na descoberta, mas obrigatório nas APIs de feedback e confirmação; uma integração anônima não preserva o comportamento completo.
- `Perfil`/`Estado` no widget e `perfil`/`estado` na API têm capitalização diferente; normalização inadvertida pode quebrar segmentação e relatórios.
- O controle local de `mostrar_uma_vez` depende de `localStorage`, enquanto as demais políticas dependem do histórico no banco.
- Endpoints públicos aceitam escrita sem autenticação; antes do cutover devem ser avaliados rate limiting, validação de origem/payload e observabilidade sem quebrar o embed.
- `VITE_ADMIN_TOKEN` fica exposto no bundle e não substitui autenticação individual do painel.
- O runtime atual captura falhas de rede silenciosamente em vários fluxos; smoke tests e monitoramento precisam detectar perda de eventos.
- Não remover migrations já aplicadas do UserPulse completo. O repo extraído deve usar banco novo/baseline ou uma migração de dados explicitamente validada.
- Alterar a URL do loader ou o comportamento de cache pode deixar versões antigas do widget ativas no QuarkClinic.

## Critério de compatibilidade para a extração

O módulo separado é compatível quando mantém os contratos acima, produz as mesmas decisões de elegibilidade para o mesmo usuário/contexto/histórico e preserva contagens de dashboard e conteúdo do CSV, sem exigir APIs de Tours ou Jornadas.

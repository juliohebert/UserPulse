# PRD — Correções de Tour, Jornada e Fila de Apresentação

Status: Planned
Priority: High
PRD relacionado: `docs/redesign-jornada-tour-prd.md`

## 1. Contexto

A primeira entrega do redesign de Tour/Jornada adicionou distribuição por origem, gatilhos, frequência, contexto de execução, fila única de apresentação, Campanha como etapa de Jornada, preview e métricas por execução.

A revisão encontrou falhas que podem causar abertura indevida de Tours, publicação incorreta por payload externo, impossibilidade de criar Tours exclusivos de Jornada e concorrência visual entre destaques e Tours.

Os builds e testes automatizados atuais passam, mas ainda não cobrem esses comportamentos end-to-end.

## 2. Objetivo

Corrigir as inconsistências de contrato e runtime identificadas na revisão, garantindo que:

- cada Tour seja aberto somente pelo gatilho configurado;
- payloads inválidos não sejam convertidos silenciosamente;
- Tours exclusivos de Jornada possam ser criados sem configuração autônoma;
- somente uma experiência interativa ocupe o foco da tela;
- eventos públicos não alterem progresso de conteúdo inativo ou inválido;
- eventos repetidos não contaminem métricas e progresso;
- erros administrativos sejam visíveis e acionáveis.

## 3. Escopo

### 3.1 Gatilhos e prioridade

Corrigir a resolução de gatilhos em `web/public/widget.js`.

Regras obrigatórias:

- `botao_ajuda` só pode ser considerado quando a avaliação for explicitamente solicitada pelo botão de ajuda;
- `manual` só pode ser usado por `UserPulse.iniciarTour(slug)`;
- `evento` só pode ser usado quando o nome recebido por `UserPulse.track()` corresponder ao gatilho configurado;
- `entrada_tela`, `url` e `elemento` só podem ser avaliados em avaliações automáticas de contexto;
- um Tour com `botao_ajuda` não pode abrir durante `init()` ou navegação automática;
- Tour disparado pelo botão de ajuda deve ser tratado como ação explícita do usuário, com prioridade de classe 1;
- Tour automático continua usando a prioridade de classe 4;
- a origem registrada continua sendo `autonomo`, mesmo quando o gatilho for `botao_ajuda`.

### 3.2 Validação estrita de booleanos

Criar helper compartilhado para aceitar somente booleanos reais nos controllers e contratos afetados.

Campos mínimos:

- Tour: `ativo`, `permite_autonomo`, `permite_jornada`, `publico_geral`;
- Jornada: `ativo`, `permitir_refazer`, `permitir_pacotes_fora_ordem`, `obrigatorio`, `ativo` de pacote e etapa;
- demais campos booleanos tratados no mesmo payload quando fizerem parte do fluxo corrigido.

Regras:

- `true` e `false` booleanos são aceitos;
- strings como `"true"` e `"false"` são rejeitadas com HTTP 400;
- números, arrays, objetos e strings vazias são rejeitados;
- o servidor nunca deve usar `Boolean(valor)` diretamente para interpretar payload administrativo;
- a resposta deve identificar o campo inválido sem expor stack trace.

### 3.3 Tour exclusivo de Jornada

Adequar `web/src/pages/tours/Form.tsx` ao contrato de distribuição.

Quando `permite_autonomo = false` e `permite_jornada = true`:

- não exigir tela, URL, `data-cy` ou outro destino autônomo;
- não exigir gatilho autônomo;
- permitir salvar como rascunho mesmo sem seletores completos;
- manter validação de título e estrutura mínima necessária ao cadastro;
- mostrar uma mensagem clara de que o Tour está disponível somente dentro de Jornadas;
- não enviar valores ocultos de destino como se fossem configuração autônoma nova;
- ao ativar execução autônoma, exigir novamente destino, gatilho e seletores válidos.

O backend permanece como fonte de verdade e deve continuar rejeitando estado final incoerente.

### 3.4 Foco único e destaques

Integrar destaques já montados ao coordenador de apresentação.

Regras:

- iniciar um Tour deve ocultar ou desmontar imediatamente todos os destaques ativos;
- iniciar um Tour não deve consumir indevidamente o destaque nem registrar dispensa;
- ao finalizar, pular ou fechar o Tour, os destaques elegíveis podem ser reavaliados;
- um destaque não pode ser montado enquanto houver Tour ativo, inclusive em callbacks atrasados;
- tooltip de destaque aberto continua ocupando o foco e deve bloquear novas apresentações;
- badge passivo fechado não ocupa o foco.

### 3.5 Eventos públicos de Jornada

Fortalecer `registrarEventoJornada`.

Regras:

- Jornada, pacote e etapa devem pertencer ao mesmo tenant resolvido pela `public_key`;
- pacote e etapa devem estar ativos para aceitar eventos de execução;
- a etapa deve continuar pertencendo ao pacote e à Jornada informados;
- o tipo do evento deve corresponder ao nível estrutural enviado;
- conteúdo removido, inativo ou incompatível deve retornar 404 ou 400 sem alterar progresso;
- eventos antigos não devem ser reclassificados nem reativados retroativamente.

### 3.6 Idempotência de eventos de Tour

Tornar atômica a deduplicação de eventos de Tour.

Regras:

- cada evento novo deve possuir uma chave determinística baseada em Tour, execução, tipo e passo quando aplicável;
- a criação deve ser protegida por constraint única ou operação equivalente no banco;
- retries concorrentes devem retornar sucesso idempotente, sem criar duas linhas;
- uma mesma chave usada com outro usuário, origem ou contexto deve retornar conflito;
- eventos legados sem execução continuam válidos e não recebem origem inventada.

### 3.7 Erros administrativos e dependências

Corrigir carregamentos silenciosos do formulário de Tour.

Regras:

- falha ao carregar sistemas ou telas deve aparecer em estado de erro;
- o usuário deve poder tentar novamente;
- lista vazia legítima deve ser diferenciada de falha de rede/permissão;
- criação de nova tela deve respeitar a permissão existente e informar indisponibilidade quando necessário;
- nenhuma resposta de dependência deve sobrescrever estado mais novo após troca de rota ou desmontagem.

### 3.8 Métricas e desempenho

Revisar o dashboard de Tour para não carregar histórico ilimitado em memória.

Regras:

- manter paginação para a lista de eventos;
- substituir `findMany` ilimitado das métricas por agregação, consulta limitada ou processamento paginado;
- preservar métricas por origem e execução;
- manter eventos legados como `desconhecida`;
- garantir que uma execução seja contada uma única vez;
- adicionar índice ou ajuste de consulta quando necessário.

## 4. Fora de escopo

- criar uma fila persistida;
- alterar a política de produto para Campanhas críticas;
- criar um segundo modelo de Tour;
- remover imediatamente os campos legados de identificação;
- implementar reinício completo de Jornada;
- alterar o desenho visual geral do widget ou do painel fora dos estados necessários para os erros desta revisão.

## 5. Critérios de aceite

### Gatilhos

- Tour com apenas `botao_ajuda` não abre em `init()` nem em navegação automática;
- o mesmo Tour abre ao clicar no botão de ajuda;
- Tour iniciado por `iniciarTour(slug)` exige gatilho `manual`;
- Tour de evento só abre para o evento configurado;
- Tour disparado pelo botão de ajuda aguarda ou vence a fila conforme ação explícita do usuário.

### Payloads

- payload com `ativo: "false"` retorna 400;
- payload com `permite_autonomo: "false"` retorna 400;
- payload válido com booleanos reais mantém o comportamento atual;
- nenhum controller transforma string em booleano por coerção implícita.

### Tour de Jornada

- é possível criar e salvar Tour sem destino autônomo quando ele for exclusivo de Jornada;
- é possível vinculá-lo a uma Jornada e executá-lo;
- ao habilitar uso autônomo, o formulário exige configuração completa antes de publicar.

### Foco

- destaque montado desaparece quando um Tour começa;
- destaque não é montado por callback atrasado durante Tour ativo;
- fechamento do Tour libera a fila e reavalia o conteúdo elegível.

### Jornada e eventos

- evento para pacote ou etapa inativos não altera progresso;
- referência hierárquica inválida não cria evento;
- duas requisições simultâneas do mesmo evento de Tour produzem uma única linha;
- retry idempotente retorna resposta consistente.

### Administração

- falha de catálogo aparece na UI com ação de retry;
- dashboard continua funcional com histórico grande sem carregar todas as linhas na memória;
- contexto de origem do Tour permanece disponível nos eventos e métricas.

## 6. Estratégia de implementação

1. Corrigir contratos puros e validação estrita de booleanos.
2. Corrigir resolução de gatilhos e prioridade do botão de ajuda.
3. Ajustar formulário para Tour exclusivo de Jornada.
4. Integrar desmontagem/reavaliação de destaques ao coordenador.
5. Corrigir validação de eventos ativos e idempotência com migration, se necessário.
6. Corrigir estados de erro do catálogo.
7. Revisar consultas do dashboard.
8. Executar smoke tests no widget real em desktop, mobile, SPA e navegação multipágina.

## 7. Testes obrigatórios

### Backend

- testes puros do parser de booleanos;
- testes de cada combinação de origem e gatilho;
- testes de payloads malformados retornando 400;
- testes de Jornada/pacote/etapa inativos;
- teste concorrente ou de constraint para idempotência de EventoTour;
- teste de métricas com eventos legados e modernos;
- teste de dashboard com consulta paginada/agregada.

### Widget

- Tour `botao_ajuda` não abre automaticamente;
- Tour `botao_ajuda` abre somente após ação explícita;
- prioridade correta entre botão de ajuda, Tour automático e Campanha;
- destaque montado é ocultado ao iniciar Tour;
- callback atrasado não monta destaque sobre Tour;
- encerramento do Tour libera fila e reavalia conteúdo.

### Frontend

- Tour somente de Jornada salva sem destino autônomo;
- Tour autônomo continua exigindo destino e gatilho;
- erros de catálogo são exibidos e podem ser repetidos;
- troca de rota não aplica resposta antiga ao formulário.

### Validação final

```bash
npm test --prefix server
npx tsc --noEmit --prefix server
npx tsc --noEmit --prefix web
npm run build
node --check web/public/widget.js
node --check web/public/widget-loader.js
```

## 8. Definition of Done

- todos os critérios de aceite deste documento possuem teste automatizado ou smoke test documentado;
- nenhum gatilho abre fora do contexto configurado;
- payloads administrativos usam validação estrita;
- Tour exclusivo de Jornada funciona de ponta a ponta;
- somente uma experiência interativa ocupa o foco;
- eventos e métricas permanecem idempotentes e tenant-scoped;
- erros de dependência são visíveis no painel;
- dashboard não depende de carregar histórico ilimitado;
- PRD original continua válido sem duplicar entidades ou alterar decisões já tomadas.

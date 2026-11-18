# Plano de Implementação — Redesign de Jornada, Tour e Campanhas

Status: In progress
PRD de origem: `docs/redesign-jornada-tour-prd.md`

## Progresso atual

Implementado até a primeira entrega estrutural:

- Fase 0: baseline executado; suíte, builds, type-checks e checks de sintaxe validados.
- Fase 1: validação multi-tenant de referências de Jornada e validação hierárquica de eventos públicos.
- Fase 2: campos de distribuição, gatilhos, frequência e contexto de execução de Tours; migration com data-fix; contratos e tipos atualizados.
- Fase 3: preservação de IDs de pacotes/etapas, validação de referências e impacto de dependências de Tours.
- Fase 4/5: primeira versão dos campos de distribuição no formulário de Tour, filtro de Tours elegíveis em Jornadas e Jornada nova como rascunho.
- Fase 6: `execucao_id`, origem, gatilho e contexto estrutural em eventos de Tour; frequência identificada no endpoint público; proteção de modo teste; stub `abrirJornadas` no loader.
- Progresso de Jornada: pacotes inativos não bloqueiam a conclusão.
- Fase 7: coordenador de apresentação em memória, com ordenação, deduplicação,
  geração de contexto e liberação integrada a Campanhas, Tours, destaques
  interativos e Central.
- Fases 8/9/10: Campanha como etapa executável, preview assinado de Jornada,
  métricas por origem/execução e UX administrativa de impacto, gatilhos múltiplos,
  criação inline e filtros.
- Smoke integrado executado contra o Postgres local: listagem pública de
  Jornadas com Campanhas/Tours, rejeição de preview inválido, preview assinado
  em modo de teste e conclusão transacional de Campanha com evento de Jornada.

Validações executadas após esta entrega:

- `npm test` no servidor: 1657 testes passando;
- builds do servidor, frontend e projeto completo passando;
- `node --check` do widget e do loader passando.

Pendente para concluir o plano:

- executar os smoke tests manuais de navegador descritos na seção 18, incluindo
  layout desktop/mobile, navegação SPA/multipágina e interação visual entre
  Campanha, Tour e Central.

A implementação funcional e os checks automatizados desta entrega estão
concluídos. A Definition of Done só deve ser marcada como finalizada depois dos
smoke tests manuais de navegador.

## 1. Objetivo deste documento

Este documento transforma o PRD em uma sequência técnica executável por um LLM coder. A implementação deve preservar o que já funciona, corrigir problemas de integridade antes de ampliar o produto e entregar mudanças pequenas o suficiente para serem verificadas ao final de cada fase.

O resultado esperado é:

- continuar existindo um único `TourGuiado` reutilizável;
- explicitar se o Tour pode ser executado autonomamente, em Jornada ou nos dois contextos;
- registrar a origem real de cada execução;
- permitir configurar gatilhos e frequência para Tours autônomos;
- validar Tours usados por Jornadas;
- impedir concorrência entre conteúdos interativos;
- ordenar Campanhas, Tours e a Central de Jornadas por uma política única no widget;
- testar Jornadas sem contaminar progresso, deduplicação ou métricas reais;
- separar métricas de Tour autônomo e Tour executado em Jornada.

## 2. Regras de execução para o LLM coder

1. Ler antes de editar:
   - `AGENTS.md`;
   - `docs/redesign-jornada-tour-prd.md`;
   - este plano;
   - `DESIGN.md` antes de alterar o painel.
2. Executar as fases na ordem descrita. Não começar pela UI nem pela fila antes de fechar contratos e integridade.
3. Ao iniciar cada fase, reler os arquivos indicados e conferir mudanças existentes no worktree. Não desfazer alterações feitas por outras pessoas ou agentes.
4. Fazer a menor mudança correta. Não reescrever os renderizadores de Tour, Campanha ou Jornada quando for possível apenas controlar os pontos de entrada e saída.
5. Manter código, comentários e UI em português.
6. Preservar isolamento por tenant em toda consulta administrativa e pública.
7. Atualizar `web/src/types.ts` sempre que uma resposta da API ou modelo exposto mudar.
8. Toda migration deve conter o data-fix necessário. Não depender de seed para corrigir dados existentes.
9. Adicionar cada novo teste `*.test.ts` do servidor ao script `test` de `server/package.json`; caso contrário ele não será executado por `npm test --prefix server`.
10. Validar `web/public/widget.js` e `web/public/widget-loader.js` com `node --check`, pois eles não passam pelo bundler/TypeScript.
11. Não criar tabela persistida de fila nesta entrega. A fila começa em memória no runtime.
12. Não criar dois modelos de Tour. Origem é configuração e contexto de execução, não tipo de conteúdo.
13. Ao final de cada fase, executar os checks indicados e corrigir regressões antes de prosseguir.
14. Não criar commits, publicar branch ou abrir PR sem solicitação explícita.

## 3. Estado atual que deve ser preservado

- `EtapaJornada.tour_id` já referencia o mesmo `TourGuiado` usado autonomamente.
- `TourGuiado.ativo` controla atualmente a exibição autônoma; Tour inativo ainda pode ser usado por Jornada.
- Tours já possuem passos, segmentação, prioridade e identificação por tela, URL ou elemento.
- `window.UserPulse.iniciarTour(slug)` já inicia Tour manualmente.
- Jornadas são abertas pelo FAB/Central de ajuda e não abrem modal automaticamente.
- Pacotes e etapas já possuem ordem e obrigatoriedade.
- Uma etapa de Tour só é concluída após a conclusão real do Tour.
- Fechar ou pular um Tour de Jornada não conclui a etapa.
- A retomada multipágina do Tour usa `sessionStorage` e deve continuar funcionando.
- Preview interno de Tour já evita eventos; essa proteção deve ser generalizada para o modo de teste.
- Campanhas possuem regras de repetição, vigência e prioridade que não podem regredir.

## 4. Problemas atuais que a implementação não pode perpetuar

1. `criar` e `atualizar` Jornada não confirmam que `tour_id` e `campanha_id` pertencem ao tenant da sessão.
2. O endpoint público de evento de Jornada não confirma que pacote e etapa pertencem à Jornada enviada.
3. Tour, Campanha e Central de Jornadas possuem estados separados e podem disputar a tela por corrida assíncrona.
4. Campanha disparada por `track()` pode abrir durante Tour ou Jornada.
5. Tour automático pode abrir sobre Campanha já aberta.
6. Tour manual pode interromper silenciosamente Tour iniciado por Jornada.
7. Conteúdo bloqueado é normalmente descartado, não enfileirado.
8. Fechamento de conteúdo não libera formalmente o próximo item elegível.
9. Eventos de Tour não registram origem, gatilho, Jornada, pacote, etapa ou identificador da execução.
10. A frequência do Tour é fixa e implícita.
11. Exclusão de Tour usa `onDelete: SetNull` sem informar quais Jornadas serão afetadas.
12. Etapa de Campanha é aceita no modelo e no formulário de Jornada, mas está desabilitada no widget.
13. O testador por slug pode registrar métricas reais.
14. Pacote obrigatório inativo pode impedir a conclusão da Jornada.
15. O formulário de Jornada oculta erros ao carregar Tours ou Campanhas sem permissão, resultando em selects vazios sem explicação.

## 5. Defaults provisórios para decisões abertas

Aplicar estes defaults enquanto não houver decisão de produto diferente. Não inferir outra regra silenciosamente.

1. Campanha crítica não interrompe conteúdo ativo na primeira versão; ela aguarda na fila.
2. Campanhas informativas entram na mesma fila quando ocupam o foco. Badge passivo fechado não ocupa o slot; tooltip aberto ocupa.
3. Manter “Pacote” como nome visual e `BlocoJornada` como nome técnico.
4. Usar prioridade em duas camadas: classe fixa de negócio e, dentro da classe, prioridade configurada pelo administrador.
5. Tour concluído autonomamente não conclui uma etapa futura de Jornada.
6. Não implementar silenciamento temporário de Tours nesta entrega.
7. Novos Tours começam permitidos em Jornada e sem execução autônoma publicada.
8. Jornada nova deve nascer inativa até passar pelas validações de publicação.
9. A fila é mantida somente em memória; reload pode descartar itens aguardando.
10. Candidatura referente a URL ou contexto antigo deve ser descartada e reavaliada.
11. Teste/preview não grava evento, progresso, feedback, deduplicação local ou estado real de fila.
12. Enquanto não existir classificação persistida de criticidade, tratar todas as Campanhas como informativas. Não inferir criticidade pelo texto livre de `categoria`.
13. Início explícito de outro conteúdo durante um Tour de Jornada deve aguardar. Nunca substituir o Tour silenciosamente.
14. Manter Campanha como tipo de etapa e habilitar sua execução dentro da Jornada em fase própria. Até essa fase terminar, impedir a publicação de Jornada que contenha esse tipo, em vez de publicar algo não executável.

## 6. Contratos-alvo

### 6.1 Distribuição do Tour

Adicionar configuração explícita equivalente a:

```ts
type OrigemPermitidaTour = 'autonomo' | 'jornada'

interface DistribuicaoTour {
  permite_autonomo: boolean
  permite_jornada: boolean
  publico_geral: boolean
  gatilhos: GatilhoTour[]
  frequencia: FrequenciaTour
  frequencia_intervalo_dias: number | null
  prioridade: number
}
```

Regras:

- pelo menos uma origem deve estar habilitada;
- gatilhos, frequência e prioridade controlam somente execução autônoma;
- Tour exclusivo de Jornada não exige gatilho autônomo;
- `ativo` deve continuar significando que a execução autônoma está publicada/ativa nesta primeira entrega, para preservar dados e comportamento existentes;
- candidatura autônoma exige `ativo = true` e `permite_autonomo = true`;
- `ativo = true` com `permite_autonomo = false` é inválido; ao retirar a permissão, a UI deve desligar `ativo` e o backend deve rejeitar payload incoerente;
- uso em Jornada exige `permite_jornada = true`, independentemente de `ativo`, preservando o comportamento atual;
- remover a permissão de Jornada deve ser bloqueado ou exigir confirmação explícita quando houver Jornadas vinculadas;
- excluir Tour reutilizado exige consulta de impacto e confirmação explícita.

### 6.2 Gatilhos do Tour

Contrato mínimo:

```ts
type TipoGatilhoTour =
  | 'entrada_tela'
  | 'url'
  | 'elemento'
  | 'botao_ajuda'
  | 'manual'
  | 'evento'

interface GatilhoTour {
  tipo: TipoGatilhoTour
  tela?: string
  url_contem?: string
  seletor_tipo?: 'data_cy' | 'id' | 'css'
  seletor?: string
  evento?: string
}
```

Regras:

- implementar entrada em tela, URL, elemento, botão de ajuda, chamada manual e evento via `UserPulse.track()`;
- `manual` permite `UserPulse.iniciarTour(slug)`; o endpoint por slug exige Tour ativo, `permite_autonomo = true` e gatilho `manual`;
- gatilho futuro desconhecido deve ser rejeitado na API, não ignorado;
- manter temporariamente os campos legados `modo_identificacao`, `tela`, `data_cy` e `url_contem` até todos os leitores usarem `gatilhos`;
- criar data-fix que converta a identificação legada em um gatilho equivalente e acrescente `manual` aos Tours existentes ativos, preservando a API pública atual;
- remover campos legados somente em uma migration posterior e separada, fora desta primeira entrega, após confirmar que não existem leitores antigos.

### 6.3 Frequência do Tour autônomo

Valores iniciais:

```ts
type FrequenciaTour =
  | 'sempre'
  | 'uma_vez_por_usuario'
  | 'uma_vez_por_sessao'
  | 'ate_concluir'
  | 'intervalo_dias'
```

Regras:

- `intervalo_dias` exige inteiro positivo em `frequencia_intervalo_dias`;
- os outros valores exigem `frequencia_intervalo_dias = null`;
- `uma_vez_por_sessao` é sempre controlada por `sessionStorage`, inclusive para usuário identificado;
- `uma_vez_por_usuario` bloqueia depois do primeiro evento `inicio`; para anônimo, registrar a exibição real em `localStorage`;
- `ate_concluir` volta a permitir após pulo/fechamento e bloqueia somente depois de `concluido`;
- `intervalo_dias` conta a partir do último evento `inicio`; para anônimo, guardar o timestamp da exibição real em `localStorage`;
- `sempre` não consulta histórico, mas continua sujeito à fila e à elegibilidade contextual;
- execução manual iniciada pelo usuário ignora bloqueio de frequência, mas não ignora exclusão de concorrência;
- execução em Jornada segue o progresso da Jornada, não a frequência autônoma.

### 6.4 Contexto de execução e eventos

Cada início de Tour deve gerar um `execucao_id` estável até o encerramento ou retomada da execução.

```ts
type OrigemExecucaoTour = 'autonomo' | 'jornada'

interface ContextoExecucaoTour {
  execucao_id: string
  origem: OrigemExecucaoTour
  gatilho: TipoGatilhoTour | 'etapa_jornada'
  jornada_id: string | null
  bloco_id: string | null
  etapa_id: string | null
  modo_teste: boolean
}
```

Regras:

- Tour manual independente usa `origem = autonomo` e `gatilho = manual`;
- Tour clicado no botão de ajuda usa `origem = autonomo` e `gatilho = botao_ajuda`;
- Tour de Jornada preenche Jornada, pacote e etapa;
- retomada multipágina preserva o mesmo `execucao_id` e contexto;
- o servidor valida coerência e ownership de todos os IDs recebidos;
- campos estruturais devem ser colunas explícitas em `EventoTour`, não depender apenas de `contexto` JSON;
- `modo_teste = true` não deve persistir evento; o campo pode existir no contrato/runtime para reforçar a decisão antes do POST;
- eventos antigos permanecem com os novos campos nulos. Não inferir origem histórica.

### 6.5 Item da fila em memória

Estrutura conceitual mínima:

```js
{
  key: 'tour:<id>:<origem>:<etapa-id-ou-vazio>',
  tipo: 'tour' | 'campanha' | 'jornada_panel',
  origem: 'usuario' | 'jornada' | 'autonomo' | 'evento',
  gatilho: 'manual' | 'entrada_tela' | 'url' | 'elemento' | 'evento' | 'fab',
  prioridadeClasse: 1,
  prioridadeNegocio: 0,
  elegivelEm: 0,
  validoAte: null,
  estado: 'aguardando',
  geracaoContexto: 0,
  modoTeste: false,
  payload: {}
}
```

Política conceitual do PRD:

1. ação explícita do usuário;
2. Tour em execução dentro de Jornada;
3. Campanha crítica/transacional;
4. Jornada disponível, que apenas sinaliza o FAB e não ocupa a fila;
5. Tour autônomo automático;
6. Campanha informativa/promocional.

Desempate:

1. menor `prioridadeClasse`;
2. maior `prioridadeNegocio`;
3. menor `elegivelEm`;
4. menor sequência interna.

Somente itens aguardando são comparados. Clique do usuário em Tour ou Campanha de Jornada é classe 1; a classe 2 representa a proteção do Tour de Jornada depois que ele já ocupa o slot, não uma classe diferente para duas ações explícitas equivalentes. Abertura explícita da Central também é classe 1. Jornada apenas disponível e Tour de Jornada já ativo não são inseridos como novos itens pendentes.

Não há preempção automática na primeira versão. O item ativo mantém o foco até concluir, pular ou fechar. Ao liberar o slot, o gerenciador revalida e inicia o próximo item.

## 7. Fase 0 — Baseline e mapa de impacto

### Tarefas

1. Conferir `git status --short` e registrar mentalmente arquivos já alterados por terceiros.
2. Executar a suíte atual antes das mudanças.
3. Confirmar no código os contratos e símbolos citados neste plano.
4. Identificar todas as leituras e escritas de `TourGuiado.ativo`, `modo_identificacao`, `EventoTour`, `EtapaJornada` e os pontos de abertura/fechamento no widget.
5. Não editar nada nesta fase, salvo correção necessária para fazer o baseline executar e desde que ela pertença ao escopo.

### Validação

```bash
npm test --prefix server
npm run build
node --check web/public/widget.js
node --check web/public/widget-loader.js
```

### Saída esperada

- baseline conhecido;
- falhas preexistentes documentadas separadamente;
- nenhum comportamento alterado.

## 8. Fase 1 — Integridade e isolamento por tenant

Esta fase é obrigatória antes de adicionar novos vínculos ou eventos.

### Arquivos principais

- `server/src/controllers/jornadas.ts`
- `server/src/controllers/widget.ts`
- `server/src/controllers/jornadas.test.ts`
- `server/src/controllers/widget.test.ts`

### Tarefas

1. Extrair validação pura para referências de etapas de Jornada.
2. Em criação e atualização, coletar IDs de Tour e Campanha e consultá-los em lote, sempre com `tenant_id` da sessão.
3. Rejeitar payload quando uma referência não existir, pertencer a outro tenant ou não corresponder ao tipo da etapa.
4. Garantir exatamente um destino por etapa:
   - `tour` exige somente `tour_id`;
   - `campanha` exige somente `campanha_id`;
   - `link` exige somente `url`.
5. No evento público de Jornada, validar que:
   - a Jornada pertence ao tenant resolvido por `public_key`;
   - `bloco_id`, quando presente, pertence à Jornada;
   - `etapa_id`, quando presente, pertence ao pacote e à Jornada;
   - o tipo de evento aceita a combinação de IDs enviada.
6. Corrigir o cálculo de progresso para ignorar pacotes inativos; pacote obrigatório inativo não pode impedir conclusão.
7. Cobrir tentativas cross-tenant e relações estruturalmente inconsistentes.

### Critérios de aceite

- não é possível vincular Tour ou Campanha de outro tenant;
- não é possível poluir progresso com pacote/etapa de outra Jornada;
- payload inválido retorna `400`, referência não acessível retorna resposta sem revelar existência cross-tenant;
- Jornada com pacote obrigatório inativo pode concluir pelos pacotes ativos.

### Validação

```bash
npx tsc --noEmit
npx tsx --test src/controllers/jornadas.test.ts src/controllers/widget.test.ts
npm test
```

Executar em `server/`.

## 9. Fase 2 — Schema, migration e contratos de Tour

### Arquivos principais

- `server/prisma/schema.prisma`
- `server/prisma/migrations/<timestamp>_tour_origens_eventos/migration.sql`
- `server/src/controllers/tours.ts`
- `server/src/controllers/widget.ts`
- `web/src/types.ts`

### Tarefas de schema

1. Adicionar em `TourGuiado`:
   - `permite_autonomo Boolean @default(false)`;
   - `permite_jornada Boolean @default(true)`;
   - `publico_geral Boolean @default(true)`;
   - `gatilhos Json?`;
   - `frequencia String @default("uma_vez_por_usuario")`;
   - `frequencia_intervalo_dias Int?`.
2. Adicionar em `EventoTour`:
   - `execucao_id String?`;
   - `origem String?`;
   - `gatilho String?`;
   - `jornada_id String?`;
   - `bloco_id String?`;
   - `etapa_id String?`.
3. Adicionar em `EventoJornada`:
   - `execucao_jornada_id String?`;
   - `chave_idempotencia String? @unique`.
4. Adicionar índices que atendam:
   - eventos por Tour, origem e data;
   - eventos por execução;
   - histórico de frequência por Tour, usuário, origem e data.
5. Criar relações opcionais com `onDelete: SetNull` somente se isso não apagar o contexto histórico necessário. Caso use apenas IDs escalares, validar os vínculos no controller e documentar a decisão.
6. Não criar enum Prisma/Postgres para valores que provavelmente crescerão; seguir o padrão atual de strings validadas na aplicação.

### Data-fix obrigatório

1. Para Tour existente com `ativo = true`:
   - `permite_autonomo = true`;
   - `permite_jornada = true`;
   - `publico_geral = true` somente quando `segmentacao_regras` for nulo ou vazio;
   - `frequencia = 'uma_vez_por_usuario'`.
2. Para Tour existente com `ativo = false`:
   - `permite_autonomo = false`;
   - `permite_jornada = true`;
   - `publico_geral = true` somente quando `segmentacao_regras` for nulo ou vazio;
   - `frequencia = 'uma_vez_por_usuario'`.
3. Converter `modo_identificacao`, `tela`, `data_cy` e `url_contem` em um item de `gatilhos` sem apagar as colunas legadas.
4. Adicionar também o gatilho `manual` a todo Tour existente com `ativo = true`, preservando `UserPulse.iniciarTour(slug)`.
5. Quando houver regras de segmentação, usar `publico_geral = false`.
6. Eventos existentes recebem `null` nos campos de contexto novos.

### Tarefas de contrato

1. Centralizar constantes e validações de origem, gatilho e frequência no backend.
2. Fazer CRUD de Tour aceitar e devolver os campos novos.
3. Rejeitar:
   - nenhuma origem permitida;
   - gatilho desconhecido;
   - gatilho incompleto;
   - frequência desconhecida;
   - intervalo inválido;
   - `publico_geral = false` sem regras de segmentação;
   - `publico_geral = true` com regras de segmentação simultâneas;
   - `ativo = true` sem permissão autônoma;
   - execução autônoma publicada sem pelo menos um gatilho e um passo válido.
4. Adaptar as validações atuais: rascunho e Tour exclusivo de Jornada podem ser salvos incompletos; passos, identificação e seletores completos são exigidos ao ativar a execução autônoma ou ao ativar uma Jornada que usa o Tour.
5. Fazer `validarPassos` e a validação de campos obrigatórios receberem o contexto de salvamento/publicação, em vez de sempre bloquearem rascunhos incompletos.
6. Atualizar `web/src/types.ts` com os contratos exatos retornados pela API.
7. Atualizar duplicação, exportação e importação:
   - duplicação copia origens, público, gatilhos, frequência, prioridade e segmentação, mas a cópia nasce com `ativo = false`;
   - exportação inclui os campos novos e uma versão explícita do formato;
   - importação aceita o formato versionado, valida todos os campos e nasce com `ativo = false`;
   - importação de formato legado converte identificação antiga e aplica defaults documentados, sem ativar o Tour.
8. Atualizar seed apenas se ele cria Tours, sem usar seed como data-fix.
9. Rodar `prisma generate` depois da migration/schema.

### Critérios de aceite

- dados existentes mantêm a mesma elegibilidade observável;
- Tour pode ser autônomo, de Jornada ou ambos sem duplicar passos;
- configurações inválidas são rejeitadas no servidor;
- tipos do frontend refletem a API sem `any` novo;
- migration funciona sobre banco com dados antigos.

### Testes

- normalização e validação de origens;
- validação de cada gatilho;
- validação das políticas de frequência;
- data-fix da migration revisado;
- candidatura legada equivalente após migração.

## 10. Fase 3 — APIs administrativas, impacto e publicação

### Arquivos principais

- `server/src/controllers/tours.ts`
- `server/src/controllers/jornadas.ts`
- `server/src/routes/tours.ts`
- `server/src/controllers/tours.test.ts`
- `server/src/controllers/jornadas.test.ts`
- `web/src/pages/jornadas/Form.tsx`
- `web/src/types.ts`

### Tarefas

1. Incluir no detalhe do Tour uma lista resumida das Jornadas que o utilizam:
   - `jornada_id`;
   - título da Jornada;
   - status ativo/inativo;
   - pacote e etapa onde aparece.
2. Evitar alterar o formato de lista `GET /tours` se consumidores esperam array puro. Preferir incluir dependências apenas no detalhe ou criar endpoint específico `GET /tours/:id/dependencias`.
3. Antes de excluir Tour, permitir consultar impacto.
4. Na exclusão, exigir confirmação explícita quando houver dependências. A confirmação pode ser campo no body/query ou endpoint dedicado, mas deve ser validada pelo backend, não somente pela UI.
5. Antes de retirar `permite_jornada`, aplicar a mesma proteção de impacto.
6. Em todo create/update cujo estado final seja `ativo = true`, mesmo quando a Jornada já estava ativa, validar:
   - ao menos um pacote ativo;
   - ao menos uma etapa executável;
   - ordem e obrigatoriedade coerentes;
   - Tours existentes, do mesmo tenant e com `permite_jornada = true`;
   - Tours com pelo menos um passo e seletores válidos;
   - Campanhas existentes e do mesmo tenant;
   - segmentação e domínios normalizados.
7. Enquanto Campanha em Jornada não estiver implementada no widget, rejeitar ativação de Jornada com etapa de Campanha e devolver erro claro.
8. Alterar o default de novas Jornadas para `ativo = false` de forma consistente no schema/controller/frontend. Incluir data-fix apenas se necessário; não desativar Jornadas existentes.
9. Revisar atualização de Jornada que hoje apaga e recria etapas. Preservar IDs existentes ao atualizar itens conhecidos, pois `etapa_id` passa a participar de eventos, retomada e métricas.
10. Implementar sincronização por ID:
    - atualizar filhos existentes pertencentes à Jornada;
    - criar filhos sem ID;
    - remover filhos omitidos somente após validar ownership;
    - nunca aceitar ID de filho de outra Jornada.
11. Adicionar `id` aos estados de formulário de pacote e etapa no frontend, hidratar esses IDs na edição e incluí-los no payload. Sem isso, o backend não consegue distinguir atualização de criação.
12. Cobrir round-trip de hidratação e serialização para provar que IDs existentes são preservados.

### Critérios de aceite

- detalhe do Tour informa todos os usos dentro do tenant;
- exclusão ou retirada de origem não quebra Jornada sem aviso e confirmação;
- Jornada inválida não pode ser ativada;
- editar Jornada preserva IDs de pacotes e etapas não removidos;
- erro de validação identifica o pacote/etapa problemática.

## 11. Fase 4 — Formulário e biblioteca de Tours

### Arquivos principais

- `web/src/pages/tours/Form.tsx`
- `web/src/pages/tours/Index.tsx`
- novos utilitários/componentes em `web/src/pages/tours/`
- `web/src/types.ts`

### Tarefas

1. Antes de ampliar `Form.tsx`, extrair apenas blocos que reduzam risco e sejam testáveis:
   - transformação estado/payload;
   - card de distribuição;
   - card de gatilhos/frequência;
   - lista de Jornadas utilizadoras.
2. Adicionar seção “Onde este Tour pode ser usado?” com toggles independentes:
   - “Pode ser executado de forma independente”;
   - “Pode ser usado como etapa de Jornada”.
3. Exibir gatilhos, frequência e prioridade somente quando uso autônomo estiver habilitado.
4. Adicionar escolha explícita entre “Público geral” e “Público segmentado”; a segunda exige ao menos uma regra e a primeira não pode enviar regras ocultas.
5. Permitir editar múltiplos gatilhos com campos condicionais e mensagens específicas.
6. Mostrar resumo interpretativo antes de publicar, seguindo o padrão de Campanhas.
7. Na edição, mostrar “Usado em Jornadas” com links para as Jornadas.
8. Ao desabilitar uso em Jornada, abrir confirmação que lista impactos; tratar também rejeição do backend.
9. Na biblioteca, adicionar:
   - badge `Independente`, `Jornada` ou `Ambos`;
   - contagem de Jornadas utilizadoras;
   - filtro por origem;
   - confirmação de exclusão com impacto real.
10. Preservar componentes, tokens, tipografia system e linguagem visual existentes. Não impor cores fixas do painel ao widget do tenant.
11. Não esconder erro de carregamento de dependências.

### Critérios de aceite

- origem do Tour é compreensível sem conhecer a semântica de `ativo`;
- campos autônomos desaparecem quando não se aplicam, sem perder dados salvos acidentalmente;
- impacto de mudança/exclusão fica explícito;
- formulário funciona em desktop e mobile;
- nenhum fluxo atual de passos, preview ou gravador regride.

### Testes

Extrair e testar funções puras para:

- hidratação do formulário;
- serialização do payload;
- validação condicional de origem/gatilhos/frequência;
- resumo de distribuição;
- decisão de exigir confirmação por dependências.

## 12. Fase 5 — Formulário de Jornada e criação de Tour no fluxo

### Arquivos principais

- `web/src/pages/jornadas/Form.tsx`
- novos utilitários/componentes em `web/src/pages/jornadas/`
- `web/src/App.tsx`
- permissões e guards relacionados

### Tarefas

1. Filtrar seleção para Tours com `permite_jornada = true`.
2. Exibir no seletor status de qualidade:
   - sem passos;
   - seletor inválido;
   - disponível para Jornada;
   - utilizado em outras Jornadas.
3. Mostrar pendências por pacote e etapa antes de ativar/publicar.
4. Adicionar criação de Tour sem perder estado do formulário da Jornada.
5. Preferir modal ou drawer com formulário mínimo reutilizável. Não navegar para `/tours/novo` descartando alterações não salvas.
6. Depois da criação, atualizar a biblioteca e selecionar automaticamente o novo Tour na etapa atual.
7. Respeitar permissões:
   - selecionar Tour exige capacidade de visualização adequada;
   - criar inline exige `TOURS.GERENCIAR`;
   - se faltar permissão, esconder criação e explicar indisponibilidade, não mostrar lista vazia silenciosamente.
8. Tratar falhas de `GET /tours` e `GET /campanhas` de forma visível.
9. Manter ordenação e obrigatoriedade existentes.
10. Manter “Pacote” na UI.

### Critérios de aceite

- admin seleciona Tour existente elegível;
- admin autorizado cria Tour inline e volta à mesma etapa sem perder dados;
- usuário sem permissão recebe feedback correto;
- Jornada não ativa com referência incompleta ou conteúdo não executável;
- frontend lida com erro estruturado do backend.

## 13. Fase 6 — Registro de origem e frequência no runtime

### Arquivos principais

- `server/src/controllers/widget.ts`
- `web/public/widget.js`
- `server/src/controllers/widget.test.ts`
- testes `server/src/widgetTour*.test.ts`

### Tarefas backend

1. Em `/api/widget/tour/candidatas`, filtrar `ativo = true` e `permite_autonomo = true`.
2. Avaliar frequência no servidor para usuário identificado.
3. Retornar somente campos públicos necessários; não expor `tenant_id` ou metadados internos.
4. Ao retornar Jornadas, incluir Tour somente quando `permite_jornada = true` e manter Jornada inválida fora do runtime público.
5. Em `/api/widget/tour/evento`, validar:
   - Tour pertence ao tenant resolvido;
   - origem e gatilho são válidos;
   - contexto de Jornada pertence ao mesmo tenant e corresponde à etapa/Tour;
   - IDs de Jornada são nulos fora da origem Jornada;
   - `execucao_id` está presente nos novos eventos.
6. Garantir que payload com `modo_teste = true` não persista. Preferencialmente o cliente nem envia; o servidor deve continuar protegido.
7. Quando o evento `concluido` tiver contexto de Jornada válido, registrar na mesma transação a conclusão do Tour e `etapa_concluida`, usando `chave_idempotencia` derivada de execução, etapa e transição. O cliente não deve precisar coordenar dois POSTs independentes para essa conclusão.

### Tarefas widget

1. Gerar `execucao_id` no início real do Tour.
2. Armazenar origem, gatilho e IDs de Jornada em `tourState`.
3. Preservar esses dados no snapshot de retomada do `sessionStorage`.
4. Enviar contexto em todos os eventos do Tour.
5. Gerar `execucao_jornada_id` no primeiro início de uma Jornada e preservá-lo durante retomadas.
6. Fazer todos os eventos novos de Jornada aceitarem o identificador, validar sua associação com Jornada/usuário e devolver a execução corrente junto do progresso em `GET /api/widget/jornadas`.
7. Preservar a semântica atual de `permitir_refazer`: rever/refazer conteúdo concluído não limpa progresso e não cria nova execução. Uma operação futura de “reiniciar Jornada” exigirá nova execução e fica fora desta entrega.
8. Ao reconstruir progresso, considerar eventos legados sem execução e eventos da execução corrente. Como esta entrega não reinicia progresso, ambos formam o mesmo histórico cumulativo; não marcar eventos legados com uma origem inventada.
9. Gerar chaves de idempotência determinísticas por execução, entidade e transição. Refazer conteúdo já concluído não cria outra transição de progresso.
10. Implementar deduplicação anônima conforme a frequência configurada.
11. Integrar Tour ao `UserPulse.track()` quando houver gatilho de evento.
12. Listar Tours de gatilho `botao_ajuda` na Central sem transformá-los em Jornada.
13. Manter compatibilidade de `UserPulse.iniciarTour(slug)` apenas para Tours que permitem o gatilho `manual`.
14. Adicionar `abrirJornadas` ao stub de `widget-loader.js`, pois o drain já reconhece o método.
15. Impedir carregamento duplicado do widget quando `_up_ready` já estiver verdadeiro.
16. Corrigir comentário obsoleto que afirma que Tours não abrem automaticamente.
17. Exibir contexto curto e acessível na introdução ou cabeçalho do conteúdo, explicando a origem quando ela não for óbvia e qual ação é esperada. Exemplos: “Guia desta etapa da Jornada” e “Exibido ao acessar esta tela”.

### Critérios de aceite

- todo evento novo de Tour é correlacionável por execução e origem;
- retomada multipágina mantém a correlação;
- frequência funciona para identificado e anônimo;
- início manual continua funcionando e não é bloqueado por frequência;
- Tour autônomo nunca conclui automaticamente etapa de Jornada;
- modo de teste não grava nem deduplica.
- usuário entende por que o conteúdo apareceu e qual ação deve realizar.

## 14. Fase 7 — Coordenador único de apresentação no widget

Esta é a fase de maior risco. Preservar renderizadores existentes e substituir gradualmente somente os pontos que decidem abrir e fechar conteúdos.

### Arquivos principais

- `web/public/widget.js`
- novos testes runtime em `server/src/widgetPresentationQueue.test.ts`
- `server/package.json`

### Tarefas

1. Criar estado único em memória, por exemplo `presentationState`, com:
   - item ativo;
   - itens aguardando;
   - contador de sequência;
   - geração do contexto;
   - proteção contra `drain()` reentrante.
2. Implementar funções pequenas e testáveis no próprio IIFE:
   - normalizar item;
   - comparar prioridades;
   - deduplicar;
   - enfileirar;
   - descartar expirados/obsoletos;
   - reservar slot;
   - liberar slot;
   - drenar fila.
3. A chave de deduplicação deve incluir tipo, entidade, origem e etapa. O mesmo Tour autônomo e em Jornada são candidaturas diferentes.
4. Redirecionar para o coordenador:
   - Tour manual;
   - Tour automático;
   - Tour de etapa de Jornada;
   - abertura da Central;
   - Campanha por tela/URL;
   - Campanha por `track()`;
   - abertura de tooltip de destaque interativo.
5. Não considerar FAB visível ou badge passivo fechado como ocupação de foco.
6. Liberar o slot em todos os encerramentos:
   - conclusão de Tour;
   - pulo/fechamento de Tour;
   - fechamento/dispensa/conclusão de Campanha;
   - fechamento da Central;
   - fechamento de tooltip interativo.
7. Reavaliar fila imediatamente após liberar o slot.
8. Antes de abrir item aguardando, revalidar URL, contexto, validade, DOM e deduplicação.
9. Usar geração de contexto para descartar respostas assíncronas antigas após navegação SPA ou `updateContext()`.
10. Usar contador de intenção em chamadas manuais concorrentes. A ordem da rede não pode escolher o Tour final.
11. Corrigir timers de Campanha para limpar referência quando dispararem, mesmo quando o conteúdo for bloqueado/enfileirado.
12. Não suspender DOM ativo para preempção. A primeira versão espera o slot ser liberado.
13. Não registrar visualização ao enfileirar; registrar somente quando o item realmente abrir.
14. Definir validade inicial:
   - URL/tela/elemento: expira quando contexto deixa de corresponder;
   - evento: expiração curta e documentada;
   - ação explícita: permanece até abrir ou ser cancelada por nova intenção explícita;
   - Jornada disponível: não entra automaticamente na fila, apenas a abertura explícita da Central.

### Matriz mínima de comportamento

| Conteúdo ativo | Novo conteúdo | Resultado inicial |
| --- | --- | --- |
| Tour de Jornada | Tour manual | aguarda; nunca interrompe silenciosamente |
| Tour de Jornada | Campanha informativa | aguarda |
| Tour manual | conteúdo automático | aguarda |
| Central aberta | Campanha automática | aguarda |
| Central aberta | Tour automático | aguarda |
| Campanha informativa | Tour manual | Tour aguarda até a Campanha fechar, sem preempção na V1 |
| Tour automático | Campanha crítica | Campanha aguarda na V1 |
| Nenhum | Tour automático + Campanha informativa | Tour abre primeiro |
| Nenhum | Jornada disponível | somente FAB |

### Critérios de aceite

- apenas uma experiência que ocupa foco fica ativa por vez;
- nenhuma resposta assíncrona obsoleta abre conteúdo;
- item bloqueado elegível é retomado após fechamento do ativo;
- Tour de Jornada não é interrompido;
- concluir, pular ou fechar sempre libera a fila;
- renderização e métricas existentes continuam funcionando.

### Testes obrigatórios

1. Ordem das classes e desempates.
2. Deduplicação do mesmo item.
3. Tour manual e Tour de Jornada com respostas invertidas.
4. Campanha e Tour automático com respostas invertidas.
5. `track()` durante Tour de Jornada.
6. Central aberta durante timer de Campanha.
7. Navegações SPA com respostas antigas.
8. `updateContext()` durante fetch.
9. Liberação após concluir, pular e fechar.
10. Descarte por validade/contexto.
11. `drain()` reentrante sem dupla abertura.
12. Visualização somente após abertura real.

## 15. Fase 8 — Campanha como etapa de Jornada

### Arquivos principais

- `server/src/controllers/widget.ts`
- `web/public/widget.js`
- `web/src/pages/jornadas/Form.tsx`
- testes de Jornada e fila

### Tarefas

1. Definir candidatura de Campanha originada por etapa de Jornada usando a mesma Campanha existente, sem duplicar conteúdo.
2. Ao clicar na etapa, enfileirar a Campanha como ação explícita vinculada à Jornada.
3. A frequência autônoma da Campanha não deve impedir execução exigida pela Jornada; o progresso da Jornada controla essa origem.
4. Registrar no contexto da interação a Jornada, pacote e etapa, de modo equivalente ao Tour.
5. Concluir a etapa somente após a condição real de conclusão da Campanha:
   - modal informativo: CTA/conclusão definida;
   - formulário/NPS: envio válido;
   - campanha dispensada/fechada: não concluir, salvo política explicitamente configurada.
6. No endpoint que recebe a conclusão real da Campanha, persistir a interação e `etapa_concluida` na mesma transação quando houver contexto de Jornada válido.
7. Usar `execucao_jornada_id` e chave de idempotência para aceitar retry sem duplicar conclusão. Refazer a Campanha preserva a execução e não duplica progresso.
8. Remover o bloqueio temporário de publicação criado na Fase 3.
9. Habilitar o botão no painel somente depois que o runtime estiver completo.
10. Cobrir retomada da Jornada e liberação da fila.

### Critérios de aceite

- etapa de Campanha publicada é realmente executável;
- Campanha autônoma e Campanha de Jornada possuem contextos distintos;
- conclusão real atualiza a etapa uma única vez;
- fechamento sem conclusão mantém etapa pendente;
- fila impede concorrência com outro conteúdo.

## 16. Fase 9 — Modo de teste da Jornada completa

### Arquivos principais

- `web/src/App.tsx`
- `web/src/pages/jornadas/Form.tsx`
- nova página/componente de teste de Jornada
- `web/public/widget.js`
- `server/src/controllers/jornadas.ts`
- `server/src/routes/jornadas.ts`
- `server/src/controllers/widget.ts`

### Tarefas

1. Exigir que a Jornada seja salva como rascunho antes do teste; suporte a formulário ainda não salvo fica fora desta entrega.
2. Criar endpoint administrativo autenticado que gera token de preview assinado, com audiência específica, `tenant_id`, `jornada_id`, `admin_user_id`, nonce e expiração curta. Validar tenant e permissão antes de emitir.
3. Pedir uma URL da aplicação-alvo compatível com os domínios da Jornada e abri-la com o token no fragmento da URL, evitando envio do bearer token em logs HTTP e cabeçalho `Referer`.
4. Fazer o widget detectar o fragmento de preview, removê-lo da URL visível com `history.replaceState`, guardar o token em `sessionStorage` da aplicação-alvo e chamar endpoint público dedicado de preview.
5. No endpoint público, validar assinatura, audiência, expiração, tenant e Jornada antes de devolver o snapshot completo, inclusive quando `ativo = false`. Não ampliar `GET /api/widget/jornadas` para expor rascunhos.
6. Reutilizar o token de `sessionStorage` após navegação multipágina e buscar novamente o snapshot. Limpar o token ao sair do teste ou expirar.
7. Criar fluxo que execute a Jornada completa no widget real dentro da aplicação-alvo, não apenas uma simulação React sem os seletores reais.
8. Não depender de `test-embed.html`, pois essa rota pode estar indisponível em produção.
9. Propagar `modoTeste` para Central, etapas, Tour, Campanha e fila.
10. Em modo de teste:
   - não enviar eventos;
   - não alterar progresso real;
   - não escrever deduplicação em storage;
   - não enviar feedback;
   - não misturar item de teste com fila real;
   - mostrar indicação visual “Modo teste”.
11. Corrigir o testador por slug para usar opção explícita de preview/teste em vez da execução manual real.
12. Permitir reiniciar teste localmente sem limpar dados reais do usuário.
13. Cobrir Tour multipágina, recuperação do snapshot e retorno à Jornada dentro do modo de teste.

### Critérios de aceite

- teste percorre pacotes e etapas reais;
- token inválido, expirado ou de outro tenant não retorna snapshot;
- navegação multipágina recupera o preview sem expor rascunho pela rota pública normal;
- nenhuma tabela de evento recebe registro de teste;
- storage real não é contaminado;
- sair do teste restaura o estado normal do widget.

## 17. Fase 10 — Métricas por origem e execução

### Arquivos principais

- `server/src/controllers/tours.ts`
- testes de métricas em `server/src/controllers/tours.test.ts`
- dashboard de Tour no frontend
- `web/src/types.ts`

### Tarefas

1. Recalcular funil por `execucao_id`, não apenas por contagem agregada de passos.
2. Adicionar filtro e agrupamento por origem.
3. Exibir comparação entre execução autônoma e em Jornada.
4. Permitir detalhar Jornada, pacote e etapa associados.
5. Calcular abandono somente para execução realmente iniciada e não concluída.
6. Excluir modo de teste por construção; eventos de teste não deveriam existir.
7. Preservar relatório legado para eventos antigos sem origem, agrupando-os como `desconhecida`.
8. Adicionar métricas de fila apenas se os eventos necessários forem implementados sem transformar elegibilidade em visualização:
   - tempo aguardando;
   - expiração antes de exibir;
   - conflitos evitados.
9. Não criar persistência de fila apenas para produzir dashboard. Avaliar essa necessidade depois de uso real.

### Critérios de aceite

- uma execução é contada uma vez;
- origem desconhecida não é atribuída retroativamente;
- filtros do frontend correspondem aos dados da API;
- métricas antigas continuam acessíveis.

## 18. Testes e verificações finais

### Backend e schema

```bash
npm run db:generate
npm test
npx tsc --noEmit
npm run build
```

Executar em `server/`.

### Frontend

```bash
npx tsc --noEmit
npm run build
```

Executar em `web/`.

### Widget

```bash
node --check web/public/widget.js
node --check web/public/widget-loader.js
```

### Build completo

```bash
npm run build
```

Executar na raiz.

### Smoke tests manuais

1. Criar Tour exclusivo de Jornada, vinculá-lo e concluir a etapa.
2. Criar Tour autônomo com cada gatilho e frequência.
3. Usar o mesmo Tour autonomamente e em Jornada, confirmando eventos com origens diferentes.
4. Abrir Campanha, Tour e Central em ordens diferentes e confirmar um único foco.
5. Navegar em SPA durante fetch e confirmar que conteúdo antigo não abre.
6. Retomar Tour multipágina e confirmar o mesmo `execucao_id`.
7. Excluir ou retirar origem de Tour usado e confirmar aviso/bloqueio.
8. Tentar payload cross-tenant em Jornada e eventos públicos.
9. Executar Jornada em modo de teste e confirmar zero alteração em eventos/progresso/storage.
10. Verificar layout do painel em desktop e viewport móvel.

## 19. Definition of Done

A entrega só está concluída quando:

- todos os requisitos essenciais do PRD possuem implementação ou decisão explícita documentada;
- um único `TourGuiado` atende uso autônomo e Jornada;
- origens, gatilhos, frequência e prioridade são validados no backend;
- referências e eventos respeitam tenant e hierarquia da Jornada;
- admin vê reutilização e impacto antes de mudança destrutiva;
- Jornada valida conteúdo executável antes de ativar;
- fila em memória controla todos os pontos de abertura interativa;
- apenas uma experiência ocupa o foco;
- evento de Tour registra execução e origem;
- Campanha como etapa funciona ou permanece bloqueada para publicação até sua fase estar completa;
- modo de teste não contamina dados reais;
- métricas distinguem origem sem falsificar eventos históricos;
- `web/src/types.ts` está sincronizado;
- migrations incluem data-fix;
- novos testes fazem parte dos scripts executados;
- type-checks, testes, builds e checks de sintaxe passam.

## 20. Arquivos de referência

- `server/prisma/schema.prisma`
- `server/src/controllers/jornadas.ts`
- `server/src/controllers/tours.ts`
- `server/src/controllers/campanhas.ts`
- `server/src/controllers/widget.ts`
- `server/src/routes/widget.ts`
- `server/src/controllers/jornadas.test.ts`
- `server/src/controllers/tours.test.ts`
- `server/src/controllers/widget.test.ts`
- `server/src/widgetTourAutomatico.test.ts`
- `server/src/widgetTourSegmentacao.test.ts`
- `web/src/types.ts`
- `web/src/App.tsx`
- `web/src/pages/jornadas/Form.tsx`
- `web/src/pages/tours/Form.tsx`
- `web/src/pages/tours/Index.tsx`
- `web/src/pages/campanhas/CampanhaForm.tsx`
- `web/src/pages/campanhas/campanhaForm.utils.ts`
- `web/public/widget.js`
- `web/public/widget-loader.js`
- `test-embed.html`
- `DESIGN.md`

## 21. Ordem recomendada de entregas

Para reduzir o tamanho de cada revisão, dividir a implementação em entregas independentes:

1. integridade multi-tenant e validação hierárquica;
2. schema, migration, contratos e tipos;
3. dependências, publicação e preservação de IDs da Jornada;
4. UX administrativa de Tours;
5. UX de Jornada e criação inline;
6. origem, gatilhos e frequência no runtime;
7. fila única em memória;
8. Campanha como etapa;
9. teste completo sem métricas;
10. métricas por origem e execução.

Cada entrega deve terminar funcional, testada e sem depender de código morto da entrega seguinte. Quando uma capacidade ainda não estiver pronta, bloquear sua publicação com mensagem explícita em vez de expor comportamento parcialmente funcional.

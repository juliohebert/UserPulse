# Redesenhar XP Jornada/Tour

Status: In progress
Priority: MID

# PRD — Jornada, Tour Guiado e Campanhas

## 1. Objetivo

Definir como **Jornadas**, **Tours Guiados** e **Campanhas** devem coexistir no UserPulse, mantendo o Tour independente quando fizer sentido e evitando conflitos de apresentação na mesma tela.

## 2. Conceitos

- **Jornada:** experiência estruturada, com sequência de módulos e progresso.
- **Tour Guiado:** orientação interativa composta por passos e destaques de elementos da tela.
- **Campanha:** comunicação pontual, normalmente apresentada como modal, banner ou outro conteúdo de mensagem.
- **Módulo/Pacote:** agrupamento de conteúdos dentro de uma Jornada.

A Jornada organiza uma sequência. O Tour ensina ou orienta uma tarefa. A Campanha comunica uma mensagem ou ação específica. São conteúdos diferentes e não devem ser tratados como tipos equivalentes.

## 3. Proposta principal

### 3.1 Um Tour com diferentes formas de uso

Não criar “Tour de Jornada” e “Tour independente” como entidades diferentes. Deve existir um único `TourGuiado`, que pode ter uma ou mais origens de execução:

- **Independente:** iniciado por gatilho contextual, ação manual ou integração.
- **Jornada:** iniciado como etapa de uma Jornada.
- **Ambos:** disponível nos dois contextos.

A origem é uma configuração de distribuição, não um tipo de conteúdo.

### 3.2 Gatilhos do Tour independente

Quando o Tour puder ser executado de forma independente, o administrador poderá configurar:

- entrada em uma tela;
- correspondência de URL;
- existência de elemento ou área;
- botão de ajuda;
- chamada manual pela API;
- evento de integração futuro.

Esses gatilhos devem ser combinados com:

- segmentação;
- frequência de exibição;
- prioridade;
- condição de conclusão ou reexibição.

Um Tour usado exclusivamente em Jornada não precisa possuir gatilho independente.

## 4. Experiência administrativa

O painel deve manter duas entradas complementares:

- **Jornadas:** criação de experiências sequenciais.
- **Tours:** biblioteca de conteúdos reutilizáveis.

No cadastro do Tour, incluir:

- “Pode ser usado como Tour independente”;
- “Pode ser usado como etapa de Jornada”;
- gatilhos, frequência e prioridade quando a execução independente estiver ativa;
- lista de Jornadas que utilizam o Tour;
- aviso de impacto antes de alterar ou excluir um Tour reutilizado.

Na Jornada, o administrador deve poder:

- selecionar um Tour existente;
- criar um Tour sem sair do fluxo;
- ordenar etapas;
- definir etapas obrigatórias ou opcionais;
- testar a Jornada completa.

## 5. Apresentação e conflitos na mesma tela

Campanhas, Tours e Jornadas podem ser elegíveis simultaneamente. O widget deve aplicar uma política única de prioridade, em vez de exibir todos ao mesmo tempo.

### 5.1 Regra de prioridade

A ordem recomendada é:

1. **Tour ou conteúdo iniciado diretamente pelo usuário** — ação explícita sempre tem prioridade.
2. **Tour em execução dentro de Jornada** — não pode ser interrompido.
3. **Campanha transacional ou crítica** — mensagem necessária para concluir uma operação ou informar risco relevante.
4. **Jornada disponível** — apresentada no FAB/painel de ajuda, sem abrir automaticamente.
5. **Tour independente automático** — aberto apenas quando não houver conteúdo prioritário ativo.
6. **Campanha informativa/promocional** — aguarda a liberação da fila.

A prioridade de negócio da Campanha pode alterar sua posição dentro da fila, mas não deve interromper uma interação iniciada diretamente pelo usuário sem confirmação.

### 5.2 Exclusão de concorrência

- Apenas uma experiência interativa pode ocupar o foco da tela por vez.
- Um Tour em execução bloqueia a abertura de outro Tour ou Campanha não crítica.
- Uma Jornada não deve abrir um modal automaticamente; deve permanecer acessível pelo FAB/painel.
- Um Tour independente não deve abrir por cima de um Tour iniciado por Jornada.
- Uma Campanha crítica pode interromper apenas com regra explícita e mensagem clara ao usuário.
- Conteúdos bloqueados devem ser enfileirados ou descartados conforme sua política de validade.
- Ao terminar um Tour, o sistema pode retomar a Jornada ou liberar o próximo item da fila.

### 5.3 Fila de apresentação

Cada conteúdo elegível deve possuir:

- prioridade;
- origem;
- momento de criação/elegibilidade;
- validade opcional;
- política de repetição;
- indicador de que está aguardando, em exibição, concluído, pulado ou expirado.

O widget deve reavaliar a fila após concluir, pular ou fechar um conteúdo.

## 6. Requisitos funcionais essenciais

- O administrador consegue criar e publicar um Tour independente.
- O administrador consegue usar o mesmo Tour dentro de uma Jornada.
- Um Tour pode ser usado nos dois contextos sem duplicar seus passos.
- O Tour independente possui gatilhos, segmentação, frequência e prioridade configuráveis.
- A Jornada possui progresso por módulos e etapas.
- Uma etapa de Tour só é concluída depois da conclusão real do Tour.
- O sistema impede dois Tours simultâneos.
- A Jornada não interrompe um Tour ativo.
- Campanhas, Tours e Jornadas seguem uma fila de apresentação única.
- O usuário consegue entender por que um conteúdo foi exibido e o que deve fazer.
- O modo de teste não contamina as métricas reais.
- O histórico diferencia execução autônoma e execução dentro de Jornada.

## 7. Modelo de dados recomendado

A estrutura atual já suporta a maior parte da proposta:

```
Jornada
└── Módulo/Pacote
    └── EtapaJornada → TourGuiado
                         └── TourPasso
```

O Tour deve ganhar, ou passar a tratar explicitamente, configurações equivalentes a:

```json
{
  "origens_permitidas": ["autonomo", "jornada"],
  "gatilhos": [],
  "frequencia": "uma_vez_por_usuario",
  "prioridade": 0
}
```

Toda execução deve registrar sua origem:

```json
{
  "origem": "autonomo",
  "gatilho": "entrada_tela",
  "jornada_id": null,
  "modulo_id": null,
  "etapa_id": null
}
```

Para uma execução em Jornada, preencher os identificadores da Jornada, módulo e etapa.

A fila de apresentação pode começar como estado no runtime e eventos existentes. Uma entidade persistida de fila só deve ser criada se o uso demonstrar necessidade de retomada, validade ou ordenação entre múltiplos conteúdos.

## 8. Publicação e validação

### Tour independente

Para publicar, deve possuir:

- pelo menos um passo;
- seletores válidos;
- identificação ou gatilho configurado;
- política de frequência;
- segmentação explícita ou indicação de público geral.

### Tour usado somente em Jornada

Pode ser mantido como rascunho até ser revisado, mas a publicação da Jornada deve alertar se o Tour estiver incompleto ou sem seletores.

### Jornada

Antes da publicação, validar:

- módulos e etapas;
- Tours vinculados;
- ordem e obrigatoriedade;
- segmentação;
- existência de conteúdo executável.

## 9. Implementação sugerida

### Fase 1 — configuração e UX

- Manter um único cadastro de Tour.
- Adicionar origem de execução.
- Separar gatilhos independentes das etapas de Jornada.
- Exibir onde cada Tour é utilizado.
- Implementar prioridade e bloqueio básico entre conteúdos.

### Fase 2 — runtime e progresso

- Adicionar contexto de origem aos eventos.
- Garantir conclusão correta da etapa após o Tour.
- Impedir concorrência entre Campanhas, Tours e Jornadas.
- Liberar a Jornada ou o próximo item após o encerramento do conteúdo atual.

### Fase 3 — métricas

- Consolidar métricas por origem.
- Medir fila, abandono, conclusão e conflitos evitados.
- Avaliar necessidade de persistir estado de fila e retomada.

## 10. Decisões em aberto

1. Campanha crítica poderá interromper um Tour ou apenas aguardar?
2. Campanhas informativas devem entrar na mesma fila ou ter canal visual separado?
3. O agrupamento da Jornada será chamado de “Módulo” ou “Pacote”?
4. A prioridade será configurada manualmente, por tipo de conteúdo ou pelos dois?
5. Um Tour concluído autonomamente deve contar como concluído quando aparecer depois em uma Jornada?
6. O usuário poderá silenciar Tours independentes por um período?

## 11. Recomendação

Manter:

- **um único tipo de Tour**;
- **origens de execução configuráveis**;
- **gatilhos independentes configuráveis**;
- **Jornada como experiência sequencial**;
- **uma política única de fila e prioridade para Campanhas, Tours e Jornadas**.

Essa solução preserva a flexibilidade dos Tours independentes, permite experiências completas com Jornadas e evita que diferentes conteúdos disputem a tela de forma imprevisível.

## Fontes analisadas

- `server/prisma/schema.prisma`
- `server/src/controllers/jornadas.ts`
- `server/src/controllers/tours.ts`
- `server/src/controllers/widget.ts`
- `web/src/pages/jornadas/Form.tsx`
- `web/src/pages/tours/Form.tsx`
- `web/src/pages/tours/Index.tsx`
- `web/src/pages/tours/Guide.tsx`
- `web/public/widget.js`
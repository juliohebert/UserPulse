# Proposta: Modulo Central De Configuracoes

## Contexto

Hoje existe uma liberdade grande na configuracao de campanhas, tours e aparencia. Em varios pontos o sistema usa strings livres para representar o sistema, a tela ou o local onde uma experiencia deve aparecer.

Exemplos atuais:

- `Campanha.sistema`
- `Campanha.tela`
- `Campanha.url_contem`
- `Campanha.data_cy`
- `TourGuiado.sistema`
- `TourGuiado.tela`
- `TelaCatalogo.sistema`
- `AparenciaWidget.sistema`

Isso funciona, mas cria alguns problemas:

- Erros de digitacao em nomes de sistemas e telas.
- Duplicacao de conceitos entre campanhas, tours, catalogo e aparencia.
- Dificuldade para padronizar cores e identidade visual por sistema.
- Dificuldade para orientar usuarios menos tecnicos.
- Falta de um lugar central para entender quais sistemas e telas existem em cada tenant.

O projeto ja tem parte dessa ideia com `TelaCatalogo` e `AparenciaWidget`, mas ainda falta uma entidade central para representar o sistema/produto do cliente.

## Objetivo

Criar um modulo central de configuracoes que organize informacoes reutilizaveis por campanhas, tours, jornadas, widget e futuras funcionalidades.

O primeiro foco deve ser:

- Sistemas.
- Catalogo de telas por sistema.
- Aparencia por sistema.

Elementos de tela, seletores reutilizaveis e outros detalhes podem ficar para uma fase posterior.

## Nome Do Modulo

Sugestoes de nome para o painel:

- Configuracoes.
- Catalogo.
- Workspace.
- Aplicacoes.
- Produto.

Recomendacao inicial: **Configuracoes**.

Dentro dele:

- Sistemas.
- Catalogo de Telas.
- Aparencia.

## Modelo Proposto

### Sistema

Nova entidade central do modulo.

```prisma
model Sistema {
  id            String   @id @default(uuid())
  tenant_id     String
  nome          String
  slug          String
  descricao     String?
  identificador String
  url_base      String?
  ativo         Boolean  @default(true)
  criado_em     DateTime @default(now())
  atualizado_em DateTime @updatedAt

  tenant     Tenant            @relation(fields: [tenant_id], references: [id])
  telas      TelaCatalogo[]
  aparencia  AparenciaWidget?

  @@unique([tenant_id, slug])
  @@unique([tenant_id, identificador])
  @@index([tenant_id])
  @@map("sistemas")
}
```

Campos principais:

- `nome`: nome amigavel exibido no painel. Exemplo: `Clinic`, `Portal do Paciente`, `Painel Admin`.
- `slug`: identificador interno amigavel para URLs/admin. Exemplo: `clinic`.
- `identificador`: valor tecnico usado pelo widget e pelo sistema hospedeiro. Ele deve conversar com o valor enviado em `UserPulse.init({ sistema })`.
- `url_base`: URL opcional do sistema, util para documentacao ou validacoes futuras.
- `ativo`: permite esconder um sistema sem apagar historico.

### TelaCatalogo

Hoje `TelaCatalogo` guarda `sistema` como texto livre. A proposta e fazer cada tela pertencer a um `Sistema`.

```prisma
model TelaCatalogo {
  id                 String   @id @default(uuid())
  tenant_id          String
  sistema_id         String
  nome               String
  categoria          String
  modo_identificacao String   @default("url_contem")
  tela               String?
  url_contem         String?
  data_cy            String?
  ativo              Boolean  @default(true)
  criado_em          DateTime @default(now())
  atualizado_em      DateTime @updatedAt

  tenant  Tenant  @relation(fields: [tenant_id], references: [id])
  sistema Sistema @relation(fields: [sistema_id], references: [id])

  @@index([tenant_id])
  @@index([sistema_id])
  @@map("telas_catalogo")
}
```

Observacao: manter `tenant_id` em `TelaCatalogo` mesmo com `sistema_id` e coerente com o padrao do projeto. Isso facilita isolamento, queries e validacoes por tenant.

### AparenciaWidget

Hoje a aparencia e configurada por `sistema` textual. A proposta e configurar por `sistema_id`.

```prisma
model AparenciaWidget {
  id            String   @id @default(uuid())
  tenant_id     String
  sistema_id    String
  cor_principal String?
  logo_url      String?
  criado_em     DateTime @default(now())
  atualizado_em DateTime @updatedAt

  tenant  Tenant  @relation(fields: [tenant_id], references: [id])
  sistema Sistema @relation(fields: [sistema_id], references: [id])

  @@unique([tenant_id, sistema_id])
  @@map("aparencias_widget")
}
```

O widget ainda pode consultar por `sistema` tecnico, mas internamente o backend resolveria esse valor para um `Sistema` do tenant.

## Campanhas

Campanhas devem passar a usar referencias estruturadas, mas sem quebrar o runtime atual do widget.

Modelo futuro sugerido:

```prisma
model Campanha {
  id               String @id @default(uuid())
  tenant_id        String
  sistema_id       String?
  tela_catalogo_id String?

  sistema            String
  tela               String
  modo_identificacao String @default("sistema_tela")
  data_cy            String?
  url_contem         String?

  // Demais campos atuais permanecem.
}
```

Recomendacao: manter os campos atuais por enquanto.

Motivo:

- O widget provavelmente depende desses campos simples para decidir onde exibir campanhas.
- Campanhas antigas continuam funcionando.
- A campanha pode salvar um snapshot tecnico da tela escolhida.
- A migracao fica incremental e segura.

Fluxo sugerido ao criar campanha:

- Usuario escolhe um sistema cadastrado.
- Usuario escolhe uma tela do catalogo daquele sistema.
- Backend preenche `sistema_id` e `tela_catalogo_id`.
- Backend tambem grava `sistema`, `tela`, `url_contem`, `data_cy` conforme os dados tecnicos da tela.
- Widget continua usando o contrato atual.

## Tours

Tours devem seguir a mesma estrategia das campanhas.

```prisma
model TourGuiado {
  id               String @id @default(uuid())
  tenant_id        String
  sistema_id       String?
  tela_catalogo_id String?

  sistema            String
  modo_identificacao String @default("sistema_tela")
  tela               String?
  data_cy            String?
  url_contem         String?

  // Demais campos atuais permanecem.
}
```

## Interface Do Painel

Proposta de navegacao:

- `/configuracoes/sistemas`
- `/configuracoes/telas`
- `/configuracoes/aparencia`

Alternativa inicial mais simples:

- Manter os itens atuais na sidebar.
- Adicionar `Sistemas`.
- Depois agrupar tudo visualmente sob `Configuracoes`.

## Fluxo Ideal

1. Cliente cadastra um sistema.
2. Cliente cadastra telas dentro daquele sistema.
3. Cliente configura aparencia por sistema.
4. Ao criar campanha, escolhe primeiro o sistema.
5. Depois escolhe uma tela daquele sistema.
6. A campanha herda os dados tecnicos da tela.
7. O widget continua recebendo `sistema`, `tela`, `url_contem` ou `data_cy` como hoje.

## Fases De Implementacao

### Fase 1: Sistemas

- Criar tabela `sistemas`.
- Criar CRUD admin de sistemas.
- Adicionar rota `/api/sistemas`.
- Adicionar tela `Sistemas` no painel.
- Restringir escrita com `requireEscritaConfiguracao`.
- Permitir leitura para roles autenticadas, igual ao catalogo de telas.

### Fase 2: Vincular Catalogo De Telas

- Adicionar `sistema_id` em `TelaCatalogo`.
- Criar migration que popula `sistemas` a partir de valores distintos de `TelaCatalogo.sistema`, `Campanha.sistema`, `TourGuiado.sistema` e `AparenciaWidget.sistema`.
- Vincular telas existentes ao sistema correspondente.
- Atualizar controller de catalogo para aceitar `sistema_id`.
- Atualizar frontend do catalogo para selecionar sistema cadastrado.

### Fase 3: Aparencia Por Sistema

- Adicionar `sistema_id` em `AparenciaWidget`.
- Migrar aparencias existentes para o sistema correspondente.
- Atualizar tela de aparencia para escolher sistema cadastrado.
- Atualizar rota publica/admin para resolver aparencia pelo identificador do sistema.

### Fase 4: Campanhas Usando Catalogo

- Adicionar `sistema_id` e `tela_catalogo_id` em `Campanha`.
- Atualizar formulario de campanha para privilegiar selecao por catalogo.
- Ao selecionar tela, salvar tambem os campos tecnicos atuais.
- Manter modo manual como escape hatch temporario.

### Fase 5: Tours Usando Catalogo

- Adicionar `sistema_id` e `tela_catalogo_id` em `TourGuiado`.
- Atualizar formulario/gravador de tours para usar sistema e tela cadastrados.
- Manter campos tecnicos atuais para compatibilidade com widget.

### Fase 6: Reduzir Liberdade Manual

- Tornar o fluxo por catalogo o caminho principal.
- Deixar entrada manual apenas para ADMIN ou modo avancado.
- Adicionar validacoes para evitar campanhas/tours apontando para sistemas inativos.

## Decisoes Importantes

### Nao remover `sistema` textual agora

O campo `sistema` atual faz parte do contrato pratico com o widget e com o sistema hospedeiro.

Exemplo:

```js
UserPulse.init({
  sistema: 'clinic',
  tela: 'agenda'
})
```

O novo `Sistema.identificador` deve representar esse valor tecnico. A mudanca e que o painel deixa de espalhar essa string manualmente.

### Usar `Sistema` como centro do modulo

Campanhas, tours, catalogo de telas e aparencia devem convergir para `Sistema`.

Isso cria um modulo mais profundo: o resto do sistema aprende uma interface simples, enquanto regras de identificacao, aparencia e catalogo ficam concentradas.

### Elementos ficam para depois

Um catalogo de elementos de tela pode ser util para tours, tooltips e seletores reutilizaveis, mas ainda nao precisa entrar na primeira versao.

Possivel modelo futuro:

- `ElementoTela`
- `tela_catalogo_id`
- `nome`
- `tipo`
- `seletor_tipo`
- `seletor`
- `descricao`
- `ativo`

## Resultado Esperado

Com esse modulo, campanhas e tours deixam de depender principalmente de texto livre e passam a reutilizar configuracoes centrais.

Beneficios:

- Menos erro de cadastro.
- Mais consistencia entre campanhas, tours e widget.
- Melhor experiencia para usuarios nao tecnicos.
- Aparencia centralizada por sistema.
- Base melhor para evoluir jornadas, tours, checklists, pesquisas e elementos no futuro.
- Migracao segura sem quebrar o widget atual.

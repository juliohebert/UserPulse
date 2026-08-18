import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validarSegmentacaoRegras, validarPassos, montarFunilPorPasso, montarResumoFeedback, montarWhereListaTours, normalizarPaginacaoTours } from './tours'

// validarSegmentacaoRegras é a única peça de lógica de Segmentação de Tours
// que vive no backend — decide o que criar()/atualizar()/importar() persistem
// e quando cada um deles responde 400. Testada como função pura, sem HTTP nem
// banco (mesmo padrão de widget.test.ts). O restante do fluxo de
// criar/atualizar/duplicar/exportar/importar em torno dela é só "passar o
// resultado adiante pro Prisma" (sem lógica própria de segmentação) — ver
// nota no final do arquivo sobre por que esses fluxos não ganharam teste de
// integração aqui.
//
// montarFunilPorPasso/montarResumoFeedback (Funil por passo do Dashboard de
// Tours) seguem o mesmo padrão: são as únicas peças de lógica de agregação —
// buscarDashboard só busca os dados (contagens/groupBy já filtrados por
// whereComum) e repassa pra elas. Testadas aqui como função pura, com dados
// de entrada já "no formato que o Prisma devolveria" (Record<passo_ordem,
// contagem> e lista de { contexto }) — ver nota no final do arquivo sobre por
// que a consulta em si (groupBy + respeito aos filtros de período/cliente/
// usuário/unidade) não tem teste automatizado.

describe('validarSegmentacaoRegras — compatibilidade (sem segmentação)', () => {
  test('undefined (campo não enviado) => sem erro, lista null — criar Tour sem segmentacao_regras', () => {
    const r = validarSegmentacaoRegras(undefined)
    assert.equal(r.erro, null)
    assert.equal(r.lista, null)
  })

  test('null (enviado explicitamente) => sem erro, lista null — PUT limpando segmentação existente', () => {
    const r = validarSegmentacaoRegras(null)
    assert.equal(r.erro, null)
    assert.equal(r.lista, null)
  })

  test('lista vazia => sem erro, lista null (nunca [])', () => {
    const r = validarSegmentacaoRegras([])
    assert.equal(r.erro, null)
    assert.equal(r.lista, null)
  })
})

describe('validarSegmentacaoRegras — regras válidas', () => {
  test('uma regra válida é aceita e devolvida trimada', () => {
    const r = validarSegmentacaoRegras([{ campo: ' estado ', operador: ' igual ', valor: ' RN ' }])
    assert.equal(r.erro, null)
    assert.deepEqual(r.lista, [{ campo: 'estado', operador: 'igual', valor: 'RN' }])
  })

  test('múltiplas regras válidas são todas aceitas, na ordem enviada', () => {
    const r = validarSegmentacaoRegras([
      { campo: 'estado', operador: 'igual', valor: 'RN' },
      { campo: 'cliente_id', operador: 'em_lista', valor: '111,222' },
    ])
    assert.equal(r.erro, null)
    assert.equal(r.lista?.length, 2)
    assert.equal(r.lista?.[1].campo, 'cliente_id')
  })

  const camposSugeridos = [
    'cliente_id', 'unidade_id', 'organizacao_id', 'clinica_id',
    'usuario_tipo', 'perfil', 'estado', 'usuario_id', 'usuario_email',
    'tela', 'sistema',
  ]
  for (const campo of camposSugeridos) {
    test(`campo sugerido "${campo}" é aceito`, () => {
      const r = validarSegmentacaoRegras([{ campo, operador: 'igual', valor: 'x' }])
      assert.equal(r.erro, null)
    })
  }

  for (const operador of ['igual', 'diferente', 'contem', 'em_lista']) {
    test(`operador "${operador}" é aceito`, () => {
      const r = validarSegmentacaoRegras([{ campo: 'estado', operador, valor: 'x' }])
      assert.equal(r.erro, null)
    })
  }
})

describe('validarSegmentacaoRegras — regras inválidas (400 no controller)', () => {
  test('campo inválido retorna erro', () => {
    const r = validarSegmentacaoRegras([{ campo: 'campo_que_nao_existe', operador: 'igual', valor: 'x' }])
    assert.match(r.erro ?? '', /campo inválido/)
    assert.equal(r.lista, null)
  })

  test('campo ausente retorna erro', () => {
    const r = validarSegmentacaoRegras([{ operador: 'igual', valor: 'x' }])
    assert.match(r.erro ?? '', /campo inválido/)
  })

  test('operador inválido retorna erro', () => {
    const r = validarSegmentacaoRegras([{ campo: 'estado', operador: 'maior_que', valor: 'x' }])
    assert.match(r.erro ?? '', /operador inválido/)
    assert.equal(r.lista, null)
  })

  test('operador ausente retorna erro', () => {
    const r = validarSegmentacaoRegras([{ campo: 'estado', valor: 'x' }])
    assert.match(r.erro ?? '', /operador inválido/)
  })

  test('valor vazio retorna erro', () => {
    const r = validarSegmentacaoRegras([{ campo: 'estado', operador: 'igual', valor: '   ' }])
    assert.match(r.erro ?? '', /valor é obrigatório/)
  })

  test('não é uma lista (objeto solto) retorna erro', () => {
    const r = validarSegmentacaoRegras({ campo: 'estado', operador: 'igual', valor: 'x' })
    assert.match(r.erro ?? '', /lista de regras/)
  })

  test('primeira regra inválida numa lista de 2 já bloqueia tudo (nenhuma é salva pela metade)', () => {
    const r = validarSegmentacaoRegras([
      { campo: 'estado', operador: 'igual', valor: 'RN' },
      { campo: 'campo_invalido', operador: 'igual', valor: 'x' },
    ])
    assert.notEqual(r.erro, null)
    assert.equal(r.lista, null)
  })
})

describe('montarFunilPorPasso — funil por passo do Dashboard de Tours', () => {
  const passos = [
    { ordem: 0, titulo: 'Abrir filtros' },
    { ordem: 1, titulo: 'Selecionar período' },
    { ordem: 2, titulo: 'Confirmar' },
  ]

  test('visualizacoes e elemento_nao_encontrado vêm do Record por passo_ordem, sem mistura entre passos', () => {
    const funil = montarFunilPorPasso(
      passos,
      { 0: 100, 1: 80, 2: 60 },
      { 0: 0, 1: 5, 2: 1 },
      50,
    )
    assert.equal(funil[0].visualizacoes, 100)
    assert.equal(funil[1].visualizacoes, 80)
    assert.equal(funil[0].elemento_nao_encontrado, 0)
    assert.equal(funil[1].elemento_nao_encontrado, 5)
    assert.equal(funil[2].elemento_nao_encontrado, 1)
  })

  test('drop-off estimado num passo intermediário = visualizacoes atuais − visualizacoes do próximo passo', () => {
    const funil = montarFunilPorPasso(passos, { 0: 100, 1: 70, 2: 70 }, {}, 0)
    assert.equal(funil[0].proximo_passo_visualizacoes, 70)
    assert.equal(funil[0].avancos_estimados, 70)
    assert.equal(funil[0].abandonos_estimados, 30)
    assert.equal(funil[0].taxa_continuidade, 70)
    assert.equal(funil[0].taxa_queda, 30)
    assert.equal(funil[0].ultimo_passo, false)
  })

  test('último passo não tem "próximo passo" — usa concluidos como avanço (fim do tour)', () => {
    const funil = montarFunilPorPasso(passos, { 0: 100, 1: 80, 2: 60 }, {}, 45)
    const ultimo = funil[2]
    assert.equal(ultimo.ultimo_passo, true)
    assert.equal(ultimo.proximo_passo_visualizacoes, null)
    assert.equal(ultimo.avancos_estimados, 45)
    assert.equal(ultimo.abandonos_estimados, 15)
  })

  test('avancos_estimados nunca ultrapassa as visualizacoes do próprio passo (clamp defensivo)', () => {
    // Cenário improvável (mais visualização do próximo passo que do atual —
    // ex.: tour editado no meio da coleta de dados), mas nunca deveria sugerir
    // >100% de continuidade.
    const funil = montarFunilPorPasso(passos.slice(0, 2), { 0: 10, 1: 15 }, {}, 0)
    assert.equal(funil[0].avancos_estimados, 10)
    assert.equal(funil[0].abandonos_estimados, 0)
    assert.equal(funil[0].taxa_continuidade, 100)
  })

  test('passo sem nenhuma visualizacao => taxa_continuidade/taxa_queda null (evita divisão por zero)', () => {
    const funil = montarFunilPorPasso([passos[0]], {}, {}, 0)
    assert.equal(funil[0].visualizacoes, 0)
    assert.equal(funil[0].avancos_estimados, 0)
    assert.equal(funil[0].taxa_continuidade, null)
    assert.equal(funil[0].taxa_queda, null)
  })

  test('sem passos => funil vazio', () => {
    assert.deepEqual(montarFunilPorPasso([], {}, {}, 0), [])
  })
})

describe('montarResumoFeedback — agregação de feedback_tour por valor', () => {
  test('conta por valor e categoriza em positivos/neutros/negativos', () => {
    const resumo = montarResumoFeedback([
      { contexto: { feedback_valor: 'muito_util' } },
      { contexto: { feedback_valor: 'muito_util' } },
      { contexto: { feedback_valor: 'ajudou' } },
      { contexto: { feedback_valor: 'nao_ajudou' } },
    ])
    assert.equal(resumo.total, 4)
    assert.equal(resumo.positivos, 2)
    assert.equal(resumo.neutros, 1)
    assert.equal(resumo.negativos, 1)
    const muitoUtil = resumo.por_valor.find(v => v.valor === 'muito_util')
    assert.equal(muitoUtil?.total, 2)
    assert.equal(muitoUtil?.label, 'Muito útil')
    assert.equal(muitoUtil?.emoji, '🤩')
    assert.equal(muitoUtil?.categoria, 'positivo')
  })

  test('ignora eventos sem contexto, contexto malformado (array/string) ou feedback_valor desconhecido', () => {
    const resumo = montarResumoFeedback([
      { contexto: null },
      { contexto: 'string solta' },
      { contexto: [1, 2, 3] },
      { contexto: { feedback_valor: 'valor_que_nao_existe' } },
      { contexto: {} },
    ])
    assert.equal(resumo.total, 0)
    assert.deepEqual(resumo.por_valor, [])
  })

  test('nunca expõe outros campos do contexto — só valor/label/emoji/categoria/total agregados', () => {
    const resumo = montarResumoFeedback([
      { contexto: { feedback_valor: 'ajudou', usuario_email: 'pessoa@teste.com', cliente_nome: 'Cliente X' } },
    ])
    assert.equal(resumo.total, 1)
    assert.deepEqual(Object.keys(resumo.por_valor[0]).sort(), ['categoria', 'emoji', 'label', 'total', 'valor'])
  })

  test('sem eventos => tudo zero, por_valor vazio', () => {
    const resumo = montarResumoFeedback([])
    assert.equal(resumo.total, 0)
    assert.equal(resumo.positivos, 0)
    assert.equal(resumo.neutros, 0)
    assert.equal(resumo.negativos, 0)
    assert.deepEqual(resumo.por_valor, [])
  })
})

describe('montarWhereListaTours — filtros da listagem de Tours (GET /tours)', () => {
  test('sem filtro nenhum => where vazio (mesma consulta de sempre)', () => {
    assert.deepEqual(montarWhereListaTours({}), {})
  })

  test('status=ativos => where.ativo=true', () => {
    assert.deepEqual(montarWhereListaTours({ status: 'ativos' }), { ativo: true })
  })

  test('status=inativos => where.ativo=false', () => {
    assert.deepEqual(montarWhereListaTours({ status: 'inativos' }), { ativo: false })
  })

  test('status=todos (ou qualquer outro valor) => sem where.ativo, igual a "sem filtro"', () => {
    assert.deepEqual(montarWhereListaTours({ status: 'todos' }), {})
    assert.deepEqual(montarWhereListaTours({ status: 'qualquer-coisa' }), {})
  })

  test('sistema preenchido => match exato, trimado', () => {
    assert.deepEqual(montarWhereListaTours({ sistema: '  crm  ' }), { sistema: 'crm' })
  })

  test('sistema só com espaços => tratado como ausente', () => {
    assert.deepEqual(montarWhereListaTours({ sistema: '   ' }), {})
  })

  test('busca preenchida => OR contains/insensitive em titulo, sistema, slug e tela', () => {
    const where = montarWhereListaTours({ busca: 'agenda' })
    assert.deepEqual(where, {
      OR: [
        { titulo: { contains: 'agenda', mode: 'insensitive' } },
        { sistema: { contains: 'agenda', mode: 'insensitive' } },
        { slug: { contains: 'agenda', mode: 'insensitive' } },
        { tela: { contains: 'agenda', mode: 'insensitive' } },
      ],
    })
  })

  test('busca é trimada antes de virar o termo de busca', () => {
    const where = montarWhereListaTours({ busca: '  agenda  ' })
    assert.equal((where.OR as Array<{ titulo: { contains: string } }>)[0].titulo.contains, 'agenda')
  })

  test('busca só com espaços => tratada como ausente (sem where.OR)', () => {
    assert.deepEqual(montarWhereListaTours({ busca: '   ' }), {})
  })

  test('busca + sistema combinados => filtros presentes juntos (AND implícito)', () => {
    const where = montarWhereListaTours({ busca: 'agenda', sistema: 'crm' })
    assert.equal(where.sistema, 'crm')
    assert.ok(Array.isArray(where.OR))
  })

  test('busca + sistema + status combinados => todos os filtros presentes juntos (AND implícito)', () => {
    const where = montarWhereListaTours({ busca: 'agenda', sistema: 'crm', status: 'ativos' })
    assert.equal(where.ativo, true)
    assert.equal(where.sistema, 'crm')
    assert.ok(Array.isArray(where.OR))
  })
})

describe('validarPassos — regra "seletor obrigatório só pra ativar" (Tour.ativo controla o uso autônomo)', () => {
  const PASSO_OK = { titulo: 'Passo 1', seletor: '[data-cy="botao"]' }
  const PASSO_SEM_SELETOR = { titulo: 'Passo 1' }
  const PASSO_SEM_TITULO = { seletor: '[data-cy="botao"]' }

  test('lista vazia ou não-array => erro, mesmo com exigirSeletor=false (rascunho precisa de ao menos 1 passo)', () => {
    assert.equal(validarPassos([], false).erro, 'O tour precisa ter ao menos um passo.')
    assert.equal(validarPassos(undefined, false).erro, 'O tour precisa ter ao menos um passo.')
  })

  test('título é sempre obrigatório, independente de exigirSeletor', () => {
    assert.match(validarPassos([PASSO_SEM_TITULO], false).erro!, /título é obrigatório/)
    assert.match(validarPassos([PASSO_SEM_TITULO], true).erro!, /título é obrigatório/)
  })

  test('exigirSeletor=false (tour ainda rascunho) => passo sem seletor é aceito', () => {
    const r = validarPassos([PASSO_SEM_SELETOR], false)
    assert.equal(r.erro, null)
    assert.equal(r.lista.length, 1)
  })

  test('exigirSeletor=true (ativando o tour) => passo sem seletor bloqueia', () => {
    const r = validarPassos([PASSO_SEM_SELETOR], true)
    assert.match(r.erro!, /seletor\/data-cy informado/)
    assert.deepEqual(r.lista, [])
  })

  test('exigirSeletor=true com todos os passos preenchidos => sem erro', () => {
    const r = validarPassos([PASSO_OK, { titulo: 'Passo 2', seletor: '#outro' }], true)
    assert.equal(r.erro, null)
    assert.equal(r.lista.length, 2)
  })

  test('modo de avanço com confirmação exige seletor_confirmacao só quando exigirSeletor=true', () => {
    const passoSemConfirmacao = { ...PASSO_OK, modo_avanco_interacao: 'ao_aparecer_elemento' }
    assert.equal(validarPassos([passoSemConfirmacao], false).erro, null)
    assert.match(validarPassos([passoSemConfirmacao], true).erro!, /seletor de confirmação/)
  })
})

describe('normalizarPaginacaoTours — clamp de page/pageSize da listagem de Tours', () => {
  test('sem page nem pageSize => padrão (page=1, perPage=10)', () => {
    assert.deepEqual(normalizarPaginacaoTours(undefined, undefined), { page: 1, perPage: 10 })
  })

  test('page e pageSize numéricos válidos são usados como vieram', () => {
    assert.deepEqual(normalizarPaginacaoTours('3', '25'), { page: 3, perPage: 25 })
  })

  test('pageSize acima de 100 é limitado a 100 (evita payload gigante)', () => {
    assert.deepEqual(normalizarPaginacaoTours('1', '9999'), { page: 1, perPage: 100 })
  })

  test('page <= 0 ou não numérica cai pra 1', () => {
    assert.equal(normalizarPaginacaoTours('0', '10').page, 1)
    assert.equal(normalizarPaginacaoTours('-5', '10').page, 1)
    assert.equal(normalizarPaginacaoTours('abc', '10').page, 1)
    assert.equal(normalizarPaginacaoTours(undefined, '10').page, 1)
  })

  test('pageSize 0/não-numérico cai pro padrão (10); negativo só é limitado ao mínimo (1)', () => {
    // 0 e NaN são falsy em JS => o "|| PADRAO" pega os dois. Negativo é
    // truthy (não entra no "||"), então só desce até o mínimo de 1 — mesmo
    // comportamento (não é bug) já usado em per_page de buscarDashboard.
    assert.equal(normalizarPaginacaoTours('1', '0').perPage, 10)
    assert.equal(normalizarPaginacaoTours('1', 'abc').perPage, 10)
    assert.equal(normalizarPaginacaoTours('1', '-5').perPage, 1)
  })

  test('valores fracionários são truncados', () => {
    assert.deepEqual(normalizarPaginacaoTours('2.9', '15.9'), { page: 2, perPage: 15 })
  })
})

// ─── O que ficou fora deste arquivo, e por quê ─────────────────────────────
// criar()/atualizar()/duplicar()/exportar()/importar() em si (efeito de
// verdade no banco: "salva null", "PUT sem campo preserva", "PUT null limpa",
// "duplicar copia segmentacao_regras", ativo real gravado/lido, rascunho por
// padrão em criar/duplicar/importar) não têm teste automatizado aqui — o
// projeto não tem infraestrutura de teste de integração HTTP+banco (sem
// supertest, sem banco de teste isolado, sem mock de Prisma; o único padrão
// de teste existente, mesmo antes desta feature, é função pura via
// node:test). Montar essa infraestrutura do zero só para estes fluxos seria
// a "improvisação grande" que a tarefa pediu para evitar. Esses fluxos foram
// validados manualmente contra o servidor local real (curl) antes deste
// commit: criar sem/com segmentação, PUT preservando/limpando, regra
// inválida → 400, criar/duplicar/importar nascendo inativos, PUT ativando com
// passo sem seletor bloqueando (400) e liberando quando todos têm seletor,
// bloqueio de plano/limite ao ativar — e cada um deles depende SOMENTE de
// validarSegmentacaoRegras/validarPassos (ambas testadas acima) + guards de
// tenantGuards.ts (motivoBloqueioAtivacao delega pra motivoBloqueioEscrita,
// já testada em tenantGuards.test.ts; motivoRecursoNaoPermitido/
// checarLimiteToursAtivos são triviais/dependem de Prisma) + um repasse
// direto pro Prisma sem lógica própria adicional — ver criar()/atualizar()
// em tours.ts.
//
// buscarDashboard (a rota em si — groupBy por passo_ordem, o findMany de
// feedback_tour, e principalmente se os filtros de período/tour/cliente/
// usuário/unidade/busca são de fato respeitados pelo funil e pelo resumo de
// feedback) também não tem teste automatizado, pela mesma razão: exigiria
// banco real (Prisma.groupBy não é mockável sem infraestrutura própria pra
// isso). montarFunilPorPasso/montarResumoFeedback (testadas acima) são TODA a
// lógica de agregação da rota — o resto é busca (já filtrada por whereComum,
// os mesmos filtros já usados pelos 4 cards existentes) + repasse dos
// resultados pras duas funções. Validado manualmente contra o servidor local
// real (ver passo a passo da entrega desta tarefa): Tour de 3 passos,
// eventos de passo_visualizado/elemento_nao_encontrado/concluido/
// feedback_tour gerados via curl, funil e resumo de feedback conferidos no
// Dashboard, e os mesmos filtros de período/cliente/usuário/unidade já
// existentes aplicados sobre o funil.
//
// listar (GET /tours com paginação server-side) segue o mesmo padrão:
// montarWhereListaTours/normalizarPaginacaoTours (testadas acima) são toda a
// lógica própria da rota — o resto é skip/take/count/distinct direto no
// Prisma, sem nenhum branching adicional que valha a pena testar sem banco
// real. O ramo de compatibilidade (sem page/pageSize, devolve array puro) e o
// ramo paginado (com resumo/sistemas) foram validados manualmente contra o
// servidor local real (curl): contagem/total/total_pages batendo com o
// esperado, busca por título/sistema/slug/tela funcionando, status
// ativos/inativos filtrando corretamente, resumo (KPIs) sempre refletindo a
// base inteira independente dos filtros aplicados, e — o mais importante —
// GET /tours sem parâmetro nenhum continuando a devolver o array de sempre
// (conferido especificamente porque web/src/pages/Dashboard.tsx e
// web/src/pages/jornadas/Form.tsx dependem desse formato e não foram
// tocados nesta tarefa).

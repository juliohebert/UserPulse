import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validarSegmentacaoRegras, montarFunilPorPasso, montarResumoFeedback } from './tours'

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

// ─── O que ficou fora deste arquivo, e por quê ─────────────────────────────
// criar()/atualizar()/duplicar()/exportar()/importar() em si (efeito de
// verdade no banco: "salva null", "PUT sem campo preserva", "PUT null limpa",
// "duplicar copia segmentacao_regras") não têm teste automatizado aqui — o
// projeto não tem infraestrutura de teste de integração HTTP+banco (sem
// supertest, sem banco de teste isolado, sem mock de Prisma; o único padrão
// de teste existente, mesmo antes desta feature, é função pura via
// node:test). Montar essa infraestrutura do zero só para estes fluxos seria
// a "improvisação grande" que a tarefa pediu para evitar. Esses fluxos foram
// validados manualmente contra o servidor local real (curl) antes deste
// commit: criar sem/com segmentação, PUT preservando/limpando, regra
// inválida → 400 — e cada um deles depende SOMENTE de validarSegmentacaoRegras
// (testada acima) + um repasse direto pro Prisma sem lógica própria — ver
// criar()/atualizar() em tours.ts, onde o único branching é
// `listaSegmentacao ?? Prisma.DbNull` / `...(listaSegmentacao && {...})`.
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

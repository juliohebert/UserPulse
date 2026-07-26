import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validarSegmentacaoRegras } from './tours'

// validarSegmentacaoRegras é a única peça de lógica de Segmentação de Tours
// que vive no backend — decide o que criar()/atualizar()/importar() persistem
// e quando cada um deles responde 400. Testada como função pura, sem HTTP nem
// banco (mesmo padrão de widget.test.ts). O restante do fluxo de
// criar/atualizar/duplicar/exportar/importar em torno dela é só "passar o
// resultado adiante pro Prisma" (sem lógica própria de segmentação) — ver
// nota no final do arquivo sobre por que esses fluxos não ganharam teste de
// integração aqui.

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

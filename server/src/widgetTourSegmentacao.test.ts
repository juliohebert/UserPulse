import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// widget.js é um script de navegador (IIFE, sem module.exports) — não dá pra
// importar normalmente. Carregado aqui via vm com stubs MÍNIMOS só pra
// terminar de parsear/executar o topo do arquivo; avaliarSegmentacaoTour é
// uma função pura (só lê os objetos `tour`/`config` recebidos como
// argumento, nunca toca em document/fetch/localStorage), então não precisa
// de DOM de verdade — nada aqui simula navegador ou depende de um.
// Exposta só para teste via window.UserPulse._internal (ver comentário em
// widget.js, ao lado de window.UserPulse.debugState).
type AvaliarSegmentacaoTour = (
  tour: { segmentacao_regras: unknown },
  config: { contexto?: Record<string, string> | null; usuario_id?: string; usuario_email?: string; sistema?: string; tela?: string }
) => { ok: boolean; motivo: string; regraFalhou: { campo: string; operador: string; valor_esperado: unknown; valor_recebido: unknown } | null }

let avaliarSegmentacaoTour: AvaliarSegmentacaoTour

before(() => {
  const codigo = fs.readFileSync(
    path.resolve(__dirname, '../../web/public/widget.js'),
    'utf8'
  )
  const sandbox: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    document: {
      currentScript: { src: 'http://localhost/widget.js' },
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener() {},
      removeEventListener() {},
    },
  }
  sandbox.window = {
    location: { search: '', href: 'http://localhost/', pathname: '/', hash: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
    history: { pushState() {}, replaceState() {} },
  }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  const UserPulse = (sandbox.window as { UserPulse?: { _internal?: { avaliarSegmentacaoTour?: AvaliarSegmentacaoTour } } }).UserPulse
  const fn = UserPulse?._internal?.avaliarSegmentacaoTour
  assert.equal(typeof fn, 'function', 'window.UserPulse._internal.avaliarSegmentacaoTour não foi exposta por widget.js')
  avaliarSegmentacaoTour = fn as AvaliarSegmentacaoTour
})

function tour(regras: unknown) {
  return { segmentacao_regras: regras }
}

// contexto = campos que só existem dentro de config.contexto (cliente_id,
// unidade_id, organizacao_id, clinica_id, usuario_tipo, Perfil, Estado);
// top = campos que vivem direto em config (usuario_id, usuario_email,
// sistema, tela) — mesma forma que normalizeConfig() produz em widget.js.
function config(contexto: Record<string, string> = {}, top: Record<string, string> = {}) {
  return { contexto, ...top }
}

describe('avaliarSegmentacaoTour (widget.js) — sem regras', () => {
  test('segmentacao_regras null => elegível ("sem_segmentacao")', () => {
    const r = avaliarSegmentacaoTour(tour(null), config())
    assert.equal(r.ok, true)
    assert.equal(r.motivo, 'sem_segmentacao')
    assert.equal(r.regraFalhou, null)
  })

  test('segmentacao_regras [] => elegível ("sem_segmentacao")', () => {
    const r = avaliarSegmentacaoTour(tour([]), config())
    assert.equal(r.ok, true)
    assert.equal(r.motivo, 'sem_segmentacao')
  })
})

describe('avaliarSegmentacaoTour (widget.js) — operador igual', () => {
  test('bate', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'estado', operador: 'igual', valor: 'RN' }]), config({ Estado: 'RN' }))
    assert.equal(r.ok, true)
    assert.equal(r.motivo, 'atendida')
  })

  test('não bate', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'estado', operador: 'igual', valor: 'RN' }]), config({ Estado: 'SP' }))
    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'bloqueado')
    assert.equal(r.regraFalhou?.campo, 'estado')
  })
})

describe('avaliarSegmentacaoTour (widget.js) — operador diferente', () => {
  test('bate (valores diferentes)', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'estado', operador: 'diferente', valor: 'RN' }]), config({ Estado: 'SP' }))
    assert.equal(r.ok, true)
  })

  test('não bate (mesmo valor)', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'estado', operador: 'diferente', valor: 'RN' }]), config({ Estado: 'RN' }))
    assert.equal(r.ok, false)
  })
})

describe('avaliarSegmentacaoTour (widget.js) — operador contem', () => {
  test('bate (substring)', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'tela', operador: 'contem', valor: 'agenda' }]), config({}, { tela: 'agenda-semanal' }))
    assert.equal(r.ok, true)
  })

  test('não bate', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'tela', operador: 'contem', valor: 'agenda' }]), config({}, { tela: 'financeiro' }))
    assert.equal(r.ok, false)
  })
})

describe('avaliarSegmentacaoTour (widget.js) — operador em_lista', () => {
  test('bate (valor presente na lista separada por vírgula)', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'cliente_id', operador: 'em_lista', valor: '111, 222, 333' }]), config({ cliente_id: '222' }))
    assert.equal(r.ok, true)
  })

  test('não bate (valor ausente da lista)', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'cliente_id', operador: 'em_lista', valor: '111, 222, 333' }]), config({ cliente_id: '999' }))
    assert.equal(r.ok, false)
  })

  test('espaços em volta de cada item da lista são ignorados', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'cliente_id', operador: 'em_lista', valor: '  111 ,222,  333  ' }]), config({ cliente_id: '333' }))
    assert.equal(r.ok, true)
  })
})

describe('avaliarSegmentacaoTour (widget.js) — comparação como string', () => {
  test('valor numérico no contexto casa com o mesmo valor em string na regra', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'cliente_id', operador: 'igual', valor: '123' }]), config({ cliente_id: '123' }))
    assert.equal(r.ok, true)
  })

  test('não há coerção numérica: "123" e "0123" são diferentes', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'cliente_id', operador: 'igual', valor: '123' }]), config({ cliente_id: '0123' }))
    assert.equal(r.ok, false)
  })
})

describe('avaliarSegmentacaoTour (widget.js) — campo ausente no contexto', () => {
  test('ausente + igual => bloqueia (não bate com nada)', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'estado', operador: 'igual', valor: 'RN' }]), config({}))
    assert.equal(r.ok, false)
  })

  test('ausente + contem => bloqueia', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'estado', operador: 'contem', valor: 'R' }]), config({}))
    assert.equal(r.ok, false)
  })

  test('ausente + em_lista => bloqueia', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'estado', operador: 'em_lista', valor: 'RN,SP' }]), config({}))
    assert.equal(r.ok, false)
  })

  test('ausente + diferente => libera (ausente é, por definição, diferente de qualquer valor esperado)', () => {
    const r = avaliarSegmentacaoTour(tour([{ campo: 'estado', operador: 'diferente', valor: 'RN' }]), config({}))
    assert.equal(r.ok, true)
  })
})

describe('avaliarSegmentacaoTour (widget.js) — múltiplas regras usam AND', () => {
  test('uma regra falhando bloqueia o conjunto inteiro', () => {
    const r = avaliarSegmentacaoTour(
      tour([
        { campo: 'estado', operador: 'igual', valor: 'RN' },
        { campo: 'cliente_id', operador: 'igual', valor: '999' },
      ]),
      config({ Estado: 'RN', cliente_id: '111' })
    )
    assert.equal(r.ok, false)
    // Reporta a PRIMEIRA regra que falhou, não avalia as seguintes.
    assert.equal(r.regraFalhou?.campo, 'cliente_id')
  })

  test('todas as regras batendo libera', () => {
    const r = avaliarSegmentacaoTour(
      tour([
        { campo: 'estado', operador: 'igual', valor: 'RN' },
        { campo: 'cliente_id', operador: 'igual', valor: '111' },
      ]),
      config({ Estado: 'RN', cliente_id: '111' })
    )
    assert.equal(r.ok, true)
    assert.equal(r.motivo, 'atendida')
  })
})

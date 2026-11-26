import { test, describe, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { passaSegmentacao, lerCampoContexto } from './controllers/widget'

// Missão 018 — contexto (perfil/Perfil, estado/Estado, usuario_tipo) entre o
// host, o widget REAL (widget.js via vm, fetch falso, sem banco/rede) e a
// avaliação de segmentação do backend (passaSegmentacao). O widget serializa o
// contexto em /api/widget/candidatas; o teste lê esses parâmetros e os passa
// ao filtro real do backend, cobrindo o caminho completo.

type UP = {
  init: (c: Record<string, unknown>) => void
  updateContext: (c: Record<string, unknown>) => void
}
let UserPulse: UP
let urls: string[] = []
let seq = 0
const tick = () => new Promise<void>(r => setTimeout(r, 0))

before(() => {
  const codigo = fs.readFileSync(path.resolve(__dirname, '../../web/public/widget.js'), 'utf8')
  const sandbox: Record<string, unknown> = {
    console, URL, URLSearchParams,
    history: { pushState() {}, replaceState() {} },
    fetch: (url: string) => {
      urls.push(url)
      if (url.indexOf('/api/widget/candidatas') !== -1) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      return Promise.resolve({ ok: false, status: 404 })
    },
    document: {
      currentScript: { src: 'http://localhost/widget.js' },
      getElementById: () => null,
      createElement: () => ({ style: {}, addEventListener() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [] }),
      querySelectorAll: () => [], querySelector: () => null,
      addEventListener() {}, removeEventListener() {},
      body: { appendChild() {}, style: {} }, head: { appendChild() {} },
      documentElement: { style: { removeProperty() {}, setProperty() {} } },
    },
  }
  sandbox.window = {
    location: { pathname: '/app/home', href: 'http://localhost/app/home', search: '', hash: '', hostname: 'ng.quarkclinic.com.br' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {},
    history: { pushState() {}, replaceState() {} },
    setTimeout: () => 0, clearTimeout() {}, scrollTo() {},
    requestAnimationFrame: (cb: () => void) => { cb(); return 0 },
    CSS: { escape: (v: string) => v }, navigator: { userAgent: 'node:test' }, innerWidth: 1024, pageYOffset: 0,
  }
  vm.createContext(sandbox)
  vm.runInContext(codigo, sandbox, { filename: 'widget.js' })
  UserPulse = (sandbox.window as { UserPulse: UP }).UserPulse
})

beforeEach(() => { urls = [] })

// Última chamada a /api/widget/candidatas -> parâmetros.
function ultimaCandidatas(): URLSearchParams {
  const u = urls.filter(x => x.indexOf('/api/widget/candidatas') !== -1).pop()
  assert.ok(u, 'nenhuma chamada a /api/widget/candidatas')
  return new URL(u!, 'http://x').searchParams
}
async function iniciar(config: Record<string, unknown>) {
  UserPulse.init({ public_key: 'pk_tenant_a', sistema: 'erp', tela: 'home', usuario_id: 'u-' + (++seq), ...config })
  for (let i = 0; i < 6; i++) await tick()
}
function ctxDe(p: URLSearchParams) {
  return {
    perfil: p.get('perfil') ?? undefined,
    usuario_tipo: p.get('usuario_tipo') ?? undefined,
    estado: p.get('estado') ?? undefined,
  }
}

const SEG = {
  segmentar_cliente_ids: [] as string[], segmentar_unidade_ids: [] as string[],
  segmentar_perfis: ['ADMINISTRADOR', 'PROFISSIONAL_SAUDE', 'GERENTE'],
  segmentar_usuario_tipos: [] as string[], segmentar_estados: [] as string[],
}

describe('widget real — serialização de perfil/estado/usuario_tipo', () => {
  test('1/4 minúsculas (contrato documentado): perfil e estado chegam ao backend', async () => {
    await iniciar({ perfil: 'ADMINISTRADOR', estado: 'RN' })
    const p = ultimaCandidatas()
    assert.equal(p.get('perfil'), 'ADMINISTRADOR')
    assert.equal(p.get('estado'), 'RN')
  })
  test('2/5 maiúsculas (contrato legado): Perfil e Estado continuam funcionando', async () => {
    await iniciar({ Perfil: 'ADMINISTRADOR', Estado: 'RN' })
    const p = ultimaCandidatas()
    assert.equal(p.get('perfil'), 'ADMINISTRADOR')
    assert.equal(p.get('estado'), 'RN')
  })
  test('3 usuario_tipo preservado', async () => {
    await iniciar({ usuario_tipo: 'ADMINISTRADOR' })
    assert.equal(ultimaCandidatas().get('usuario_tipo'), 'ADMINISTRADOR')
  })
  test('6 valores com espaços são aparados', async () => {
    await iniciar({ perfil: '  PROFISSIONAL_SAUDE ', estado: ' rn ', usuario_tipo: ' GERENTE ' })
    const p = ultimaCandidatas()
    assert.equal(p.get('perfil'), 'PROFISSIONAL_SAUDE')
    assert.equal(p.get('estado'), 'rn')
    assert.equal(p.get('usuario_tipo'), 'GERENTE')
  })
  test('ambos fornecidos: a forma canônica (Perfil/Estado) vence, sem duplicar', async () => {
    await iniciar({ perfil: 'GERENTE', Perfil: 'ADMINISTRADOR', estado: 'SP', Estado: 'RN' })
    const p = ultimaCandidatas()
    assert.deepEqual(p.getAll('perfil'), ['ADMINISTRADOR'])
    assert.deepEqual(p.getAll('estado'), ['RN'])
  })
  test('canônica vazia cai para a minúscula', async () => {
    await iniciar({ Perfil: '  ', perfil: 'GERENTE' })
    assert.equal(ultimaCandidatas().get('perfil'), 'GERENTE')
  })
  test('identificadores não são alterados', async () => {
    await iniciar({ cliente_id: ' 12 ', unidade_id: 'U-9', organizacao_id: 'o', clinica_id: 'c', perfil: 'GERENTE' })
    const p = ultimaCandidatas()
    assert.equal(p.get('cliente_id'), ' 12 ')
    assert.equal(p.get('unidade_id'), 'U-9')
  })
  test('7 updateContext (minúscula e maiúscula) substitui o valor anterior', async () => {
    await iniciar({ perfil: 'RECEPCIONISTA', estado: 'SP' })
    UserPulse.updateContext({ perfil: 'GERENTE', estado: 'RN' })
    for (let i = 0; i < 6; i++) await tick()
    let p = ultimaCandidatas()
    assert.equal(p.get('perfil'), 'GERENTE')
    assert.equal(p.get('estado'), 'RN')
    UserPulse.updateContext({ Perfil: 'ADMINISTRADOR' })
    for (let i = 0; i < 6; i++) await tick()
    p = ultimaCandidatas()
    assert.deepEqual(p.getAll('perfil'), ['ADMINISTRADOR'])
    assert.equal(p.get('estado'), 'RN') // não tocado
  })
  test('public_key do tenant acompanha a requisição (isolamento no backend)', async () => {
    await iniciar({ perfil: 'GERENTE' })
    assert.equal(ultimaCandidatas().get('public_key'), 'pk_tenant_a')
  })
})

describe('caminho completo: widget -> parâmetros -> passaSegmentacao', () => {
  for (const perfil of ['ADMINISTRADOR', 'PROFISSIONAL_SAUDE', 'GERENTE']) {
    test(`8 ${perfil} (enviado em minúscula pelo host) é elegível`, async () => {
      await iniciar({ perfil })
      assert.equal(passaSegmentacao(SEG, ctxDe(ultimaCandidatas())), true)
    })
  }
  test('8 perfil em maiúscula legada também é elegível', async () => {
    await iniciar({ Perfil: 'PROFISSIONAL_SAUDE' })
    assert.equal(passaSegmentacao(SEG, ctxDe(ultimaCandidatas())), true)
  })
  test('9 RECEPCIONISTA não é elegível', async () => {
    await iniciar({ perfil: 'RECEPCIONISTA' })
    assert.equal(passaSegmentacao(SEG, ctxDe(ultimaCandidatas())), false)
  })
  test('10 campanha sem segmentação continua elegível (com ou sem contexto)', async () => {
    const livre = { ...SEG, segmentar_perfis: [] as string[] }
    await iniciar({})
    assert.equal(passaSegmentacao(livre, ctxDe(ultimaCandidatas())), true)
    await iniciar({ perfil: 'QUALQUER' })
    assert.equal(passaSegmentacao(livre, ctxDe(ultimaCandidatas())), true)
  })
  test('11 perfil + estado combinados', async () => {
    const comb = { ...SEG, segmentar_estados: ['RN'] }
    await iniciar({ perfil: 'GERENTE', estado: 'RN' })
    assert.equal(passaSegmentacao(comb, ctxDe(ultimaCandidatas())), true)
    await iniciar({ perfil: 'GERENTE', estado: 'SP' })
    assert.equal(passaSegmentacao(comb, ctxDe(ultimaCandidatas())), false)
    await iniciar({ perfil: 'RECEPCIONISTA', estado: 'RN' })
    assert.equal(passaSegmentacao(comb, ctxDe(ultimaCandidatas())), false)
  })
  test('updateContext muda a elegibilidade de RECEPCIONISTA para GERENTE', async () => {
    await iniciar({ perfil: 'RECEPCIONISTA' })
    assert.equal(passaSegmentacao(SEG, ctxDe(ultimaCandidatas())), false)
    UserPulse.updateContext({ perfil: 'GERENTE' })
    for (let i = 0; i < 6; i++) await tick()
    assert.equal(passaSegmentacao(SEG, ctxDe(ultimaCandidatas())), true)
  })
})

describe('12 isolamento entre tenants (estático — sem banco)', () => {
  const fonte = fs.readFileSync(path.resolve(__dirname, 'controllers/widget.ts'), 'utf8')
  test('buscarCandidatas filtra por tenant_id resolvido a partir da public_key', () => {
    const trecho = fonte.slice(fonte.indexOf('export async function buscarCandidatas'))
    const ate = trecho.slice(0, trecho.indexOf('passaSegmentacao(c, ctx)'))
    assert.match(ate, /resolverTenantPublico\(public_key\)/)
    assert.match(ate, /tenant_id: resolucao\.tenantId/)
  })
  test('passaSegmentacao não conhece tenant: nunca amplia o que o tenant_id já restringiu', () => {
    assert.doesNotMatch(fonte.slice(fonte.indexOf('export function passaSegmentacao'), fonte.indexOf('// Filtro de /api/widget/candidatas')), /tenant/)
  })
})

describe('lerCampoContexto (track/conclusão no backend)', () => {
  test('aceita as duas grafias; canônica vence; trim; ignora não-objeto', () => {
    assert.equal(lerCampoContexto({ perfil: ' A ' }, 'perfil'), 'A')
    assert.equal(lerCampoContexto({ Perfil: 'B' }, 'perfil'), 'B')
    assert.equal(lerCampoContexto({ Perfil: 'B', perfil: 'A' }, 'perfil'), 'B')
    assert.equal(lerCampoContexto({ Estado: 'RN' }, 'estado'), 'RN')
    assert.equal(lerCampoContexto({ Perfil: '  ', perfil: 'A' }, 'perfil'), 'A')
    assert.equal(lerCampoContexto(null, 'perfil'), undefined)
    assert.equal(lerCampoContexto([], 'estado'), undefined)
  })
})

// Missão 019 — estrutura do script de integração do QuarkClinic:
//   Object.assign({ sistema: 'QuarkClinic', contexto: ctx }, ctx)
// ou seja, as propriedades vêm PLANAS (via Object.assign) e também aninhadas
// em `contexto`. O widget só lê as planas; o objeto aninhado é ignorado (não
// quebra nada e não sobrescreve as planas).
describe('integração QuarkClinic — Object.assign({sistema, contexto}, contexto)', () => {
  const contextoUserPulse = {
    cliente_id: '456', unidade_id: '789', perfil: 'PROFISSIONAL_SAUDE',
    usuario_tipo: 'PROFISSIONAL_SAUDE', estado: 'RN',
  }
  const configUserPulse = () => Object.assign({ sistema: 'QuarkClinic', contexto: contextoUserPulse }, contextoUserPulse)

  test('propriedades planas chegam à requisição de candidatas', async () => {
    await iniciar(configUserPulse())
    const p = ultimaCandidatas()
    assert.equal(p.get('sistema'), 'QuarkClinic')
    assert.equal(p.get('perfil'), 'PROFISSIONAL_SAUDE')
    assert.equal(p.get('estado'), 'RN')
    assert.equal(p.get('usuario_tipo'), 'PROFISSIONAL_SAUDE')
    assert.equal(p.get('cliente_id'), '456')
    assert.equal(p.get('unidade_id'), '789')
  })
  test('cada parâmetro aparece uma única vez (sem duplicar por causa do aninhado)', async () => {
    await iniciar(configUserPulse())
    const p = ultimaCandidatas()
    for (const k of ['perfil', 'estado', 'usuario_tipo', 'cliente_id', 'unidade_id']) assert.equal(p.getAll(k).length, 1, k)
  })
  test('o objeto aninhado `contexto` não sobrescreve as propriedades planas', async () => {
    await iniciar({ ...configUserPulse(), contexto: { perfil: 'RECEPCIONISTA', estado: 'SP' } })
    const p = ultimaCandidatas()
    assert.equal(p.get('perfil'), 'PROFISSIONAL_SAUDE')
    assert.equal(p.get('estado'), 'RN')
  })
  test('campanha por perfil/estado fica elegível para esse contexto e não para outro', async () => {
    const seg = { ...SEG, segmentar_estados: ['RN'] }
    await iniciar(configUserPulse())
    assert.equal(passaSegmentacao(seg, ctxDe(ultimaCandidatas())), true)
    await iniciar({ ...configUserPulse(), perfil: 'RECEPCIONISTA' })
    assert.equal(passaSegmentacao(seg, ctxDe(ultimaCandidatas())), false)
  })
})

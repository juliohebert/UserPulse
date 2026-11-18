import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import prisma from '../lib/prisma'
import { buscarCandidatas, registrarConfirmacao, registrarFeedback } from './widget'

// Regressão (Missão 003): com 'reexibir_a_cada_24h', fechar a campanha numa
// aba B não pode barrar com 409 o envio de feedback já iniciado na aba A.
// Prisma é STUBADO (sem banco, sem escrita) — o runner `node --test` roda cada
// arquivo em processo próprio, então o monkeypatch não vaza para outras suítes.

const p = prisma as any
type Chamada = { modelo: string; metodo: string; args: any }
let chamadas: Chamada[]
const H = 3_600_000

function stub(modelo: string, metodo: string, retorno: (a: any) => any) {
  p[modelo][metodo] = async (args: any) => { chamadas.push({ modelo, metodo, args }); return retorno(args) }
}
function res() {
  const r: any = { code: 200, status(c: number) { r.code = c; return r }, json(b: any) { r.body = b; return r } }
  return r
}

const CAMP = {
  id: 'c1', tenant_id: 'tenantA', status: 'ATIVA', sistema: 'erp',
  politica_reexibicao: 'reexibir_a_cada_24h', reexibir_apos_dias: null, intervalo_reexibicao_dias: null,
  exige_confirmacao_leitura: false, feedback_habilitado: true, tipo_avaliacao_feedback: 'nps',
  observacao_obrigatoria: false, encerrar_apos_evento: false, evento_conclusao: null, prioridade: 0, criado_em: new Date(),
  segmentar_cliente_ids: [], segmentar_unidade_ids: [], segmentar_perfis: [], segmentar_usuario_tipos: [], segmentar_estados: [], segmentar_dominios: [],
  destaques: [], conteudos: [],
  regras: [{ modo_identificacao: 'sistema_tela', tela: 'home', url_contem: null, data_cy: null, ordem: 0 }],
}

type Hist = { viz?: Date | null; fech?: Date | null; fb?: Date | null; conf?: Date | null }
// Histórico por usuário: só 'u1' tem registros; qualquer outro usuário vem vazio.
function prepararHistorico(h: Hist, camp: any = CAMP) {
  const agora = Date.now()
  const so = (d?: Date | null) => (d ? { criado_em: d, contexto: null } : null)
  stub('tenant', 'findUnique', () => ({ id: 'tenantA', status: 'ACTIVE', licenca_fim: null, trial_fim: null }))
  stub('campanha', 'findUnique', () => camp)
  stub('campanha', 'findMany', () => [camp])
  stub('campanhaDestaqueItem', 'findMany', () => [])
  stub('eventoCampanha', 'findFirst', (a: any) => {
    if (a.where.usuario_id !== 'u1') return null
    return so(a.where.tipo_evento === 'fechamento_manual' ? h.fech : h.viz)
  })
  stub('eventoCampanha', 'findMany', (a: any) => {
    if (a.where.usuario_id !== 'u1') return []
    const d = a.where.tipo_evento === 'fechamento_manual' ? h.fech : h.viz
    return d ? [{ criado_em: d, contexto: null }] : []
  })
  stub('feedback', 'findFirst', (a: any) => (a.where.usuario_id === 'u1' ? so(h.fb) : null))
  stub('feedback', 'findMany', (a: any) => (a.where.usuario_id === 'u1' && h.fb ? [{ criado_em: h.fb, contexto: null }] : []))
  stub('feedback', 'groupBy', () => [])
  stub('feedback', 'create', (a: any) => ({ id: 'f1', ...a.data }))
  stub('confirmacaoLeitura', 'findFirst', (a: any) => (a.where.usuario_id === 'u1' ? so(h.conf) : null))
  stub('confirmacaoLeitura', 'findMany', (a: any) => (a.where.usuario_id === 'u1' && h.conf ? [{ criado_em: h.conf, contexto: null }] : []))
  stub('confirmacaoLeitura', 'create', (a: any) => ({ id: 'cf1', ...a.data }))
  void agora
}

const enviarFeedback = async (usuario = 'u1') => {
  const r = res()
  await registrarFeedback({ body: { public_key: 'pk', campanha_id: 'c1', nota: 9, usuario_id: usuario, sistema: 'erp', tela: 'home' } } as any, r)
  return r
}
const candidatas = async (usuario = 'u1') => {
  const r = res()
  await buscarCandidatas({ query: { public_key: 'pk', sistema: 'erp', tela: 'home', usuario_id: usuario } } as any, r)
  return r
}
const consultouFechamento = () => chamadas.some(c => c.modelo === 'eventoCampanha' && c.args?.where?.tipo_evento === 'fechamento_manual')
const criouFeedback = () => chamadas.some(c => c.modelo === 'feedback' && c.metodo === 'create')

beforeEach(() => { chamadas = []; delete process.env.USERPULSE_ALWAYS_SHOW_USER_IDS })

describe('multi-aba: fechamento em B não barra o feedback iniciado em A (reexibir_a_cada_24h)', () => {
  test('A abriu (viz há 2h), B fechou há 5min -> envio da resposta em A é aceito (201), sem 409', async () => {
    prepararHistorico({ viz: new Date(Date.now() - 2 * H), fech: new Date(Date.now() - 5 * 60_000) })
    const r = await enviarFeedback()
    assert.equal(r.code, 201)
    assert.equal(criouFeedback(), true)
  })

  test('na validação da resposta o fechamento_manual nem é consultado', async () => {
    prepararHistorico({ viz: new Date(Date.now() - 2 * H), fech: new Date(Date.now() - 5 * 60_000) })
    await enviarFeedback()
    assert.equal(consultouFechamento(), false)
  })

  test('o MESMO fechamento continua bloqueando a EXIBIÇÃO por 24h (candidatas -> [])', async () => {
    prepararHistorico({ viz: new Date(Date.now() - 2 * H), fech: new Date(Date.now() - 5 * 60_000) })
    const r = await candidatas()
    assert.deepEqual(r.body, [])
    assert.equal(consultouFechamento(), true)
  })

  test('e libera a exibição quando o fechamento tem 24h exatas (+1ms)', async () => {
    prepararHistorico({ fech: new Date(Date.now() - 24 * H - 1) })
    const r = await candidatas()
    assert.equal(r.body.length, 1)
  })

  test('prevenção de resposta duplicada preservada: feedback já enviado há 2h -> 409', async () => {
    prepararHistorico({ fb: new Date(Date.now() - 2 * H) })
    const r = await enviarFeedback()
    assert.equal(r.code, 409)
    assert.equal(criouFeedback(), false)
  })

  test('feedback antigo (>24h) não bloqueia novo ciclo de resposta', async () => {
    prepararHistorico({ fb: new Date(Date.now() - 25 * H), fech: new Date(Date.now() - 5 * 60_000) })
    assert.equal((await enviarFeedback()).code, 201)
  })

  test('confirmação de leitura: fluxo próprio, sem verificarHistorico — fechamento em outra aba não interfere', async () => {
    prepararHistorico({ fech: new Date(Date.now() - 5 * 60_000) }, { ...CAMP, exige_confirmacao_leitura: true })
    const r = res()
    await registrarConfirmacao({ body: { public_key: 'pk', campanha_id: 'c1', usuario_id: 'u1' } } as any, r)
    assert.equal(r.code, 201)
    assert.equal(consultouFechamento(), false)
    const fonte = readFileSync(new URL('./widget.ts', import.meta.url), 'utf8')
    assert.equal((fonte.match(/await verificarHistorico\(/g) ?? []).length, 1, 'único call site: registrarFeedback')
  })
})

describe('isolamento preservado', () => {
  test('campanha de outro tenant -> 400 e nada é gravado', async () => {
    prepararHistorico({}, { ...CAMP, tenant_id: 'tenantB' })
    const r = await enviarFeedback()
    assert.equal(r.code, 400)
    assert.equal(criouFeedback(), false)
  })

  test('histórico de u1 (fechamento recente) não afeta u2 na exibição nem na resposta', async () => {
    prepararHistorico({ viz: new Date(Date.now() - 2 * H), fech: new Date(Date.now() - 5 * 60_000) })
    assert.equal((await candidatas('u2')).body.length, 1)
    assert.equal((await enviarFeedback('u2')).code, 201)
  })

  test('consultas de histórico seguem escopadas por campanha_id + usuario_id', async () => {
    prepararHistorico({ viz: new Date(Date.now() - 2 * H), fech: new Date(Date.now() - 5 * 60_000) })
    await candidatas()
    for (const c of chamadas.filter(x => x.modelo === 'eventoCampanha')) {
      assert.equal(c.args.where.campanha_id, 'c1')
      assert.equal(c.args.where.usuario_id, 'u1')
    }
  })
})

describe('políticas anteriores inalteradas na validação da resposta', () => {
  const comFechamentoRecente = { fech: new Date(Date.now() - 5 * 60_000) }

  test('uma_vez_apos_visualizacao: feedback já enviado -> 409; sem feedback -> 201; nunca consulta fechamento', async () => {
    const camp = { ...CAMP, politica_reexibicao: 'uma_vez_apos_visualizacao' }
    prepararHistorico({ ...comFechamentoRecente, fb: new Date(Date.now() - H) }, camp)
    assert.equal((await enviarFeedback()).code, 409)
    chamadas = []
    prepararHistorico({ ...comFechamentoRecente, viz: new Date(Date.now() - H) }, camp)
    assert.equal((await enviarFeedback()).code, 201)
    assert.equal(consultouFechamento(), false)
  })

  test('ate_responder_ou_confirmar: feedback já enviado -> 409; sem feedback -> 201', async () => {
    const camp = { ...CAMP, politica_reexibicao: 'ate_responder_ou_confirmar' }
    prepararHistorico({ ...comFechamentoRecente, fb: new Date(Date.now() - H) }, camp)
    assert.equal((await enviarFeedback()).code, 409)
    prepararHistorico({ ...comFechamentoRecente }, camp)
    assert.equal((await enviarFeedback()).code, 201)
  })

  test('reexibir_apos_dias=1: feedback há 2h -> 409; feedback há 24h -> 201 (semântica de dias intacta)', async () => {
    const camp = { ...CAMP, politica_reexibicao: 'reexibir_apos_dias', reexibir_apos_dias: 1 }
    prepararHistorico({ fb: new Date(Date.now() - 2 * H) }, camp)
    assert.equal((await enviarFeedback()).code, 409)
    prepararHistorico({ fb: new Date(Date.now() - 24 * H) }, camp)
    assert.equal((await enviarFeedback()).code, 201)
    assert.equal(consultouFechamento(), false)
  })
})

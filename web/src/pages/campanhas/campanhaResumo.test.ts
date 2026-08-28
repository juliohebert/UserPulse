import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Campanha } from '../../types'
import { montarResumoCampanha, type ResumoLinha } from './campanhaResumo'

// Só lógica pura (sem React/DB) — montarResumoCampanha transforma uma
// Campanha persistida em linhas + alertas do "revisar antes de publicar".

const AGORA = new Date('2026-06-15T12:00:00.000Z')
const FUTURO = '2026-09-01T12:00:00.000Z' // 09:00 em São Paulo
const FUTURO_FIM = '2026-10-01T21:00:00.000Z' // 18:00 em São Paulo
const PASSADO = '2026-01-10T12:00:00.000Z'

function campanha(over: Partial<Campanha> = {}): Campanha {
  return {
    id: 'c1', slug: 'c1', nome_interno: 'Interna', titulo: 'Título', subtitulo: null,
    descricao: 'Desc', tipo: 'comunicado', sistema: 'erp', tela: 'Home',
    imagem_url: null, video_url: null, texto_botao: null, url_botao: null,
    feedback_habilitado: false, modo_exibicao: 'modal_automatica',
    gatilho: 'ao_abrir_tela', evento: null, modo_identificacao: 'sistema_tela',
    data_cy: null, url_contem: null, atraso_ms: 800, mostrar_uma_vez: true,
    prioridade: 0, ordem: 1, status: 'RASCUNHO', data_inicio: null, data_fim: null,
    pergunta_feedback: null, observacao_obrigatoria: false,
    exige_confirmacao_leitura: false, permitir_fechar_modal: true,
    intervalo_reexibicao_dias: null, politica_reexibicao: 'uma_vez_apos_visualizacao',
    reexibir_apos_dias: null, encerrar_apos_evento: false, evento_conclusao: null,
    tipo_avaliacao_feedback: 'nps',
    segmentar_cliente_ids: [], segmentar_unidade_ids: [], segmentar_perfis: [],
    segmentar_usuario_tipos: [], segmentar_estados: [], segmentar_dominios: [],
    criado_em: '2026-06-01T00:00:00.000Z', atualizado_em: '2026-06-01T00:00:00.000Z',
    modo_navegacao: 'SCROLL',
    ...over,
  }
}

const r = (over: Partial<Campanha> = {}) => montarResumoCampanha(campanha(over), AGORA)
const linha = (linhas: ResumoLinha[], label: string) => linhas.find(l => l.label === label)?.valor
const temAlerta = (a: { texto: string }[], re: RegExp) => a.some(x => re.test(x.texto))

describe('montarResumoCampanha — linhas: labels fixos e ordem', () => {
  test('labels na ordem esperada, sem status/nome/título/mídia/atraso', () => {
    const { linhas } = r()
    assert.deepEqual(linhas.map(l => l.label), [
      'Formato', 'Conteúdos', 'Vigência', 'Destino', 'Segmentação', 'Domínios', 'Reexibição', 'Interação',
    ])
    for (const proibido of ['Situação', 'Status', 'Nome', 'Título', 'Descrição', 'Mídia', 'CTA', 'Atraso']) {
      assert.equal(linhas.some(l => l.label === proibido), false, proibido)
    }
  })
})

describe('Formato', () => {
  test('modal_automatica -> "Modal automática"', () => {
    assert.equal(linha(r().linhas, 'Formato'), 'Modal automática')
  })
  test('destaque_elemento -> "Destaque em elemento"', () => {
    assert.equal(linha(r({ modo_exibicao: 'destaque_elemento' }).linhas, 'Formato'), 'Destaque em elemento')
  })
})

describe('Conteúdos — 1/N + SCROLL/SLIDES', () => {
  test('sem conteudos (fallback legado) -> "1 conteúdo", sem navegação', () => {
    assert.equal(linha(r().linhas, 'Conteúdos'), '1 conteúdo')
  })
  test('1 conteúdo persistido -> "1 conteúdo", sem navegação (SLIDES irrelevante)', () => {
    const v = linha(r({ modo_navegacao: 'SLIDES', conteudos: [{ id: 'a', titulo: 'A', descricao: 'd', imagem_url: null, video_url: null, texto_botao: null, url_botao: null, ordem: 1 } as never] }).linhas, 'Conteúdos')
    assert.equal(v, '1 conteúdo')
  })
  test('N conteúdos + SCROLL -> "N conteúdos · Sequência (rolagem)"', () => {
    const conteudos = [1, 2, 3].map(i => ({ id: String(i), titulo: 't', descricao: 'd', imagem_url: null, video_url: null, texto_botao: null, url_botao: null, ordem: i }))
    assert.equal(linha(r({ modo_navegacao: 'SCROLL', conteudos: conteudos as never }).linhas, 'Conteúdos'), '3 conteúdos · Sequência (rolagem)')
  })
  test('N conteúdos + SLIDES -> "N conteúdos · Slides"', () => {
    const conteudos = [1, 2].map(i => ({ id: String(i), titulo: 't', descricao: 'd', imagem_url: null, video_url: null, texto_botao: null, url_botao: null, ordem: i }))
    assert.equal(linha(r({ modo_navegacao: 'SLIDES', conteudos: conteudos as never }).linhas, 'Conteúdos'), '2 conteúdos · Slides')
  })
  test('destaque_elemento -> conta destaques ativos', () => {
    const destaques = [
      { id: 'd1', ativo: true }, { id: 'd2', ativo: true }, { id: 'd3', ativo: false },
    ].map(d => ({ ...d, campanha_id: 'c1', ordem: 1, data_cy: 'x', texto_badge: null, titulo: 't', descricao: 'd', texto_botao: null, url_botao: null, criado_em: '', atualizado_em: '' }))
    assert.equal(linha(r({ modo_exibicao: 'destaque_elemento', destaques: destaques as never }).linhas, 'Conteúdos'), '2 destaques')
  })
  test('destaque_elemento sem relação carregada -> "1 destaque"', () => {
    assert.equal(linha(r({ modo_exibicao: 'destaque_elemento' }).linhas, 'Conteúdos'), '1 destaque')
  })
})

describe('Vigência — 4 cenários, America/Sao_Paulo', () => {
  test('sem início / sem fim', () => {
    assert.equal(linha(r().linhas, 'Vigência'), 'Publica ao ativar, sem data de término')
  })
  test('só início -> "Agendada para DD/MM/AAAA às HH:MM (SP), sem término"', () => {
    assert.equal(linha(r({ data_inicio: FUTURO }).linhas, 'Vigência'), 'Agendada para 01/09/2026 às 09:00, sem data de término')
  })
  test('só fim -> "Publica ao ativar, termina em …"', () => {
    assert.equal(linha(r({ data_fim: FUTURO_FIM }).linhas, 'Vigência'), 'Publica ao ativar, termina em 01/10/2026 às 18:00')
  })
  test('início + fim -> "De … até …"', () => {
    assert.equal(linha(r({ data_inicio: FUTURO, data_fim: FUTURO_FIM }).linhas, 'Vigência'), 'De 01/09/2026 às 09:00 até 01/10/2026 às 18:00')
  })
  test('valor date-only legado -> sem "às HH:MM"', () => {
    assert.equal(linha(r({ data_inicio: '2026-09-01' }).linhas, 'Vigência'), 'Agendada para 01/09/2026, sem data de término')
  })
})

describe('Destino — 4 tipos', () => {
  test('sistema_tela -> "Ao abrir a tela «X»"', () => {
    assert.equal(linha(r({ tela: 'Agenda' }).linhas, 'Destino'), 'Ao abrir a tela «Agenda»')
  })
  test('data_cy -> "Ao encontrar o elemento «X»"', () => {
    assert.equal(linha(r({ modo_identificacao: 'data_cy', data_cy: 'btn-x' }).linhas, 'Destino'), 'Ao encontrar o elemento «btn-x»')
  })
  test('url_contem -> "Na URL que contém «X»"', () => {
    assert.equal(linha(r({ modo_identificacao: 'url_contem', url_contem: '/app/x' }).linhas, 'Destino'), 'Na URL que contém «/app/x»')
  })
  test('apos_evento -> "Após o evento «X»"', () => {
    assert.equal(linha(r({ gatilho: 'apos_evento', evento: 'checkout' }).linhas, 'Destino'), 'Após o evento «checkout»')
  })
})

describe('Segmentação — 4 modos', () => {
  test('todos', () => {
    assert.equal(linha(r().linhas, 'Segmentação'), 'Todos os usuários elegíveis')
  })
  test('cliente', () => {
    assert.equal(linha(r({ segmentar_cliente_ids: ['a'] }).linhas, 'Segmentação'), 'Por cliente / unidade')
  })
  test('perfil', () => {
    assert.equal(linha(r({ segmentar_perfis: ['gestor'] }).linhas, 'Segmentação'), 'Por perfil / tipo de usuário / estado')
  })
  test('combinada', () => {
    assert.equal(linha(r({ segmentar_cliente_ids: ['a'], segmentar_estados: ['SP'] }).linhas, 'Segmentação'), 'Combinada (cliente + perfil)')
  })
})

describe('Domínios', () => {
  test('vazio -> "Todos os domínios"', () => {
    assert.equal(linha(r().linhas, 'Domínios'), 'Todos os domínios')
  })
  test('lista -> hostnames separados por vírgula', () => {
    assert.equal(linha(r({ segmentar_dominios: ['a.x.com', 'b.x.com'] }).linhas, 'Domínios'), 'a.x.com, b.x.com')
  })
})

describe('Reexibição', () => {
  test('uma_vez_apos_visualizacao -> "Uma vez por usuário"', () => {
    assert.equal(linha(r().linhas, 'Reexibição'), 'Uma vez por usuário')
  })
  test('ate_responder_ou_confirmar', () => {
    assert.equal(linha(r({ politica_reexibicao: 'ate_responder_ou_confirmar' }).linhas, 'Reexibição'), 'Até responder ou confirmar')
  })
  test('reexibir_apos_dias -> "A cada N dias"', () => {
    assert.equal(linha(r({ politica_reexibicao: 'reexibir_apos_dias', reexibir_apos_dias: 7 }).linhas, 'Reexibição'), 'A cada 7 dias')
  })
  test('reexibir_apos_dias com fallback intervalo_reexibicao_dias', () => {
    assert.equal(linha(r({ politica_reexibicao: 'reexibir_apos_dias', reexibir_apos_dias: null, intervalo_reexibicao_dias: 1 }).linhas, 'Reexibição'), 'A cada 1 dia')
  })
})

describe('Interação', () => {
  test('nada ligado -> "Apenas visualização"', () => {
    assert.equal(linha(r().linhas, 'Interação'), 'Apenas visualização')
  })
  test('feedback -> "Coleta feedback"', () => {
    assert.equal(linha(r({ feedback_habilitado: true }).linhas, 'Interação'), 'Coleta feedback')
  })
  test('feedback + observação obrigatória', () => {
    assert.equal(linha(r({ feedback_habilitado: true, observacao_obrigatoria: true }).linhas, 'Interação'), 'Coleta feedback (observação obrigatória)')
  })
  test('confirmação vence feedback quando as duas estão ligadas', () => {
    assert.equal(linha(r({ feedback_habilitado: true, exige_confirmacao_leitura: true }).linhas, 'Interação'), 'Confirmação de leitura obrigatória')
  })
})

describe('Prioridade — só quando > 0', () => {
  test('prioridade 0 -> linha ausente', () => {
    assert.equal(linha(r().linhas, 'Prioridade'), undefined)
  })
  test('prioridade 3 -> "Prioridade 3" (última linha)', () => {
    const { linhas } = r({ prioridade: 3 })
    assert.equal(linhas[linhas.length - 1].label, 'Prioridade')
    assert.equal(linhas[linhas.length - 1].valor, 'Prioridade 3')
  })
})

describe('Alertas', () => {
  test('campanha padrão -> só info "sem data de término" (nenhum aviso)', () => {
    const { alertas } = r()
    assert.equal(alertas.every(a => a.tipo === 'info'), true)
    assert.ok(temAlerta(alertas, /Sem data de término/))
    assert.equal(alertas.some(a => a.tipo === 'aviso'), false)
  })
  test('nenhum alerta "sem segmentação" é emitido (redundante com a linha Segmentação — removido na Etapa 3)', () => {
    assert.equal(temAlerta(r().alertas, /segmenta/i), false)
    assert.equal(temAlerta(r({ segmentar_perfis: ['g'] }).alertas, /segmenta/i), false)
    assert.equal(temAlerta(r({ segmentar_dominios: ['a.x.com'] }).alertas, /segmenta/i), false)
  })
  test('data_inicio no futuro -> info "Agendada"', () => {
    assert.ok(temAlerta(r({ data_inicio: FUTURO }).alertas.filter(a => a.tipo === 'info'), /Agendada/))
  })
  test('data_inicio no passado -> SEM alerta "Agendada"', () => {
    assert.equal(temAlerta(r({ data_inicio: PASSADO }).alertas, /Agendada/), false)
  })
  test('com data_fim -> SEM alerta "sem data de término"', () => {
    assert.equal(temAlerta(r({ data_fim: FUTURO_FIM }).alertas, /Sem data de término/), false)
  })
  test('modal obrigatória -> aviso', () => {
    const av = r({ permitir_fechar_modal: false, exige_confirmacao_leitura: true }).alertas.filter(a => a.tipo === 'aviso')
    assert.ok(temAlerta(av, /Modal obrigatória: o usuário não pode fechar/))
  })
  test('modal obrigatória em destaque_elemento -> NÃO gera o aviso (campo não se aplica)', () => {
    assert.equal(temAlerta(r({ modo_exibicao: 'destaque_elemento', permitir_fechar_modal: false }).alertas, /Modal obrigatória/), false)
  })
  test('config inconsistente: modal obrigatória sem feedback nem confirmação -> aviso', () => {
    assert.ok(temAlerta(r({ permitir_fechar_modal: false }).alertas, /exige feedback ou confirmação/))
  })
  test('config inconsistente: modal obrigatória + política "uma vez" -> aviso', () => {
    assert.ok(temAlerta(r({ permitir_fechar_modal: false, feedback_habilitado: true }).alertas, /não é compatível com modal obrigatória/))
  })
  test('config inconsistente: reexibir_apos_dias sem número -> aviso', () => {
    assert.ok(temAlerta(r({ politica_reexibicao: 'reexibir_apos_dias' }).alertas, /sem número de dias/))
  })
  test('reexibir_apos_dias com número válido -> sem aviso de "sem número"', () => {
    assert.equal(temAlerta(r({ politica_reexibicao: 'reexibir_apos_dias', reexibir_apos_dias: 5 }).alertas, /sem número de dias/), false)
  })
  test('info ≠ aviso: campanha "saudável" segmentada com término não gera aviso', () => {
    const { alertas } = r({ segmentar_perfis: ['g'], data_fim: FUTURO_FIM, feedback_habilitado: true })
    assert.equal(alertas.some(a => a.tipo === 'aviso'), false)
  })
})

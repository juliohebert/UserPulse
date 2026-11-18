import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { assinaturaRascunho, avisosQualidadeReferencias, resumoQualidadeTour, urlComTokenPreviewJornada, urlPermitidaNosDominios } from './jornadaForm.utils'
import type { Campanha, TourGuiado } from '../../types'

const tour = (patch: Partial<TourGuiado>): TourGuiado => ({
  id: 't1', slug: 'tour', titulo: 'Tour', descricao: null, sistema: 'app', modo_identificacao: 'sistema_tela',
  tela: null, data_cy: null, url_contem: null, prioridade: 0, ativo: false, permite_autonomo: false,
  permite_jornada: true, publico_geral: true, gatilhos: [], frequencia: 'uma_vez_por_usuario',
  frequencia_intervalo_dias: null, segmentacao_regras: null, criado_em: '', atualizado_em: '', ...patch,
})

describe('utilitários do formulário de Jornada', () => {
  test('detecta alterações no rascunho de forma determinística', () => {
    assert.equal(assinaturaRascunho({ titulo: 'A' }, []), assinaturaRascunho({ titulo: 'A' }, []))
    assert.notEqual(assinaturaRascunho({ titulo: 'A' }, []), assinaturaRascunho({ titulo: 'B' }, []))
  })

  test('restringe preview aos domínios configurados', () => {
    assert.equal(urlPermitidaNosDominios(new URL('https://app.exemplo.com/tela'), ['app.exemplo.com']), true)
    assert.equal(urlPermitidaNosDominios(new URL('https://outro.exemplo.com'), ['app.exemplo.com']), false)
    assert.equal(urlPermitidaNosDominios(new URL('https://qualquer.test'), []), true)
  })

  test('não inventa qualidade sem dados de seletores', () => {
    assert.equal(resumoQualidadeTour(tour({ _count: { passos: 0 } })), 'sem passos')
    assert.equal(resumoQualidadeTour(tour({ _count: { passos: 3, etapasJornada: 2 } })), '3 passo(s) · 2 uso(s)')
  })

  test('preserva rota e parâmetros do hash ao transportar o token de preview', () => {
    const url = urlComTokenPreviewJornada(new URL('https://app.exemplo.com/#/clientes/42?aba=dados'), 'token secreto/+')
    assert.equal(url.toString(), 'https://app.exemplo.com/#/clientes/42?aba=dados&userpulse_jornada_preview=token+secreto%2F%2B')
    assert.equal(url.search, '')
  })

  test('coloca o token somente no fragmento quando a URL não usa hash routing', () => {
    const url = urlComTokenPreviewJornada(new URL('https://app.exemplo.com/tela?origem=admin'), 'abc')
    assert.equal(url.toString(), 'https://app.exemplo.com/tela?origem=admin#?userpulse_jornada_preview=abc')
  })

  test('não bloqueia referências quando o catálogo é desconhecido', () => {
    const blocos = [{ etapas: [{ tipo: 'tour' as const, tour_id: 'tour-oculto', campanha_id: '' }] }]
    assert.deepEqual(avisosQualidadeReferencias(blocos, null, null), [])
    assert.equal(avisosQualidadeReferencias(blocos, [], null)[0], 'Pacote 1, etapa 1: o Tour selecionado não está disponível para Jornada.')
  })

  test('mantém validação de campanha quando o catálogo foi carregado', () => {
    const campanha = { id: 'c1', status: 'INATIVA' } as Campanha
    const blocos = [{ etapas: [{ tipo: 'campanha' as const, tour_id: '', campanha_id: 'c1' }] }]
    assert.equal(avisosQualidadeReferencias(blocos, null, [campanha])[0], 'Pacote 1, etapa 1: a Campanha selecionada não está ativa.')
  })
})

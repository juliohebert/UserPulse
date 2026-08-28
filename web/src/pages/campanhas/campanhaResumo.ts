import type { Campanha } from '../../types'
import {
  FORMATO_DESTAQUE_ELEMENTO,
  resolverModoSegmentacao,
  resolverTipoDestino,
  separarDataHora,
} from './campanhaForm.utils'

// Resumo "revisar antes de publicar" — função pura (sem React/import.meta)
// que transforma uma Campanha PERSISTIDA nas linhas de configuração + os
// alertas relevantes exibidos na página de preview. Mesmo motivo de
// dashboardBlocos.ts / campanhaForm.utils.ts serem puros: testável com
// node:test sem montar componentes.
//
// NÃO inclui: situação/status (já sai do StatusBadge no topo da página),
// nome interno / título / descrição / mídia / CTA (já aparecem na simulação
// visual logo acima), atraso_ms nem qualquer campo técnico. Reaproveita
// resolverTipoDestino / resolverModoSegmentacao / separarDataHora e as
// constantes já existentes. Nenhuma validação de negócio é reimplementada
// aqui além dos poucos alertas de config inconsistente que o backend também
// barra no publish — são acionáveis e evitam o usuário levar um 400.

export interface ResumoLinha {
  label: string
  valor: string
}

export interface ResumoAlerta {
  tipo: 'info' | 'aviso'
  texto: string
}

export interface ResumoCampanha {
  linhas: ResumoLinha[]
  alertas: ResumoAlerta[]
}

// "2026-09-01T12:00:00.000Z" -> "01/09/2026 às 09:00" (America/Sao_Paulo).
// Valor date-only legado ("2026-09-01") -> "01/09/2026" (sem hora).
function formatarMomentoSP(iso: string): string {
  const { data, hora } = separarDataHora(iso)
  if (!data) return iso
  const [ano, mes, dia] = data.split('-')
  const dataBr = `${dia}/${mes}/${ano}`
  return hora ? `${dataBr} às ${hora}` : dataBr
}

function linhaVigencia(c: Campanha): string {
  const temInicio = Boolean(c.data_inicio)
  const temFim = Boolean(c.data_fim)
  if (!temInicio && !temFim) return 'Publica ao ativar, sem data de término'
  if (temInicio && !temFim) return `Agendada para ${formatarMomentoSP(c.data_inicio as string)}, sem data de término`
  if (!temInicio && temFim) return `Publica ao ativar, termina em ${formatarMomentoSP(c.data_fim as string)}`
  return `De ${formatarMomentoSP(c.data_inicio as string)} até ${formatarMomentoSP(c.data_fim as string)}`
}

function linhaConteudos(c: Campanha): string {
  if (c.modo_exibicao === FORMATO_DESTAQUE_ELEMENTO) {
    const n = c.destaques ? c.destaques.filter(d => d.ativo).length || 1 : 1
    return n === 1 ? '1 destaque' : `${n} destaques`
  }
  const n = c.conteudos && c.conteudos.length > 0 ? c.conteudos.length : 1
  const base = n === 1 ? '1 conteúdo' : `${n} conteúdos`
  // Navegação SCROLL/SLIDES só faz diferença com 2+ conteúdos.
  if (n <= 1) return base
  return `${base} · ${c.modo_navegacao === 'SLIDES' ? 'Slides' : 'Sequência (rolagem)'}`
}

function linhaDestino(c: Campanha): string {
  switch (resolverTipoDestino(c)) {
    case 'data_cy':
      return c.data_cy ? `Ao encontrar o elemento «${c.data_cy}»` : 'Ao encontrar um elemento'
    case 'url':
      return c.url_contem ? `Na URL que contém «${c.url_contem}»` : 'Na URL configurada'
    case 'acao':
      return c.evento ? `Após o evento «${c.evento}»` : 'Após uma ação do sistema'
    default:
      return c.tela ? `Ao abrir a tela «${c.tela}»` : 'Ao abrir a tela'
  }
}

function linhaSegmentacao(c: Campanha): string {
  switch (resolverModoSegmentacao(c)) {
    case 'cliente': return 'Por cliente / unidade'
    case 'perfil': return 'Por perfil / tipo de usuário / estado'
    case 'combinada': return 'Combinada (cliente + perfil)'
    default: return 'Todos os usuários elegíveis'
  }
}

function linhaDominios(c: Campanha): string {
  return c.segmentar_dominios.length === 0
    ? 'Todos os domínios'
    : c.segmentar_dominios.join(', ')
}

function linhaReexibicao(c: Campanha): string {
  if (c.politica_reexibicao === 'ate_responder_ou_confirmar') return 'Até responder ou confirmar'
  if (c.politica_reexibicao === 'reexibir_apos_dias') {
    const dias = c.reexibir_apos_dias ?? c.intervalo_reexibicao_dias
    return dias && dias > 0 ? `A cada ${dias} dia${dias === 1 ? '' : 's'}` : 'Reexibir periodicamente'
  }
  return 'Uma vez por usuário'
}

function linhaInteracao(c: Campanha): string {
  // Mesma precedência do widget (renderModal): confirmação de leitura vence
  // feedback quando as duas estão ligadas.
  if (c.exige_confirmacao_leitura) return 'Confirmação de leitura obrigatória'
  if (c.feedback_habilitado) {
    return c.observacao_obrigatoria ? 'Coleta feedback (observação obrigatória)' : 'Coleta feedback'
  }
  return 'Apenas visualização'
}

function montarAlertas(c: Campanha, agora: Date): ResumoAlerta[] {
  const alertas: ResumoAlerta[] = []
  const modalObrigatoria = c.modo_exibicao !== FORMATO_DESTAQUE_ELEMENTO && c.permitir_fechar_modal === false

  // ── info ──
  // "Sem segmentação" foi removido de propósito: a linha "Segmentação: Todos
  // os usuários elegíveis" já comunica exatamente a mesma coisa (validação da
  // Etapa 2).
  if (c.data_inicio && new Date(c.data_inicio).getTime() > agora.getTime()) {
    alertas.push({ tipo: 'info', texto: 'Agendada: só começa a ser exibida na data e hora de início.' })
  }
  if (!c.data_fim) {
    alertas.push({ tipo: 'info', texto: 'Sem data de término: fica ativa até ser encerrada manualmente.' })
  }

  // ── aviso ──
  if (modalObrigatoria) {
    alertas.push({ tipo: 'aviso', texto: 'Modal obrigatória: o usuário não pode fechar sem responder ou confirmar.' })
  }
  // Configurações inconsistentes que o backend barra no publish — vale
  // sinalizar antes pra não levar um 400.
  if (modalObrigatoria && !c.feedback_habilitado && !c.exige_confirmacao_leitura) {
    alertas.push({ tipo: 'aviso', texto: 'Modal obrigatória exige feedback ou confirmação de leitura ativos.' })
  }
  if (modalObrigatoria && c.politica_reexibicao === 'uma_vez_apos_visualizacao') {
    alertas.push({ tipo: 'aviso', texto: 'Reexibição "uma vez por usuário" não é compatível com modal obrigatória.' })
  }
  if (
    c.politica_reexibicao === 'reexibir_apos_dias' &&
    !((c.reexibir_apos_dias ?? c.intervalo_reexibicao_dias ?? 0) > 0)
  ) {
    alertas.push({ tipo: 'aviso', texto: 'Reexibição periódica sem número de dias definido.' })
  }

  return alertas
}

export function montarResumoCampanha(campanha: Campanha, agora: Date = new Date()): ResumoCampanha {
  const linhas: ResumoLinha[] = [
    { label: 'Formato', valor: campanha.modo_exibicao === FORMATO_DESTAQUE_ELEMENTO ? 'Destaque em elemento' : 'Modal automática' },
    { label: 'Conteúdos', valor: linhaConteudos(campanha) },
    { label: 'Vigência', valor: linhaVigencia(campanha) },
    { label: 'Destino', valor: linhaDestino(campanha) },
    { label: 'Segmentação', valor: linhaSegmentacao(campanha) },
    { label: 'Domínios', valor: linhaDominios(campanha) },
    { label: 'Reexibição', valor: linhaReexibicao(campanha) },
    { label: 'Interação', valor: linhaInteracao(campanha) },
  ]
  if (campanha.prioridade > 0) {
    linhas.push({ label: 'Prioridade', valor: `Prioridade ${campanha.prioridade}` })
  }
  return { linhas, alertas: montarAlertas(campanha, agora) }
}

import type { Campanha, TipoEtapaJornada, TourGuiado } from '../../types'

interface BlocoComReferencias {
  etapas: Array<{
    tipo: TipoEtapaJornada
    tour_id: string
    campanha_id: string
  }>
}

export function assinaturaRascunho(form: unknown, blocos: unknown): string {
  return JSON.stringify({ form, blocos })
}

export function urlPermitidaNosDominios(url: URL, dominios: string[]): boolean {
  if (dominios.length === 0) return true
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  return dominios.some(dominio => hostname === dominio.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/:]/)[0].replace(/\.$/, ''))
}

export function urlComTokenPreviewJornada(alvo: URL, token: string): URL {
  const url = new URL(alvo.toString())
  const fragmento = url.hash.replace(/^#/, '')
  const separadorQuery = fragmento.indexOf('?')
  const rotaHash = separadorQuery === -1 ? fragmento : fragmento.slice(0, separadorQuery)
  const queryHash = separadorQuery === -1 ? '' : fragmento.slice(separadorQuery + 1)
  const paramsHash = new URLSearchParams(queryHash)
  paramsHash.set('userpulse_jornada_preview', token)
  url.hash = `${rotaHash}?${paramsHash.toString()}`
  return url
}

export function avisosQualidadeReferencias(
  blocos: BlocoComReferencias[],
  tours: TourGuiado[] | null,
  campanhas: Campanha[] | null,
): string[] {
  const avisos: string[] = []
  blocos.forEach((bloco, bi) => bloco.etapas.forEach((etapa, ei) => {
    const rotulo = `Pacote ${bi + 1}, etapa ${ei + 1}`
    if (tours !== null && etapa.tipo === 'tour' && etapa.tour_id) {
      const tour = tours.find(item => item.id === etapa.tour_id)
      const totalPassos = tour?._count?.passos ?? tour?.passos?.length
      if (!tour) avisos.push(`${rotulo}: o Tour selecionado não está disponível para Jornada.`)
      else if (totalPassos === 0) avisos.push(`${rotulo}: o Tour selecionado ainda não possui passos.`)
      else if (tour.passos?.some(passo => !passo.seletor.trim())) avisos.push(`${rotulo}: o Tour possui passo sem seletor.`)
    }
    if (campanhas !== null && etapa.tipo === 'campanha' && etapa.campanha_id) {
      const campanha = campanhas.find(item => item.id === etapa.campanha_id)
      if (!campanha || campanha.status !== 'ATIVA') avisos.push(`${rotulo}: a Campanha selecionada não está ativa.`)
    }
  }))
  return avisos
}

export function resumoQualidadeTour(tour: TourGuiado): string {
  const totalPassos = tour._count?.passos ?? tour.passos?.length
  if (totalPassos === 0) return 'sem passos'
  if (tour.passos?.some(passo => !passo.seletor.trim())) return 'com seletor pendente'
  const qualidade = tour.passos ? 'pronto para Jornada' : `${totalPassos ?? '?'} passo(s)`
  const usos = tour._count?.etapasJornada ?? 0
  return `${qualidade}${usos ? ` · ${usos} uso(s)` : ''}`
}

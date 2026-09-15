export const TIPOS_GATILHO_TOUR = [
  'entrada_tela', 'url', 'elemento', 'botao_ajuda', 'manual', 'evento',
] as const

export const FREQUENCIAS_TOUR = [
  'sempre', 'uma_vez_por_usuario', 'uma_vez_por_sessao', 'ate_concluir', 'intervalo_dias',
] as const

export type TipoGatilhoTour = typeof TIPOS_GATILHO_TOUR[number]
export type FrequenciaTour = typeof FREQUENCIAS_TOUR[number]

export interface GatilhoTour {
  tipo: TipoGatilhoTour
  tela?: string
  url_contem?: string
  seletor_tipo?: 'data_cy' | 'id' | 'css'
  seletor?: string
  evento?: string
}

export interface ConfiguracaoDistribuicaoTour {
  permite_autonomo: boolean
  permite_jornada: boolean
  publico_geral: boolean
  gatilhos: GatilhoTour[]
  frequencia: FrequenciaTour
  frequencia_intervalo_dias: number | null
  prioridade: number
}

const TIPOS_SELETOR = ['data_cy', 'id', 'css'] as const

function texto(v: unknown): string | undefined {
  const valor = typeof v === 'string' ? v.trim() : ''
  return valor || undefined
}

export function gatilhosLegados(modo: unknown, tela: unknown, dataCy: unknown, urlContem: unknown): GatilhoTour[] {
  const tipo = texto(modo)
  if (tipo === 'data_cy') {
    const seletor = texto(dataCy)
    return seletor ? [{ tipo: 'elemento', seletor_tipo: 'data_cy', seletor }] : []
  }
  if (tipo === 'url_contem') {
    const url_contem = texto(urlContem)
    return url_contem ? [{ tipo: 'url', url_contem }] : []
  }
  const telaTexto = texto(tela)
  return telaTexto ? [{ tipo: 'entrada_tela', tela: telaTexto }] : []
}

export function validarGatilhosTour(valor: unknown): { erro: string | null; lista: GatilhoTour[] } {
  if (!Array.isArray(valor)) return { erro: 'gatilhos deve ser uma lista.', lista: [] }
  const lista: GatilhoTour[] = []
  for (const [i, bruto] of valor.entries()) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
      return { erro: `Gatilho ${i + 1}: configuração inválida.`, lista: [] }
    }
    const item = bruto as Record<string, unknown>
    const tipo = texto(item.tipo)
    if (!tipo || !TIPOS_GATILHO_TOUR.includes(tipo as TipoGatilhoTour)) {
      return { erro: `Gatilho ${i + 1}: tipo inválido.`, lista: [] }
    }
    const gatilho: GatilhoTour = { tipo: tipo as TipoGatilhoTour }
    if (tipo === 'entrada_tela') gatilho.tela = texto(item.tela)
    if (tipo === 'url') gatilho.url_contem = texto(item.url_contem)
    if (tipo === 'elemento') {
      const seletor_tipo = texto(item.seletor_tipo)
      gatilho.seletor_tipo = TIPOS_SELETOR.includes(seletor_tipo as typeof TIPOS_SELETOR[number])
        ? seletor_tipo as GatilhoTour['seletor_tipo'] : undefined
      gatilho.seletor = texto(item.seletor)
    }
    if (tipo === 'evento') gatilho.evento = texto(item.evento)
    if (tipo === 'entrada_tela' && !gatilho.tela) return { erro: `Gatilho ${i + 1}: tela é obrigatória.`, lista: [] }
    if (tipo === 'url' && !gatilho.url_contem) return { erro: `Gatilho ${i + 1}: url_contem é obrigatório.`, lista: [] }
    if (tipo === 'elemento' && (!gatilho.seletor_tipo || !gatilho.seletor)) return { erro: `Gatilho ${i + 1}: seletor_tipo e seletor são obrigatórios.`, lista: [] }
    if (tipo === 'evento' && !gatilho.evento) return { erro: `Gatilho ${i + 1}: evento é obrigatório.`, lista: [] }
    lista.push(gatilho)
  }
  return { erro: null, lista }
}

export function validarDistribuicaoTour(input: {
  permite_autonomo?: unknown
  permite_jornada?: unknown
  publico_geral?: unknown
  gatilhos?: unknown
  frequencia?: unknown
  frequencia_intervalo_dias?: unknown
  ativo?: unknown
  segmentacao_regras?: unknown
}, defaults?: Partial<ConfiguracaoDistribuicaoTour>): { erro: string | null; valor: ConfiguracaoDistribuicaoTour } {
  const permite_autonomo = input.permite_autonomo !== undefined ? Boolean(input.permite_autonomo) : (defaults?.permite_autonomo ?? false)
  const permite_jornada = input.permite_jornada !== undefined ? Boolean(input.permite_jornada) : (defaults?.permite_jornada ?? true)
  const publico_geral = input.publico_geral !== undefined ? Boolean(input.publico_geral) : (defaults?.publico_geral ?? true)
  const frequencia = (input.frequencia ?? defaults?.frequencia ?? 'uma_vez_por_usuario') as string
  const intervaloBruto = input.frequencia_intervalo_dias !== undefined ? input.frequencia_intervalo_dias : (defaults?.frequencia_intervalo_dias ?? null)
  const gatilhosResultado = input.gatilhos === undefined
    ? { erro: null, lista: defaults?.gatilhos ?? [] }
    : validarGatilhosTour(input.gatilhos)
  const valor = {
    permite_autonomo,
    permite_jornada,
    publico_geral,
    gatilhos: gatilhosResultado.lista,
    frequencia: frequencia as FrequenciaTour,
    frequencia_intervalo_dias: intervaloBruto == null ? null : Number(intervaloBruto),
    prioridade: defaults?.prioridade ?? 0,
  }
  if (!permite_autonomo && !permite_jornada) return { erro: 'Habilite pelo menos uma origem de execução.', valor }
  if (input.ativo === true && !permite_autonomo) return { erro: 'Tour ativo precisa permitir execução autônoma.', valor }
  if (gatilhosResultado.erro) return { erro: gatilhosResultado.erro, valor }
  if (!FREQUENCIAS_TOUR.includes(frequencia as FrequenciaTour)) return { erro: 'frequencia inválida.', valor }
  if (frequencia === 'intervalo_dias') {
    if (!Number.isInteger(valor.frequencia_intervalo_dias) || (valor.frequencia_intervalo_dias ?? 0) <= 0) return { erro: 'frequencia_intervalo_dias deve ser um inteiro positivo.', valor }
  } else if (valor.frequencia_intervalo_dias !== null) {
    return { erro: 'frequencia_intervalo_dias só pode ser informado com intervalo_dias.', valor }
  }
  const temSegmentacao = Array.isArray(input.segmentacao_regras) && input.segmentacao_regras.length > 0
  if (!publico_geral && !temSegmentacao) return { erro: 'Público segmentado exige regras de segmentação.', valor }
  if (publico_geral && temSegmentacao) return { erro: 'Público geral não pode ter regras de segmentação.', valor }
  if (permite_autonomo && input.ativo === true && valor.gatilhos.length === 0) return { erro: 'Execução autônoma ativa exige ao menos um gatilho.', valor }
  return { erro: null, valor }
}

export function gatilhoPermiteExecucao(gatilhos: unknown, tipo: TipoGatilhoTour): boolean {
  return Array.isArray(gatilhos) && gatilhos.some(g => g && typeof g === 'object' && (g as Record<string, unknown>).tipo === tipo)
}

export function validarContextoExecucaoTour(input: {
  origem: unknown
  gatilho: unknown
  ativo: boolean
  permite_autonomo: boolean
  permite_jornada: boolean
  gatilhos: unknown
}): string | null {
  if (input.origem === 'autonomo') {
    if (!input.ativo || !input.permite_autonomo) return 'Tour não está disponível para execução autônoma.'
    if (typeof input.gatilho !== 'string' || !TIPOS_GATILHO_TOUR.includes(input.gatilho as TipoGatilhoTour)) return 'gatilho inválido.'
    if (!gatilhoPermiteExecucao(input.gatilhos, input.gatilho as TipoGatilhoTour)) return 'Gatilho não configurado para este Tour.'
    return null
  }
  if (input.origem === 'jornada') {
    if (!input.permite_jornada) return 'Tour não está disponível para Jornada.'
    if (input.gatilho !== 'etapa_jornada') return 'Execução em Jornada exige gatilho etapa_jornada.'
    return null
  }
  return 'origem inválida.'
}

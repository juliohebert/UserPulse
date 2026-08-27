// Módulo isolado de propósito (nenhum import, mesmo padrão de
// campanhas/campanhaForm.ts) — CampanhaDashboard.tsx importa utils/campanha.ts,
// que usa import.meta.env (só existe sob o bundler do Vite/navegador), então
// qualquer lógica pura que precise ser testada via node:test (ver
// dashboardBlocos.test.ts) tem que morar fora do .tsx do componente.

export interface OpcaoFiltroEvento {
  value: string
  label: string
}

/** Conta dias civis entre limites ISO, interpretados no fuso do produto. */
export function diasCivisNoIntervalo(
  inicio: string | null | undefined,
  fim: string | null | undefined,
  timeZone = 'America/Sao_Paulo',
): number | null {
  if (!inicio || !fim) return null
  const formatador = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const dataCivil = (valor: string) => {
    const partes = formatador.formatToParts(new Date(valor))
    const ano = partes.find(p => p.type === 'year')?.value
    const mes = partes.find(p => p.type === 'month')?.value
    const dia = partes.find(p => p.type === 'day')?.value
    return Date.UTC(Number(ano), Number(mes) - 1, Number(dia))
  }
  const diferenca = Math.round((dataCivil(fim) - dataCivil(inicio)) / 86_400_000) + 1
  return Math.max(0, diferenca)
}

/** Retorna a variação percentual ou nulo quando não há base comparável. */
export function variacaoPercentual(atual: number, anterior: number | null | undefined): number | null {
  if (anterior === null || anterior === undefined || anterior === 0) return null
  return Math.round(((atual - anterior) / anterior) * 100)
}

// `key` identifica qual valor já calculado no componente entra em cada chip
// (ver valoresIndicadoresInteracoes em CampanhaDashboard.tsx) — este módulo
// só decide QUAIS chips e com QUE RÓTULO aparecem, nunca os valores em si
// (que dependem de estado local: período selecionado, dados carregados).
export interface IndicadorResumoDef {
  key: 'visualizacoes' | 'usuariosUnicos' | 'interacoes' | 'cliquesCta' | 'clicadoresUnicos' | 'dispensas' | 'taxaClique'
  label: string
}

// Fonte única de verdade de quais blocos do dashboard aparecem pra cada
// modo_exibicao — o dashboard fica CONTEXTUAL em destaque_elemento (feedback
// geral/NPS não existe nesse formato: sem "Respostas", sem Nota Média/NPS,
// sem funil, sem Resumo Promotores/Neutros/Detratores, sem Distribuição de
// notas). Nenhum desses blocos é removido do JSX de CampanhaDashboard.tsx —
// só deixam de renderizar quando este mapa diz `false`; pra qualquer outro
// modo_exibicao, o relatório tradicional continua 100% intacto. Centralizar
// aqui (em vez de espalhar `campanha.modo_exibicao === 'destaque_elemento'`
// em cada `{...&&}` do JSX) é o que torna essa regra testável sem precisar
// renderizar React.
export interface BlocosDashboard {
  kpiDestaque: boolean
  kpiFeedbackGeral: boolean
  // Impressões existem nos dois formatos; destaque_elemento só não usa o
  // funil Visualizações -> Respostas, que pertence ao feedback geral.
  graficoImpressoes: boolean
  funilEngajamento: boolean
  resumoNps: boolean
  distribuicaoNotas: boolean
  secaoRespostas: boolean
  desempenhoDestaques: boolean
  // Bloco "por conteúdo" (CampanhaConteudoItem) — mecanismo independente de
  // desempenhoDestaques, nunca os dois juntos: só aparece pra formato que
  // NÃO é destaque_elemento (destaque_elemento usa desempenhoDestaques).
  desempenhoConteudos: boolean
  // Sempre true pra destaque_elemento, mesmo sem nenhuma avaliação ainda —
  // a seção não deve sumir por quantidade zero (ver empty state no JSX).
  avaliacoesDestaques: boolean
  // Interações detalhadas continuam pros dois formatos — não é
  // condicionada por modo_exibicao, listada aqui só por completude.
  interacoesDetalhadas: boolean
  // Filtro "Destaque" e coluna "Destaque" na tabela de Interações — mesma
  // regra de destaque_elemento, aplicada aqui em vez de repetir a
  // comparação de modo_exibicao em cada ponto da seção Interações.
  filtroDestaque: boolean
  // Opções do filtro "Tipo" da seção Interações. interacao_badge/dispensa
  // (ver TIPOS_EVENTO_CAMPANHA em widget.ts) só existem de verdade pra
  // campanhas destaque_elemento — modal_automatica nunca gera esses 2
  // tipos de evento, então oferecê-los como filtro seria oferecer uma
  // opção que nunca traz resultado. Visualização/Clique CTA continuam
  // disponíveis pros dois formatos, exatamente como já eram.
  opcoesTipoEvento: OpcaoFiltroEvento[]
  // Chips-resumo acima da tabela de Interações. destaque_elemento troca pra
  // métricas de destaque (Interações/Dispensas em vez de Únicos/Clicadores
  // únicos/Taxa de clique); qualquer outro tipo preserva exatamente os 5
  // chips tradicionais.
  indicadoresInteracoes: IndicadorResumoDef[]
}

export function blocosDashboardVisiveis(modoExibicao: string): BlocosDashboard {
  const destaque = modoExibicao === 'destaque_elemento'
  const opcoesTipoEvento: OpcaoFiltroEvento[] = [
    { value: 'Todos', label: 'Todos' },
    { value: 'Visualização', label: 'Visualização' },
    { value: 'Clique', label: 'Clique CTA' },
  ]
  if (destaque) {
    opcoesTipoEvento.push(
      { value: 'Interação', label: 'Interação' },
      { value: 'Dispensa', label: 'Dispensa' },
    )
  }
  const indicadoresInteracoes: IndicadorResumoDef[] = destaque
    ? [
        { key: 'visualizacoes', label: 'Visualizações' },
        { key: 'interacoes', label: 'Interações' },
        { key: 'cliquesCta', label: 'Cliques CTA' },
        { key: 'dispensas', label: 'Dispensas' },
        { key: 'usuariosUnicos', label: 'Usuários únicos' },
      ]
    : [
        { key: 'visualizacoes', label: 'Visualizações' },
        { key: 'usuariosUnicos', label: 'Únicos' },
        { key: 'cliquesCta', label: 'Cliques CTA' },
        { key: 'clicadoresUnicos', label: 'Clicadores únicos' },
        { key: 'taxaClique', label: 'Taxa de clique' },
      ]
  return {
    kpiDestaque: destaque,
    kpiFeedbackGeral: !destaque,
    graficoImpressoes: true,
    funilEngajamento: !destaque,
    resumoNps: !destaque,
    distribuicaoNotas: !destaque,
    secaoRespostas: !destaque,
    desempenhoDestaques: destaque,
    desempenhoConteudos: !destaque,
    avaliacoesDestaques: destaque,
    interacoesDetalhadas: true,
    filtroDestaque: destaque,
    opcoesTipoEvento,
    indicadoresInteracoes,
  }
}

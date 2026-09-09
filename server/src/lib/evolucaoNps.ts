// ─── Evolução de NPS (Mensal | Trimestral | Anual) ────────────────────────
// Lógica pura da seção "Evolução de NPS" do dashboard da campanha — módulo
// pequeno e dedicado (mesmo padrão de outros helpers puros em server/src/lib),
// sem dependência de Prisma nem de Express. O controller (dashboard.ts) só
// orquestra: lê os parâmetros, roda o $queryRaw e chama montarEvolucaoNps.
//
// Modelo (decisão de produto): a seção mostra UM ano de referência por vez
// (default = ano atual em America/Sao_Paulo). A comparação é opcional e é
// sempre "ano de referência × outro ano", ALINHADA pelo mesmo sub-período
// (Jan×Jan, Q1×Q1, ano×ano) — nunca "período imediatamente anterior".
//
// A query devolve UMA granularidade fina (ano + mês + nota, com COUNT(*), em
// America/Sao_Paulo, já filtrada por tenant/tipo_avaliacao='nps'/nota 0–10/
// SUPER_USUARIO). Aqui só se filtra por ano, deriva-se trimestre a partir do
// mês (fonte única da regra mês→trimestre) e agrega-se as contagens CRUAS —
// nunca média de NPS de sub-períodos. Sem query nova: o mês corrente parcial
// é comparado contra o mês completo do ano anterior e sinalizado como
// `parcial` (a janela dia-a-dia exigiria granularidade de dia no SQL).

export type GranularidadeEvolucaoNps = 'mensal' | 'trimestral' | 'anual'

// Aceita o valor cru do query string (unknown): 'mensal'/'anual' selecionam o
// modo; qualquer outra coisa (inclusive ausência) cai em 'trimestral'.
export function normalizarGranularidadeEvolucaoNps(valor: unknown): GranularidadeEvolucaoNps {
  if (valor === 'mensal') return 'mensal'
  if (valor === 'anual') return 'anual'
  return 'trimestral'
}

// Ano vindo da query (string) — inteiro plausível ou null (ausente/inválido).
export function normalizarAnoEvolucaoNps(valor: unknown): number | null {
  const n = Number(valor)
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null
}

// null = nota fora da faixa NPS válida (0–10 inteiro) — defesa contra dado
// inconsistente; a query já filtra `nota IS NOT NULL AND nota BETWEEN 0 AND
// 10`, então na prática nunca ocorre.
export function classificarNotaNps(nota: number): 'promotor' | 'neutro' | 'detrator' | null {
  if (!Number.isInteger(nota) || nota < 0 || nota > 10) return null
  if (nota >= 9) return 'promotor'
  if (nota >= 7) return 'neutro'
  return 'detrator'
}

// Rótulo curto do mês em pt-BR (array fixo — determinístico, sem depender de
// Intl/locale do runtime). Índice 0 = janeiro.
const MESES_ABREV_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export interface EvolucaoNpsComparacao {
  ano: number
  // Rótulo do MESMO sub-período no ano comparado: "Mar/2025" / "Q1/2025" / "2025".
  label: string
  // 0 quando o ano comparado não tem respostas nesse sub-período.
  respostas: number
  // null quando respostas === 0 — ausência de dados NÃO é NPS 0.
  nps: number | null
  // nps(referência) − nps(comparado), em pontos. null se algum lado é null.
  variacao: number | null
}

export interface EvolucaoNpsPonto {
  // "2026-03" (mensal) / "2026-Q1" (trimestral) / "2026" (anual)
  bucket: string
  // Rótulo completo: "Mar/2026" / "Q1/2026" / "2026".
  label: string
  // Rótulo curto pro eixo X (o ano já está no cabeçalho): "Mar" / "Q1" / "2026".
  rotuloCurto: string
  respostas: number
  promotores: number
  neutros: number
  detratores: number
  // Sempre um número nos pontos emitidos (só se emite sub-período com dados).
  nps: number | null
  // true = este é o sub-período AINDA EM ANDAMENTO (só possível no ano
  // corrente). A comparação dele é contra o sub-período COMPLETO do ano
  // comparado — o frontend sinaliza isso.
  parcial: boolean
  // null quando não se pediu comparação.
  comparacao: EvolucaoNpsComparacao | null
}

export interface EvolucaoNpsResultado {
  granularidade: GranularidadeEvolucaoNps
  anoReferencia: number
  anoComparacao: number | null
  // Anos com pelo menos uma resposta NPS válida, mais recente primeiro.
  anosDisponiveis: number[]
  pontos: EvolucaoNpsPonto[]
}

interface OpcoesEvolucaoNps {
  anoReferencia: number
  anoComparacao: number | null
  // "Agora" em America/Sao_Paulo, resolvido pelo controller (mantém a função
  // pura/determinística nos testes).
  hoje: { ano: number; mes: number }
}

interface AggSub {
  respostas: number
  promotores: number
  neutros: number
  detratores: number
}

function npsDoAgg(agg: AggSub | undefined): number | null {
  if (!agg || agg.respostas <= 0) return null
  return Math.round((agg.promotores / agg.respostas) * 100) - Math.round((agg.detratores / agg.respostas) * 100)
}

export function montarEvolucaoNps(
  rows: Array<{ ano: number; mes: number; nota: number; quantidade: bigint | number }>,
  granularidade: GranularidadeEvolucaoNps,
  opcoes: OpcoesEvolucaoNps,
): EvolucaoNpsResultado {
  const anoReferencia = opcoes.anoReferencia
  // Nunca comparar um ano com ele mesmo.
  const anoComparacao = opcoes.anoComparacao !== null && opcoes.anoComparacao !== anoReferencia ? opcoes.anoComparacao : null
  const { hoje } = opcoes
  const trimestreAtual = Math.ceil(hoje.mes / 3)

  // Linhas válidas (nota na faixa, mês 1–12).
  const linhas = rows.filter(r => {
    const mes = Number(r.mes)
    return classificarNotaNps(Number(r.nota)) !== null && Number.isInteger(mes) && mes >= 1 && mes <= 12
  })

  const anosDisponiveis = [...new Set(linhas.map(r => Number(r.ano)))].sort((a, b) => b - a)

  // sub-chave: mensal = mês (1..12); trimestral = trimestre (1..4); anual = 0
  const subDe = (mes: number) => (granularidade === 'anual' ? 0 : granularidade === 'mensal' ? mes : Math.ceil(mes / 3))

  function agregarAno(ano: number): Map<number, AggSub> {
    const m = new Map<number, AggSub>()
    for (const row of linhas) {
      if (Number(row.ano) !== ano) continue
      const faixa = classificarNotaNps(Number(row.nota))!
      const sub = subDe(Number(row.mes))
      let agg = m.get(sub)
      if (!agg) {
        agg = { respostas: 0, promotores: 0, neutros: 0, detratores: 0 }
        m.set(sub, agg)
      }
      const q = Number(row.quantidade)
      agg.respostas += q
      if (faixa === 'promotor') agg.promotores += q
      else if (faixa === 'neutro') agg.neutros += q
      else agg.detratores += q
    }
    return m
  }

  const aggRef = agregarAno(anoReferencia)
  const aggComp = anoComparacao !== null ? agregarAno(anoComparacao) : null

  const rotular = (sub: number, ano: number): { bucket: string; label: string; rotuloCurto: string } => {
    if (granularidade === 'anual') return { bucket: `${ano}`, label: `${ano}`, rotuloCurto: `${ano}` }
    if (granularidade === 'mensal') {
      const nome = MESES_ABREV_PT[sub - 1]
      return { bucket: `${ano}-${String(sub).padStart(2, '0')}`, label: `${nome}/${ano}`, rotuloCurto: nome }
    }
    return { bucket: `${ano}-Q${sub}`, label: `Q${sub}/${ano}`, rotuloCurto: `Q${sub}` }
  }

  // Sub-períodos exibidos: só os que têm dados no ano de referência; no ano
  // corrente, nunca além do sub-período atual (sem meses/trimestres futuros).
  const ehAnoCorrente = anoReferencia === hoje.ano
  const subAtual = granularidade === 'anual' ? 0 : granularidade === 'mensal' ? hoje.mes : trimestreAtual
  const subChaves = [...aggRef.keys()]
    .filter(sub => !ehAnoCorrente || sub <= subAtual)
    .sort((a, b) => a - b)

  const pontos: EvolucaoNpsPonto[] = subChaves.map(sub => {
    const aggR = aggRef.get(sub)!
    const rot = rotular(sub, anoReferencia)
    const npsR = npsDoAgg(aggR)

    let comparacao: EvolucaoNpsComparacao | null = null
    if (aggComp) {
      const aggC = aggComp.get(sub)
      const npsC = npsDoAgg(aggC)
      comparacao = {
        ano: anoComparacao!,
        label: rotular(sub, anoComparacao!).label,
        respostas: aggC?.respostas ?? 0,
        nps: npsC,
        variacao: npsR !== null && npsC !== null ? npsR - npsC : null,
      }
    }

    return {
      bucket: rot.bucket,
      label: rot.label,
      rotuloCurto: rot.rotuloCurto,
      respostas: aggR.respostas,
      promotores: aggR.promotores,
      neutros: aggR.neutros,
      detratores: aggR.detratores,
      nps: npsR,
      parcial: ehAnoCorrente && sub === subAtual,
      comparacao,
    }
  })

  return { granularidade, anoReferencia, anoComparacao, anosDisponiveis, pontos }
}

import type { Campanha } from '../../types'

// Espelha chaveGrupoConcorrente em server/src/controllers/campanhas.ts (não
// há pacote compartilhado entre server/web, ver CLAUDE.md) — mesma chave de
// "quem compete com quem" usada em testarElegibilidade/competidores:
// sistema + (tela, se modo_identificacao=sistema_tela) ou (url_contem, se
// modo_identificacao=url_contem) + gatilho(+evento, se apos_evento).
// Campanha em modo data_cy nunca forma grupo (mesma limitação documentada
// no backend) — retorna null.
export interface CampanhaGrupoInput {
  sistema: string
  tela: string | null
  modo_identificacao: string
  url_contem: string | null
  gatilho: string
  evento: string | null
}

export function chaveGrupoConcorrente(c: CampanhaGrupoInput): string | null {
  const gatilhoParte = c.gatilho === 'apos_evento' && c.evento ? `apos_evento:${c.evento}` : 'ao_abrir_tela'
  if (c.modo_identificacao === 'sistema_tela') {
    return `${c.sistema}::tela::${c.tela ?? ''}::${gatilhoParte}`
  }
  if (c.modo_identificacao === 'url_contem' && c.url_contem) {
    return `${c.sistema}::url::${c.url_contem}::${gatilhoParte}`
  }
  return null
}

export interface GrupoConcorrente {
  chave: string
  campanhas: Campanha[]
}

// Só grupos com 2+ campanhas competem de fato entre si (prioridade só
// importa comparada dentro do mesmo grupo) — grupo com 1 único membro não
// tem o que reordenar, por isso nunca aparece pra escolha na UI.
export function agruparCampanhasConcorrentes(campanhas: Campanha[]): GrupoConcorrente[] {
  const mapa = new Map<string, Campanha[]>()
  for (const c of campanhas) {
    const chave = chaveGrupoConcorrente(c)
    if (!chave) continue
    const lista = mapa.get(chave)
    if (lista) lista.push(c)
    else mapa.set(chave, [c])
  }
  return [...mapa.entries()]
    .filter(([, lista]) => lista.length >= 2)
    .map(([chave, lista]) => ({ chave, campanhas: lista }))
}

// Rótulo legível do grupo pra tela de escolha (antes de abrir o reorder).
export function rotuloGrupoConcorrente(grupo: GrupoConcorrente): string {
  const exemplo = grupo.campanhas[0]
  if (exemplo.modo_identificacao === 'url_contem') {
    return `${exemplo.sistema} · URL contém "${exemplo.url_contem}"`
  }
  return `${exemplo.sistema}${exemplo.tela ? ` · ${exemplo.tela}` : ''}`
}

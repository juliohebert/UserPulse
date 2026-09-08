import type { Campanha } from '../../types'

// Espelha chavesGrupoConcorrente em server/src/controllers/campanhas.ts (não
// há pacote compartilhado entre server/web, ver CLAUDE.md).
//
// "Quem compete com quem": uma campanha gera um CONJUNTO de chaves — UMA por
// regra de exibição (múltiplas telas/URLs). Duas campanhas concorrem quando
// compartilham pelo menos uma chave. Cada chave é
// sistema + (tela | url_contem | data_cy) + gatilho(+evento, se apos_evento).
// Antes só existia a regra base e data_cy nunca formava grupo — agora
// data_cy também forma. Campanha sem `regras` carregada cai na regra base
// (colunas legadas), produzindo as mesmas chaves de antes para
// sistema_tela/url_contem (campanha antiga de 1 regra inalterada).

export interface RegraGrupoInput {
  modo_identificacao: string
  tela: string | null
  url_contem: string | null
  data_cy: string | null
}

export interface CampanhaGrupoInput {
  sistema: string
  gatilho: string
  evento: string | null
  // regra base (colunas legadas) — fallback quando `regras` não vem
  modo_identificacao: string
  tela: string | null
  url_contem: string | null
  data_cy: string | null
  regras?: RegraGrupoInput[]
}

function parteGatilho(c: Pick<CampanhaGrupoInput, 'gatilho' | 'evento'>): string {
  return c.gatilho === 'apos_evento' && c.evento ? `apos_evento:${c.evento}` : 'ao_abrir_tela'
}

function chaveDeRegra(sistema: string, gatilhoParte: string, r: RegraGrupoInput): string | null {
  if (r.modo_identificacao === 'sistema_tela') return `${sistema}::tela::${r.tela ?? ''}::${gatilhoParte}`
  if (r.modo_identificacao === 'url_contem') return r.url_contem ? `${sistema}::url::${r.url_contem}::${gatilhoParte}` : null
  if (r.modo_identificacao === 'data_cy') return r.data_cy ? `${sistema}::datacy::${r.data_cy}::${gatilhoParte}` : null
  return null
}

export function chavesGrupoConcorrente(c: CampanhaGrupoInput): string[] {
  const gatilhoParte = parteGatilho(c)
  const regras: RegraGrupoInput[] = c.regras && c.regras.length > 0
    ? c.regras
    : [{ modo_identificacao: c.modo_identificacao, tela: c.tela, url_contem: c.url_contem, data_cy: c.data_cy }]
  const chaves = new Set<string>()
  for (const r of regras) {
    const k = chaveDeRegra(c.sistema, gatilhoParte, r)
    if (k) chaves.add(k)
  }
  return [...chaves]
}

export interface GrupoConcorrente {
  chave: string
  campanhas: Campanha[]
}

// Um grupo por CHAVE — a campanha pode aparecer em mais de um grupo (uma
// regra por tela/URL). Dentro de um grupo cada campanha aparece só uma vez,
// mesmo que várias regras suas gerem aquela chave. Só grupos com 2+
// campanhas competem de fato (prioridade só importa comparada dentro do
// mesmo grupo), então grupo de 1 nunca aparece pra escolha na UI.
export function agruparCampanhasConcorrentes(campanhas: Campanha[]): GrupoConcorrente[] {
  const mapa = new Map<string, { campanhas: Campanha[]; ids: Set<string> }>()
  for (const c of campanhas) {
    for (const chave of chavesGrupoConcorrente(c)) {
      let g = mapa.get(chave)
      if (!g) { g = { campanhas: [], ids: new Set() }; mapa.set(chave, g) }
      if (!g.ids.has(c.id)) { g.ids.add(c.id); g.campanhas.push(c) }
    }
  }
  return [...mapa.entries()]
    .filter(([, g]) => g.campanhas.length >= 2)
    .map(([chave, g]) => ({ chave, campanhas: g.campanhas }))
}

// Rótulo legível do grupo — derivado da PRÓPRIA chave (não de campanhas[0],
// que pode casar o grupo por uma regra adicional, não pela base).
export function rotuloGrupoConcorrente(grupo: GrupoConcorrente): string {
  const partes = grupo.chave.split('::')
  const sistema = partes[0]
  const tipo = partes[1]
  const valor = partes.slice(2, -1).join('::')
  if (tipo === 'url') return `${sistema} · URL contém "${valor}"`
  if (tipo === 'datacy') return `${sistema} · elemento [data-cy="${valor}"]`
  return `${sistema}${valor ? ` · ${valor}` : ''}`
}

// Hostname puro: trim + lowercase + strip de protocolo/porta/path, caso o
// usuário cole uma URL completa por engano no admin (Sistema.dominios,
// Campanha.segmentar_dominios, Jornada.segmentar_dominios, campo "dominio"
// de TourGuiado.segmentacao_regras). Comparações no widget/backend também
// usam lowercase nos dois lados (ver passaSegmentacao em controllers/widget.ts
// e avaliarSegmentacaoTour em widget.js) — defesa em profundidade além desta
// normalização na gravação.
export function normalizarDominio(v: string): string {
  let s = v.trim().toLowerCase()
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  s = s.split('/')[0]
  s = s.split(':')[0]
  return s
}

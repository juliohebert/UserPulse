import type { TourGuiado } from '../types'

// Mesma convenção de WIDGET_URL em utils/campanha.ts: usa o domínio configurado
// para o widget em produção, ou cai para a própria origem (válido quando admin
// e API são servidos pelo mesmo processo Express, como em produção).
const WIDGET_ORIGIN: string = (() => {
  const envUrl = import.meta.env.VITE_USERPULSE_WIDGET_URL as string | undefined
  if (envUrl) {
    try {
      return new URL(envUrl).origin
    } catch {
      // valor malformado no .env — ignora e cai no fallback
    }
  }
  return window.location.origin
})()

export function comandoIniciarTour(tour: Pick<TourGuiado, 'slug'>): string {
  return `window.UserPulse.iniciarTour("${tour.slug}");`
}

// URL do test-embed.html servido pelo mesmo Express que expõe /widget-loader.js,
// já com ?local=1 (widget local) e ?tour=<slug> (auto-inicia o tour ao carregar).
export function testEmbedUrl(tour: Pick<TourGuiado, 'slug'>): string {
  const params = new URLSearchParams({ local: '1', tour: tour.slug })
  return `${WIDGET_ORIGIN}/test-embed.html?${params.toString()}`
}

interface OpcoesOrigemTestador {
  widgetUrl?: string
  appOrigin: string
  dev: boolean
}

export function resolverOrigemTestador({ widgetUrl, appOrigin, dev }: OpcoesOrigemTestador): string {
  if (widgetUrl) {
    try {
      return new URL(widgetUrl).origin
    } catch {
      // Ignora configuração inválida e usa a origem do painel.
    }
  }

  if (dev) {
    try {
      const apiUrl = new URL(appOrigin)
      apiUrl.port = '3333'
      return apiUrl.origin
    } catch {
      return 'http://localhost:3333'
    }
  }

  return appOrigin
}

export function montarTestEmbedUrl(widgetOrigin: string, tourSlug: string, publicKey: string): string {
  const params = new URLSearchParams({ local: '1', tour: tourSlug })
  if (publicKey) params.set('public_key', publicKey)
  return `${widgetOrigin}/test-embed.html?${params.toString()}`
}

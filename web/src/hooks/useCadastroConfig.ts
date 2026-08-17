import { useEffect, useState } from 'react'
import { get } from '../services/api'
import type { CadastroConfig } from '../types'

// Cache em memória do módulo (perdido só num F5) — Login.tsx e Cadastro.tsx
// usam este mesmo hook e chamavam GET /auth/cadastro/config cada um por si
// (dois fetches ao navegar entre as duas telas, cada um reabrindo o mesmo
// flash de loading). undefined = ainda não resolvido com SUCESSO nesta
// sessão de página. Só a resposta 2xx grava aqui — o endpoint público hoje
// nunca resolve com sucesso pra `null` (sempre um objeto real ou 503, ver
// server/src/controllers/auth.ts, cadastroConfig), então cache resolvido é
// sempre um CadastroConfig de verdade. Erro NUNCA é gravado em `cache`: fica
// undefined, então a próxima montagem (ex.: usuário navega de novo pra
// /login) tenta buscar de novo, sem criar retry automático em loop — só
// "tenta de novo na próxima vez que alguém precisar". Uma segunda montagem
// que já viu um cache resolvido nem passa pelo estado de carregando.
let cache: CadastroConfig | undefined
let emAndamento: Promise<CadastroConfig | null> | null = null

function buscar(): Promise<CadastroConfig | null> {
  if (cache !== undefined) return Promise.resolve(cache)
  if (!emAndamento) {
    emAndamento = get<CadastroConfig>('/auth/cadastro/config')
      .then(config => { cache = config; return config })
      .catch(() => null)
      .finally(() => { emAndamento = null })
  }
  return emAndamento
}

// carregando distingue "ainda buscando" de "resolvido sem dados" — as duas
// telas usavam antes um único `useState<CadastroConfig | null>(null)`, onde
// null significava as duas coisas ao mesmo tempo, e por isso renderizavam
// direto o fallback (visível) antes da resposta chegar, trocando de
// conteúdo/tamanho na hora que os dados apareciam (o flash/layout shift que
// esta task corrige). Quem usa este hook decide o que fazer durante
// `carregando` (normalmente: reservar o espaço final com skeleton, nunca
// mostrar um fallback "provisório" que depois é substituído).
export function useCadastroConfig(): { config: CadastroConfig | null; carregando: boolean } {
  const [config, setConfig] = useState<CadastroConfig | null>(cache ?? null)
  const [carregando, setCarregando] = useState(cache === undefined)

  useEffect(() => {
    if (cache !== undefined) {
      setConfig(cache)
      setCarregando(false)
      return
    }
    let ativo = true
    buscar().then(resultado => {
      if (!ativo) return
      setConfig(resultado)
      setCarregando(false)
    })
    return () => { ativo = false }
  }, [])

  return { config, carregando }
}

import { useEffect, useState } from 'react'
import { get, put } from '../services/api'
import type { AparenciaWidget, Sistema } from '../types'
import { CardHeader } from '../components/ui/CardHeader'
import { Button } from '../components/ui/Button'

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const card = 'w-full bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm'
const COR_PADRAO = '#0058be'
const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

type Selecao = { tipo: 'default'; id: 'default'; nome: string; descricao: string } | { tipo: 'sistema'; id: string; nome: string; descricao: string }

function corValida(valor: string): boolean {
  return valor.trim() === '' || HEX_REGEX.test(valor.trim())
}

function pathAparencia(selecao: Selecao): string {
  return selecao.tipo === 'default' ? 'default' : selecao.id
}

function chaveAparencia(selecao: Selecao): string {
  return `${selecao.tipo}:${selecao.id}`
}

export function AparenciaWidgetPage() {
  const [sistemas, setSistemas] = useState<Sistema[]>([])
  const [selecao, setSelecao] = useState<Selecao>({
    tipo: 'default',
    id: 'default',
    nome: 'Padrão do tenant',
    descricao: 'Fallback para todos os sistemas sem aparência própria.',
  })
  const [corPrincipal, setCorPrincipal] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoQuebrada, setLogoQuebrada] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [salvoEm, setSalvoEm] = useState<number | null>(null)
  const [erro, setErro] = useState('')
  const [aparencias, setAparencias] = useState<Record<string, { cor_principal: string | null; logo_url: string | null }>>({})

  const corPreview = corValida(corPrincipal) && corPrincipal.trim() ? corPrincipal.trim() : COR_PADRAO
  const itens: Selecao[] = [
    { tipo: 'default', id: 'default', nome: 'Padrão do tenant', descricao: 'Usado quando o sistema não tem aparência própria.' },
    ...sistemas.map(s => ({ tipo: 'sistema' as const, id: s.id, nome: s.nome, descricao: s.identificador })),
  ]

  useEffect(() => {
    get<Sistema[]>('/sistemas?ativo=true')
      .then(setSistemas)
      .catch(() => setErro('Erro ao carregar sistemas cadastrados.'))
  }, [])

  useEffect(() => {
    let cancelado = false
    const selecoes: Selecao[] = [
      { tipo: 'default', id: 'default', nome: 'Padrão do tenant', descricao: '' },
      ...sistemas.map(s => ({ tipo: 'sistema' as const, id: s.id, nome: s.nome, descricao: s.identificador })),
    ]

    Promise.all(
      selecoes.map(item =>
        get<AparenciaWidget>(`/aparencia-widget/${encodeURIComponent(pathAparencia(item))}`)
          .then(dados => [chaveAparencia(item), { cor_principal: dados.cor_principal, logo_url: dados.logo_url }] as const)
          .catch(() => [chaveAparencia(item), { cor_principal: null, logo_url: null }] as const)
      )
    ).then(entries => {
      if (cancelado) return
      setAparencias(Object.fromEntries(entries))
    })

    return () => { cancelado = true }
  }, [sistemas])

  useEffect(() => {
    setErro('')
    setSalvoEm(null)
    const aparenciaCache = aparencias[chaveAparencia(selecao)]
    setCorPrincipal(aparenciaCache?.cor_principal || '')
    setLogoUrl(aparenciaCache?.logo_url || '')
    setLogoQuebrada(false)
    setCarregando(true)
    get<AparenciaWidget>(`/aparencia-widget/${encodeURIComponent(pathAparencia(selecao))}`)
      .then(dados => {
        setCorPrincipal(dados.cor_principal || '')
        setLogoUrl(dados.logo_url || '')
        setLogoQuebrada(false)
        setAparencias(prev => ({
          ...prev,
          [chaveAparencia(selecao)]: { cor_principal: dados.cor_principal, logo_url: dados.logo_url },
        }))
      })
      .catch(() => setErro('Erro ao carregar a aparência selecionada.'))
      .finally(() => setCarregando(false))
  }, [selecao])

  useEffect(() => {
    if (!salvoEm) return
    const timeout = window.setTimeout(() => setSalvoEm(null), 2400)
    return () => window.clearTimeout(timeout)
  }, [salvoEm])

  async function salvar() {
    if (!corValida(corPrincipal)) { setErro('Cor principal inválida — use um HEX no formato #0066CC.'); return }
    if (logoUrl.trim() && !/^https?:\/\//i.test(logoUrl.trim())) {
      setErro('URL da logo inválida — use uma URL completa começando com http:// ou https://.')
      return
    }
    setErro('')
    setSalvando(true)
    try {
      await put<AparenciaWidget>(`/aparencia-widget/${encodeURIComponent(pathAparencia(selecao))}`, {
        cor_principal: corPrincipal.trim() || null,
        logo_url: logoUrl.trim() || null,
      })
      setAparencias(prev => ({
        ...prev,
        [chaveAparencia(selecao)]: { cor_principal: corPrincipal.trim() || null, logo_url: logoUrl.trim() || null },
      }))
      setSalvoEm(Date.now())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar a aparência do widget.')
    } finally {
      setSalvando(false)
    }
  }

  function selecionarItem(item: Selecao) {
    const cache = aparencias[chaveAparencia(item)]
    setCorPrincipal(cache?.cor_principal || '')
    setLogoUrl(cache?.logo_url || '')
    setLogoQuebrada(false)
    setSalvoEm(null)
    setSelecao(item)
  }

  return (
    <>
      <div className="px-4 lg:px-margin-desktop py-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-title-lg font-bold text-on-surface">Aparência do Widget</h2>
            <p className="text-body-md text-on-surface-variant mt-0.5">
              Configure uma aparência padrão e sobrescritas por sistema.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {salvoEm && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-label-md font-bold text-tertiary">
                <span className="material-symbols-outlined text-[17px]">check_circle</span>
                Salvo
              </span>
            )}
            <Button type="button" onClick={salvar} disabled={salvando || carregando} size="md" variant="gradient" className="min-w-[108px]">
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>

      <section className="w-full px-4 lg:px-margin-desktop pt-0 pb-5 max-w-[1400px] space-y-4">
        {erro && (
          <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {erro}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className={card}>
            <h3 className="text-title-md font-bold text-on-surface mb-3">Sistemas</h3>
            <div className="space-y-2">
              {itens.map(item => {
                const ativo = item.tipo === selecao.tipo && item.id === selecao.id
                const aparencia = aparencias[chaveAparencia(item)]
                const corItem = corValida(aparencia?.cor_principal ?? '') && aparencia?.cor_principal ? aparencia.cor_principal : COR_PADRAO
                const logoItem = aparencia?.logo_url
                return (
                  <button
                    key={`${item.tipo}:${item.id}`}
                    type="button"
                    onClick={() => selecionarItem(item)}
                    style={ativo ? { borderColor: corItem, boxShadow: `0 0 0 1px ${corItem}22` } : undefined}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${ativo ? 'bg-primary/5 text-on-surface shadow-sm' : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-container-low'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-white"
                        style={{ background: logoItem ? '#f8f9ff' : corItem, border: logoItem ? `1px solid ${corItem}33` : 'none' }}
                      >
                        {logoItem ? (
                          <img src={logoItem} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <span className="material-symbols-outlined text-[18px]">{item.tipo === 'default' ? 'home' : 'dns'}</span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-body-md font-bold">{item.nome}</span>
                        <span className="block truncate text-[12px] text-on-surface-variant">{item.descricao}</span>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className={card}>
              <CardHeader
                icon={selecao.tipo === 'default' ? 'home' : 'dns'}
                iconBg="bg-secondary-fixed"
                iconColor="text-secondary"
                title={selecao.nome}
                description={selecao.tipo === 'default' ? 'Aparência padrão usada como fallback.' : 'Aparência específica que sobrescreve o padrão deste sistema.'}
              />
              <fieldset disabled={carregando} className="space-y-4 disabled:opacity-50">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Cor principal</label>
                  <div className="flex items-center gap-3 max-w-md">
                    <input
                      type="color"
                      value={corValida(corPrincipal) && corPrincipal.trim() ? corPrincipal.trim() : COR_PADRAO}
                      onChange={e => setCorPrincipal(e.target.value)}
                      className="w-11 h-11 rounded-lg border border-outline-variant cursor-pointer shrink-0"
                      aria-label="Selecionar cor principal"
                    />
                    <input
                      value={corPrincipal}
                      onChange={e => setCorPrincipal(e.target.value)}
                      placeholder={`Padrão: ${COR_PADRAO}`}
                      className={`${field} font-mono ${corPrincipal.trim() && !corValida(corPrincipal) ? 'border-error focus:ring-error' : ''}`}
                    />
                  </div>
                  {corPrincipal.trim() && !corValida(corPrincipal) && (
                    <p className="mt-1.5 text-[11px] text-error">HEX inválido — use o formato #0066CC.</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-outline">Deixe em branco para usar o fallback visual padrão do widget.</p>
                </div>

                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Logo/ícone do tour</label>
                  <input
                    value={logoUrl}
                    onChange={e => { setLogoUrl(e.target.value); setLogoQuebrada(false) }}
                    placeholder="https://minhaempresa.com/logo.png"
                    className={field}
                  />
                  <p className="mt-1.5 text-[11px] text-outline">
                    Deixe em branco para usar o ícone padrão. Upload de arquivo ainda não é suportado nesta versão — só URL.
                  </p>
                </div>
              </fieldset>
            </div>

            <div className={card}>
              <CardHeader
                icon="visibility"
                iconBg="bg-surface-container-high"
                iconColor="text-on-surface-variant"
                title="Preview"
                description="Como o topo do modal inicial do tour fica com a cor/logo escolhidas."
              />
              <div className="flex justify-center py-6 bg-[#f3f5fa] rounded-xl">
                <div className="w-[260px] bg-white rounded-2xl border border-[rgba(194,198,214,.5)] shadow-lg p-5 text-center">
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center overflow-hidden"
                    style={{ background: logoUrl.trim() && !logoQuebrada ? '#f8f9ff' : corPreview, border: logoUrl.trim() && !logoQuebrada ? '1px solid rgba(0,0,0,.06)' : 'none' }}
                  >
                    {logoUrl.trim() && !logoQuebrada ? (
                      <img
                        src={logoUrl.trim()}
                        alt=""
                        className="w-full h-full object-contain"
                        onError={() => setLogoQuebrada(true)}
                      />
                    ) : (
                      <span className="material-symbols-outlined text-white text-[28px]">auto_awesome</span>
                    )}
                  </div>
                  <p className="text-[15px] font-extrabold text-[#0b1c30] mb-1.5">Nome do tour</p>
                  <p className="text-[13px] text-[#4b5163] mb-3">Seja bem-vindo ao tour guiado.</p>
                  <div className="w-full py-2.5 rounded-xl text-white text-[12.5px] font-extrabold" style={{ background: corPreview }}>
                    Começar tour →
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

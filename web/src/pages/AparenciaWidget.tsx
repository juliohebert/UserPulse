import { useEffect, useState } from 'react'
import { get, put } from '../services/api'
import type { AparenciaWidget, Sistema } from '../types'

const COR_PADRAO = '#0058be'
const HEX_REGEX = /^#[0-9a-fA-F]{6}$/
const painel = 'rounded-[32px] border border-[#dee3e9] bg-white p-6 sm:p-8'
const input = 'h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-[16px] leading-[1.5] tracking-[-0.16px] text-[#1c1e21] outline-none focus:border-[#1876f2] focus:ring-2 focus:ring-[#1876f2]/10 disabled:cursor-not-allowed'

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

function IconeCircular({ icon }: { icon: string }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8f2ff] text-[#0064e0]">
      <span className="material-symbols-outlined text-[22px] leading-none">{icon}</span>
    </span>
  )
}

export function AparenciaWidgetPage() {
  const [sistemas, setSistemas] = useState<Sistema[]>([])
  const [selecao, setSelecao] = useState<Selecao>({
    tipo: 'default',
    id: 'default',
    nome: 'Padrão',
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
    { tipo: 'default', id: 'default', nome: 'Padrão', descricao: 'Usado quando o sistema não tem aparência própria.' },
    ...sistemas.map(s => ({ tipo: 'sistema' as const, id: s.id, nome: s.nome, descricao: s.identificador })),
  ]

  useEffect(() => {
    get<Sistema[]>('/sistemas?ativo=true')
      .then(setSistemas)
      .catch(() => setErro('Erro ao carregar sistemas cadastrados.'))
  }, [])

  useEffect(() => {
    setErro('')
    setSalvoEm(null)
    const chave = chaveAparencia(selecao)
    const aparenciaCache = aparencias[chave]
    setCorPrincipal(aparenciaCache?.cor_principal || '')
    setLogoUrl(aparenciaCache?.logo_url || '')
    setLogoQuebrada(false)

    if (aparenciaCache) {
      setCarregando(false)
      return
    }

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
  }, [aparencias, selecao])

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
    <div className="min-h-full bg-white text-[#1c1e21]">
      <section className="px-4 py-6 lg:px-margin-desktop lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[28px] font-semibold leading-[1.21] text-[#0a1317]">Aparência do widget</h2>
            <p className="mt-1 text-[16px] leading-[1.5] tracking-[-0.16px] text-[#4b4c4f]">
              Configure a cor e a logo padrão ou por sistema.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {salvoEm && (
              <span className="inline-flex items-center gap-2 rounded-[100px] bg-[#f1f4f7] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[#31a24c]">
                <span className="material-symbols-outlined text-[16px] leading-none">check_circle</span>
                Salvo
              </span>
            )}
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || carregando}
              className="rounded-[100px] bg-[#0064e0] px-[30px] py-[14px] text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-white active:bg-[#0457cb] disabled:bg-[#bcc0c4]"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 px-4 pb-8 lg:px-margin-desktop xl:grid-cols-[360px_minmax(0,1fr)]">
        {erro && (
          <div className="rounded-[24px] border border-[#f0284a] bg-white p-4 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#e41e3f] xl:col-span-2">
            <span className="mr-2 align-middle material-symbols-outlined text-[18px] leading-none">error</span>
            {erro}
          </div>
        )}

        <aside className={painel}>
          <div className="mb-6 flex items-start gap-4">
            <IconeCircular icon="dns" />
            <div>
              <h3 className="text-[24px] font-semibold leading-[1.25] text-[#0a1317]">Sistemas</h3>
              <p className="mt-1 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#5d6c7b]">Escolha onde a aparência será aplicada.</p>
            </div>
          </div>

          <div className="space-y-3">
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
                  className={`w-full rounded-[16px] border p-4 text-left transition-colors ${ativo ? 'border-2 border-[#0064e0] bg-white' : 'border-[#dee3e9] bg-white active:bg-[#f1f4f7]'}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-white"
                      style={{ background: logoItem ? '#f1f4f7' : corItem, border: logoItem ? `1px solid ${corItem}33` : 'none' }}
                    >
                      {logoItem ? (
                        <img src={logoItem} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <span className="material-symbols-outlined text-[20px] leading-none">{item.tipo === 'default' ? 'home' : 'dns'}</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[16px] font-bold leading-[1.5] tracking-[-0.16px] text-[#0a1317]">{item.nome}</span>
                      <span className="block truncate text-[12px] leading-[1.33] text-[#5d6c7b]">{item.descricao}</span>
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className={painel}>
            <div className="mb-6 flex items-start gap-4">
              <IconeCircular icon={selecao.tipo === 'default' ? 'home' : 'dns'} />
              <div>
                <h3 className="text-[24px] font-semibold leading-[1.25] text-[#0a1317]">{selecao.nome}</h3>
                <p className="mt-1 text-[16px] leading-[1.5] tracking-[-0.16px] text-[#4b4c4f]">
                  {selecao.tipo === 'default' ? 'Aparência padrão usada como fallback.' : 'Aparência específica que sobrescreve o padrão deste sistema.'}
                </p>
              </div>
            </div>

            <fieldset disabled={carregando} className="space-y-6 disabled:opacity-50">
              <div>
                <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">Cor principal</label>
                <div className="flex max-w-md items-center gap-3">
                  <input
                    type="color"
                    value={corValida(corPrincipal) && corPrincipal.trim() ? corPrincipal.trim() : COR_PADRAO}
                    onChange={e => setCorPrincipal(e.target.value)}
                    className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-[#ced0d4] bg-white p-1"
                    aria-label="Selecionar cor principal"
                  />
                  <input
                    value={corPrincipal}
                    onChange={e => setCorPrincipal(e.target.value)}
                    placeholder={`Padrão: ${COR_PADRAO}`}
                    className={`${input} font-mono ${corPrincipal.trim() && !corValida(corPrincipal) ? 'border-[#f0284a] focus:border-[#f0284a] focus:ring-[#f0284a]/10' : ''}`}
                  />
                </div>
                {corPrincipal.trim() && !corValida(corPrincipal) && (
                  <p className="mt-2 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#f0284a]">HEX inválido. Use o formato #0066CC.</p>
                )}
                <p className="mt-2 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#5d6c7b]">Deixe em branco para usar o fallback visual padrão do widget.</p>
              </div>

              <div>
                <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">Logo ou ícone do tour</label>
                <input
                  value={logoUrl}
                  onChange={e => { setLogoUrl(e.target.value); setLogoQuebrada(false) }}
                  placeholder="https://minhaempresa.com/logo.png"
                  className={input}
                />
                <p className="mt-2 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#5d6c7b]">Deixe em branco para usar o ícone padrão. Upload de arquivo ainda não é suportado nesta versão.</p>
              </div>
            </fieldset>
          </section>

          <section className={painel}>
            <div className="mb-6 flex items-start gap-4">
              <IconeCircular icon="visibility" />
              <div>
                <h3 className="text-[24px] font-semibold leading-[1.25] text-[#0a1317]">Preview</h3>
                <p className="mt-1 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#5d6c7b]">Topo do modal inicial do tour.</p>
              </div>
            </div>

            <div className="rounded-[32px] bg-[#f1f4f7] p-6">
              <div className="rounded-[24px] border border-[#dee3e9] bg-white p-6 text-center">
                <div
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full"
                  style={{ background: logoUrl.trim() && !logoQuebrada ? '#f1f4f7' : corPreview, border: logoUrl.trim() && !logoQuebrada ? '1px solid #dee3e9' : 'none' }}
                >
                  {logoUrl.trim() && !logoQuebrada ? (
                    <img
                      src={logoUrl.trim()}
                      alt=""
                      className="h-full w-full object-contain"
                      onError={() => setLogoQuebrada(true)}
                    />
                  ) : (
                    <span className="material-symbols-outlined text-[28px] leading-none text-white">auto_awesome</span>
                  )}
                </div>
                <p className="mb-2 text-[18px] font-bold leading-[1.44] text-[#0a1317]">Nome do tour</p>
                <p className="mb-5 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#444950]">Seja bem-vindo ao tour guiado.</p>
                <div className="w-full rounded-[100px] px-[30px] py-[14px] text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-white" style={{ background: corPreview }}>
                  Começar tour
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}

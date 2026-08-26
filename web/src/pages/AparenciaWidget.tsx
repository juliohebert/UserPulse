import { useEffect, useState } from 'react'
import { get, put } from '../services/api'
import type { AparenciaWidget, Sistema } from '../types'
import { Button } from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { podeGerenciarModulo } from '../utils/permissions'

const COR_PADRAO = '#0058be'
const HEX_REGEX = /^#[0-9a-fA-F]{6}$/
const painel = 'rounded-3xl border border-outline-variant bg-surface p-6 sm:p-8'
const input = 'h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-body-md text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed'

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
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <span className="material-symbols-outlined text-[22px] leading-none">{icon}</span>
    </span>
  )
}

export function AparenciaWidgetPage() {
  const { user } = useAuth()
  // Fase 4 de permissões personalizadas — rota exige só VISUALIZAR em
  // CONFIGURACOES (ver App.tsx); esta página é um formulário único de
  // visualizar+editar (sem versão só-leitura separada), então GERENCIAR
  // desabilita os campos e o botão Salvar em vez de esconder uma tela
  // inteira (mesmo raciocínio do antigo RequireEscritaConfiguracao.tsx,
  // agora aplicado por campo).
  const podeGerenciar = podeGerenciarModulo(user, 'CONFIGURACOES')
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
    if (!podeGerenciar) return
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
    <div>
      <section className="px-4 lg:px-margin-desktop py-5 overflow-x-hidden">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-visible">
          <div className="px-5 py-4 border-b border-outline-variant/30 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-title-lg font-bold text-on-surface">Aparência do widget</h3>
              <p className="text-body-md text-on-surface-variant mt-0.5">
                Configure a cor e a logo padrão ou por sistema.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {salvoEm && (
                <span className="inline-flex items-center gap-2 rounded-full bg-tertiary/10 px-4 py-2 text-label-sm font-bold uppercase tracking-[0.08em] text-tertiary">
                  <span className="material-symbols-outlined text-[16px] leading-none">check_circle</span>
                  Salvo
                </span>
              )}
              {podeGerenciar && (
                <Button onClick={salvar} disabled={salvando || carregando} variant="gradient" size="lg">
                  {salvando ? 'Salvando...' : 'Salvar'}
                </Button>
              )}
            </div>
          </div>

          <div className="p-5 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            {erro && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-body-md bg-error-container text-on-error-container xl:col-span-2">
                <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
                {erro}
              </div>
            )}

            <aside className={painel}>
              <div className="mb-6 flex items-start gap-4">
                <IconeCircular icon="dns" />
                <div>
                  <h3 className="text-title-md font-bold text-on-surface">Sistemas</h3>
                  <p className="text-body-sm text-on-surface-variant mt-1">Escolha onde a aparência será aplicada.</p>
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
                      className={`w-full rounded-xl border p-4 text-left transition-colors ${ativo ? 'border-2 border-primary bg-surface' : 'border-outline-variant bg-surface hover:border-primary/50'}`}
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
                          <span className="block truncate text-body-md font-bold text-on-surface">{item.nome}</span>
                          <span className="block truncate text-label-sm text-on-surface-variant">{item.descricao}</span>
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
                    <h3 className="text-title-md font-bold text-on-surface">{selecao.nome}</h3>
                    <p className="text-body-md text-on-surface-variant mt-1">
                      {selecao.tipo === 'default' ? 'Aparência padrão usada como fallback.' : 'Aparência específica que sobrescreve o padrão deste sistema.'}
                    </p>
                  </div>
                </div>

                <fieldset disabled={carregando || !podeGerenciar} className="space-y-6 disabled:opacity-50">
                  <div>
                    <label className="mb-1.5 block text-label-md text-on-surface-variant">Cor principal</label>
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
                        className={`${input} font-mono ${corPrincipal.trim() && !corValida(corPrincipal) ? 'border-error focus:border-error focus:ring-error/10' : ''}`}
                      />
                    </div>
                    {corPrincipal.trim() && !corValida(corPrincipal) && (
                      <p className="mt-2 text-body-sm text-error">HEX inválido. Use o formato #0066CC.</p>
                    )}
                    <p className="mt-2 text-body-sm text-on-surface-variant">Deixe em branco para usar o fallback visual padrão do widget.</p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-label-md text-on-surface-variant">Logo ou ícone do tour</label>
                    <input
                      value={logoUrl}
                      onChange={e => { setLogoUrl(e.target.value); setLogoQuebrada(false) }}
                      placeholder="https://minhaempresa.com/logo.png"
                      className={input}
                    />
                    <p className="mt-2 text-body-sm text-on-surface-variant">Deixe em branco para usar o ícone padrão. Upload de arquivo ainda não é suportado nesta versão.</p>
                  </div>
                </fieldset>
              </section>

              <section className={painel}>
                <div className="mb-6 flex items-start gap-4">
                  <IconeCircular icon="visibility" />
                  <div>
                    <h3 className="text-title-md font-bold text-on-surface">Preview</h3>
                    <p className="text-body-sm text-on-surface-variant mt-1">Topo do modal inicial do tour.</p>
                  </div>
                </div>

                <div className="rounded-3xl bg-surface-container-low p-6">
                  <div className="rounded-2xl border border-outline-variant bg-surface p-6 text-center">
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
                    <p className="mb-2 text-body-lg font-bold text-on-surface">Nome do tour</p>
                    <p className="mb-5 text-body-sm text-on-surface-variant">Seja bem-vindo ao tour guiado.</p>
                    <div className="w-full rounded-full px-[30px] py-[14px] text-body-sm font-bold text-white" style={{ background: corPreview }}>
                      Começar tour
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

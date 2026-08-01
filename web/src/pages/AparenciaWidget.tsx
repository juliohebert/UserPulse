import { useState } from 'react'
import { get, put } from '../services/api'
import type { AparenciaWidget } from '../types'
import { CardHeader } from '../components/ui/CardHeader'

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const card = 'w-full bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm'

// Mesmo fallback visual hoje aplicado no runtime do tour (ver ensureStyles()
// em widget.js) — só pra desenhar o preview aqui; nunca é enviado ao salvar
// (campos vazios no formulário viram null, que é o que o widget já trata
// como "sem configuração, usar o padrão").
const COR_PADRAO = '#0058be'

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

function corValida(valor: string): boolean {
  return valor.trim() === '' || HEX_REGEX.test(valor.trim())
}

export function AparenciaWidgetPage() {
  const [sistema, setSistema] = useState('')
  const [carregado, setCarregado] = useState(false)
  const [corPrincipal, setCorPrincipal] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoQuebrada, setLogoQuebrada] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  const corPreview = corValida(corPrincipal) && corPrincipal.trim() ? corPrincipal.trim() : COR_PADRAO

  async function carregar() {
    const alvo = sistema.trim()
    if (!alvo) { setErro('Informe o sistema para carregar a configuração.'); return }
    setErro('')
    setSucesso(false)
    setCarregando(true)
    try {
      const dados = await get<AparenciaWidget>(`/aparencia-widget/${encodeURIComponent(alvo)}`)
      setCorPrincipal(dados.cor_principal || '')
      setLogoUrl(dados.logo_url || '')
      setLogoQuebrada(false)
      setCarregado(true)
    } catch {
      setErro('Erro ao carregar a configuração deste sistema.')
    } finally {
      setCarregando(false)
    }
  }

  async function salvar() {
    const alvo = sistema.trim()
    if (!alvo) { setErro('Informe o sistema antes de salvar.'); return }
    if (!corValida(corPrincipal)) { setErro('Cor principal inválida — use um HEX no formato #0066CC.'); return }
    if (logoUrl.trim() && !/^https?:\/\//i.test(logoUrl.trim())) {
      setErro('URL da logo inválida — use uma URL completa começando com http:// ou https://.')
      return
    }
    setErro('')
    setSalvando(true)
    try {
      await put<AparenciaWidget>(`/aparencia-widget/${encodeURIComponent(alvo)}`, {
        cor_principal: corPrincipal.trim() || null,
        logo_url: logoUrl.trim() || null,
      })
      setCarregado(true)
      setSucesso(true)
    } catch {
      setErro('Erro ao salvar a aparência do widget.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <div className="bg-surface border-b border-outline-variant px-4 lg:px-margin-desktop py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-headline-md font-bold text-on-surface leading-tight">Aparência do Widget</h2>
            <p className="text-body-md text-on-surface-variant mt-0.5 hidden sm:block">
              Personalize a cor principal e a logo/ícone exibidos no runtime de Tours, por sistema integrado.
            </p>
          </div>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !carregado}
            className="px-5 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 shrink-0"
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      <section className="w-full px-4 lg:px-margin-desktop py-5 max-w-[1400px] space-y-4">
        {erro && (
          <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {erro}
          </div>
        )}
        {sucesso && (
          <div className="p-3 bg-tertiary/10 text-tertiary rounded-xl text-body-md flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            Aparência salva. O widget passa a usar essa configuração na próxima carga.
          </div>
        )}

        {/* Sistema */}
        <div className={card}>
          <CardHeader
            number={1}
            icon="dns"
            iconBg="bg-primary-fixed"
            iconColor="text-primary"
            title="Sistema"
            description="A aparência é configurada por sistema integrado, não por tour individual — o mesmo identificador usado em Tours/Campanhas."
          />
          <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
            <input
              value={sistema}
              onChange={e => { setSistema(e.target.value); setCarregado(false); setSucesso(false) }}
              placeholder="Ex: portal, crm, mobile"
              className={field}
            />
            <button
              type="button"
              onClick={carregar}
              disabled={carregando}
              className="px-4 py-2 border border-outline-variant rounded-xl text-label-md font-bold text-on-surface hover:bg-surface-container-low transition-all shrink-0 disabled:opacity-60"
            >
              {carregando ? 'Carregando…' : 'Carregar'}
            </button>
          </div>
        </div>

        <fieldset disabled={!carregado} className="space-y-4 disabled:opacity-50">
          {/* Cor principal */}
          <div className={card}>
            <CardHeader
              number={2}
              icon="palette"
              iconBg="bg-secondary-fixed"
              iconColor="text-secondary"
              title="Cor principal"
              description="Aplicada no botão principal, badge/ícone do topo, progresso ativo e destaque do elemento do tour."
            />
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
            <p className="mt-1.5 text-[11px] text-outline">Deixe em branco para usar a cor padrão do widget.</p>
          </div>

          {/* Logo */}
          <div className={card}>
            <CardHeader
              number={3}
              icon="image"
              iconBg="bg-tertiary/10"
              iconColor="text-tertiary"
              title="Logo/ícone do tour"
              description="URL pública de uma imagem PNG, JPG, SVG ou WEBP — exibida em um container fixo de 64x64, sem distorcer."
            />
            <div className="max-w-xl">
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
          </div>

          {/* Preview */}
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
                    // eslint-disable-next-line @next/next/no-img-element
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
                <div
                  className="w-full py-2.5 rounded-xl text-white text-[12.5px] font-extrabold"
                  style={{ background: corPreview }}
                >
                  Começar tour →
                </div>
              </div>
            </div>
          </div>
        </fieldset>
      </section>
    </>
  )
}

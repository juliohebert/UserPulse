import { useEffect, useRef, useState } from 'react'
import type { Campanha, TelaCatalogo } from '../../types'
import { CardHeader } from '../ui/CardHeader'
import { ScreenCatalogModal, identifier } from './ScreenCatalogModal'

type ManualKey = 'sistema' | 'modo_identificacao' | 'tela' | 'data_cy' | 'url_contem'

interface Props {
  numero?: number
  catalogoTelas: TelaCatalogo[]
  sistemasSugeridas: string[]
  telasSugeridas: string[]
  selectedScreenId: string | null
  onSelectScreen: (id: string) => void
  onClearScreen: () => void
  sistema: string
  modoIdentificacao: string
  tela: string
  dataCy: string
  urlContem: string
  onFieldChange: (key: ManualKey, value: string) => void
  campanhaConflitante: Campanha | null
  resumo: string
}

const field = 'meta-input w-full'

const MODOS = [
  { value: 'sistema_tela', label: 'Tela informada pelo sistema', desc: 'Use quando o sistema hospedeiro envia o nome da tela.' },
  { value: 'data_cy', label: 'Elemento da tela', desc: 'Use quando a tela possui um data-cy estável.' },
  { value: 'url_contem', label: 'Caminho da URL', desc: 'Use quando a página possui uma rota ou caminho conhecido.' },
]

export function DestinoCampanha({
  numero,
  catalogoTelas,
  sistemasSugeridas,
  telasSugeridas,
  selectedScreenId,
  onSelectScreen,
  onClearScreen,
  sistema,
  modoIdentificacao,
  tela,
  dataCy,
  urlContem,
  onFieldChange,
  campanhaConflitante,
  resumo,
}: Props) {
  const [tab, setTab] = useState<'catalogo' | 'manual'>(() => {
    if (selectedScreenId) return 'catalogo'
    if (sistema || tela || dataCy || urlContem) return 'manual'
    return 'catalogo'
  })
  const [busca, setBusca] = useState('')
  const [dropdownAberto, setDropdownAberto] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)
  const buscaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownAberto) return
    const onMouseDown = (e: MouseEvent) => {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) setDropdownAberto(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [dropdownAberto])

  const selecionada = selectedScreenId ? catalogoTelas.find(t => t.id === selectedScreenId) ?? null : null

  const q = busca.toLowerCase().trim()
  const matches = q
    ? catalogoTelas.filter(t =>
        t.nome.toLowerCase().includes(q) ||
        t.categoria.toLowerCase().includes(q) ||
        t.sistema.toLowerCase().includes(q) ||
        (t.url_contem ?? '').toLowerCase().includes(q) ||
        (t.tela ?? '').toLowerCase().includes(q) ||
        (t.data_cy ?? '').toLowerCase().includes(q)
      )
    : []
  const shown = matches.slice(0, 6)
  const hasMore = matches.length > shown.length

  const handleSelect = (id: string) => {
    onSelectScreen(id)
    setBusca('')
    setDropdownAberto(false)
  }

  const handleManualChange = (key: ManualKey, value: string) => {
    onFieldChange(key, value)
    if (key === 'sistema' || key === 'modo_identificacao' || key === 'url_contem') onClearScreen()
  }

  return (
    <div className="meta-card-compact">
      <CardHeader
        number={numero}
        icon="explore"
        iconBg="bg-primary-fixed"
        iconColor="text-primary"
        title="Destino da campanha"
        description="Defina em qual tela esta campanha deve aparecer."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab('catalogo')}
          className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
            tab === 'catalogo' ? 'border-ink-deep bg-surface' : 'border-hairline-soft bg-surface-container-low hover:border-hairline'
          }`}
        >
          <span className={`material-symbols-outlined text-[20px] mt-0.5 shrink-0 ${tab === 'catalogo' ? 'text-ink-deep' : 'text-charcoal'}`}>grid_view</span>
          <div>
            <p className={`text-body-md font-semibold ${tab === 'catalogo' ? 'text-ink-deep' : 'text-ink'}`}>Escolher do catálogo</p>
            <p className="text-label-sm text-charcoal mt-0.5">Selecione uma tela já mapeada no sistema.</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setTab('manual')}
          className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
            tab === 'manual' ? 'border-ink-deep bg-surface' : 'border-hairline-soft bg-surface-container-low hover:border-hairline'
          }`}
        >
          <span className={`material-symbols-outlined text-[20px] mt-0.5 shrink-0 ${tab === 'manual' ? 'text-ink-deep' : 'text-charcoal'}`}>tune</span>
          <div>
            <p className={`text-body-md font-semibold ${tab === 'manual' ? 'text-ink-deep' : 'text-ink'}`}>Configurar manualmente</p>
            <p className="text-label-sm text-charcoal mt-0.5">Informe sistema, tela ou URL você mesmo.</p>
          </div>
        </button>
      </div>

      {tab === 'catalogo' ? (
        selecionada ? (
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-surface border border-ink-deep">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
                <span className="text-label-md font-bold text-ink-deep truncate">{selecionada.nome}</span>
              </div>
              <span className="text-[11px] text-on-surface-variant">{selecionada.categoria} · {selecionada.sistema}</span>
              {identifier(selecionada) && (
                <span className="block text-[10px] font-mono text-outline truncate mt-0.5">{identifier(selecionada)}</span>
              )}
            </div>
            <button
              type="button"
              onClick={onClearScreen}
              className="meta-button-ghost shrink-0 px-4 py-2"
            >
              Alterar
            </button>
          </div>
        ) : (
          <div>
            <div ref={buscaRef} className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-steel text-[18px] pointer-events-none">search</span>
              <input
                value={busca}
                onChange={e => { setBusca(e.target.value); setDropdownAberto(true) }}
                onFocus={() => { if (busca.trim()) setDropdownAberto(true) }}
                placeholder="Buscar tela, módulo ou funcionalidade..."
                className="meta-input w-full pl-9 pr-9"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => { setBusca(''); setDropdownAberto(false) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}

              {dropdownAberto && q && (
                <div className="absolute z-40 mt-1.5 w-full rounded-xl border border-hairline-soft bg-surface shadow-panel overflow-hidden max-h-80 overflow-y-auto">
                  {shown.length === 0 ? (
                    <p className="px-4 py-3 text-[12px] text-outline italic">Nenhuma tela encontrada para "{busca}".</p>
                  ) : (
                    shown.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelect(t.id)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-primary-fixed/30 border-b border-outline-variant/30 last:border-0 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-label-md font-semibold text-on-surface truncate">{t.nome}</span>
                          <span className="text-[10px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded-full shrink-0">{t.sistema}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-on-surface-variant">{t.categoria}</span>
                          {identifier(t) && (
                            <span className="text-[10px] font-mono text-outline truncate">· {identifier(t)}</span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => { setModalAberto(true); setDropdownAberto(false) }}
                      className="w-full text-center px-3 py-2 text-[11px] text-primary font-semibold hover:bg-primary-fixed/20 transition-colors"
                    >
                      Ver mais {matches.length - shown.length} resultado(s) no catálogo completo
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setModalAberto(true)}
              className="mt-2.5 flex items-center gap-1.5 text-[12px] text-primary font-semibold hover:underline"
            >
              <span className="material-symbols-outlined text-[14px]">open_in_full</span>
              Ver catálogo completo
            </button>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1.5">
              Sistema <span className="text-error">*</span>
            </label>
            <input
              required
              list="destino-sistemas-list"
              value={sistema}
              onChange={e => handleManualChange('sistema', e.target.value)}
              placeholder="Ex: portal, crm, mobile"
              className={field}
            />
            <datalist id="destino-sistemas-list">
              {sistemasSugeridas.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          <div className="md:col-span-2">
            <label className="block text-label-md text-on-surface-variant mb-2">
              Onde essa campanha deve aparecer? <span className="text-error">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MODOS.map(opt => {
                const active = modoIdentificacao === opt.value
                return (
                  <label key={opt.value} className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all ${active ? 'border-primary bg-primary-fixed' : 'border-outline-variant bg-surface-container-low hover:border-primary/50'}`}>
                    <input
                      type="radio"
                      name="modo_identificacao"
                      value={opt.value}
                      checked={active}
                      onChange={e => handleManualChange('modo_identificacao', e.target.value)}
                      className="mt-0.5 text-primary focus:ring-primary shrink-0"
                    />
                    <div>
                      <p className={`text-body-md font-semibold ${active ? 'text-primary' : 'text-on-surface'}`}>{opt.label}</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {modoIdentificacao === 'sistema_tela' && (
            <div className="md:col-span-2">
              <label className="block text-label-md text-on-surface-variant mb-1.5">
                Nome da tela <span className="text-error">*</span>
              </label>
              <input
                required
                list="destino-telas-list"
                value={tela}
                onChange={e => handleManualChange('tela', e.target.value)}
                placeholder="Ex: home, checkout, dashboard"
                className={field}
              />
              <datalist id="destino-telas-list">
                {telasSugeridas.map(t => <option key={t} value={t} />)}
              </datalist>
              <p className="mt-1 text-[11px] text-outline">Deve ser o mesmo valor enviado pelo sistema no UserPulse.init.</p>
            </div>
          )}

          {modoIdentificacao === 'data_cy' && (
            <div className="md:col-span-2">
              <label className="block text-label-md text-on-surface-variant mb-1.5">
                Data-cy da tela <span className="text-error">*</span>
              </label>
              <input
                required
                value={dataCy}
                onChange={e => handleManualChange('data_cy', e.target.value)}
                placeholder="Ex: agenda-page"
                className={field}
              />
              <p className="mt-1 text-[11px] text-outline">Informe apenas o valor do data-cy, exemplo: agenda-page.</p>
            </div>
          )}

          {modoIdentificacao === 'url_contem' && (
            <div className="md:col-span-2">
              <label className="block text-label-md text-on-surface-variant mb-1.5">
                URL da tela no Clinic <span className="text-error">*</span>
              </label>
              <input
                required
                value={urlContem}
                onChange={e => handleManualChange('url_contem', e.target.value)}
                placeholder="https://clinic.exemplo.com/app/atendimento/agendamentos"
                className={field}
              />
              <p className="mt-1 text-[11px] text-outline">
                Cole a URL completa da tela onde a campanha deve aparecer. O UserPulse usará apenas o caminho da URL para funcionar em diferentes ambientes.
              </p>
              {urlContem && !urlContem.startsWith('/') && (
                <p className="mt-1 text-[11px] text-amber-600">
                  O caminho deve começar com "/". Exemplo: /app/atendimento/agendamentos
                </p>
              )}
              {urlContem && (
                <p className="mt-1.5 text-[11px] text-primary font-medium bg-primary/5 px-2.5 py-1.5 rounded-lg">
                  Esta campanha será exibida nesta rota e em suas subrotas: <strong>{urlContem}</strong>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {campanhaConflitante && (
        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2.5">
          <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">warning</span>
          <div className="text-[12px] leading-snug">
            <p className="font-semibold">Já existe uma campanha ativa para esta URL neste sistema.</p>
            <p className="mt-0.5 text-amber-700">Se mantiver as duas ativas, apenas uma poderá ser exibida por vez para o usuário final.</p>
            <p className="mt-1 font-medium">Campanha existente: <span className="font-bold">{campanhaConflitante.titulo}</span></p>
          </div>
        </div>
      )}

      <div className="mt-4 p-3.5 rounded-xl border border-outline-variant bg-surface-container-low flex items-start gap-2.5">
        <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[16px]">insights</span>
        </span>
        <div className="min-w-0">
          <p className="text-label-md font-bold text-on-surface mb-0.5">Como isso vai funcionar</p>
          <p className="text-body-md text-on-surface-variant leading-snug">{resumo}</p>
        </div>
      </div>

      {modalAberto && (
        <ScreenCatalogModal
          telas={catalogoTelas}
          onSelect={id => { onSelectScreen(id); setTab('catalogo') }}
          onClose={() => setModalAberto(false)}
        />
      )}
    </div>
  )
}

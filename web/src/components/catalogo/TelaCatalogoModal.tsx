import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { FormEvent } from 'react'
import { ToggleSwitch } from '../ui/ToggleSwitch'
import type { Sistema, TelaCatalogo } from '../../types'

export const TELA_CATALOGO_EMPTY_FORM = {
  nome: '',
  sistema_id: '',
  sistema: '',
  categoria: 'Produto',
  modo_identificacao: 'url_contem',
  tela: '',
  url_contem: '',
  data_cy: '',
  ativo: true,
}

export type TelaCatalogoFormState = typeof TELA_CATALOGO_EMPTY_FORM

const MODOS = [
  { value: 'url_contem', label: 'Caminho da URL', desc: 'Identifica pela rota carregada no navegador.' },
  { value: 'sistema_tela', label: 'Tela informada pelo sistema', desc: 'Usa o nome enviado pela integração.', tooltip: 'É o valor de tela enviado pelo sistema hospedeiro na configuração do embed/init do widget. Exemplo: quando o sistema chama UserPulse.init com a tela atual do usuário.' },
  { value: 'data_cy', label: 'Elemento da tela (data-cy)', desc: 'Procura um elemento específico no DOM.' },
]

const MODO_ICONE: Record<string, string> = {
  url_contem: 'link',
  data_cy: 'tag',
  sistema_tela: 'view_quilt',
}

const field =
  'h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-[16px] leading-[1.5] tracking-[-0.16px] text-[#1c1e21] outline-none placeholder:text-[#8595a4] focus:border-[#1876f2] focus:ring-2 focus:ring-[#1876f2]/10'
const botaoPrimario = 'inline-flex items-center justify-center gap-2 rounded-[100px] bg-[#0064e0] px-[30px] py-[14px] text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-white active:bg-[#0457cb] disabled:bg-[#bcc0c4]'
const botaoGhost = 'inline-flex items-center justify-center rounded-[100px] border-2 border-[rgba(10,19,23,0.12)] px-6 py-3 text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317] active:bg-[#f1f4f7]'

export function pathUrlValido(valor: string): boolean {
  const limpo = valor.trim()
  return limpo === '' || (limpo.startsWith('/') && !/^https?:\/\//i.test(limpo) && !/[\s,]/.test(limpo))
}

export function normalizarPathUrl(valor: string): string {
  const limpo = valor.trim()
  if (!/^https?:\/\//i.test(limpo)) return limpo
  try {
    const url = new URL(limpo)
    return `${url.pathname}${url.search}${url.hash}` || '/'
  } catch {
    return limpo
  }
}

export function formTelaCatalogoDeTela(tela: TelaCatalogo): TelaCatalogoFormState {
  return {
    nome: tela.nome,
    sistema_id: tela.sistema_id,
    sistema: tela.sistema,
    categoria: tela.categoria,
    modo_identificacao: tela.modo_identificacao,
    tela: tela.tela ?? '',
    url_contem: tela.url_contem ?? '',
    data_cy: tela.data_cy ?? '',
    ativo: tela.ativo,
  }
}

function FormSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string; desc?: string; padrao?: boolean }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-[#ced0d4] bg-white px-3 text-[16px] leading-[1.5] tracking-[-0.16px] text-[#1c1e21] outline-none focus:border-[#1876f2] focus:ring-2 focus:ring-[#1876f2]/10"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {selected?.padrao && <span className="material-symbols-outlined text-[16px] leading-none text-[#0064e0]">star</span>}
          <span className="truncate">{selected?.label ?? '—'}</span>
        </span>
        <span className={`material-symbols-outlined text-outline text-[18px] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-[16px] border border-[#dee3e9] bg-white">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-[16px] leading-[1.5] tracking-[-0.16px] ${
                value === o.value
                  ? 'bg-[#e8f2ff] font-bold text-[#0064e0]'
                  : 'text-[#1c1e21] active:bg-[#f1f4f7]'
              }`}
            >
              <span>
                <span className="flex items-center gap-1.5">
                  {o.padrao && <span className="material-symbols-outlined text-[16px] leading-none text-[#0064e0]">star</span>}
                  <span>{o.label}</span>
                </span>
                {o.desc && <span className="mt-0.5 block text-[12px] leading-[1.33] text-[#5d6c7b]">{o.desc}</span>}
              </span>
              {value === o.value && (
                <span className="material-symbols-outlined text-[16px]">check</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ModoIdentificacaoCards({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {MODOS.map(modo => {
        const selecionado = value === modo.value
        return (
          <button
            key={modo.value}
            type="button"
            onClick={() => onChange(modo.value)}
            className={`relative rounded-lg bg-white p-4 text-left ${selecionado ? 'border-2 border-[#0143b5]' : 'border border-[rgba(10,19,23,0.12)]'}`}
          >
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f2ff] text-[#0064e0]">
              <span className="material-symbols-outlined text-[20px] leading-none">{MODO_ICONE[modo.value]}</span>
            </span>
            {'tooltip' in modo && modo.tooltip && (
              <span className="group/tooltip absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-[#0064e0] transition hover:bg-[#e8f2ff]" tabIndex={0} aria-label="Ajuda sobre tela informada pelo sistema">
                <span className="material-symbols-outlined text-[22px]">help</span>
                <span className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-50 hidden w-64 rounded-xl bg-[#0a1317] px-3 py-2 text-[12px] font-semibold leading-4 text-white shadow-[0_12px_30px_rgba(20,22,26,0.22)] group-hover/tooltip:block group-focus/tooltip:block">
                  {modo.tooltip}
                </span>
              </span>
            )}
            <span className="block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">{modo.label}</span>
            <span className="mt-1 block text-[12px] leading-[1.33] text-[#5d6c7b]">{modo.desc}</span>
          </button>
        )
      })}
    </div>
  )
}

export function TelaCatalogoModal({
  form,
  sistemas,
  editando,
  saving,
  error,
  titulo,
  submitLabel,
  onClose,
  onSubmit,
  setForm,
}: {
  form: TelaCatalogoFormState
  sistemas: Sistema[]
  editando?: TelaCatalogo | null
  saving: boolean
  error: string | null
  titulo?: string
  submitLabel?: string
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  setForm: Dispatch<SetStateAction<TelaCatalogoFormState>>
}) {
  const set = (key: keyof TelaCatalogoFormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }))
  const sistemaSelecionadoId = form.sistema_id || sistemas.find(sistema => sistema.padrao && sistema.ativo)?.id || ''

  useEffect(() => {
    if (form.sistema_id || sistemas.length === 0) return
    const padrao = sistemas.find(sistema => sistema.padrao && sistema.ativo)
    if (!padrao) return
    setForm(prev => prev.sistema_id ? prev : { ...prev, sistema_id: padrao.id, sistema: padrao.identificador })
  }, [form.sistema_id, setForm, sistemas])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1317]/45 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#dee3e9] bg-white">
        <div className="flex items-center justify-between border-b border-[#dee3e9] px-6 py-5">
          <h3 className="text-[24px] font-semibold leading-[1.25] text-[#0a1317]">
            {titulo ?? (editando ? 'Editar Tela' : 'Nova Tela')}
          </h3>
          <button
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dee3e9] text-[#1c1e21] active:bg-[#f1f4f7]"
          >
            <span className="material-symbols-outlined text-[20px] leading-none">close</span>
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 px-6 py-5">
          {error && (
            <div className="rounded-[16px] border border-[#f0284a] p-3 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#e41e3f]">{error}</div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">
                Nome <span className="text-[#e41e3f]">*</span>
              </label>
              <input
                required
                value={form.nome}
                onChange={e => set('nome', e.target.value)}
                placeholder="Ex: Agendamentos"
                className={field}
              />
            </div>
            <div>
              <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">
                Sistema <span className="text-[#e41e3f]">*</span>
              </label>
              <FormSelect
                value={sistemaSelecionadoId}
                options={[{ value: '', label: 'Selecione...' }, ...sistemas.map(s => ({ value: s.id, label: s.nome, desc: s.identificador, padrao: s.padrao }))]}
                onChange={value => {
                  const selecionado = sistemas.find(s => s.id === value)
                  setForm(prev => ({ ...prev, sistema_id: value, sistema: selecionado?.identificador ?? '' }))
                }}
              />
            </div>
            <div className="col-span-2">
              <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">
                Modo de identificação <span className="text-[#e41e3f]">*</span>
              </label>
              <ModoIdentificacaoCards
                value={form.modo_identificacao}
                onChange={v => set('modo_identificacao', v)}
              />
            </div>

            {form.modo_identificacao === 'sistema_tela' && (
              <div className="col-span-2">
                <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">Nome da tela</label>
                <input
                  value={form.tela}
                  onChange={e => set('tela', e.target.value)}
                  placeholder="Ex: agendamentos"
                  className={field}
                />
              </div>
            )}
            {form.modo_identificacao === 'url_contem' && (
              <div className="col-span-2">
                <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">Caminho da URL</label>
                <input
                  value={form.url_contem}
                  onChange={e => set('url_contem', e.target.value)}
                  onBlur={e => set('url_contem', normalizarPathUrl(e.target.value))}
                  onPaste={e => {
                    const texto = e.clipboardData.getData('text')
                    if (!/^https?:\/\//i.test(texto.trim())) return
                    e.preventDefault()
                    set('url_contem', normalizarPathUrl(texto))
                  }}
                  placeholder="Ex: /app/faturamento"
                  className={`${field} ${form.url_contem.trim() && !pathUrlValido(form.url_contem) ? 'border-[#f0284a] focus:border-[#f0284a] focus:ring-[#f0284a]/10' : ''}`}
                />
                <p className="mt-2 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#5d6c7b]">
                  Informe apenas o caminho, como /app/faturamento. A URL completa é lida pelo embed do widget no sistema onde ele está instalado.
                </p>
              </div>
            )}
            {form.modo_identificacao === 'data_cy' && (
              <div className="col-span-2">
                <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">Valor do data-cy</label>
                <input
                  value={form.data_cy}
                  onChange={e => set('data_cy', e.target.value)}
                  placeholder="Ex: agenda-page"
                  className={field}
                />
              </div>
            )}

            <div className="col-span-2 flex items-center gap-3 pt-1">
              <ToggleSwitch checked={form.ativo} onChange={v => set('ativo', v)} />
              <label
                onClick={() => set('ativo', !form.ativo)}
                className="cursor-pointer select-none text-[16px] leading-[1.5] tracking-[-0.16px] text-[#1c1e21]"
              >
                {form.ativo ? 'Tela ativa' : 'Tela inativa'}
                <span className="ml-1 text-[12px] leading-[1.33] text-[#5d6c7b]">(aparece no catálogo de campanhas se ativa)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={botaoGhost}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className={botaoPrimario}>
              {saving ? 'Salvando...' : submitLabel ?? (editando ? 'Salvar' : 'Criar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

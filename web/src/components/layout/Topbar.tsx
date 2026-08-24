import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { Campanha, Jornada, ModuloPainel, TourGuiadoListaPaginada } from '../../types'
import { podeGerenciarModulo } from '../../utils/permissions'
import { get } from '../../services/api'

interface Props {
  collapsed: boolean
  onOpenMobileSidebar: () => void
}

// Cada atalho de criação pertence a um módulo diferente (Fase 4) — não dá
// mais pra esconder os 3 atrás de um único booleano "pode escrever
// conteúdo", já que GERENCIAR pode divergir entre CAMPANHAS/JORNADAS/TOURS
// com personalização ativa (ver opcoesNovoDisponiveis abaixo).
const opcoesNovo: { label: string; description: string; icon: string; to: string; modulo: ModuloPainel }[] = [
  { label: 'Campanha', description: 'Criar comunicado, melhoria ou pesquisa.', icon: 'campaign', to: '/campanhas/nova', modulo: 'CAMPANHAS' },
  { label: 'Jornada', description: 'Criar uma trilha de etapas guiadas.', icon: 'route', to: '/jornadas/novo', modulo: 'JORNADAS' },
  { label: 'Tour', description: 'Criar um passo a passo dentro do produto.', icon: 'map', to: '/tours/novo', modulo: 'TOURS' },
]

type ResultadoBusca = {
  id: string
  tipo: 'campanha' | 'tour' | 'jornada'
  titulo: string
  subtitulo: string
  icon: string
  to: string
}

const BUSCA_DEBOUNCE_MS = 250

// Iniciais pro avatar (fallback "UP" se, por algum motivo, o nome vier vazio
// — nunca deveria acontecer, mas evita um avatar em branco).
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'UP'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export function Topbar({ collapsed, onOpenMobileSidebar }: Props) {
  const [search, setSearch] = useState('')
  const [novoAberto, setNovoAberto] = useState(false)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [buscaLoading, setBuscaLoading] = useState(false)
  const [resultadosBusca, setResultadosBusca] = useState<ResultadoBusca[]>([])
  const [contaAberta, setContaAberta] = useState(false)
  const novoRef = useRef<HTMLDivElement>(null)
  const buscaRef = useRef<HTMLFormElement>(null)
  const contaRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const opcoesNovoDisponiveis = opcoesNovo.filter(o => podeGerenciarModulo(user, o.modulo))

  useEffect(() => {
    if (!novoAberto) return
    const onMouseDown = (e: MouseEvent) => {
      if (novoRef.current && !novoRef.current.contains(e.target as Node)) setNovoAberto(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNovoAberto(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [novoAberto])

  useEffect(() => {
    if (!contaAberta) return
    const onMouseDown = (e: MouseEvent) => {
      if (contaRef.current && !contaRef.current.contains(e.target as Node)) setContaAberta(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContaAberta(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [contaAberta])

  useEffect(() => {
    if (!buscaAberta) return
    const onMouseDown = (e: MouseEvent) => {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) setBuscaAberta(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBuscaAberta(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [buscaAberta])

  useEffect(() => {
    const termo = search.trim()
    if (!termo) {
      setResultadosBusca([])
      setBuscaLoading(false)
      return
    }

    let cancelado = false
    setBuscaLoading(true)
    const t = window.setTimeout(async () => {
      try {
        const [campanhas, tours, jornadas] = await Promise.all([
          get<Campanha[]>('/campanhas').catch(() => []),
          get<TourGuiadoListaPaginada>(`/tours?busca=${encodeURIComponent(termo)}&page=1&pageSize=5`).catch(() => null),
          get<Jornada[]>('/jornadas').catch(() => []),
        ])
        if (cancelado) return

        const q = termo.toLowerCase()
        const campanhasFiltradas = campanhas
          .filter(c => [c.nome_interno, c.titulo, c.subtitulo ?? '', c.slug, c.sistema, c.tela, c.tipo]
            .some(v => v.toLowerCase().includes(q)))
          .slice(0, 5)
          .map<ResultadoBusca>(c => ({
            id: `campanha-${c.id}`,
            tipo: 'campanha',
            titulo: c.nome_interno,
            subtitulo: `Campanha · ${c.sistema} · ${c.tela}`,
            icon: 'campaign',
            to: `/campanhas/${c.id}/dashboard`,
          }))

        const toursFiltrados = (tours?.items ?? []).slice(0, 5).map<ResultadoBusca>(t => ({
          id: `tour-${t.id}`,
          tipo: 'tour',
          titulo: t.titulo,
          subtitulo: `Tour · ${t.sistema} · ${t._count?.passos ?? 0} passo${(t._count?.passos ?? 0) === 1 ? '' : 's'}`,
          icon: 'map',
          to: `/tours/${t.id}/dashboard`,
        }))

        const jornadasFiltradas = jornadas
          .filter(j => `${j.titulo} ${j.slug}`.toLowerCase().includes(q))
          .slice(0, 5)
          .map<ResultadoBusca>(j => ({
            id: `jornada-${j.id}`,
            tipo: 'jornada',
            titulo: j.titulo,
            subtitulo: `Jornada · ${j.slug}`,
            icon: 'route',
            to: `/jornadas/${j.id}/editar`,
          }))

        setResultadosBusca([...campanhasFiltradas, ...toursFiltrados, ...jornadasFiltradas].slice(0, 12))
      } catch {
        if (!cancelado) setResultadosBusca([])
      } finally {
        if (!cancelado) setBuscaLoading(false)
      }
    }, BUSCA_DEBOUNCE_MS)

    return () => {
      cancelado = true
      window.clearTimeout(t)
    }
  }, [search])

  const navegarBusca = (to: string) => {
    setBuscaAberta(false)
    setSearch('')
    navigate(to)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const termo = search.trim()
    if (!termo) return
    const primeiroResultado = resultadosBusca[0]
    if (primeiroResultado) {
      navegarBusca(primeiroResultado.to)
      return
    }

    const destino = location.pathname.startsWith('/tours')
      ? '/tours'
      : location.pathname.startsWith('/jornadas')
      ? '/jornadas'
      : location.pathname.startsWith('/campanhas')
      ? '/campanhas'
      : null
    if (destino) navegarBusca(`${destino}?busca=${encodeURIComponent(termo)}`)
    else setBuscaAberta(true)
  }

  const navegarParaCriacao = (to: string) => {
    setNovoAberto(false)
    navigate(to)
  }

  const sair = () => {
    setContaAberta(false)
    void logout()
  }

  return (
    <header
      className={`fixed inset-x-0 top-0 h-16 bg-white border-b border-outline-variant flex justify-between items-center px-4 md:pr-8 ${collapsed ? 'md:pl-32' : 'md:pl-[324px]'} z-40 transition-[padding-left] duration-200`}
    >
      <button
        type="button"
        onClick={onOpenMobileSidebar}
        aria-label="Abrir menu"
        className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant active:bg-surface-container md:hidden"
      >
        <span className="material-symbols-outlined text-[24px] leading-none">menu</span>
      </button>
      <form ref={buscaRef} onSubmit={handleSearch} className="relative flex items-center flex-1 max-w-lg">
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
            search
          </span>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setBuscaAberta(Boolean(e.target.value.trim())) }}
            onFocus={() => setBuscaAberta(Boolean(search.trim()))}
            className="h-10 w-full rounded-full border-0 bg-surface-container-low pl-10 pr-4 text-body-sm text-on-surface outline-none transition-colors placeholder:text-outline focus:ring-2 focus:ring-primary"
            placeholder="Buscar campanhas, tours ou jornadas..."
            type="text"
          />
        </div>
        {buscaAberta && search.trim() && (
          <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-3xl border border-outline-variant bg-surface p-2 shadow-panel">
            {buscaLoading && (
              <div className="flex items-center gap-2 px-3 py-4 text-body-md text-on-surface-variant">
                <span>Buscando</span>
                <span className="flex items-center gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-[search-dot_900ms_ease-in-out_infinite]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-[search-dot_900ms_ease-in-out_150ms_infinite]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-[search-dot_900ms_ease-in-out_300ms_infinite]" />
                </span>
              </div>
            )}
            {!buscaLoading && resultadosBusca.length === 0 && (
              <div className="px-3 py-4 text-body-md text-on-surface-variant">Nenhum resultado encontrado.</div>
            )}
            {!buscaLoading && resultadosBusca.map(resultado => (
                <button
                  key={resultado.id}
                  type="button"
                  onClick={() => navegarBusca(resultado.to)}
                  className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-surface-container-low"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-[19px]">{resultado.icon}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-body-md font-bold text-on-surface">{resultado.titulo}</span>
                    <span className="mt-0.5 block truncate text-label-md text-on-surface-variant">{resultado.subtitulo}</span>
                  </span>
                </button>
              ))}
          </div>
        )}
      </form>

      <div className="flex items-center gap-1.5 sm:gap-2 ml-3 sm:ml-5">
        {opcoesNovoDisponiveis.length > 0 && (
          <div className="relative" ref={novoRef}>
            <button
              type="button"
              onClick={() => setNovoAberto(v => !v)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-[30px] text-label-md font-bold tracking-[-0.14px] text-on-primary transition-colors active:bg-[#0457cb] active:scale-[0.98]"
              aria-haspopup="menu"
              aria-expanded={novoAberto}
            >
              <span className={`material-symbols-outlined text-[18px] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${novoAberto ? 'rotate-45 scale-110' : 'rotate-0 scale-100'}`}>add</span>
              <span>Novo</span>
            </button>
            {novoAberto && (
              <div className="absolute right-0 z-50 mt-2 w-72 origin-top-right overflow-hidden rounded-3xl border border-outline-variant bg-surface p-2 shadow-panel animate-[novo-menu-in_240ms_cubic-bezier(0.16,1,0.3,1)]" role="menu">
                {opcoesNovoDisponiveis.map((opcao, index) => (
                  <button
                    key={opcao.to}
                    type="button"
                    role="menuitem"
                    onClick={() => navegarParaCriacao(opcao.to)}
                    className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left opacity-0 transition-colors hover:bg-surface-container-low animate-[novo-item-in_260ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
                    style={{ animationDelay: `${index * 45 + 60}ms` }}
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <span className="material-symbols-outlined text-[19px]">{opcao.icon}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-body-md font-bold text-on-surface">{opcao.label}</span>
                      <span className="mt-0.5 block text-label-md text-on-surface-variant">{opcao.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button type="button" title="Notificações" aria-label="Notificações" className="relative flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-surface" />
        </button>
        <button type="button" title="Ajuda" aria-label="Ajuda" className="hidden h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface sm:flex">
          <span className="material-symbols-outlined">help_outline</span>
        </button>

        <div className="hidden sm:block h-8 w-px bg-outline-variant mx-1" />

        <div className="relative" ref={contaRef}>
          <button
            type="button"
            onClick={() => setContaAberta(v => !v)}
            aria-haspopup="menu"
            aria-expanded={contaAberta}
              className="flex items-center gap-2.5 rounded-full px-2 py-1.5 transition-colors hover:bg-surface-container-low"
          >
            <div className="hidden md:block text-right">
              <p className="text-label-md font-bold text-on-surface">{user?.nome ?? 'Admin'}</p>
              <p className="text-[10px] text-outline uppercase tracking-wider truncate max-w-[160px]">{user?.email ?? 'UserPulse'}</p>
            </div>
            <div
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm"
              title={user?.email}
            >
              {iniciais(user?.nome ?? 'UserPulse')}
            </div>
          </button>
          {contaAberta && (
            <div className="absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-3xl border border-outline-variant bg-surface p-3 shadow-panel" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => { setContaAberta(false); navigate('/minha-conta') }}
                className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-surface-container-low"
              >
                <span className="material-symbols-outlined text-[19px] text-on-surface-variant">account_circle</span>
                <span className="text-body-md font-medium text-on-surface">Minha conta</span>
              </button>
              <div className="my-2 h-px bg-outline-variant/50" />
              <button
                type="button"
                role="menuitem"
                onClick={sair}
                className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-error/10"
              >
                <span className="material-symbols-outlined text-[19px] text-error">logout</span>
                <span className="text-body-md font-medium text-error">Sair</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

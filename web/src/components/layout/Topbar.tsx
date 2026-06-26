import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  collapsed: boolean
}

export function Topbar({ collapsed }: Props) {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) {
      navigate(`/campanhas?busca=${encodeURIComponent(search.trim())}`)
      setSearch('')
    }
  }

  return (
    <header
      className={`fixed top-0 right-0 ${collapsed ? 'left-16' : 'left-[248px]'} h-16 bg-surface border-b border-outline-variant/30 flex justify-between items-center px-4 lg:px-margin-desktop z-40 transition-[left] duration-200`}
    >
      <form onSubmit={handleSearch} className="flex items-center flex-1 max-w-lg">
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
            search
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2 bg-surface-container-low border-none rounded-xl focus:ring-2 focus:ring-primary text-body-md outline-none transition-all"
            placeholder="Buscar campanhas..."
            type="text"
          />
        </div>
      </form>

      <div className="flex items-center gap-2 sm:gap-4 ml-3 sm:ml-6">
        <button className="relative p-2 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-surface" />
        </button>
        <button className="hidden sm:block p-2 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">help_outline</span>
        </button>

        <div className="hidden sm:block h-8 w-px bg-outline-variant mx-1" />

        <div className="flex items-center gap-3">
          <div className="hidden md:block text-right">
            <p className="text-label-md font-bold text-on-surface">Admin</p>
            <p className="text-[10px] text-outline uppercase tracking-wider">UserPulse</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-sm border-2 border-primary-fixed">
            UP
          </div>
        </div>
      </div>
    </header>
  )
}

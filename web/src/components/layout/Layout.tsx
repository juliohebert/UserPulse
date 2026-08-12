import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { AvisoComercial } from './AvisoComercial'
import { BoasVindasTrial } from './BoasVindasTrial'

const STORAGE_KEY = 'userpulse:sidebar:collapsed'

export function Layout() {
  const location = useLocation()
  const rotaConfiguracoes = location.pathname === '/configuracoes' || location.pathname.startsWith('/configuracoes/')
  const [submoduloAberto, setSubmoduloAberto] = useState(rotaConfiguracoes)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })

  const toggle = () =>
    setCollapsed(v => {
      const next = !v
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch {}
      return next
    })

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={toggle} onSubmoduloChange={setSubmoduloAberto} />
      <Topbar collapsed={collapsed} />
      <main className={`ml-24 ${submoduloAberto ? 'md:ml-[296px]' : collapsed ? 'md:ml-24' : 'md:ml-[296px]'} pt-16 min-h-screen transition-[margin-left] duration-200`}>
        <AvisoComercial />
        <BoasVindasTrial />
        <Outlet />
      </main>
    </div>
  )
}

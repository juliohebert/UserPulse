import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { AvisoComercial } from './AvisoComercial'
import { ModalContratacaoBloqueio } from './ModalContratacaoBloqueio'

const STORAGE_KEY = 'userpulse:sidebar:collapsed'

export function Layout() {
  const location = useLocation()
  const rotaConfiguracoes = location.pathname === '/configuracoes' || location.pathname.startsWith('/configuracoes/')
  const [submoduloAberto, setSubmoduloAberto] = useState(rotaConfiguracoes)
  const [sidebarMobileAberta, setSidebarMobileAberta] = useState(false)
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
    <div className="min-h-screen bg-[#f5f7fb]">
      {sidebarMobileAberta && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setSidebarMobileAberta(false)}
          className="fixed inset-0 z-40 bg-[#0a1317]/45 backdrop-blur-sm md:hidden"
        />
      )}
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        onSubmoduloChange={setSubmoduloAberto}
        mobileOpen={sidebarMobileAberta}
        onCloseMobile={() => setSidebarMobileAberta(false)}
      />
      <Topbar onOpenMobileSidebar={() => setSidebarMobileAberta(true)} />
      <main className={`ml-0 ${collapsed ? 'md:ml-24' : submoduloAberto ? 'md:ml-[296px]' : 'md:ml-[296px]'} pt-16 min-h-screen transition-[margin-left] duration-200`}>
        <AvisoComercial />
        <ModalContratacaoBloqueio />
        <Outlet />
      </main>
    </div>
  )
}

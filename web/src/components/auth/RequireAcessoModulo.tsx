import { Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { EmptyState } from '../ui/EmptyState'
import { podeVisualizarModulo, podeGerenciarModulo } from '../../utils/permissions'
import type { ModuloPainel, NivelAcessoModulo } from '../../types'

const MODULO_TITULO: Record<ModuloPainel, string> = {
  CAMPANHAS: 'Campanhas',
  TOURS: 'Tours Guiados',
  JORNADAS: 'Jornadas',
  CONFIGURACOES: 'Configurações',
}

// Fase 4 de permissões personalizadas — guard genérico de rota por módulo
// (substitui o antigo RequireEscritaConteudo, que tratava campanhas+tours+
// jornadas como um "conteúdo" único, sem distinguir módulo nem nível).
// Espelha requireAcessoModulo no backend (ver server/src/middleware/
// requireAcessoModulo.ts) — mesmo par (modulo, nivel mínimo), mesma decisão
// já resolvida em user.permissoes_efetivas (ver utils/permissions.ts, nunca
// recalculada aqui). Fica dentro de <Layout> (sidebar/topbar continuam
// visíveis) — só o conteúdo principal vira a mensagem de bloqueio, mesmo
// padrão de RequireEscritaConfiguracao.tsx. Só UX: o backend já bloqueia
// com 403 mesmo que alguém contorne esta tela.
export function RequireAcessoModulo({ modulo, nivel }: { modulo: ModuloPainel; nivel: NivelAcessoModulo }) {
  const { user } = useAuth()
  const permitido = nivel === 'GERENCIAR' ? podeGerenciarModulo(user, modulo) : podeVisualizarModulo(user, modulo)

  if (!permitido) {
    return (
      <div className="px-4 lg:px-margin-desktop py-10">
        <EmptyState
          icon="lock"
          title="Acesso restrito"
          description={
            nivel === 'GERENCIAR'
              ? `Seu papel não permite criar ou editar em ${MODULO_TITULO[modulo]}. Peça a um administrador do seu time se precisar de acesso.`
              : `Você não tem acesso ao módulo ${MODULO_TITULO[modulo]}. Peça a um administrador do seu time se precisar de acesso.`
          }
        />
      </div>
    )
  }

  return <Outlet />
}

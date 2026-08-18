import type { FormEvent } from 'react'
import type { AdminDoTenant, ModuloPainel, NivelAcessoModulo } from '../../types'
import type { FormPermissoes } from '../../utils/permissoesUsuario'
import { MODULOS_PAINEL, MODULO_LABEL, NIVEL_OPCOES } from '../../utils/permissoesUsuario'
import { LoadingSpinner } from '../ui/EmptyState'
import { Select } from '../ui/Select'
import { ToggleSwitch } from '../ui/ToggleSwitch'
import { Button } from '../ui/Button'

const ROLE_LABEL: Record<AdminDoTenant['role'], string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Visualizador',
}

// Fase 3 de permissões personalizadas — modal "Personalizar permissões",
// aberto a partir da tela de Acessos (ver Tenants.tsx, único ponto de
// entrada; só SUPER_ADMIN chega aqui). Componente controlado: todo o estado
// (form/loading/saving/error) vive em Tenants.tsx, mesmo padrão de
// TelaCatalogoModal.tsx — este arquivo só apresenta e emite eventos, nunca
// chama a API sozinho. GERENCIAR implica VISUALIZAR é uma regra do
// backend (ver lib/permissoesModulo.ts); aqui os 3 níveis aparecem como
// alternativas mutuamente exclusivas de um único select por módulo — nunca
// dois checkboxes, pra não deixar o usuário desenhar um estado impossível
// (ex.: "gerenciar" marcado sem "visualizar").
export function PermissoesUsuarioModal({
  usuario,
  loading,
  saving,
  error,
  form,
  onClose,
  onSubmit,
  onTogglePersonalizado,
  onChangeModulo,
}: {
  usuario: AdminDoTenant
  loading: boolean
  saving: boolean
  error: string | null
  form: FormPermissoes | null
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  onTogglePersonalizado: (v: boolean) => void
  onChangeModulo: (modulo: ModuloPainel, nivel: NivelAcessoModulo) => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <h3 className="text-title-md font-bold text-on-surface truncate pr-2">Permissões — {usuario.nome}</h3>
          <button
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
            className="shrink-0 p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && <LoadingSpinner />}

          {/* Falha no GET inicial (form nunca chegou a existir) — erro
              aparece sozinho, sem formulário pra preencher ainda. Erro de
              salvar (form já existe) aparece dentro do form abaixo,
              mantendo os valores preenchidos, nunca fechando o modal. */}
          {!loading && !form && error && (
            <div className="px-5 py-4">
              <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{error}</div>
            </div>
          )}

          {!loading && form && (
            <form onSubmit={onSubmit} className="px-5 py-4 space-y-4">
              {error && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{error}</div>}

              <div>
                <span className="block text-label-md text-on-surface-variant mb-1">Perfil base</span>
                <p className="text-body-md text-on-surface font-semibold">{ROLE_LABEL[usuario.role]}</p>
              </div>

              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60">
                <ToggleSwitch checked={form.personalizado} onChange={onTogglePersonalizado} disabled={saving} />
                <label onClick={() => !saving && onTogglePersonalizado(!form.personalizado)} className="text-body-md text-on-surface cursor-pointer select-none">
                  Personalizar permissões deste usuário
                </label>
              </div>

              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-outline">Módulos</h4>
                {MODULOS_PAINEL.map(modulo => (
                  <div key={modulo} className="flex items-center justify-between gap-3">
                    <span className="text-body-md text-on-surface">{MODULO_LABEL[modulo]}</span>
                    <div className="w-40 shrink-0">
                      <Select
                        size="sm"
                        value={form.matriz[modulo]}
                        options={NIVEL_OPCOES}
                        disabled={!form.personalizado || saving}
                        onChange={v => onChangeModulo(modulo, v as NivelAcessoModulo)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[12px] text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">
                Gerenciar já inclui visualizar. Billing e Minha Assinatura não fazem parte desta matriz.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={onClose} variant="ghost" disabled={saving}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} size="md">
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export interface RegraSenha {
  chave: string
  descricao: string
  testar: (s: string) => boolean
}

// Mesmas regras do backend (server/src/controllers/auth.ts,
// REGRAS_SENHA_FORTE) — reutilizadas em cadastro, redefinição de senha
// (esqueci minha senha) e alteração de senha autenticada (Minha Conta),
// sempre pelo mesmo checklist. Duplicadas aqui de propósito, sem pacote
// compartilhado entre server/web neste projeto. O backend é sempre quem
// decide de verdade; este componente só alimenta o checklist visual — uma
// senha que passe aqui mas seja rejeitada lá cai no erro geral do
// formulário, nunca trava o usuário sem explicação.
export const REGRAS_SENHA: RegraSenha[] = [
  { chave: 'tamanho', descricao: 'Pelo menos 8 caracteres', testar: s => s.length >= 8 },
  { chave: 'maiuscula', descricao: 'Uma letra maiúscula', testar: s => /[A-Z]/.test(s) },
  { chave: 'minuscula', descricao: 'Uma letra minúscula', testar: s => /[a-z]/.test(s) },
  { chave: 'numero', descricao: 'Um número', testar: s => /[0-9]/.test(s) },
  { chave: 'especial', descricao: 'Um caractere especial', testar: s => /[^A-Za-z0-9]/.test(s) },
]

export function senhaAtendeTodasRegras(senha: string): boolean {
  return REGRAS_SENHA.every(r => r.testar(senha))
}

// Só aparece depois que o usuário começa a digitar (senha vazia = campo
// ainda não tocado, sem motivo pra mostrar uma lista de requisitos não
// atendidos ainda).
export function RequisitosSenha({ senha }: { senha: string }) {
  if (senha.length === 0) return null
  return (
    <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
      {REGRAS_SENHA.map(r => {
        const ok = r.testar(senha)
        return (
          <li key={r.chave} className={`flex items-center gap-1.5 text-label-sm ${ok ? 'text-tertiary' : 'text-on-surface-variant'}`}>
            <span className="material-symbols-outlined text-[14px] shrink-0">{ok ? 'check_circle' : 'radio_button_unchecked'}</span>
            {r.descricao}
          </li>
        )
      })}
    </ul>
  )
}

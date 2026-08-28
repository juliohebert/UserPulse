import type { Campanha } from '../../types'
import { montarResumoCampanha } from './campanhaResumo'

// Conteúdo do "Resumo da configuração" — alertas + linhas (label / valor).
// Compartilhado entre a página de Preview (/campanhas/:id/preview) e o modal
// "Revisar configuração" do formulário de edição (RASCUNHO/INATIVA, antes de
// Publicar/Reativar). Não traz chrome própria (título da seção, borda,
// modal): cada caller fornece a sua. Nenhuma regra é recalculada aqui — tudo
// vem da função pura montarResumoCampanha.
export function ResumoConfiguracao({ campanha }: { campanha: Campanha }) {
  const resumo = montarResumoCampanha(campanha)
  return (
    <>
      {resumo.alertas.length > 0 && (
        <div className="px-5 py-4 space-y-2 border-b border-outline-variant/30">
          {resumo.alertas.map((a, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 rounded-xl p-3 ${
                a.tipo === 'aviso' ? 'bg-[#fff8e1] border border-[#ffe082]' : 'bg-surface-container-low'
              }`}
            >
              <span className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${
                a.tipo === 'aviso' ? 'text-[#e65100]' : 'text-on-surface-variant'
              }`}>
                {a.tipo === 'aviso' ? 'warning' : 'info'}
              </span>
              <p className={`text-body-sm ${
                a.tipo === 'aviso' ? 'text-[#e65100] font-semibold' : 'text-on-surface-variant'
              }`}>
                {a.texto}
              </p>
            </div>
          ))}
        </div>
      )}

      <dl className="divide-y divide-outline-variant/20">
        {resumo.linhas.map(l => (
          <div key={l.label} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
            <dt className="text-label-md text-on-surface-variant sm:w-[132px] sm:shrink-0">{l.label}</dt>
            <dd className="text-body-md text-on-surface min-w-0 break-words">{l.valor}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

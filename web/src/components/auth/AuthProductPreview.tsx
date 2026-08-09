import { useState } from 'react'

type Opcao = 'campanhas' | 'tours' | 'jornadas'

const OPCOES: { key: Opcao; label: string; icon: string }[] = [
  { key: 'campanhas', label: 'Campanhas in-app', icon: 'campaign' },
  { key: 'tours', label: 'Tours guiados', icon: 'map' },
  { key: 'jornadas', label: 'Jornadas', icon: 'route' },
]

const LEGENDA: Record<Opcao, string> = {
  campanhas: 'Um comunicado aparece dentro do sistema, na tela certa, sem precisar sair do contexto.',
  tours: 'Um roteiro guiado destaca o elemento certo e ensina o fluxo passo a passo.',
  jornadas: 'Uma sequência de etapas conduz o usuário do primeiro acesso até o uso completo.',
}

const fill = { fontVariationSettings: "'FILL' 1" }

// Comunicado de nova funcionalidade, com vídeo, explicação, CTA e uma
// pequena área de feedback — versão compacta e adaptada do mock "melhoria"
// de /apresentacao (nunca copiada literalmente: aqui cabe inteira numa
// coluna de login, sem barra de rolagem própria). O vídeo é só
// representação visual (gradiente + ícone de play + duração falsa) — sem
// player, sem autoplay, sem fonte externa.
function MockCampanhas() {
  return (
    <div className="bg-white rounded-xl shadow-xl w-full max-w-[220px] border border-slate-100 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 bg-slate-50/80">
        <div className="w-3.5 h-3.5 rounded bg-primary flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-white text-[9px]" style={fill}>pulse_alert</span>
        </div>
        <span className="flex-1 text-[9px] font-bold text-primary uppercase tracking-wider truncate">Comunicado</span>
        <span className="material-symbols-outlined text-slate-300 text-[12px] select-none shrink-0">close</span>
      </div>

      <div className="px-3 pt-2.5 pb-3">
        <p className="text-[11px] font-bold text-slate-800 leading-snug mb-2">Nova funcionalidade disponível</p>

        {/* Vídeo — só representação visual, nunca um player de verdade */}
        <div className="relative w-full h-14 rounded-lg overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 mb-2">
          <div className="absolute inset-0 opacity-20 select-none pointer-events-none">
            <div className="absolute top-1.5 left-2 w-9 h-1 bg-white/40 rounded-full" />
            <div className="absolute top-3.5 left-2 w-6 h-1 bg-white/25 rounded-full" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-white/20 border border-white/40 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[13px]" style={fill}>play_arrow</span>
            </div>
          </div>
          <span className="absolute bottom-1 right-1.5 text-[8px] text-white/70 font-mono bg-black/50 px-1 py-px rounded">0:42</span>
        </div>

        <p className="text-[9.5px] text-slate-500 leading-relaxed mb-2.5">Veja como usar o novo recurso em menos de um minuto.</p>

        <div className="w-full py-1.5 rounded-lg bg-primary text-white text-[10px] font-bold text-center mb-2.5">Ver novidade</div>

        {/* Feedback rápido — só visual, sem interação, pra não pesar o mock */}
        <div className="pt-2 border-t border-slate-100">
          <p className="text-[8.5px] font-semibold text-slate-400 mb-1">O que achou?</p>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(n => (
              <span
                key={n}
                className={`material-symbols-outlined text-[12px] ${n <= 4 ? 'text-amber-400' : 'text-slate-200'}`}
                style={n <= 4 ? fill : undefined}
              >
                star
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Interface simulada do sistema cliente (cartão claro com barra de título e
// grade de conteúdo) com o botão "Novo" embutido nela, no canto superior
// direito — precisa parecer parte de uma tela real do cliente, não um
// elemento solto no fundo azul da coluna. O tooltip do tour fica encostado
// nele, com um pequeno conector (mesmo losango recortado do mock de
// /apresentacao), deixando claro que o UserPulse encontrou e está
// destacando justamente esse botão.
function MockTours() {
  return (
    <div className="relative w-full max-w-[220px]">
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-2.5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="h-2 w-12 bg-slate-200 rounded-full" />
          <div className="relative h-6 px-2 rounded-md bg-primary shadow-md ring-4 ring-primary/25 flex items-center gap-1 shrink-0">
            <span className="material-symbols-outlined text-white text-[12px]">add</span>
            <span className="text-white text-[9px] font-bold">Novo</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 mb-1.5">
          {[1, 2, 3].map(i => <div key={i} className="h-6 bg-slate-50 rounded border border-slate-100" />)}
        </div>
        <div className="space-y-1">
          {[1, 2].map(i => <div key={i} className="h-3.5 bg-slate-50 rounded border border-slate-100" />)}
        </div>
      </div>

      {/* Tooltip encostado logo abaixo do botão destacado — a proximidade
          mais o losango recortado (aponta direto pro botão) já deixam a
          relação clara, sem precisar de conector extra. */}
      <div className="absolute top-[38px] right-2 w-[142px] bg-white rounded-lg shadow-xl border border-slate-200 p-2.5">
        <div className="absolute -top-[5px] right-5 w-2.5 h-2.5 bg-white border-t border-l border-slate-200 rotate-45" />
        <p className="text-[8px] font-bold uppercase tracking-wider text-primary mb-0.5">Passo 1 de 3</p>
        <p className="text-[10px] font-bold text-slate-800 leading-snug mb-1.5">Comece por aqui</p>
        <div className="flex items-center gap-1">
          {[0, 1, 2].map(d => (
            <span key={d} className={`h-1 rounded-full ${d === 0 ? 'w-3 bg-primary' : 'w-1 bg-slate-200'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

function MockJornadas() {
  const etapas = [
    { titulo: 'Boas-vindas', estado: 'feito' as const },
    { titulo: 'Primeiro tour', estado: 'atual' as const },
    { titulo: 'Configuração concluída', estado: 'pendente' as const },
  ]
  return (
    <div className="bg-white rounded-xl shadow-xl p-3.5 w-full max-w-[220px] border border-slate-100">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="material-symbols-outlined text-primary text-[14px]" style={fill}>route</span>
        <span className="text-[10px] font-bold text-slate-700">Jornada de ativação</span>
      </div>
      <div className="space-y-2.5">
        {etapas.map((e, i) => (
          <div key={e.titulo} className="flex items-center gap-2.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
              e.estado === 'feito' ? 'bg-primary text-white'
                : e.estado === 'atual' ? 'bg-primary/15 text-primary border-2 border-primary'
                : 'bg-slate-100 text-slate-300 border border-slate-200'
            }`}>
              {e.estado === 'feito'
                ? <span className="material-symbols-outlined text-[12px]" style={fill}>check</span>
                : <span className="text-[9px] font-bold">{i + 1}</span>}
            </div>
            <span className={`text-[10px] leading-snug ${e.estado === 'pendente' ? 'text-slate-300' : 'text-slate-700 font-semibold'}`}>
              {e.titulo}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Mini demonstração interativa da coluna institucional, inspirada nos mocks
// de /apresentacao (mesma linguagem visual: navegador falso + cartão branco
// flutuando por cima), só que compacta o bastante pra caber ao lado de um
// formulário de autenticação. 100% mock em React/CSS, sem iframe, sem
// runtime real do widget, sem dado externo — só pra dar a sensação de
// produto antes do login. Continua sendo uma tela de autenticação, não uma
// landing page: sem seções extras, sem rolagem própria.
export function AuthProductPreview() {
  const [ativo, setAtivo] = useState<Opcao>('campanhas')

  return (
    <div>
      <div className="flex gap-1.5 mb-2.5">
        {OPCOES.map(o => (
          <button
            key={o.key}
            type="button"
            onClick={() => setAtivo(o.key)}
            className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-[10px] lg:text-[11px] font-bold transition-all ${
              ativo === o.key ? 'bg-white text-primary shadow-sm' : 'bg-white/10 text-white/70 hover:bg-white/15'
            }`}
          >
            <span className="material-symbols-outlined text-[13px] lg:text-[14px]">{o.icon}</span>
            <span className="truncate">{o.label}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden border border-white/15 bg-white/5">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/10">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-white/25" />
            <div className="w-2 h-2 rounded-full bg-white/25" />
            <div className="w-2 h-2 rounded-full bg-white/25" />
          </div>
          <div className="flex-1 bg-white/10 rounded px-2 py-0.5 text-[9px] text-white/50 truncate">
            seusistema.com.br
          </div>
        </div>
        {/* Canvas de altura estável — os 3 mocks ocupam a MESMA célula de
            grid (empilhados via grid-area), então a célula sempre assume a
            altura do mais alto entre eles (Campanhas, por ter vídeo/CTA/
            feedback). Trocar de aba só alterna qual um fica visível
            (visibility, não display:none, pra continuar contando no
            cálculo de altura do grid) — nunca redimensiona a moldura, sem
            precisar adivinhar um valor de altura fixo em pixels. */}
        <div className="grid p-3.5">
          <div className={`[grid-area:1/1] flex items-center justify-center ${ativo === 'campanhas' ? 'visible' : 'invisible pointer-events-none'}`}>
            <MockCampanhas />
          </div>
          <div className={`[grid-area:1/1] flex items-center justify-center ${ativo === 'tours' ? 'visible' : 'invisible pointer-events-none'}`}>
            <MockTours />
          </div>
          <div className={`[grid-area:1/1] flex items-center justify-center ${ativo === 'jornadas' ? 'visible' : 'invisible pointer-events-none'}`}>
            <MockJornadas />
          </div>
        </div>
      </div>

      <p className="text-[11px] lg:text-[12px] text-white/70 mt-2 leading-relaxed">{LEGENDA[ativo]}</p>
    </div>
  )
}

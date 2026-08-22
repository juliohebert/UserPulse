import { useEffect, useState } from 'react'
import { criarEstadoUtilidadeSimulada, deveRenderizarCtaSimulado } from './DestaqueElementoSimulacao.logic'

// Representação visual do formato "Destaque em elemento" — elemento alvo
// (chip com o data-cy configurado), badge flutuando FORA do alvo (acima,
// alinhado à direita, gap ~8px) com um beacon conectando os dois, e o
// tooltip contextual (título/descrição/CTA opcional/fechar conforme
// permitirDispensar) ancorado ao ALVO — não ao badge — abaixo dele com o
// mesmo gap. Badge e tooltip são ambos posicionados a partir do alvo (nunca
// um do outro) justamente pra nunca cobrir a caixa do alvo, mesma regra
// obrigatória de web/public/widget.js (destaqueElementoCalcularPosicao /
// destaqueElementoCalcularPosicaoTooltip: preferência abaixo do alvo).
// Extraído do preview de campanhas2/Index.tsx pra evitar reimplementar o
// mesmo mock em cada lugar que precisa simular este formato (builder
// canvas, "Simular" e /campanhas/:id/preview).
interface DestaqueElementoSimulacaoProps {
  corAcao: string
  dataCyLabel: string
  placeholderSemAlvo?: string
  badgeTexto: string
  titulo: string
  descricao: string
  ctaTexto: string | null
  ctaUrl: string | null
  itemId: string
  permitirDispensar: boolean
  // Ausente => X só decorativo (builder canvas, sem interação real).
  // Presente => X fecha de verdade (usado em simulações reais).
  onFechar?: () => void
}

export function DestaqueElementoSimulacao({
  corAcao,
  dataCyLabel,
  placeholderSemAlvo,
  badgeTexto,
  titulo,
  descricao,
  ctaTexto,
  ctaUrl,
  itemId,
  permitirDispensar,
  onFechar,
}: DestaqueElementoSimulacaoProps) {
  const [estado, setEstado] = useState(() => criarEstadoUtilidadeSimulada(itemId))

  useEffect(() => {
    setEstado(criarEstadoUtilidadeSimulada(itemId))
  }, [itemId])

  if (!dataCyLabel) {
    return (
      <span className="max-w-[220px] text-center text-[12px] font-semibold leading-5 text-[#8595a4]">
        {placeholderSemAlvo ?? 'Nenhum elemento alvo (data-cy) configurado.'}
      </span>
    )
  }

  return (
    <div className="relative inline-flex items-center rounded-lg border border-[#ced0d4] bg-white px-3 py-2 text-[12px] font-bold text-[#1c1e21]">
      <span className="rounded-md border border-[#ced0d4] bg-[#f8f9ff] px-3 py-2">Elemento</span>

      {/* Badge — ancorado FORA do alvo (acima, alinhado à direita, gap de
          8px), nunca sobre a caixa do alvo. Mesmo padrão de
          destaqueElementoCalcularPosicao em widget.js. */}
      <span
        className="absolute bottom-[calc(100%+8px)] right-0 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide text-white"
        style={{ backgroundColor: corAcao }}
      >
        {badgeTexto}
      </span>

      {/* Beacon — conecta visualmente badge e alvo, centralizado no gap de 8px */}
      <span className="absolute bottom-full right-2.5 flex h-2 w-2 -mb-1 items-center justify-center">
        <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full opacity-75" style={{ backgroundColor: corAcao }} />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full border border-white" style={{ backgroundColor: corAcao }} />
      </span>

      {/* Tooltip — ancorado ao ALVO (não ao badge), abaixo dele com gap de
          8px. Nunca cobre a caixa do alvo, seja qual for a posição do
          badge (mesma preferência "abaixo do alvo" do widget real). */}
      <div className="absolute left-1/2 top-[calc(100%+8px)] w-64 max-w-[calc(100vw-3rem)] -translate-x-1/2 rounded-2xl border border-[#dee3e9] bg-white p-4 text-left normal-case shadow-[0_18px_40px_rgba(20,22,26,0.16)]">
        <p className="text-[15px] font-bold leading-5 text-[#0a1317]">{titulo}</p>
        {descricao && <p className="mt-1 text-[13px] font-normal normal-case leading-5 text-[#5d6c7b]">{descricao}</p>}
        {deveRenderizarCtaSimulado(ctaTexto, ctaUrl) && (
          <a href={ctaUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center justify-center rounded-full px-4 py-2 text-[12px] font-bold text-white" style={{ backgroundColor: corAcao }}>
            {ctaTexto ?? ''}
          </a>
        )}
        <div className="mt-4 border-t border-[#dee3e9] pt-3">
          <p className="text-[12px] font-semibold text-[#1c1e21]">Essa melhoria foi útil?</p>
          <div className="mt-2 flex gap-2">
            {[true, false].map(valor => (
              <button key={String(valor)} type="button" onClick={() => setEstado(previous => ({ ...previous, utilidade: valor, enviado: false }))} className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition ${estado.utilidade === valor ? 'border-[#0064e0] bg-[#eff4ff] text-[#0064e0]' : 'border-[#ced0d4] text-[#5d6c7b]'}`}>
                {valor ? 'Sim' : 'Não'}
              </button>
            ))}
          </div>
          {estado.utilidade !== null && (
            <div className="mt-3 space-y-2">
              <p className="text-[12px] font-semibold text-[#5d6c7b]">Quer contar mais? (opcional)</p>
              <textarea aria-label="Comentário opcional" value={estado.observacao} onChange={event => setEstado(previous => ({ ...previous, observacao: event.target.value, enviado: false }))} placeholder="Comentário opcional" className="min-h-[56px] w-full resize-y rounded-lg border border-[#ced0d4] px-2.5 py-2 text-[12px] outline-none focus:border-[#0064e0]" />
              <button type="button" onClick={() => setEstado(previous => ({ ...previous, enviado: true }))} className="rounded-full px-3 py-1.5 text-[12px] font-bold text-white" style={{ backgroundColor: corAcao }}>Enviar</button>
              {estado.enviado && <p className="text-[11px] font-semibold text-[#1e7e34]">Obrigado! (simulação)</p>}
            </div>
          )}
        </div>
        {permitirDispensar && (
          onFechar ? (
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="absolute right-3 top-3 text-[#8595a4] hover:text-[#0a1317]"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          ) : (
            <span className="absolute right-3 top-3 text-[#8595a4]" aria-hidden="true">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </span>
          )
        )}
      </div>
    </div>
  )
}

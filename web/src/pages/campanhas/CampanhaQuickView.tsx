import { useNavigate } from 'react-router-dom'
import type { Campanha } from '../../types'
import { getStatus, formatDate, rotaEditarCampanha } from '../../utils/campanha'
import { TypeBadge } from '../../components/ui/TypeBadge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useAuth } from '../../hooks/useAuth'
import { podeGerenciarModulo } from '../../utils/permissions'

interface Props {
  campanha: Campanha
  onClose: () => void
}

export function CampanhaQuickView({ campanha, onClose }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const podeEscrever = podeGerenciarModulo(user, 'CAMPANHAS')
  const status = getStatus(campanha)
  const feedbackCount = campanha._count?.feedbacks ?? 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative z-10 flex h-full w-full max-w-[540px] flex-col bg-surface shadow-2xl">
        {/* Drawer header */}
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant/50 px-5 py-4 bg-surface-container-lowest">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge tipo={campanha.tipo} />
            <StatusBadge status={status} />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {podeEscrever && (
              <button
                onClick={() => navigate(rotaEditarCampanha(campanha))}
                title="Editar"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant text-label-md text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                Editar
              </button>
            )}
            <button
              onClick={() => navigate(`/campanhas/${campanha.id}/preview`)}
              title="Preview"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-label-md font-bold hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[16px]">visibility</span>
              Preview
            </button>
            <button
              onClick={onClose}
              title="Fechar"
              className="ml-1 p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
              aria-label="Fechar"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Título e meta */}
          <div className="px-5 pt-5 pb-4 border-b border-outline-variant/30">
            <h2 className="text-headline-sm font-bold text-on-surface leading-tight">{campanha.nome_interno}</h2>
            {campanha.subtitulo && (
              <p className="mt-1 text-body-md font-semibold text-primary">{campanha.subtitulo}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-label-md text-on-surface-variant">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">devices</span>
                {campanha.sistema}
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">layers</span>
                {campanha.tela}
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                {formatDate(campanha.criado_em)}
              </span>
              {campanha.data_inicio && (
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">event</span>
                  {formatDate(campanha.data_inicio)}
                  {campanha.data_fim && <> → {formatDate(campanha.data_fim)}</>}
                </span>
              )}
            </div>
          </div>

          {/* Conteúdo */}
          <div className="px-5 py-4 space-y-4 border-b border-outline-variant/30">
            <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wider">
              Conteúdo
            </p>

            {/* Mídia */}
            {campanha.video_url ? (
              <div className="aspect-video overflow-hidden rounded-xl bg-surface-container">
                <iframe
                  src={campanha.video_url}
                  title="Vídeo da campanha"
                  className="h-full w-full border-0"
                />
              </div>
            ) : campanha.imagem_url ? (
              <img
                src={campanha.imagem_url}
                alt=""
                className="max-h-52 w-full rounded-xl border border-outline-variant/30 object-cover"
              />
            ) : null}

            {/* Texto principal */}
            <p className="whitespace-pre-wrap text-body-md text-on-surface-variant leading-relaxed">
              {campanha.descricao}
            </p>

            {/* CTA */}
            {campanha.texto_botao && campanha.url_botao && (
              <a
                href={campanha.url_botao}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-secondary py-2.5 text-label-md font-bold text-on-secondary hover:opacity-90 transition-opacity"
              >
                {campanha.texto_botao}
                <span className="material-symbols-outlined text-[15px]">open_in_new</span>
              </a>
            )}
            {campanha.texto_botao && !campanha.url_botao && (
              <div className="w-full rounded-xl bg-secondary/30 py-2.5 text-center text-label-md font-bold text-secondary">
                {campanha.texto_botao}
                <span className="ml-1 text-[10px] normal-case font-normal opacity-60">(URL não configurada)</span>
              </div>
            )}
          </div>

          {/* Feedback */}
          <div className="px-5 py-4">
            <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-wider mb-3">
              Feedback
            </p>
            {campanha.feedback_habilitado ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-body-md text-on-surface">
                  <span className="material-symbols-outlined text-tertiary text-[18px]">check_circle</span>
                  Habilitado
                </div>
                {campanha.pergunta_feedback && (
                  <p className="text-body-md text-on-surface-variant pl-6">
                    "{campanha.pergunta_feedback}"
                  </p>
                )}
                <div className="flex items-center gap-2 mt-3 pl-6">
                  <span className="material-symbols-outlined text-on-surface-variant text-[16px]">forum</span>
                  <span className="text-body-md text-on-surface">
                    <strong>{feedbackCount.toLocaleString('pt-BR')}</strong>
                    {' '}
                    {feedbackCount === 1 ? 'resposta' : 'respostas'}
                  </span>
                  {feedbackCount > 0 && (
                    <button
                      onClick={() => navigate(`/campanhas/${campanha.id}/dashboard`)}
                      className="text-label-md text-primary hover:underline ml-1"
                    >
                      Ver dashboard →
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-body-md text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">block</span>
                Desabilitado
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

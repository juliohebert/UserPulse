import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildGravadorUrl } from '../../utils/tour'

interface GravadorForm {
  titulo: string
  descricao: string
  sistema: string
  urlInicial: string
  prioridade: string
}

const EMPTY: GravadorForm = {
  titulo: '', descricao: '', sistema: '', urlInicial: '', prioridade: '0',
}

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const card = 'bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm'

// ─── Gravador de fluxo (MVP) ────────────────────────────────────────────────
// Esta tela só monta a URL de gravação e abre numa nova aba — toda a gravação
// em si (barra flutuante, captura de cliques/campos, geração do JSON) roda
// dentro do widget.js na página real do sistema integrado. Isso evita
// depender de extensão de navegador ou de comunicação entre abas: ao
// finalizar, o próprio widget mostra o JSON pronto pra copiar/baixar, e o
// usuário importa pela tela de Tours Guiados (Importar JSON), sem nenhuma
// mudança no backend/importador existente.
export function TourGravador() {
  const navigate = useNavigate()
  const [form, setForm] = useState<GravadorForm>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [urlGerada, setUrlGerada] = useState<string | null>(null)

  const set = (key: keyof GravadorForm, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const iniciarGravacao = () => {
    setError(null)
    setUrlGerada(null)
    if (!form.titulo.trim() || !form.sistema.trim()) {
      setError('Informe ao menos o título e o sistema antes de iniciar a gravação.')
      return
    }
    if (!form.urlInicial.trim()) {
      setError('Informe a URL inicial (a página real onde o fluxo começa).')
      return
    }
    let url: string
    try {
      url = buildGravadorUrl({
        urlInicial: form.urlInicial.trim(),
        titulo: form.titulo,
        descricao: form.descricao,
        sistema: form.sistema,
        prioridade: Number(form.prioridade || 0),
      })
    } catch {
      setError('URL inicial inválida — use uma URL completa, ex: https://meusistema.com/app/agenda')
      return
    }
    setUrlGerada(url)
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="relative">
      <div className="bg-surface border-b border-outline-variant px-4 lg:px-margin-desktop py-3">
        <nav className="flex gap-2 text-label-md text-outline mb-0.5">
          <button onClick={() => navigate('/tours')} className="hover:text-primary transition-colors">
            Tours Guiados
          </button>
          <span>/</span>
          <span className="text-on-surface">Gravador de fluxo</span>
        </nav>
        <h2 className="text-title-lg font-bold text-on-surface leading-tight">Gravador de Fluxo (MVP)</h2>
        <p className="text-label-md text-on-surface-variant mt-0.5">
          Grave um fluxo navegando pelo sistema real e gere um rascunho de tour pra importar.
        </p>
      </div>

      <section className="px-4 lg:px-margin-desktop py-5 max-w-2xl space-y-4">
        <div className={card}>
          <div className="flex items-center gap-3 mb-4">
            <span className="p-1.5 bg-primary-fixed rounded-lg text-primary material-symbols-outlined text-[20px]">radio_button_checked</span>
            <div>
              <h3 className="text-title-lg font-bold text-on-surface">Como funciona</h3>
            </div>
          </div>
          <ol className="space-y-2 text-body-md text-on-surface-variant list-decimal list-inside">
            <li>Preencha os dados abaixo e clique em "Iniciar gravação" — abre a URL informada numa nova aba, já em modo de gravação.</li>
            <li>Na aba aberta, uma barra flutuante "Gravando Tour" aparece. Navegue e interaja normalmente com o sistema (clique em botões/links, preencha campos, selecione opções).</li>
            <li>Use "Pausar/Continuar" para ignorar temporariamente suas próprias interações, e "Desfazer último passo" se capturar algo por engano.</li>
            <li>Clique em "Finalizar" — o widget mostra o JSON gerado, com botões para copiar ou baixar.</li>
            <li>Volte para <button onClick={() => navigate('/tours')} className="underline hover:text-primary">Tours Guiados</button> e use "Importar JSON" para criar o tour como rascunho — revise título, descrição e seletores antes de ativar.</li>
          </ol>
        </div>

        <div className={card}>
          <div className="flex items-center gap-3 mb-4">
            <span className="p-1.5 bg-tertiary/10 rounded-lg text-tertiary material-symbols-outlined text-[20px]">privacy_tip</span>
            <h3 className="text-title-lg font-bold text-on-surface">Privacidade</h3>
          </div>
          <ul className="space-y-1.5 text-body-md text-on-surface-variant list-disc list-inside">
            <li>Nenhum valor digitado é capturado — só a interação (clique/preenchimento) e o seletor do elemento.</li>
            <li>Campos identificados como senha, CPF, e-mail, telefone ou cartão são ignorados automaticamente.</li>
            <li>Nenhuma captura de tela é feita em nenhum momento.</li>
          </ul>
        </div>

        <form onSubmit={e => { e.preventDefault(); iniciarGravacao() }} className={card}>
          <div className="flex items-center gap-3 mb-4">
            <span className="p-1.5 bg-secondary-fixed rounded-lg text-secondary material-symbols-outlined text-[20px]">tune</span>
            <h3 className="text-title-lg font-bold text-on-surface">Dados do tour</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-label-md text-on-surface-variant mb-1.5">
                Título do Tour <span className="text-error">*</span>
              </label>
              <input
                value={form.titulo}
                onChange={e => set('titulo', e.target.value)}
                placeholder="Ex: Como criar um agendamento"
                className={field}
              />
            </div>
            <div>
              <label className="block text-label-md text-on-surface-variant mb-1.5">Descrição</label>
              <textarea
                rows={2}
                value={form.descricao}
                onChange={e => set('descricao', e.target.value)}
                placeholder="Para que serve este tour?"
                className={`${field} resize-none`}
              />
            </div>
            <div>
              <label className="block text-label-md text-on-surface-variant mb-1.5">
                Sistema <span className="text-error">*</span>
              </label>
              <input
                value={form.sistema}
                onChange={e => set('sistema', e.target.value)}
                placeholder="Ex: portal, crm, mobile"
                className={field}
              />
            </div>
            <div>
              <label className="block text-label-md text-on-surface-variant mb-1.5">
                URL inicial <span className="text-error">*</span>
              </label>
              <input
                value={form.urlInicial}
                onChange={e => set('urlInicial', e.target.value)}
                placeholder="https://meusistema.com/app/agenda"
                className={`${field} font-mono text-[13px]`}
              />
              <p className="text-[11px] text-on-surface-variant mt-1">
                A página real onde o fluxo começa (precisa já ter o widget UserPulse instalado).
              </p>
            </div>
            <div className="max-w-[160px]">
              <label className="block text-label-md text-on-surface-variant mb-1.5">Prioridade</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.prioridade}
                onChange={e => set('prioridade', e.target.value)}
                className={field}
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-error-container text-on-error-container rounded-xl text-body-md flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {urlGerada && (
            <div className="mt-4 p-3 bg-tertiary/10 rounded-xl text-body-md text-tertiary flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">check_circle</span>
              <span>
                Gravação iniciada numa nova aba. Se o navegador bloqueou o pop-up, abra manualmente:{' '}
                <a href={urlGerada} target="_blank" rel="noreferrer" className="underline break-all">{urlGerada}</a>
              </span>
            </div>
          )}

          <div className="flex justify-end mt-5">
            <button
              type="submit"
              className="px-5 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95"
            >
              Iniciar gravação
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

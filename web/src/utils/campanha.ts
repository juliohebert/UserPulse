import type { Campanha, StatusCampanha } from '../types'

export function getStatus(c: Campanha): StatusCampanha {
  if (!c.ativo) return 'inativa'
  const now = new Date()
  if (c.data_inicio && new Date(c.data_inicio) > now) return 'agendada'
  if (c.data_fim && new Date(c.data_fim) < now) return 'encerrada'
  return 'ativa'
}

export function gerarSlug(titulo: string): string {
  return titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function toInputDate(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

const WIDGET_URL: string =
  import.meta.env.VITE_USERPULSE_WIDGET_URL ||
  `${window.location.origin}/widget.js`

export function gerarEmbed(campanha: Campanha): string {
  return [
    `<script src="${WIDGET_URL}"></script>`,
    `<script>`,
    `window.UserPulse.init({`,
    `  slug: "${campanha.slug}",`,
    `  usuario_id: "ID_DO_USUARIO",`,
    `  usuario_nome: "NOME_DO_USUARIO",`,
    `  usuario_email: "EMAIL_DO_USUARIO"`,
    `});`,
    `</script>`,
  ].join('\n')
}

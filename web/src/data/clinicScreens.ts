export interface TelaClinic {
  id: string
  nome: string
  sistema: string
  modo_identificacao: 'url_contem' | 'sistema_tela'
  url_contem?: string
  tela?: string
  categoria: string
  icone: string
}

export const CLINIC_SCREENS: TelaClinic[] = [
  {
    id: 'clinic-agendamentos',
    nome: 'Agendamentos',
    sistema: 'QuarkClinic',
    modo_identificacao: 'url_contem',
    url_contem: '/app/atendimento/agendamentos',
    categoria: 'Atendimento',
    icone: 'calendar_month',
  },
]

export const CLINIC_CATEGORIAS = [...new Set(CLINIC_SCREENS.map(s => s.categoria))]

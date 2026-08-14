import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCadastroConfig } from '../hooks/useCadastroConfig'
import type { CadastroConfig } from '../types'
import { RequisitosSenha, senhaAtendeTodasRegras } from '../components/auth/RequisitosSenha'
import { AuthLayout } from '../components/auth/AuthLayout'

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const fieldErro = 'border-error focus:ring-error'
const card = 'bg-surface-container-lowest p-7 rounded-2xl border border-outline-variant/70 shadow-md space-y-4'
const cta = 'w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary text-on-primary rounded-xl text-body-md font-bold shadow-md hover:shadow-lg hover:opacity-95 transition-all active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100'

// Plural simples (0/2+ = plural, 1 = singular) — só usado nos textos do
// painel de benefícios abaixo, nunca em mensagem de erro/validação.
function contagem(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

interface Beneficio {
  texto: string
}

// Painel de benefícios é 100% derivado de /auth/cadastro/config — nenhuma
// duração/limite hardcoded aqui (regra explícita da tarefa). Enquanto o
// config não carrega (ou falha), o painel mostra só o que é sempre
// verdadeiro (sem cartão nesta etapa), nunca um número inventado.
function montarBeneficios(config: CadastroConfig | null): Beneficio[] {
  const lista: Beneficio[] = []
  if (config) {
    lista.push({ texto: config.limite_campanhas_ativas != null ? `Até ${contagem(config.limite_campanhas_ativas, 'campanha', 'campanhas')}` : 'Campanhas ilimitadas' })
    lista.push({ texto: config.limite_tours_ativos != null ? contagem(config.limite_tours_ativos, 'tour guiado', 'tours guiados') : 'Tours guiados ilimitados' })
    lista.push({ texto: config.limite_jornadas_ativas != null ? contagem(config.limite_jornadas_ativas, 'jornada', 'jornadas') : 'Jornadas ilimitadas' })
  }
  lista.push({ texto: 'Sem necessidade de cartão nesta etapa' })
  return lista
}

interface ErrosCampos {
  nome?: string
  empresa?: string
  email?: string
  senha?: string
}

function validarLocalmente(nome: string, empresa: string, email: string, senha: string): ErrosCampos {
  const erros: ErrosCampos = {}
  if (!nome.trim()) erros.nome = 'Informe seu nome.'
  if (!empresa.trim()) erros.empresa = 'Informe o nome da empresa.'
  if (!email.trim()) erros.email = 'Informe seu e-mail.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) erros.email = 'E-mail inválido.'
  if (!senha) erros.senha = 'Crie uma senha.'
  else if (!senhaAtendeTodasRegras(senha)) erros.senha = 'A senha não atende aos requisitos abaixo.'
  return erros
}

export function CadastroPage() {
  const { user, loading, cadastrar } = useAuth()
  const navigate = useNavigate()

  // Mesmo hook usado por Login.tsx (useCadastroConfig, cacheia em memória
  // entre as duas telas) — `carregandoConfig` distingue ainda-buscando de
  // resolvido-sem-dados, pro AuthLayout mostrar skeleton em vez de trocar
  // "Comece seu teste grátis" por "Teste grátis por N dias" na cara do
  // usuário (ver configCarregando em AuthLayout.tsx).
  const { config, carregando: carregandoConfig } = useCadastroConfig()

  const [nome, setNome] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const [camposTocados, setCamposTocados] = useState<Record<string, boolean>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Já logado — não faz sentido mostrar o formulário de cadastro de novo.
  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  const erros = validarLocalmente(nome, empresa, email, senha)
  const erroVisivel = (campo: keyof ErrosCampos) => (camposTocados[campo] ? erros[campo] : undefined)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setCamposTocados({ nome: true, empresa: true, email: true, senha: true })
    setErroGeral(null)
    if (Object.keys(erros).length > 0) return

    setEnviando(true)
    try {
      await cadastrar({ nome: nome.trim(), empresa: empresa.trim(), email: email.trim(), senha })
      navigate('/', { replace: true, state: { trialIniciado: true, diasTrial: config?.dias ?? null } })
    } catch (err) {
      setErroGeral(err instanceof Error ? err.message : 'Não foi possível concluir o cadastro. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AuthLayout
      tituloForm="Comece seu teste grátis"
      subtituloForm="Leva menos de um minuto, sem cartão de crédito."
      headlineBranding={config ? `Teste grátis por ${contagem(config.dias, 'dia', 'dias')}` : 'Comece seu teste grátis'}
      beneficios={montarBeneficios(config)}
      configCarregando={carregandoConfig}
    >
      <form onSubmit={handleSubmit} noValidate className={card}>
        <div>
          <label htmlFor="cadastro-nome" className="block text-label-sm text-on-surface-variant mb-1">Nome</label>
          <input
            id="cadastro-nome"
            type="text"
            autoComplete="name"
            value={nome}
            onChange={e => setNome(e.target.value)}
            onBlur={() => setCamposTocados(c => ({ ...c, nome: true }))}
            className={`${field} ${erroVisivel('nome') ? fieldErro : ''}`}
            placeholder="Seu nome completo"
          />
          {erroVisivel('nome') && <p className="text-label-sm text-error mt-1">{erroVisivel('nome')}</p>}
        </div>

        <div>
          <label htmlFor="cadastro-empresa" className="block text-label-sm text-on-surface-variant mb-1">Empresa</label>
          <input
            id="cadastro-empresa"
            type="text"
            autoComplete="organization"
            value={empresa}
            onChange={e => setEmpresa(e.target.value)}
            onBlur={() => setCamposTocados(c => ({ ...c, empresa: true }))}
            className={`${field} ${erroVisivel('empresa') ? fieldErro : ''}`}
            placeholder="Nome da sua empresa"
          />
          {erroVisivel('empresa') && <p className="text-label-sm text-error mt-1">{erroVisivel('empresa')}</p>}
        </div>

        <div>
          <label htmlFor="cadastro-email" className="block text-label-sm text-on-surface-variant mb-1">E-mail</label>
          <input
            id="cadastro-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onBlur={() => setCamposTocados(c => ({ ...c, email: true }))}
            className={`${field} ${erroVisivel('email') ? fieldErro : ''}`}
            placeholder="voce@empresa.com"
          />
          {erroVisivel('email') && <p className="text-label-sm text-error mt-1">{erroVisivel('email')}</p>}
        </div>

        <div>
          <label htmlFor="cadastro-senha" className="block text-label-sm text-on-surface-variant mb-1">Senha</label>
          <div className="relative">
            <input
              id="cadastro-senha"
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="new-password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              onBlur={() => setCamposTocados(c => ({ ...c, senha: true }))}
              className={`${field} pr-10 ${erroVisivel('senha') ? fieldErro : ''}`}
              placeholder="Mínimo de 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setMostrarSenha(v => !v)}
              tabIndex={-1}
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[20px]">{mostrarSenha ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
          <RequisitosSenha senha={senha} />
          {senha.length === 0 && erroVisivel('senha') && <p className="text-label-sm text-error mt-1">{erroVisivel('senha')}</p>}
        </div>

        {erroGeral && (
          <p className="flex items-center gap-2 p-3 rounded-xl bg-error-container text-on-error-container text-body-sm">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            {erroGeral}
          </p>
        )}

        <button type="submit" disabled={enviando} className={cta}>
          {enviando ? 'Criando conta…' : 'Começar meu teste grátis'}
        </button>

        <p className="text-center text-body-sm text-outline">
          Já tem conta?{' '}
          <Link to="/login" className="text-primary font-bold hover:underline">Entrar</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

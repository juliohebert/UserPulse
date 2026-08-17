import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { motivoBloqueioEscrita } from '../lib/tenantGuards'

// Mesma regra usada nos campos de cor do resto do admin: HEX de 6 dígitos,
// com # opcional na entrada (normalizado antes de salvar). Sem suporte a
// atalho de 3 dígitos nem a nomes de cor CSS — mantém o valor sempre
// diretamente utilizável como CSS custom property no widget.
const HEX_REGEX = /^#?[0-9a-fA-F]{6}$/

function normalizarCorPrincipal(valor: unknown): { ok: true; valor: string | null } | { ok: false } {
  if (valor == null || valor === '') return { ok: true, valor: null }
  if (typeof valor !== 'string' || !HEX_REGEX.test(valor.trim())) return { ok: false }
  const limpo = valor.trim()
  return { ok: true, valor: '#' + (limpo.charAt(0) === '#' ? limpo.slice(1) : limpo).toLowerCase() }
}

// Só aceita http(s) — evita esquemas como javascript:/data: chegarem a um
// atributo src no runtime do widget (defesa em profundidade; o widget.js
// também valida o protocolo antes de renderizar a tag <img>).
function normalizarLogoUrl(valor: unknown): { ok: true; valor: string | null } | { ok: false } {
  if (valor == null || valor === '') return { ok: true, valor: null }
  if (typeof valor !== 'string') return { ok: false }
  const limpo = valor.trim()
  if (!/^https?:\/\//i.test(limpo)) return { ok: false }
  return { ok: true, valor: limpo }
}

function validarPayload(req: Request, res: Response) {
  const cor = normalizarCorPrincipal((req.body as { cor_principal?: unknown }).cor_principal)
  if (!cor.ok) { res.status(400).json({ erro: 'Cor principal inválida — use um HEX no formato #RRGGBB.' }); return null }

  const logo = normalizarLogoUrl((req.body as { logo_url?: unknown }).logo_url)
  if (!logo.ok) { res.status(400).json({ erro: 'URL da logo inválida — use uma URL completa começando com http:// ou https://.' }); return null }

  return { cor, logo }
}

export async function buscarDefault(req: Request, res: Response) {
  try {
    const existente = await prisma.aparenciaWidget.findFirst({
      where: { tenant_id: req.adminUser!.tenant_id, sistema_id: null },
    })
    res.json(existente || { sistema_id: null, sistema: null, cor_principal: null, logo_url: null })
  } catch {
    res.status(500).json({ erro: 'Erro ao buscar aparência padrão do widget.' })
  }
}

export async function salvarDefault(req: Request, res: Response) {
  try {
    const bloqueioEscrita = motivoBloqueioEscrita(req.adminUser!.tenant)
    if (bloqueioEscrita) { res.status(403).json({ erro: bloqueioEscrita }); return }

    const payload = validarPayload(req, res)
    if (!payload) return

    const tenantId = req.adminUser!.tenant_id
    const existente = await prisma.aparenciaWidget.findFirst({ where: { tenant_id: tenantId, sistema_id: null } })
    if (!existente && !payload.cor.valor && !payload.logo.valor) {
      res.json({ sistema_id: null, sistema: null, cor_principal: null, logo_url: null })
      return
    }
    const salvo = existente
      ? await prisma.aparenciaWidget.update({ where: { id: existente.id }, data: { cor_principal: payload.cor.valor, logo_url: payload.logo.valor } })
      : await prisma.aparenciaWidget.create({ data: { tenant_id: tenantId, sistema_id: null, sistema: null, cor_principal: payload.cor.valor, logo_url: payload.logo.valor } })
    res.json(salvo)
  } catch {
    res.status(500).json({ erro: 'Erro ao salvar aparência padrão do widget.' })
  }
}

// GET /api/aparencia-widget/:sistema (admin) — 200 com campos null quando
// ainda não existe configuração pra esse sistema (nunca 404: "sem config
// ainda" é um estado normal, não um erro, e a tela de admin só precisa
// saber se deve mostrar o formulário vazio ou preenchido). "sistema" virou
// único POR TENANT (ver migration 20260802090000_aparencia_widget_unique_por_tenant,
// parte da Fase 2 do widget multi-tenant) — a busca já é naturalmente
// escopada ao tenant da sessão, sem precisar checar ownership manualmente.
export async function buscar(req: Request, res: Response) {
  try {
    const sistema = (req.params.sistema as string || '').trim()
    if (!sistema) { res.status(400).json({ erro: 'sistema é obrigatório.' }); return }
    const sistemaConfig = await prisma.sistema.findFirst({
      where: { tenant_id: req.adminUser!.tenant_id, OR: [{ id: sistema }, { identificador: sistema }] },
    })
    if (!sistemaConfig) { res.status(404).json({ erro: 'Sistema não encontrado.' }); return }
    const existente = await prisma.aparenciaWidget.findUnique({
      where: { tenant_id_sistema_id: { tenant_id: req.adminUser!.tenant_id, sistema_id: sistemaConfig.id } },
    })
    res.json(existente || { sistema_id: sistemaConfig.id, sistema: sistemaConfig.identificador, cor_principal: null, logo_url: null })
  } catch {
    res.status(500).json({ erro: 'Erro ao buscar aparência do widget.' })
  }
}

// PUT /api/aparencia-widget/:sistema (admin) — upsert por (tenant, sistema)
// (nunca por tour/campanha individual). cor_principal/logo_url vazios são
// válidos (limpam a configuração, voltando pro fallback padrão do widget).
export async function salvar(req: Request, res: Response) {
  try {
    const bloqueioEscrita = motivoBloqueioEscrita(req.adminUser!.tenant)
    if (bloqueioEscrita) { res.status(403).json({ erro: bloqueioEscrita }); return }

    const sistema = (req.params.sistema as string || '').trim()
    if (!sistema) { res.status(400).json({ erro: 'sistema é obrigatório.' }); return }
    const sistemaConfig = await prisma.sistema.findFirst({
      where: { tenant_id: req.adminUser!.tenant_id, OR: [{ id: sistema }, { identificador: sistema }] },
    })
    if (!sistemaConfig) { res.status(404).json({ erro: 'Sistema não encontrado.' }); return }

    const payload = validarPayload(req, res)
    if (!payload) return

    const tenantId = req.adminUser!.tenant_id
    const salvo = await prisma.aparenciaWidget.upsert({
      where: { tenant_id_sistema_id: { tenant_id: tenantId, sistema_id: sistemaConfig.id } },
      create: { tenant_id: tenantId, sistema_id: sistemaConfig.id, sistema: sistemaConfig.identificador, cor_principal: payload.cor.valor, logo_url: payload.logo.valor },
      update: { cor_principal: payload.cor.valor, logo_url: payload.logo.valor },
    })
    res.json(salvo)
  } catch {
    res.status(500).json({ erro: 'Erro ao salvar aparência do widget.' })
  }
}

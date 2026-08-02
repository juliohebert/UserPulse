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

// GET /api/aparencia-widget/:sistema (admin) — 200 com campos null quando
// ainda não existe configuração pra esse sistema (nunca 404: "sem config
// ainda" é um estado normal, não um erro, e a tela de admin só precisa
// saber se deve mostrar o formulário vazio ou preenchido). "sistema" é
// @unique GLOBAL no schema (ver comentário lá) — se já existe config pra
// esse nome mas pertence a OUTRO tenant, este admin não pode ver nem saber
// que ela existe: devolve o mesmo "sem config" que um sistema nunca usado.
export async function buscar(req: Request, res: Response) {
  try {
    const sistema = (req.params.sistema as string || '').trim()
    if (!sistema) { res.status(400).json({ erro: 'sistema é obrigatório.' }); return }
    const existente = await prisma.aparenciaWidget.findUnique({ where: { sistema } })
    if (!existente || existente.tenant_id !== req.adminUser!.tenant_id) {
      res.json({ sistema, cor_principal: null, logo_url: null })
      return
    }
    res.json(existente)
  } catch {
    res.status(500).json({ erro: 'Erro ao buscar aparência do widget.' })
  }
}

// PUT /api/aparencia-widget/:sistema (admin) — upsert por sistema (nunca por
// tour/campanha individual). cor_principal/logo_url vazios são válidos
// (limpam a configuração, voltando pro fallback padrão do widget).
export async function salvar(req: Request, res: Response) {
  try {
    const bloqueioEscrita = motivoBloqueioEscrita(req.adminUser!.tenant)
    if (bloqueioEscrita) { res.status(403).json({ erro: bloqueioEscrita }); return }

    const sistema = (req.params.sistema as string || '').trim()
    if (!sistema) { res.status(400).json({ erro: 'sistema é obrigatório.' }); return }

    const cor = normalizarCorPrincipal((req.body as { cor_principal?: unknown }).cor_principal)
    if (!cor.ok) { res.status(400).json({ erro: 'Cor principal inválida — use um HEX no formato #RRGGBB.' }); return }

    const logo = normalizarLogoUrl((req.body as { logo_url?: unknown }).logo_url)
    if (!logo.ok) { res.status(400).json({ erro: 'URL da logo inválida — use uma URL completa começando com http:// ou https://.' }); return }

    const tenantId = req.adminUser!.tenant_id
    const existente = await prisma.aparenciaWidget.findUnique({ where: { sistema } })
    // "sistema" é uma chave global (ver schema.prisma) — se outro tenant já
    // configurou aparência pra esse mesmo nome, não deixa sobrescrever
    // silenciosamente a config de outro cliente.
    if (existente && existente.tenant_id !== tenantId) {
      res.status(409).json({ erro: `O nome de sistema "${sistema}" já está em uso por outra conta.` })
      return
    }

    const salvo = await prisma.aparenciaWidget.upsert({
      where: { sistema },
      create: { tenant_id: tenantId, sistema, cor_principal: cor.valor, logo_url: logo.valor },
      update: { cor_principal: cor.valor, logo_url: logo.valor },
    })
    res.json(salvo)
  } catch {
    res.status(500).json({ erro: 'Erro ao salvar aparência do widget.' })
  }
}

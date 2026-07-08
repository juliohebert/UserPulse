import { Request, Response } from 'express'
import prisma from '../lib/prisma'

// Configuração global do widget — linha singleton (id fixo "singleton"),
// criada sob demanda no primeiro GET se ainda não existir.
const CONFIG_ID = 'singleton'

const POSICOES_VALIDAS = [
  'inferior_direita',
  'inferior_esquerda',
  'superior_direita',
  'superior_esquerda',
  'direita_central',
  'esquerda_central',
]

async function buscarOuCriar() {
  const existente = await prisma.configuracaoWidget.findUnique({ where: { id: CONFIG_ID } })
  if (existente) return existente
  return prisma.configuracaoWidget.create({ data: { id: CONFIG_ID } })
}

export async function buscar(_req: Request, res: Response) {
  try {
    const config = await buscarOuCriar()
    res.json(config)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar configuração do widget.' })
  }
}

export async function atualizar(req: Request, res: Response) {
  try {
    const { ajuda_fab_posicao } = req.body
    if (ajuda_fab_posicao !== undefined && !POSICOES_VALIDAS.includes(ajuda_fab_posicao)) {
      return res.status(400).json({ erro: `ajuda_fab_posicao inválida. Use: ${POSICOES_VALIDAS.join(', ')}.` })
    }
    await buscarOuCriar()
    const config = await prisma.configuracaoWidget.update({
      where: { id: CONFIG_ID },
      data: {
        ...(ajuda_fab_posicao !== undefined && { ajuda_fab_posicao }),
      },
    })
    res.json(config)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao atualizar configuração do widget.' })
  }
}

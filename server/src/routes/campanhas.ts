import { Router } from 'express'
import * as campanhas from '../controllers/campanhas'
import { requireEscritaConteudo } from '../middleware/requireEscritaTenant'
import { requireAcessoModulo } from '../middleware/requireAcessoModulo'

const router = Router()

// Fase 1 de permissões personalizadas — leitura passa a exigir ao menos
// VISUALIZAR no módulo CAMPANHAS (antes desta fase, GET era aberto a
// qualquer papel autenticado sem guard nenhum; ver
// lib/permissoesModulo.ts pro nível padrão de cada role quando
// permissoes_personalizadas=false, que replica esse comportamento aberto).
router.get('/', requireAcessoModulo('CAMPANHAS', 'VISUALIZAR'), campanhas.listar)
router.post('/', requireEscritaConteudo('CAMPANHAS'), campanhas.criar)
// Reordenação visual de prioridade (sem digitar número) — corpo sempre traz
// a lista INTEIRA de ids do GRUPO CONCORRENTE na nova ordem (mesma
// sistema/tela ou url_contem + gatilho[+evento], nunca o tenant inteiro),
// ver chaveGrupoConcorrente()/reordenar() em controllers/campanhas.ts. Rota
// de segmento único, nunca colide com as rotas `/:id/...` abaixo.
router.post('/reordenar', requireEscritaConteudo('CAMPANHAS'), campanhas.reordenar)
router.post('/:id/duplicar', requireEscritaConteudo('CAMPANHAS'), campanhas.duplicar)
router.get('/:id', requireAcessoModulo('CAMPANHAS', 'VISUALIZAR'), campanhas.buscarPorId)
router.put('/:id', requireEscritaConteudo('CAMPANHAS'), campanhas.atualizar)
// DELETE aqui é "inativar" (o controller só marca ativo:false, nunca
// remove a linha — ver remover() em controllers/campanhas.ts), a mesma
// ação de ativar/inativar do PUT — por isso fica em requireEscritaConteudo
// (EDITOR pode), não na exclusão reservada a ADMIN usada por tours/jornadas.
router.delete('/:id', requireEscritaConteudo('CAMPANHAS'), campanhas.remover)
// Encerrar (Fase 2) é uma ação própria, nunca reaproveita o DELETE acima —
// só mexe em data_fim (nunca em status), ver encerrar()/
// resolverEncerramentoCampanha em controllers/campanhas.ts. Mesmo guard do
// resto da escrita de conteúdo (EDITOR pode).
router.post('/:id/encerrar', requireEscritaConteudo('CAMPANHAS'), campanhas.encerrar)
// testar-elegibilidade é só simulação (nunca escreve no banco, ver
// controller) — POST por histórico da API, não por escrita real, por isso
// exige só VISUALIZAR (ajuste pós-revisão), igual a qualquer outra leitura
// de CAMPANHAS, não GERENCIAR.
router.post('/:id/testar-elegibilidade', requireAcessoModulo('CAMPANHAS', 'VISUALIZAR'), campanhas.testarElegibilidade)
router.get('/:id/respostas.csv', requireAcessoModulo('CAMPANHAS', 'VISUALIZAR'), campanhas.exportarRespostasCSV)

export default router

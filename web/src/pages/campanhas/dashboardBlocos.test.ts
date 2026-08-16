import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { blocosDashboardVisiveis } from './dashboardBlocos'

// Não há renderização de React nos testes deste projeto (nenhum React
// Testing Library/jsdom configurado, ver server/package.json e a ausência
// de script de teste em web/package.json) — mesmo limite documentado em
// CLAUDE.md pro lado do servidor, aplicado aqui também (mesmo padrão já
// usado por campanhaForm.test.ts, ao lado). blocosDashboardVisiveis é a
// função pura que decide QUAIS blocos do dashboard aparecem pra cada
// modo_exibicao — único ponto de decisão que o JSX consulta (`blocos.*`),
// em vez de espalhar `campanha.modo_exibicao === 'destaque_elemento'` em
// cada `{...&&}` isolado. Testar esta função cobre a regra de negócio
// inteira sem precisar montar o componente de verdade. Vive num módulo
// separado (dashboardBlocos.ts, sem imports) porque CampanhaDashboard.tsx
// importa utils/campanha.ts, que usa import.meta.env — inexistente fora do
// bundler do Vite, o que quebraria qualquer import direto do .tsx aqui.

describe('blocosDashboardVisiveis — destaque_elemento não renderiza blocos de feedback geral/NPS', () => {
  const blocos = blocosDashboardVisiveis('destaque_elemento')

  test('esconde todos os blocos de feedback geral (NPS)', () => {
    assert.equal(blocos.kpiFeedbackGeral, false, 'cards Respostas/Nota Média/NPS')
    assert.equal(blocos.funilEngajamento, false, 'Funil de engajamento (Visualizações -> Respostas)')
    assert.equal(blocos.resumoNps, false, 'Resumo Promotores/Neutros/Detratores/NPS')
    assert.equal(blocos.distribuicaoNotas, false, 'Distribuição de notas')
    assert.equal(blocos.secaoRespostas, false, 'tabela de Respostas de NPS')
  })

  test('mostra os blocos específicos de destaque_elemento', () => {
    assert.equal(blocos.kpiDestaque, true, 'cards de KPI de destaque (Visualizações/Interações/Cliques CTA/Avaliações)')
    assert.equal(blocos.desempenhoDestaques, true)
    assert.equal(blocos.avaliacoesDestaques, true)
  })

  test('"Interações detalhadas" continua visível — não é exclusivo de nenhum tipo', () => {
    assert.equal(blocos.interacoesDetalhadas, true)
  })

  test('filtro/coluna "Destaque" aparece na seção Interações', () => {
    assert.equal(blocos.filtroDestaque, true)
  })

  test('filtro "Tipo" oferece os 4 tipos de evento, incluindo os exclusivos de destaque (interacao_badge/dispensa)', () => {
    const values = blocos.opcoesTipoEvento.map(o => o.value)
    assert.deepEqual(values, ['Todos', 'Visualização', 'Clique', 'Interação', 'Dispensa'])
  })

  test('indicadores-resumo de Interações trocam para Visualizações/Interações/Cliques CTA/Dispensas/Usuários únicos', () => {
    assert.deepEqual(
      blocos.indicadoresInteracoes.map(i => ({ key: i.key, label: i.label })),
      [
        { key: 'visualizacoes', label: 'Visualizações' },
        { key: 'interacoes', label: 'Interações' },
        { key: 'cliquesCta', label: 'Cliques CTA' },
        { key: 'dispensas', label: 'Dispensas' },
        { key: 'usuariosUnicos', label: 'Usuários únicos' },
      ],
    )
  })

  test('avaliacoesDestaques é true independente de haver ou não avaliações — a seção nunca deve sumir por quantidade zero', () => {
    // blocosDashboardVisiveis só recebe modo_exibicao, nunca a lista de
    // avaliações — a própria assinatura da função já garante que a
    // presença de dados nunca influencia se o bloco aparece ou não.
    assert.equal(blocosDashboardVisiveis('destaque_elemento').avaliacoesDestaques, true)
  })
})

describe('blocosDashboardVisiveis — outros tipos de campanha continuam com o relatório tradicional intacto', () => {
  test('modal_automatica: todos os blocos de feedback geral/NPS aparecem, nenhum bloco de destaque aparece', () => {
    const blocos = blocosDashboardVisiveis('modal_automatica')
    assert.equal(blocos.kpiFeedbackGeral, true)
    assert.equal(blocos.funilEngajamento, true)
    assert.equal(blocos.resumoNps, true)
    assert.equal(blocos.distribuicaoNotas, true)
    assert.equal(blocos.secaoRespostas, true)
    assert.equal(blocos.kpiDestaque, false)
    assert.equal(blocos.desempenhoDestaques, false)
    assert.equal(blocos.avaliacoesDestaques, false)
    assert.equal(blocos.interacoesDetalhadas, true)
    assert.equal(blocos.filtroDestaque, false, 'filtro/coluna "Destaque" não deve aparecer pra campanha tradicional')
  })

  test('modal_automatica: preserva exatamente os 5 indicadores-resumo tradicionais de Interações (Visualizações/Únicos/Cliques CTA/Clicadores únicos/Taxa de clique)', () => {
    const blocos = blocosDashboardVisiveis('modal_automatica')
    assert.deepEqual(
      blocos.indicadoresInteracoes.map(i => ({ key: i.key, label: i.label })),
      [
        { key: 'visualizacoes', label: 'Visualizações' },
        { key: 'usuariosUnicos', label: 'Únicos' },
        { key: 'cliquesCta', label: 'Cliques CTA' },
        { key: 'clicadoresUnicos', label: 'Clicadores únicos' },
        { key: 'taxaClique', label: 'Taxa de clique' },
      ],
    )
  })

  test('modal_automatica: filtro "Tipo" NÃO oferece interacao_badge/dispensa — só os tipos que essa campanha realmente gera', () => {
    const blocos = blocosDashboardVisiveis('modal_automatica')
    const values = blocos.opcoesTipoEvento.map(o => o.value)
    assert.deepEqual(values, ['Todos', 'Visualização', 'Clique'], 'preserva exatamente os tipos/filtros tradicionais já existentes')
    assert.equal(values.includes('Interação'), false)
    assert.equal(values.includes('Dispensa'), false)
  })

  test('qualquer modo_exibicao diferente de "destaque_elemento" (inclusive vazio/desconhecido) cai no relatório tradicional — nunca no contextual por engano', () => {
    for (const modo of ['modal_automatica', '', 'banner', 'outro_formato_futuro']) {
      const blocos = blocosDashboardVisiveis(modo)
      assert.equal(blocos.secaoRespostas, true, `modo_exibicao="${modo}" deveria mostrar Respostas`)
      assert.equal(blocos.kpiDestaque, false, `modo_exibicao="${modo}" não deveria mostrar KPIs de destaque`)
      assert.equal(blocos.filtroDestaque, false, `modo_exibicao="${modo}" não deveria mostrar filtro "Destaque"`)
      assert.equal(blocos.opcoesTipoEvento.some(o => o.value === 'Interação' || o.value === 'Dispensa'), false,
        `modo_exibicao="${modo}" não deveria oferecer tipos de evento exclusivos de destaque`)
    }
  })

  test('NPS/CSAT continuam intactos: nada nesta função depende de tipo_avaliacao_feedback (nps/csat) — só de modo_exibicao', () => {
    // A regra é inteiramente sobre modo_exibicao (destaque_elemento ou não).
    // Uma campanha NPS e uma campanha CSAT com o mesmo modo_exibicao
    // (modal_automatica) sempre recebem exatamente os mesmos blocos —
    // blocosDashboardVisiveis nem recebe tipo_avaliacao_feedback como
    // parâmetro, então não há como o cálculo de NPS/CSAT ser afetado por
    // esta função, nem o inverso.
    const paraNps = blocosDashboardVisiveis('modal_automatica')
    const paraCsat = blocosDashboardVisiveis('modal_automatica')
    assert.deepEqual(paraNps, paraCsat)
  })
})

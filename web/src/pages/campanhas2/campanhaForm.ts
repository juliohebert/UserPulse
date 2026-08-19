import type { Campanha, StatusCampanha } from '../../types'

// Lógica pura (sem React/JSX) do formulário de Campanhas 2 — hidratação
// (GET Campanha -> FormState), geração de payload (FormState -> POST/PUT) e
// resolução do tipo de destino selecionado no dock. Extraída de Index.tsx
// pra poder ser testada com node:test sem precisar montar componentes.
//
// Regra central (compat com campanhas antigas criadas pelo Form.tsx
// legado): carregar uma campanha existente e salvar SEM alterar nada nunca
// pode zerar/resetar um campo que já tinha um valor válido — ver
// campanhaForm.test.ts, principalmente o teste de round-trip.

// Múltiplos destaques por campanha (Fase 2) — 1 campanha destaque_elemento
// passa a ter N itens independentes (ex.: filtro-status, filtro-profissional,
// filtro-convenio), cada um com seu próprio data-cy/badge/título/descrição/
// CTA. Espelha CampanhaDestaqueItem (server/prisma/schema.prisma) sem
// tenant_id/campanha_id (ordem é a posição no array). `id` é opcional e só
// existe pra um item já salvo (vindo de `c.destaques` na carga da edição) —
// preservá-lo no payload de update é o que permite o backend fazer
// sincronização por identidade (UPDATE em vez de delete+recreate), mantendo
// o id estável pro estado "Até interagir" e tracking futuro. Item novo
// (adicionado no form) nunca tem `id` -> backend trata como CREATE.
export interface DestaqueFormItem {
  id?: string
  data_cy: string
  texto_badge: string
  titulo: string
  descricao: string
  cta_habilitado: boolean
  texto_botao: string
  url_botao: string
}

// `status` de propósito NÃO é um campo de FormState (Fase 2 dos 3 status) —
// o builder nunca decide status por um checkbox solto: criação sempre nasce
// RASCUNHO (decidido só pelo backend, ver criar() em
// server/src/controllers/campanhas.ts) e "Salvar alterações" preserva o
// status atual (nenhuma chave `status` no payload = backend não mexe nele).
// Publicar/desativar/reativar são ações explícitas à parte (ver
// Campanhas2Index/campanhas/Index.tsx), nunca um campo deste formulário.
export interface FormState {
  titulo: string
  // Eyebrow do modal; reutilizado como texto do badge quando
  // modo_exibicao === FORMATO_DESTAQUE_ELEMENTO (ver CampoDock "Texto do
  // badge" na aba Exibição).
  subtitulo: string
  descricao: string
  tipo: string
  sistema: string
  tela: string
  imagem_url: string
  video_url: string
  texto_botao: string
  url_botao: string
  feedback_habilitado: boolean
  modo_exibicao: string
  gatilho: string
  evento: string
  modo_identificacao: string
  data_cy: string
  url_contem: string
  atraso_ms: string
  mostrar_uma_vez: boolean
  prioridade: string
  ordem: string
  data_inicio: string
  data_fim: string
  pergunta_feedback: string
  observacao_obrigatoria: boolean
  exige_confirmacao_leitura: boolean
  permitir_fechar_modal: boolean
  intervalo_reexibicao_dias: string
  politica_reexibicao: string
  reexibir_apos_dias: string
  encerrar_apos_evento: boolean
  evento_conclusao: string
  cta_habilitado: boolean
  segmentar_cliente_ids: string[]
  segmentar_unidade_ids: string[]
  segmentar_perfis: string[]
  segmentar_usuario_tipos: string[]
  segmentar_estados: string[]
  // Só usado/relevante quando modo_exibicao === FORMATO_DESTAQUE_ELEMENTO.
  // Substitui os campos únicos (subtitulo/titulo/descricao/texto_botao/
  // url_botao/data_cy) como fonte de verdade pra ESTE formato — eles
  // continuam existindo no schema/payload como espelho do primeiro item (ver
  // montarPayloadCampanha e o comentário em server/src/controllers/campanhas.ts).
  destaques: DestaqueFormItem[]
}

export type FormatoExibicao = 'modal_automatica' | 'destaque_elemento'
export const FORMATO_DESTAQUE_ELEMENTO: FormatoExibicao = 'destaque_elemento'

export const TIPOS_CAMPANHA = ['comunicado', 'melhoria', 'pesquisa']

export const formInicial: FormState = {
  titulo: 'Novidade no produto',
  subtitulo: 'Atualização importante',
  descricao: 'Conte para o usuário o que mudou, por que isso importa e qual é o próximo passo.',
  tipo: 'comunicado',
  sistema: '',
  tela: '',
  imagem_url: '',
  video_url: '',
  texto_botao: 'Saiba mais',
  url_botao: '',
  feedback_habilitado: true,
  modo_exibicao: 'modal_automatica',
  gatilho: 'ao_abrir_tela',
  evento: '',
  modo_identificacao: 'sistema_tela',
  data_cy: '',
  url_contem: '',
  atraso_ms: '800',
  mostrar_uma_vez: true,
  prioridade: '0',
  ordem: '1',
  data_inicio: '',
  data_fim: '',
  pergunta_feedback: '',
  observacao_obrigatoria: false,
  exige_confirmacao_leitura: false,
  permitir_fechar_modal: true,
  intervalo_reexibicao_dias: '',
  politica_reexibicao: 'uma_vez_apos_visualizacao',
  reexibir_apos_dias: '',
  encerrar_apos_evento: false,
  evento_conclusao: '',
  cta_habilitado: true,
  segmentar_cliente_ids: [],
  segmentar_unidade_ids: [],
  segmentar_perfis: [],
  segmentar_usuario_tipos: [],
  segmentar_estados: [],
  destaques: [],
}

export function normalizarUrl(valor: string): string {
  const trimmed = valor.trim()
  if (!trimmed) return ''
  try {
    return new URL(trimmed).toString()
  } catch {
    return trimmed
  }
}

export function normalizarUrlContem(valor: string): string {
  const trimmed = valor.trim()
  if (!trimmed) return ''
  try {
    return new URL(trimmed).pathname
  } catch {
    return trimmed
  }
}

export function extrairYouTubeId(url: URL): string | null {
  if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] ?? null
  if (url.hostname.includes('youtube.com')) {
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/').filter(Boolean)[1] ?? null
    if (url.pathname.startsWith('/embed/')) return url.pathname.split('/').filter(Boolean)[1] ?? null
    return url.searchParams.get('v')
  }
  return null
}

export function converterVideoEmbed(valor: string): string {
  const trimmed = valor.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    const youtubeId = extrairYouTubeId(url)
    if (youtubeId) return `https://www.youtube.com/embed/${youtubeId}`
    if (url.hostname.includes('vimeo.com')) {
      const id = url.pathname.split('/').filter(Boolean).pop()
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
    }
    if (url.hostname.includes('loom.com') && url.pathname.includes('/share/')) {
      return url.toString().replace('/share/', '/embed/')
    }
    return url.toString()
  } catch {
    return trimmed
  }
}

export function pareceUrlVideo(valor: string): boolean {
  const trimmed = valor.trim()
  if (!trimmed) return false
  try {
    const url = new URL(trimmed)
    return Boolean(extrairYouTubeId(url)) || url.hostname.includes('vimeo.com') || url.hostname.includes('loom.com')
  } catch {
    return false
  }
}

// ─── Destino ────────────────────────────────────────────────────────────
// 4 formas de identificar quando/onde a campanha aparece. 'url' é a 4ª
// opção (campo desta rodada) — campanhas antigas criadas pelo Form.tsx
// legado podem ter modo_identificacao='url_contem' (destino por caminho de
// URL), formato que o Campanhas 2 não representava até agora: sem esse
// case, `resolverTipoDestino` caía no fallback 'tela', escondendo o
// url_contem configurado e arriscando perdê-lo caso o usuário mexesse na
// seção Destino (ver DockLateral em Index.tsx).
export type TipoDestino = 'tela' | 'data_cy' | 'url' | 'acao'

export function resolverTipoDestino(form: Pick<FormState, 'gatilho' | 'modo_identificacao'>): TipoDestino {
  if (form.gatilho === 'apos_evento') return 'acao'
  if (form.modo_identificacao === 'data_cy') return 'data_cy'
  if (form.modo_identificacao === 'url_contem') return 'url'
  return 'tela'
}

// ─── Segmentação ────────────────────────────────────────────────────────
// 'modo' não existe como campo persistido — é só uma lente da UI sobre os 5
// arrays de segmentar_* que o backend de fato guarda (ver FormState). Fica
// aqui (e não como useState hardcoded no componente) porque precisa ser
// derivado do FormState já hidratado sempre que uma campanha é carregada
// pra edição: sem isso, o seletor volta pro default 'todos' mesmo quando os
// IDs de cliente/perfil já estão salvos e presentes no form (bug de
// hidratação — ver campanhaForm.test.ts).
export type ModoSegmentacao = 'todos' | 'cliente' | 'perfil' | 'combinada'

export function resolverModoSegmentacao(form: Pick<FormState,
  'segmentar_cliente_ids' | 'segmentar_unidade_ids' | 'segmentar_perfis' | 'segmentar_usuario_tipos' | 'segmentar_estados'
>): ModoSegmentacao {
  const temCliente = form.segmentar_cliente_ids.length > 0 || form.segmentar_unidade_ids.length > 0
  const temPerfil = form.segmentar_perfis.length > 0 || form.segmentar_usuario_tipos.length > 0 || form.segmentar_estados.length > 0

  if (temCliente && temPerfil) return 'combinada'
  if (temCliente) return 'cliente'
  if (temPerfil) return 'perfil'
  return 'todos'
}

// ─── Hidratação: Campanha (API) -> FormState ───────────────────────────────
// Espelha 1:1 os campos de Campanha (web/src/types.ts) — qualquer campo
// existente no backend que não tenha um `?? valorPadrao` aqui e não seja
// atribuído direto é um campo que se perde silenciosamente ao editar uma
// campanha antiga (ver campanhaForm.test.ts, round-trip).
export function hidratarFormState(c: Campanha): FormState {
  return {
    titulo: c.titulo,
    subtitulo: c.subtitulo ?? '',
    descricao: c.descricao,
    tipo: c.tipo,
    sistema: c.sistema,
    tela: c.tela ?? '',
    imagem_url: c.imagem_url ?? '',
    video_url: c.video_url ?? '',
    texto_botao: c.texto_botao ?? '',
    url_botao: c.url_botao ?? '',
    feedback_habilitado: c.feedback_habilitado,
    modo_exibicao: c.modo_exibicao,
    gatilho: c.gatilho,
    evento: c.evento ?? '',
    modo_identificacao: c.modo_identificacao,
    data_cy: c.data_cy ?? '',
    url_contem: c.url_contem ?? '',
    atraso_ms: String(c.atraso_ms),
    mostrar_uma_vez: c.mostrar_uma_vez,
    prioridade: String(c.prioridade),
    ordem: String(c.ordem),
    data_inicio: c.data_inicio ?? '',
    data_fim: c.data_fim ?? '',
    pergunta_feedback: c.pergunta_feedback ?? '',
    observacao_obrigatoria: c.observacao_obrigatoria,
    exige_confirmacao_leitura: c.exige_confirmacao_leitura,
    permitir_fechar_modal: c.permitir_fechar_modal,
    intervalo_reexibicao_dias: c.intervalo_reexibicao_dias != null ? String(c.intervalo_reexibicao_dias) : '',
    politica_reexibicao: c.politica_reexibicao,
    reexibir_apos_dias: c.reexibir_apos_dias != null ? String(c.reexibir_apos_dias) : '',
    encerrar_apos_evento: c.encerrar_apos_evento,
    evento_conclusao: c.evento_conclusao ?? '',
    // texto_botao/url_botao só existem juntos (ver montarPayloadCampanha) —
    // a presença de qualquer um dos dois já indica CTA habilitado.
    cta_habilitado: Boolean(c.texto_botao || c.url_botao),
    segmentar_cliente_ids: c.segmentar_cliente_ids,
    segmentar_unidade_ids: c.segmentar_unidade_ids,
    segmentar_perfis: c.segmentar_perfis,
    segmentar_usuario_tipos: c.segmentar_usuario_tipos,
    segmentar_estados: c.segmentar_estados,
    // destaques[] tem prioridade; sem nenhum item (campanha antiga que ainda
    // não passou pelo backfill, ou resposta de um endpoint que não inclui a
    // relação), cai pro fallback legado: 1 pseudo-item a partir dos campos
    // únicos — mesma lógica de destaqueElementoResolverItens em widget.js.
    destaques: c.destaques && c.destaques.length > 0
      ? c.destaques.map(item => ({
          id: item.id,
          data_cy: item.data_cy,
          texto_badge: item.texto_badge ?? '',
          titulo: item.titulo,
          descricao: item.descricao,
          cta_habilitado: Boolean(item.texto_botao || item.url_botao),
          texto_botao: item.texto_botao ?? '',
          url_botao: item.url_botao ?? '',
        }))
      : c.modo_exibicao === FORMATO_DESTAQUE_ELEMENTO && c.data_cy
        ? [{
            data_cy: c.data_cy,
            texto_badge: c.subtitulo ?? '',
            titulo: c.titulo,
            descricao: c.descricao,
            cta_habilitado: Boolean(c.texto_botao || c.url_botao),
            texto_botao: c.texto_botao ?? '',
            url_botao: c.url_botao ?? '',
          }]
        : [],
  }
}

// Campanhas 2 é o fluxo mantido pra edição — hidratarFormState/
// montarPayloadCampanha acima cobrem com segurança todos os formatos que o
// Form.tsx legado suportava (comunicado/modal, NPS, gatilho por tela/evento,
// destino por data-cy/URL, feedback, segmentação, reexibição, vigência, CTA,
// múltiplos destaques), então toda campanha edita por lá agora. Form.tsx já
// foi removido do repositório (App.tsx aposentou a rota antiga em favor de
// Campanhas2Index) — /campanhas/:id/editar e /campanhas2/:id/editar
// renderizam o mesmo componente, esta função usa a primeira por já ser a
// canônica em App.tsx. Vive neste módulo (e não em utils/campanha.ts, que
// reexporta) porque utils/campanha.ts lê `import.meta.env`/`window` no
// top-level e não pode ser importado fora do Vite — este arquivo precisa
// continuar puro pra ser testável com node:test.
export function rotaEditarCampanha(c: Pick<Campanha, 'id'>): string {
  return `/campanhas/${c.id}/editar`
}

// ─── Status de exibição (Fase 2 dos 3 status) ──────────────────────────────
// `status` persistido é sempre a fonte de verdade: RASCUNHO e INATIVA nunca
// viram "Agendada"/"Encerrada" — essas duas são só uma leitura de período
// (data_inicio/data_fim) que só faz sentido pra uma campanha já ATIVA. Vive
// aqui (não em utils/campanha.ts, que só reexporta) pelo mesmo motivo de
// rotaEditarCampanha acima: utils/campanha.ts lê import.meta.env/window no
// top-level e não pode ser importado fora do Vite.
export function getStatus(c: Pick<Campanha, 'status' | 'data_inicio' | 'data_fim'>): StatusCampanha {
  if (c.status === 'RASCUNHO') return 'rascunho'
  if (c.status === 'INATIVA') return 'inativa'
  const now = new Date()
  if (c.data_inicio && new Date(c.data_inicio) > now) return 'agendada'
  if (c.data_fim && new Date(c.data_fim) < now) return 'encerrada'
  return 'ativa'
}

// ─── Payload: FormState -> POST/PUT ────────────────────────────────────────
// Espalha `form` inteiro primeiro (round-trip seguro por padrão: qualquer
// campo sem override abaixo volta exatamente como foi carregado) e só
// sobrescreve o que precisa de normalização/derivação.
//
// Bug corrigido nesta rodada: antes, `feedback_habilitado` e
// `observacao_obrigatoria` eram forçados a `false` sempre que
// `exige_confirmacao_leitura` fosse `true` — mas o backend permite os dois
// juntos (validarFechamentoObrigatorio só exige que PELO MENOS um esteja
// ativo, nunca que sejam mutuamente exclusivos), e o Form.tsx legado nunca
// impediu essa combinação. Uma campanha antiga com feedback_habilitado=true
// E exige_confirmacao_leitura=true tinha o feedback zerado silenciosamente
// ao salvar sem tocar em nada — mesmo sem o usuário mexer na aba Feedback.
export function montarPayloadCampanha(form: FormState): Record<string, unknown> {
  const exigeConfirmacao = Boolean(form.exige_confirmacao_leitura)
  // Continua garantindo que a campanha sempre tenha alguma saída (fechar,
  // feedback ou confirmação) — mas agora só reage ao estado REAL de
  // feedback_habilitado, nunca a uma versão artificialmente zerada dele, o
  // que também elimina qualquer risco de cascata do bug acima.
  const exigeSaidaObrigatoria = !form.permitir_fechar_modal && !exigeConfirmacao && !form.feedback_habilitado
  const embedUrl = converterVideoEmbed(form.video_url)

  return {
    ...form,
    permitir_fechar_modal: exigeSaidaObrigatoria ? true : form.permitir_fechar_modal,
    feedback_habilitado: form.feedback_habilitado,
    observacao_obrigatoria: form.observacao_obrigatoria,
    // Destaque em elemento reaproveita subtitulo como texto do badge —
    // "Novo" é o default explícito quando o campo fica em branco (ver
    // CampoDock "Texto do badge" no dock lateral).
    subtitulo: form.modo_exibicao === FORMATO_DESTAQUE_ELEMENTO
      ? (form.subtitulo.trim() || 'Novo')
      : (form.subtitulo || null),
    imagem_url: normalizarUrl(form.imagem_url) || null,
    video_url: embedUrl || null,
    texto_botao: form.cta_habilitado ? (form.texto_botao.trim() || null) : null,
    url_botao: form.cta_habilitado ? (normalizarUrl(form.url_botao) || null) : null,
    evento: form.evento || null,
    tela: form.modo_identificacao === 'sistema_tela' ? (form.tela || 'Geral') : '',
    data_cy: form.data_cy || null,
    url_contem: normalizarUrlContem(form.url_contem) || null,
    atraso_ms: Number(form.atraso_ms || 800),
    prioridade: Number(form.prioridade || 0),
    ordem: Number(form.ordem || 1),
    data_inicio: form.data_inicio || null,
    data_fim: form.data_fim || null,
    pergunta_feedback: form.pergunta_feedback || null,
    intervalo_reexibicao_dias: form.intervalo_reexibicao_dias !== '' ? Number(form.intervalo_reexibicao_dias) : null,
    reexibir_apos_dias: form.reexibir_apos_dias !== '' ? Number(form.reexibir_apos_dias) : null,
    evento_conclusao: form.evento_conclusao.trim() || null,
    // Fonte de verdade pra destaque_elemento (Fase 2) — os campos únicos
    // acima (subtitulo/titulo/descricao/texto_botao/url_botao/data_cy) são
    // ignorados pelo backend nesse formato; ele os recalcula a partir do
    // primeiro item (ver server/src/controllers/campanhas.ts).
    ...(form.modo_exibicao === FORMATO_DESTAQUE_ELEMENTO && {
      destaques: form.destaques.map(item => ({
        // Preserva o id de itens já existentes -> backend faz UPDATE
        // (mantém o id estável); item novo (sem id) -> CREATE. Omitir a
        // chave (em vez de mandar `id: undefined`) evita ambiguidade no
        // JSON.stringify do fetch — undefined nunca vira `"id":null`.
        ...(item.id && { id: item.id }),
        data_cy: item.data_cy.trim(),
        texto_badge: item.texto_badge.trim() || 'Novo',
        titulo: item.titulo.trim(),
        descricao: item.descricao.trim(),
        texto_botao: item.cta_habilitado ? (item.texto_botao.trim() || null) : null,
        url_botao: item.cta_habilitado ? (normalizarUrl(item.url_botao) || null) : null,
      })),
    }),
  }
}

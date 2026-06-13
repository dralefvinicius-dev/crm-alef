import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key)

export type Lead = {
  id?: string
  nome: string
  wa?: string
  email?: string
  cidade?: string
  prof?: string
  assunto: string
  area?: string
  fase?: string
  temp?: string
  origem?: string
  obs?: string
  criado_em?: string
  data_contato?: string
  data_ultimo_contato?: string
  data_proxima_acao?: string
  contatos?: string
  status?: string
  lead_premium?: boolean
  arquivado?: boolean
}

export type Historico = {
  id?: string
  lead_id: string
  lead_nome: string
  tipo?: string
  data?: string
  texto: string
  resultado?: string
  criado_em?: string
}

export type Cliente = {
  id?: string
  lead_id?: string
  nome: string
  wa?: string
  email?: string
  cidade?: string
  prof?: string
  assunto: string
  area?: string
  obs?: string
  fase_jornada?: string
  doc_contracheques?: boolean
  doc_extratos?: boolean
  doc_contratos_emprestimo?: boolean
  doc_outros?: string
  doc_observacoes?: string
  data_promocao?: string
  data_inicio_peticao?: string
  data_fim_peticao?: string
  data_protocolo?: string
  prazo_peticao_dias?: number
  prazo_protocolo_dias?: number
  numero_processo?: string
  vara_comarca?: string
  arquivado?: boolean
  criado_em?: string
}

export type Movimentacao = {
  id?: string
  cliente_id: string
  data?: string
  tipo?: string
  prioridade?: string
  texto: string
  prazo_resposta?: string
  criado_em?: string
}

export const FASES = [
  'Relatório Enviado',
  'Proposta Enviada',
  'Contrato Enviado',
  'Contrato Assinado',
  'Lead Perdido',
]

export const TEMPERATURAS = ['Quente','Morno','Frio']
export const ORIGENS = ['Indicação','Meta Ads','Google','Instagram','WhatsApp Direto','SINSEPPAR','Outro']
export const AREAS = ['Direito Civil','Família e Sucessões','Contratos','Direito do Consumidor','Direito Público','Bancário / Consignado']
export const TIPOS_CONTATO = ['WhatsApp','Ligação','Reunião Presencial','E-mail','Videoconferência']

export const CONTATOS_OPCOES = [
  'Contato Inicial',
  '1 Rmkt',
  '2 Rmkt',
  '3 Rmkt',
]

export const STATUS_OPCOES = [
  'Em negociação',
  'Avaliando questão financeira',
  'Aguardando Assinatura',
  'Aguardando Documentação',
]

// ====== Página Clientes ======
export const FASES_JORNADA = [
  'Documentação',
  'Petição Inicial',
  'Protocolo',
  'Acompanhamento',
]

export const TIPOS_MOVIMENTACAO = [
  'Decisão',
  'Intimação',
  'Andamento',
  'Petição',
  'Audiência',
  'Sentença',
  'Recurso',
  'Outro',
]

export const PRIORIDADES_MOVIMENTACAO = ['critica', 'normal', 'conclusao']

// Documentação padrão para área consignado
export const DOCS_CONSIGNADO = [
  { key: 'doc_contracheques' as const, label: 'Últimos 3 contracheques', obrigatorio: true },
  { key: 'doc_extratos' as const, label: 'Últimos 6 extratos bancários', obrigatorio: true },
  { key: 'doc_contratos_emprestimo' as const, label: 'Contratos de empréstimos', obrigatorio: false },
]

// Constante: dias para auto-arquivar lead perdido
export const DIAS_PARA_ARQUIVAR_LEAD_PERDIDO = 15

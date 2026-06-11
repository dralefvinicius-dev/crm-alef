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
  // ====== campos novos / renomeados ======
  data_contato?: string         // data em que o lead te procurou (1º contato)
  data_ultimo_contato?: string  // data do seu último contato com ele
  data_proxima_acao?: string    // data da próxima atuação
  contatos?: string             // 'Contato Inicial' | '1 Rmkt' | '2 Rmkt' | '3 Rmkt'
  status?: string               // motivo/status detalhado
  lead_premium?: boolean
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

// ====== Fases novas (item 1) ======
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

// ====== Contatos (item 2/4) - etapa de remarketing ======
export const CONTATOS_OPCOES = [
  'Contato Inicial',
  '1 Rmkt',
  '2 Rmkt',
  '3 Rmkt',
]

// ====== Status (item 3) - substitui o antigo Motivo/Situação ======
export const STATUS_OPCOES = [
  'Em negociação',
  'Avaliando questão financeira',
  'Aguardando Assinatura',
  'Aguardando Documentação',
]

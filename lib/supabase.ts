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
  prox_acao?: string
  consulta?: string
  obs?: string
  ultimo_contato?: string
  criado_em?: string
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

export const FASES = ['Novo Lead','Contato Inicial','Consulta Agendada','Em Negociação','Contrato Assinado','Lead Perdido']
export const TEMPERATURAS = ['Quente','Morno','Frio']
export const ORIGENS = ['Indicação','Meta Ads','Google','Instagram','WhatsApp Direto','SINSEPPAR','Outro']
export const AREAS = ['Direito Civil','Família e Sucessões','Contratos','Direito do Consumidor','Direito Público','Bancário / Consignado']
export const TIPOS_CONTATO = ['WhatsApp','Ligação','Reunião Presencial','E-mail','Videoconferência']

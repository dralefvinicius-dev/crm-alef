'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Lead, Historico, FASES, TEMPERATURAS, ORIGENS, AREAS, TIPOS_CONTATO } from '@/lib/supabase'

const NAVY = '#0D1B2E'
const GOLD = '#C9A84C'

const FASE_CORES: Record<string, { bg: string; color: string }> = {
  'Novo Lead': { bg: '#dbeafe', color: '#1e40af' },
  'Contato Inicial': { bg: '#d1fae5', color: '#065f46' },
  'Consulta Agendada': { bg: '#fef3c7', color: '#92400e' },
  'Em Negociação': { bg: '#ede9fe', color: '#5b21b6' },
  'Contrato Assinado': { bg: '#ccfbf1', color: '#134e4a' },
  'Lead Perdido': { bg: '#fee2e2', color: '#991b1b' },
}
const TEMP_COR: Record<string, string> = {
  Quente: '#ef4444', Morno: '#f59e0b', Frio: '#3b82f6',
}
const LEAD_VAZIO: Lead = {
  nome: '', wa: '', email: '', cidade: 'Parauapebas', prof: '',
  assunto: '', area: 'Direito Civil', fase: 'Novo Lead',
  temp: 'Morno', origem: 'Indicação', prox_acao: '', consulta: '', obs: '',
}

// Limites de comportamento
const DIAS_SEM_CONTATO_ALERTA = 2
const DIAS_PARADO_FUNIL = 5

function Initials({ nome }: { nome: string }) {
  const parts = nome.trim().split(' ')
  const ini = parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)
  return (
    <div style={{ background: NAVY, color: GOLD, width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
      {ini.toUpperCase()}
    </div>
  )
}

const hojeStr = () => new Date().toISOString().slice(0, 10)
const diasEntre = (d: string | undefined | null) => {
  if (!d) return null
  const dt = new Date(d + 'T00:00:00')
  const hj = new Date(hojeStr() + 'T00:00:00')
  return Math.floor((hj.getTime() - dt.getTime()) / 86400000)
}
const formatarData = (d: string | undefined | null) => {
  if (!d) return '—'
  try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') } catch { return '—' }
}
const formatarDataRelativa = (d: string | undefined | null) => {
  const dias = diasEntre(d)
  if (dias === null) return '—'
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 0) return `em ${Math.abs(dias)}d`
  return `há ${dias}d`
}

export default function Home() {
  const [aba, setAba] = useState<'dashboard' | 'leads' | 'funil' | 'historico'>('dashboard')
  const [leads, setLeads] = useState<Lead[]>([])
  const [historico, setHistorico] = useState<Historico[]>([])
  const [loading, setLoading] = useState(true)
  const [erroGlobal, setErroGlobal] = useState<string | null>(null)
  const [modalLead, setModalLead] = useState(false)
  const [form, setForm] = useState<Lead>(LEAD_VAZIO)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalHist, setModalHist] = useState(false)
  const [histForm, setHistForm] = useState<Partial<Historico>>({})
  const [busca, setBusca] = useState('')
  const [filtroFase, setFiltroFase] = useState('')
  const [filtroTemp, setFiltroTemp] = useState('')
  const [filtroHistLead, setFiltroHistLead] = useState('')
  const [filtroHistTipo, setFiltroHistTipo] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setErroGlobal(null)
    const [{ data: l, error: e1 }, { data: h, error: e2 }] = await Promise.all([
      supabase.from('leads').select('*').order('criado_em', { ascending: false }),
      supabase.from('historico').select('*').order('data', { ascending: false }),
    ])
    if (e1) setErroGlobal('Erro: ' + e1.message)
    if (e2) setErroGlobal('Erro: ' + e2.message)
    setLeads(l || []); setHistorico(h || []); setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const ehAtivo = (l: Lead) => l.fase !== 'Contrato Assinado' && l.fase !== 'Lead Perdido'

  const ativos = leads.filter(ehAtivo).length
  const consultas = leads.filter(l => l.fase === 'Consulta Agendada').length
  const contratos = leads.filter(l => l.fase === 'Contrato Assinado').length
  const perdidos = leads.filter(l => l.fase === 'Lead Perdido').length
  const decididos = contratos + perdidos
  const taxa = decididos > 0 ? Math.round(contratos / decididos * 100) : 0

  const { contratosMes, contratosMesAnt } = useMemo(() => {
    const hoje = new Date()
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const inicioMesAnt = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    const fimMesAnt = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59)
    const dentro = (lead: Lead, ini: Date, fim?: Date) => {
      if (lead.fase !== 'Contrato Assinado') return false
      const hist = historico.filter(h => h.lead_id === lead.id).sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      const ref = hist[0]?.data || lead.criado_em?.slice(0, 10) || ''
      if (!ref) return false
      const d = new Date(ref + 'T00:00:00')
      if (fim) return d >= ini && d <= fim
      return d >= ini
    }
    return {
      contratosMes: leads.filter(l => dentro(l, inicioMes)).length,
      contratosMesAnt: leads.filter(l => dentro(l, inicioMesAnt, fimMesAnt)).length,
    }
  }, [leads, historico])

  const ultAtendPorLead = useMemo(() => {
    const m: Record<string, Historico> = {}
    historico.forEach(h => {
      if (!h.lead_id) return
      const a = m[h.lead_id]
      if (!a || (h.data || '') > (a.data || '')) m[h.lead_id] = h
    })
    return m
  }, [historico])

  const acoesVencidas = useMemo(() => leads.filter(l => {
    if (!ehAtivo(l) || !l.prox_acao) return false
    const d = diasEntre(l.prox_acao); return d !== null && d >= 0
  }).sort((a, b) => (a.prox_acao || '').localeCompare(b.prox_acao || '')), [leads])

  const acoesProximas = useMemo(() => leads.filter(l => {
    if (!ehAtivo(l) || !l.prox_acao) return false
    const d = diasEntre(l.prox_acao); return d !== null && d < 0 && d >= -3
  }).sort((a, b) => (a.prox_acao || '').localeCompare(b.prox_acao || '')), [leads])

  const consultasProximas = useMemo(() => leads.filter(l => {
    if (!ehAtivo(l) || !l.consulta) return false
    const d = diasEntre(l.consulta); return d !== null && d <= 0 && d >= -7
  }).sort((a, b) => (a.consulta || '').localeCompare(b.consulta || '')), [leads])

  const leadsSemContato = useMemo(() => leads.filter(l => {
    if (!ehAtivo(l) || !l.ultimo_contato) return false
    const d = diasEntre(l.ultimo_contato); return d !== null && d >= DIAS_SEM_CONTATO_ALERTA
  }).sort((a, b) => (a.ultimo_contato || '').localeCompare(b.ultimo_contato || '')), [leads])

  const leadsParados = useMemo(() => leads.filter(l => {
    if (l.fase !== 'Contato Inicial' && l.fase !== 'Em Negociação') return false
    if (!l.ultimo_contato) return false
    const d = diasEntre(l.ultimo_contato); return d !== null && d >= DIAS_PARADO_FUNIL
  }).sort((a, b) => (a.ultimo_contato || '').localeCompare(b.ultimo_contato || '')), [leads])

  type Urgencia = { lead: Lead; motivo: string; prioridade: number; cor: string }
  const leadsUrgentes = useMemo<Urgencia[]>(() => {
    const map = new Map<string, Urgencia>()
    acoesVencidas.forEach(l => {
      if (!l.id) return
      const d = diasEntre(l.prox_acao)
      const txt = d === 0 ? 'Ação prevista para hoje' : `Ação atrasada há ${d}d`
      map.set(l.id, { lead: l, motivo: txt, prioridade: 1, cor: '#dc2626' })
    })
    consultasProximas.forEach(l => {
      if (!l.id || map.has(l.id)) return
      const d = diasEntre(l.consulta)
      const txt = d === 0 ? 'Consulta agendada para HOJE' : `Consulta em ${Math.abs(d!)}d`
      map.set(l.id, { lead: l, motivo: txt, prioridade: 2, cor: '#d97706' })
    })
    leadsParados.forEach(l => {
      if (!l.id || map.has(l.id)) return
      const d = diasEntre(l.ultimo_contato)
      map.set(l.id, { lead: l, motivo: `Parado em "${l.fase}" há ${d}d`, prioridade: 3, cor: '#7c3aed' })
    })
    leadsSemContato.forEach(l => {
      if (!l.id || map.has(l.id)) return
      const d = diasEntre(l.ultimo_contato)
      map.set(l.id, { lead: l, motivo: `Sem contato há ${d}d`, prioridade: 4, cor: '#f59e0b' })
    })
    return Array.from(map.values()).sort((a, b) => a.prioridade - b.prioridade)
  }, [acoesVencidas, consultasProximas, leadsParados, leadsSemContato])

  const ultimasAtividades = useMemo(() => {
    return [...historico]
      .sort((a, b) => (b.criado_em || b.data || '').localeCompare(a.criado_em || a.data || ''))
      .slice(0, 5)
  }, [historico])

  const leadsFiltrados = leads.filter(l => {
    if (busca && !`${l.nome} ${l.cidade} ${l.assunto}`.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroFase && l.fase !== filtroFase) return false
    if (filtroTemp && l.temp !== filtroTemp) return false
    return true
  })

  const historicoFiltrado = historico.filter(h => {
    if (filtroHistLead && h.lead_id !== filtroHistLead) return false
    if (filtroHistTipo && h.tipo !== filtroHistTipo) return false
    return true
  })

  const salvarLead = async () => {
    if (!form.nome.trim() || !form.assunto.trim()) return alert('Nome e assunto são obrigatórios.')
    setSaving(true)
    const payload = { ...form, prox_acao: form.prox_acao || null, consulta: form.consulta || null, ultimo_contato: form.ultimo_contato || hojeStr() }
    const { error } = editId
      ? await supabase.from('leads').update(payload).eq('id', editId)
      : await supabase.from('leads').insert(payload)
    setSaving(false)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setModalLead(false); carregar()
  }

  const excluirLead = async (id: string, nome: string) => {
    if (!confirm(`Excluir lead "${nome}"?`)) return
    await supabase.from('leads').delete().eq('id', id); carregar()
  }

  const abrirEditar = (l: Lead) => { setForm({ ...l }); setEditId(l.id || null); setModalLead(true) }
  const abrirNovo = () => { setForm({ ...LEAD_VAZIO }); setEditId(null); setModalLead(true) }

  const abrirHistDoLead = (lead: Lead) => {
    setHistForm({ lead_id: lead.id, lead_nome: lead.nome, data: hojeStr(), tipo: 'WhatsApp' })
    setModalHist(true)
  }

  const salvarHist = async () => {
    if (!histForm.lead_id || !histForm.texto?.trim()) return alert('Lead e descrição são obrigatórios.')
    const { error } = await supabase.from('historico').insert({ ...histForm, data: histForm.data || hojeStr() })
    if (error) { alert('Erro: ' + error.message); return }
    await supabase.from('leads').update({ ultimo_contato: histForm.data || hojeStr() }).eq('id', histForm.lead_id)
    setModalHist(false); setHistForm({}); carregar()
  }

  const barChart = (campo: keyof Lead) => {
    const m: Record<string, number> = {}
    leads.forEach(l => { const v = (l[campo] as string) || 'Não informado'; m[v] = (m[v] || 0) + 1 })
    const items = Object.entries(m).sort((a, b) => b[1] - a[1])
    const max = items[0]?.[1] || 1
    return items.map(([k, v]) => (
      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 120, fontSize: 12, color: '#6b7280', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
        <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 8, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(v / max * 100)}%`, background: GOLD, height: '100%', borderRadius: 4 }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, minWidth: 16, color: NAVY }}>{v}</span>
      </div>
    ))
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '▦' },
    { id: 'leads', label: 'Leads', icon: '◎' },
    { id: 'funil', label: 'Funil', icon: '◈' },
    { id: 'historico', label: 'Histórico', icon: '◷' },
  ] as const

  const inp: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .layout { display: flex; min-height: 100vh; background: #f4f5f7; }
        .sidebar { width: 220px; background: ${NAVY}; display: flex; flex-direction: column; position: fixed; top: 0; left: 0; bottom: 0; z-index: 20; }
        .main { margin-left: 220px; flex: 1; padding: 28px 32px; padding-bottom: 40px; }
        .bottomnav { display: none; }
        .stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 20px; }
        .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .funil-grid { display: grid; grid-template-columns: repeat(6,1fr); gap: 12px; }
        .dash-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 20px; }
        .agenda-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        @media (max-width: 1024px) { .dash-grid { grid-template-columns: 1fr; } .agenda-grid { grid-template-columns: 1fr; } }
        @media (max-width: 768px) {
          .sidebar { display: none; }
          .bottomnav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: ${NAVY}; z-index: 20; border-top: 1px solid rgba(201,168,76,0.2); padding-bottom: env(safe-area-inset-bottom); }
          .bottomnav button { flex: 1; background: none; border: none; color: rgba(255,255,255,0.6); padding: 10px 4px 8px; font-size: 10px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; }
          .bottomnav button.active { color: ${GOLD}; }
          .bottomnav button span.icon { font-size: 18px; }
          .main { margin-left: 0; padding: 16px; padding-bottom: 80px; }
          .topbar { display: flex !important; }
          .stats { grid-template-columns: repeat(2,1fr); gap: 10px; }
          .charts { grid-template-columns: 1fr; }
          .funil-grid { grid-template-columns: repeat(2,1fr); }
        }
        .topbar { display: none; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 12px 0 0; }
        .urgencia-card { background: #fff; border-radius: 10px; padding: 12px 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); display: flex; gap: 10px; align-items: flex-start; transition: transform 0.1s; cursor: pointer; }
        .urgencia-card:hover { transform: translateY(-1px); box-shadow: 0 3px 8px rgba(0,0,0,0.10); }
        .agenda-card { background: #fff; border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
        .agenda-item { padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
        .agenda-item:last-child { border-bottom: none; }
        .lead-card-rich { background: #fff; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); margin-bottom: 10px; border-left: 4px solid transparent; }
        .btn-wa { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; background: #16a34a; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600; text-decoration: none; }
        .btn-wa:hover { background: #15803d; }
        .btn-mini { padding: 5px 10px; background: #fff; color: ${NAVY}; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 500; }
        .btn-mini:hover { background: #f9fafb; border-color: ${GOLD}; }
      `}</style>

      <div className="layout">
        <div className="sidebar">
          <div style={{ padding: '24px 20px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: `2px solid ${GOLD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>AV</span>
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>ALEF VINICIUS</div>
                <div style={{ color: GOLD, fontSize: 9, letterSpacing: 2 }}>ADVOCACIA</div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: `1px solid rgba(201,168,76,0.25)`, margin: '0 16px 16px' }} />
          <nav style={{ flex: 1, padding: '0 12px' }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => setAba(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', marginBottom: 4, fontSize: 13, fontWeight: aba === item.id ? 600 : 400, background: aba === item.id ? 'rgba(201,168,76,0.18)' : 'transparent', color: aba === item.id ? GOLD : 'rgba(255,255,255,0.65)', textAlign: 'left' }}>
                <span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}
              </button>
            ))}
          </nav>
          <div style={{ padding: '16px 20px', borderTop: `1px solid rgba(255,255,255,0.07)` }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.8 }}>OAB/PA 35.567</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Parauapebas/PA</div>
          </div>
        </div>

        <div className="main">
          <div className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', border: `2px solid ${GOLD}`, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: GOLD, fontWeight: 700, fontSize: 12 }}>AV</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>ALEF VINICIUS</div>
                <div style={{ fontSize: 10, color: GOLD }}>ADVOCACIA</div>
              </div>
            </div>
            <button onClick={abrirNovo} style={{ background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>+ Lead</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: 0 }}>
                {aba === 'dashboard' ? 'Dashboard' : aba === 'leads' ? 'Leads' : aba === 'funil' ? 'Funil' : 'Histórico'}
              </h1>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '3px 0 0' }}>
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <button onClick={abrirNovo} style={{ background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>+ Novo lead</button>
          </div>

          {erroGlobal && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>{erroGlobal}</div>}
          {loading && <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>Carregando...</div>}

          {!loading && aba === 'dashboard' && (
            <div>
              {(consultasProximas.length > 0 || acoesProximas.length > 0) && (
                <div className="agenda-grid">
                  {consultasProximas.length > 0 && (
                    <div className="agenda-card">
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>📅 Consultas próximas</div>
                      {consultasProximas.slice(0, 4).map(l => {
                        const d = diasEntre(l.consulta)
                        return (
                          <div key={l.id} className="agenda-item" onClick={() => abrirEditar(l)} style={{ cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</div>
                                <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.assunto}</div>
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: d === 0 ? '#dc2626' : '#92400e', whiteSpace: 'nowrap' }}>
                                {d === 0 ? 'HOJE' : `em ${Math.abs(d!)}d`}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {acoesProximas.length > 0 && (
                    <div className="agenda-card">
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#5b21b6', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>⏰ Próximas ações (3 dias)</div>
                      {acoesProximas.slice(0, 4).map(l => {
                        const d = diasEntre(l.prox_acao)
                        return (
                          <div key={l.id} className="agenda-item" onClick={() => abrirEditar(l)} style={{ cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</div>
                                <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.assunto}</div>
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#5b21b6', whiteSpace: 'nowrap' }}>
                                {d === 0 ? 'HOJE' : `em ${Math.abs(d!)}d`}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="stats">
                {[
                  { label: 'Leads ativos', val: ativos, cor: NAVY, sub: leadsUrgentes.length > 0 ? `${leadsUrgentes.length} requerem atenção` : 'Tudo em dia' },
                  { label: 'Consultas', val: consultas, cor: '#059669', sub: 'agendadas' },
                  { label: 'Contratos no mês', val: contratosMes, cor: GOLD, sub: `vs ${contratosMesAnt} no mês anterior` },
                  { label: 'Conversão', val: `${taxa}%`, cor: '#0891b2', sub: `${contratos} ganhos · ${perdidos} perdidos` },
                ].map(s => (
                  <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '16px', borderLeft: `4px solid ${s.cor}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                    <div style={{ fontSize: 30, fontWeight: 700, color: s.cor, lineHeight: 1 }}>{s.val}</div>
                    {s.sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>{s.sub}</div>}
                  </div>
                ))}
              </div>

              {leadsParados.length > 0 && (
                <div style={{ background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#5b21b6', marginBottom: 12 }}>
                  ⚠️ <strong>{leadsParados.length} lead(s)</strong> parados em "Contato Inicial" ou "Em Negociação" há 5+ dias — risco de esfriar
                </div>
              )}
              {leadsSemContato.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#92400e', marginBottom: 16 }}>
                  ❄️ <strong>{leadsSemContato.length} lead(s)</strong> sem contato há 2+ dias: {leadsSemContato.slice(0, 5).map(l => l.nome).join(', ')}{leadsSemContato.length > 5 ? ` e mais ${leadsSemContato.length - 5}` : ''}
                </div>
              )}

              <div className="dash-grid">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 10, borderBottom: `2px solid ${GOLD}`, paddingBottom: 8, display: 'inline-block' }}>
                    Leads que precisam de você {leadsUrgentes.length > 0 && <span style={{ background: '#dc2626', color: '#fff', padding: '2px 7px', borderRadius: 10, fontSize: 10, marginLeft: 6 }}>{leadsUrgentes.length}</span>}
                  </div>
                  {leadsUrgentes.length === 0 ? (
                    <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                      ✅ Tudo em dia. Nenhum lead requer atenção imediata.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {leadsUrgentes.slice(0, 8).map(u => {
                        const ult = u.lead.id ? ultAtendPorLead[u.lead.id] : null
                        return (
                          <div key={u.lead.id} className="urgencia-card" style={{ borderLeft: `4px solid ${u.cor}` }} onClick={() => abrirEditar(u.lead)}>
                            <Initials nome={u.lead.nome} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                                <div style={{ fontWeight: 600, color: NAVY, fontSize: 13 }}>{u.lead.nome}</div>
                                <span style={{ fontSize: 10, fontWeight: 600, color: u.cor, background: u.cor + '15', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                                  {u.motivo}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {u.lead.assunto}
                              </div>
                              {ult && (
                                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                  💬 {ult.tipo} · {formatarData(ult.data)}: "{ult.texto}"
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                {u.lead.wa && (
                                  <a href={`https://wa.me/${u.lead.wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="btn-wa">
                                    ↗ WhatsApp
                                  </a>
                                )}
                                <button className="btn-mini" onClick={() => abrirHistDoLead(u.lead)}>+ Atendimento</button>
                                <span style={{ fontSize: 10, color: '#9ca3af' }}>
                                  Fase: <strong>{u.lead.fase}</strong> · Últ. contato: {formatarDataRelativa(u.lead.ultimo_contato)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      {leadsUrgentes.length > 8 && (
                        <div style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', padding: 8 }}>+ {leadsUrgentes.length - 8} lead(s) — ver na aba Leads</div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 10, borderBottom: `2px solid ${GOLD}`, paddingBottom: 8, display: 'inline-block' }}>
                    Última atividade
                  </div>
                  <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                    {ultimasAtividades.length === 0 ? (
                      <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Nenhum atendimento registrado.</div>
                    ) : (
                      ultimasAtividades.map((h, i) => {
                        const lead = leads.find(l => l.id === h.lead_id)
                        return (
                          <div key={h.id} onClick={() => lead && abrirEditar(lead)} style={{ padding: '12px 14px', borderBottom: i < ultimasAtividades.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: lead ? 'pointer' : 'default' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 12, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{h.lead_nome}</span>
                              <span style={{ fontSize: 10, background: '#f3f4f6', color: '#6b7280', padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>{h.tipo}</span>
                            </div>
                            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>{formatarData(h.data)} · {formatarDataRelativa(h.data)}</div>
                            <p style={{ fontSize: 12, color: '#374151', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{h.texto}</p>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="charts" style={{ marginTop: 20 }}>
                {[{ title: 'Por origem', campo: 'origem' as keyof Lead }, { title: 'Por área jurídica', campo: 'area' as keyof Lead }].map(c => (
                  <div key={c.title} style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 14, borderBottom: `2px solid ${GOLD}`, paddingBottom: 8, display: 'inline-block' }}>{c.title}</div>
                    {leads.length === 0 ? <div style={{ fontSize: 12, color: '#9ca3af' }}>Sem dados.</div> : barChart(c.campo)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && aba === 'leads' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar lead..." style={{ ...inp, flex: 1, minWidth: 140 }} />
                <select value={filtroFase} onChange={e => setFiltroFase(e.target.value)} style={{ ...inp, width: 'auto', flex: 'none' }}>
                  <option value="">Todas as fases</option>{FASES.map(f => <option key={f}>{f}</option>)}
                </select>
                <select value={filtroTemp} onChange={e => setFiltroTemp(e.target.value)} style={{ ...inp, width: 'auto', flex: 'none' }}>
                  <option value="">Todas as temperaturas</option>{TEMPERATURAS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              {leadsFiltrados.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  Nenhum lead encontrado.
                </div>
              ) : (
                leadsFiltrados.map(l => {
                  const fc = FASE_CORES[l.fase || ''] || { bg: '#f3f4f6', color: '#6b7280' }
                  const ult = l.id ? ultAtendPorLead[l.id] : null
                  const dias = diasEntre(l.ultimo_contato)
                  const frio = ehAtivo(l) && dias !== null && dias >= DIAS_SEM_CONTATO_ALERTA
                  return (
                    <div key={l.id} className="lead-card-rich" style={{ borderLeftColor: TEMP_COR[l.temp || ''] || '#e5e7eb' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <Initials nome={l.nome} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{l.nome}</span>
                            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: fc.bg, color: fc.color, whiteSpace: 'nowrap' }}>{l.fase}</span>
                            {l.temp && <span style={{ fontSize: 10, color: TEMP_COR[l.temp], fontWeight: 600 }}>● {l.temp}</span>}
                            {frio && <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600, background: '#fee2e2', padding: '1px 6px', borderRadius: 10 }}>❄️ sem contato há {dias}d</span>}
                          </div>
                          <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, lineHeight: 1.5 }}>{l.assunto}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: '#6b7280', marginBottom: ult ? 8 : 0 }}>
                            <span><strong style={{ color: '#4b5563' }}>Últ. contato:</strong> {formatarData(l.ultimo_contato)} {dias !== null && `(${formatarDataRelativa(l.ultimo_contato)})`}</span>
                            {l.consulta && <span><strong style={{ color: '#4b5563' }}>Consulta:</strong> {formatarData(l.consulta)}</span>}
                            {l.prox_acao && <span><strong style={{ color: '#4b5563' }}>Próx. ação:</strong> {formatarData(l.prox_acao)}</span>}
                            {l.origem && <span><strong style={{ color: '#4b5563' }}>Origem:</strong> {l.origem}</span>}
                          </div>
                          {ult && (
                            <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${GOLD}`, marginBottom: 8 }}>
                              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>
                                ÚLTIMO ATENDIMENTO · {ult.tipo} · {formatarData(ult.data)}
                              </div>
                              <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.4 }}>{ult.texto}</div>
                              {ult.resultado && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>Resultado: {ult.resultado}</div>}
                            </div>
                          )}
                          {l.obs && (
                            <div style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic', marginBottom: 8 }}>
                              <strong>Obs:</strong> {l.obs}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {l.wa && <a href={`https://wa.me/${l.wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="btn-wa">↗ WhatsApp</a>}
                            <button className="btn-mini" onClick={() => abrirHistDoLead(l)}>+ Atendimento</button>
                            <button className="btn-mini" onClick={() => abrirEditar(l)}>Editar</button>
                            <button className="btn-mini" style={{ color: '#dc2626' }} onClick={() => excluirLead(l.id!, l.nome)}>Excluir</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {!loading && aba === 'funil' && (
            <div className="funil-grid">
              {FASES.map(fase => {
                const grupo = leads.filter(l => l.fase === fase)
                const fc = FASE_CORES[fase] || { bg: '#f3f4f6', color: '#6b7280' }
                return (
                  <div key={fase} style={{ background: '#fff', borderRadius: 12, padding: 12, minHeight: 120, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${fc.color}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: fc.color, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{fase} ({grupo.length})</div>
                    {grupo.map(l => {
                      const dias = diasEntre(l.ultimo_contato)
                      const parado = ehAtivo(l) && (l.fase === 'Contato Inicial' || l.fase === 'Em Negociação') && dias !== null && dias >= DIAS_PARADO_FUNIL
                      return (
                        <div key={l.id} onClick={() => abrirEditar(l)}
                          style={{ background: parado ? '#fef3c7' : '#f8f9fa', borderRadius: 8, padding: '8px 10px', marginBottom: 6, cursor: 'pointer', borderLeft: `3px solid ${TEMP_COR[l.temp || ''] || '#e5e7eb'}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = parado ? '#fde68a' : '#eef2ff')}
                          onMouseLeave={e => (e.currentTarget.style.background = parado ? '#fef3c7' : '#f8f9fa')}>
                          <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</p>
                          <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.assunto}</p>
                          <div style={{ fontSize: 10, color: parado ? '#92400e' : '#9ca3af', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                            <span>📞 {formatarDataRelativa(l.ultimo_contato)}</span>
                            {l.prox_acao && <span>⏰ {formatarData(l.prox_acao)}</span>}
                          </div>
                          {parado && <div style={{ fontSize: 9, color: '#92400e', marginTop: 3, fontWeight: 600 }}>⚠️ Parado há {dias}d</div>}
                        </div>
                      )
                    })}
                    {grupo.length === 0 && <p style={{ fontSize: 11, color: '#d1d5db', margin: 0 }}>Vazio</p>}
                  </div>
                )
              })}
            </div>
          )}

          {!loading && aba === 'historico' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <select value={filtroHistLead} onChange={e => setFiltroHistLead(e.target.value)} style={{ ...inp, width: 'auto', flex: 1, minWidth: 140 }}>
                  <option value="">Todos os leads</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
                <select value={filtroHistTipo} onChange={e => setFiltroHistTipo(e.target.value)} style={{ ...inp, width: 'auto', flex: 'none' }}>
                  <option value="">Todos os tipos</option>
                  {TIPOS_CONTATO.map(t => <option key={t}>{t}</option>)}
                </select>
                <button onClick={() => { setHistForm({ data: hojeStr(), tipo: 'WhatsApp' }); setModalHist(true) }}
                  style={{ border: `1px solid ${GOLD}`, color: NAVY, background: '#fff', borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  + Registrar
                </button>
              </div>
              <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                {historicoFiltrado.length === 0 && <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 14 }}>Nenhum atendimento registrado.</div>}
                {historicoFiltrado.map((h, i) => {
                  const lead = leads.find(l => l.id === h.lead_id)
                  return (
                    <div key={h.id} onClick={() => lead && abrirEditar(lead)} style={{ padding: '14px 18px', borderBottom: i < historicoFiltrado.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: lead ? 'pointer' : 'default' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{h.lead_nome}</span>
                        <span style={{ fontSize: 11, background: '#f3f4f6', color: '#6b7280', padding: '3px 8px', borderRadius: 20 }}>{h.tipo}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{formatarData(h.data)} · {formatarDataRelativa(h.data)}{h.resultado ? ` · ${h.resultado}` : ''}</div>
                      <p style={{ fontSize: 13, color: '#374151', margin: 0, whiteSpace: 'pre-wrap' }}>{h.texto}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="bottomnav">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setAba(item.id)} className={aba === item.id ? 'active' : ''}>
              <span className="icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {modalLead && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: 0 }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 14, borderBottom: `2px solid ${GOLD}` }}>
              <div style={{ width: 4, height: 20, background: GOLD, borderRadius: 4 }} />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: NAVY }}>{editId ? 'Editar lead' : 'Novo lead'}</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Nome *', key: 'nome', full: true, placeholder: 'Nome completo' },
                { label: 'WhatsApp', key: 'wa', placeholder: '+55 94 99999-0000' },
                { label: 'E-mail', key: 'email', placeholder: 'email@...' },
                { label: 'Cidade', key: 'cidade', placeholder: 'Parauapebas' },
                { label: 'Profissão', key: 'prof', placeholder: 'Servidor público...' },
                { label: 'Assunto / Caso *', key: 'assunto', full: true, placeholder: 'Descreva brevemente' },
              ].map(f => (
                <div key={f.key} style={f.full ? { gridColumn: '1 / -1' } : {}}>
                  <label style={lbl}>{f.label}</label>
                  <input value={(form as any)[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inp} />
                </div>
              ))}
              {[
                { label: 'Área jurídica', key: 'area', opts: AREAS },
                { label: 'Fase', key: 'fase', opts: FASES },
                { label: 'Temperatura', key: 'temp', opts: TEMPERATURAS },
                { label: 'Origem', key: 'origem', opts: ORIGENS },
              ].map(f => (
                <div key={f.key}>
                  <label style={lbl}>{f.label}</label>
                  <select value={(form as any)[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={inp}>
                    {f.opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label style={lbl}>Próx. ação</label>
                <input type="date" value={form.prox_acao || ''} onChange={e => setForm(p => ({ ...p, prox_acao: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Consulta agendada</label>
                <input type="date" value={form.consulta || ''} onChange={e => setForm(p => ({ ...p, consulta: e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Observações</label>
                <textarea value={form.obs || ''} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} placeholder="Anotações relevantes..." style={{ ...inp, resize: 'vertical', minHeight: 80 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModalLead(false)} style={{ flex: 1, padding: '12px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarLead} disabled={saving} style={{ flex: 2, padding: '12px', fontSize: 14, background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 10, cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Salvando...' : 'Salvar lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalHist && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 14, borderBottom: `2px solid ${GOLD}` }}>
              <div style={{ width: 4, height: 20, background: GOLD, borderRadius: 4 }} />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: NAVY }}>Registrar atendimento</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Lead *</label>
                <select value={histForm.lead_id || ''} onChange={e => { const lead = leads.find(l => l.id === e.target.value); setHistForm(p => ({ ...p, lead_id: e.target.value, lead_nome: lead?.nome || '' })) }} style={inp}>
                  <option value="">Selecione...</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Tipo</label>
                <select value={histForm.tipo || 'WhatsApp'} onChange={e => setHistForm(p => ({ ...p, tipo: e.target.value }))} style={inp}>
                  {TIPOS_CONTATO.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Data</label>
                <input type="date" value={histForm.data || ''} onChange={e => setHistForm(p => ({ ...p, data: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Resultado</label>
                <input value={histForm.resultado || ''} onChange={e => setHistForm(p => ({ ...p, resultado: e.target.value }))} placeholder="Ex: Agendou consulta" style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>O que foi tratado *</label>
                <textarea value={histForm.texto || ''} onChange={e => setHistForm(p => ({ ...p, texto: e.target.value }))} placeholder="Descreva o atendimento..." style={{ ...inp, resize: 'vertical', minHeight: 100 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setModalHist(false); setHistForm({}) }} style={{ flex: 1, padding: '12px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarHist} style={{ flex: 2, padding: '12px', fontSize: 14, background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
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
  Quente: '#ef4444',
  Morno: '#f59e0b',
  Frio: '#3b82f6',
}

const LEAD_VAZIO: Lead = {
  nome: '', wa: '', email: '', cidade: 'Parauapebas', prof: '',
  assunto: '', area: 'Direito Civil', fase: 'Novo Lead',
  temp: 'Morno', origem: 'Indicação', prox_acao: '', consulta: '', obs: '',
}

function Initials({ nome }: { nome: string }) {
  const parts = nome.trim().split(' ')
  const ini = parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)
  return (
    <div style={{ background: NAVY, color: GOLD, width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
      {ini.toUpperCase()}
    </div>
  )
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

  const carregar = useCallback(async () => {
    setLoading(true)
    setErroGlobal(null)
    const [{ data: l, error: e1 }, { data: h, error: e2 }] = await Promise.all([
      supabase.from('leads').select('*').order('criado_em', { ascending: false }),
      supabase.from('historico').select('*').order('data', { ascending: false }),
    ])
    if (e1) setErroGlobal('Erro ao carregar leads: ' + e1.message)
    if (e2) setErroGlobal('Erro ao carregar histórico: ' + e2.message)
    setLeads(l || [])
    setHistorico(h || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const ativos = leads.filter(l => l.fase !== 'Lead Perdido' && l.fase !== 'Contrato Assinado').length
  const consultas = leads.filter(l => l.fase === 'Consulta Agendada').length
  const contratos = leads.filter(l => l.fase === 'Contrato Assinado').length
  const perdidos = leads.filter(l => l.fase === 'Lead Perdido').length
  const taxa = leads.length ? Math.round(contratos / leads.length * 100) : 0

  const hoje = new Date()
  const leadsFrios = leads.filter(l => {
    if (!l.ultimo_contato || l.fase === 'Lead Perdido' || l.fase === 'Contrato Assinado') return false
    return (hoje.getTime() - new Date(l.ultimo_contato).getTime()) / 86400000 >= 7
  })

  const leadsFiltrados = leads.filter(l => {
    if (busca && !`${l.nome} ${l.cidade} ${l.assunto}`.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroFase && l.fase !== filtroFase) return false
    if (filtroTemp && l.temp !== filtroTemp) return false
    return true
  })

  const salvarLead = async () => {
    if (!form.nome.trim() || !form.assunto.trim()) return alert('Nome e assunto são obrigatórios.')
    setSaving(true)
    const payload = { ...form, prox_acao: form.prox_acao || null, consulta: form.consulta || null, ultimo_contato: form.ultimo_contato || new Date().toISOString().slice(0, 10) }
    const { error } = editId
      ? await supabase.from('leads').update(payload).eq('id', editId)
      : await supabase.from('leads').insert(payload)
    setSaving(false)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setModalLead(false)
    carregar()
  }

  const excluirLead = async (id: string, nome: string) => {
    if (!confirm(`Excluir lead "${nome}"?`)) return
    await supabase.from('leads').delete().eq('id', id)
    carregar()
  }

  const abrirEditar = (l: Lead) => { setForm({ ...l }); setEditId(l.id || null); setModalLead(true) }
  const abrirNovo = () => { setForm({ ...LEAD_VAZIO }); setEditId(null); setModalLead(true) }

  const salvarHist = async () => {
    if (!histForm.lead_id || !histForm.texto?.trim()) return alert('Lead e descrição são obrigatórios.')
    const { error } = await supabase.from('historico').insert({ ...histForm, data: histForm.data || new Date().toISOString().slice(0, 10) })
    if (error) { alert('Erro: ' + error.message); return }
    await supabase.from('leads').update({ ultimo_contato: histForm.data || new Date().toISOString().slice(0, 10) }).eq('id', histForm.lead_id)
    setModalHist(false); setHistForm({}); carregar()
  }

  const barChart = (campo: keyof Lead) => {
    const m: Record<string, number> = {}
    leads.forEach(l => { const v = (l[campo] as string) || 'Não informado'; m[v] = (m[v] || 0) + 1 })
    const items = Object.entries(m).sort((a, b) => b[1] - a[1])
    const max = items[0]?.[1] || 1
    return items.map(([k, v]) => (
      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ width: 140, fontSize: 12, color: '#6b7280', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
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

  const inputStyle = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 as const }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f4f5f7' }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: NAVY, flexShrink: 0, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 10 }}>
        <div style={{ padding: '24px 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: `2px solid ${GOLD}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
            <button key={item.id} onClick={() => setAba(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', marginBottom: 4, textAlign: 'left', fontSize: 13, fontWeight: aba === item.id ? 600 : 400, background: aba === item.id ? 'rgba(201,168,76,0.18)' : 'transparent', color: aba === item.id ? GOLD : 'rgba(255,255,255,0.65)' }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: `1px solid rgba(255,255,255,0.07)` }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.8 }}>OAB/PA 35.567</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Parauapebas/PA</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ marginLeft: 220, flex: 1, padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: 0 }}>
              {aba === 'dashboard' ? 'Dashboard' : aba === 'leads' ? 'Leads' : aba === 'funil' ? 'Funil de Vendas' : 'Histórico'}
            </h1>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '3px 0 0' }}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={abrirNovo} style={{ background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            + Novo lead
          </button>
        </div>

        {erroGlobal && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#dc2626', marginBottom: 20 }}>{erroGlobal}</div>}
        {loading && <div style={{ textAlign: 'center', padding: '80px', color: '#9ca3af' }}>Carregando...</div>}

        {/* DASHBOARD */}
        {!loading && aba === 'dashboard' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Leads ativos', val: ativos, cor: NAVY },
                { label: 'Consultas agendadas', val: consultas, cor: '#059669' },
                { label: 'Contratos fechados', val: contratos, sub: `Taxa: ${taxa}%`, cor: GOLD },
                { label: 'Leads perdidos', val: perdidos, cor: '#dc2626' },
              ].map(s => (
                <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: 20, borderLeft: `4px solid ${s.cor}`, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{s.label}</div>
                  <div style={{ fontSize: 34, fontWeight: 700, color: s.cor }}>{s.val}</div>
                  {s.sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{s.sub}</div>}
                </div>
              ))}
            </div>
            {leadsFrios.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400e', marginBottom: 20 }}>
                ⚠️ <strong>{leadsFrios.length} lead(s)</strong> sem contato há 7+ dias: {leadsFrios.map(l => l.nome).join(', ')}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[{ title: 'Por origem', campo: 'origem' as keyof Lead }, { title: 'Por área jurídica', campo: 'area' as keyof Lead }].map(c => (
                <div key={c.title} style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 16, borderBottom: `2px solid ${GOLD}`, paddingBottom: 8, display: 'inline-block' }}>{c.title}</div>
                  {leads.length === 0 ? <div style={{ fontSize: 12, color: '#9ca3af' }}>Sem dados.</div> : barChart(c.campo)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEADS */}
        {!loading && aba === 'leads' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, cidade ou assunto..." style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
              <select value={filtroFase} onChange={e => setFiltroFase(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                <option value="">Todas as fases</option>{FASES.map(f => <option key={f}>{f}</option>)}
              </select>
              <select value={filtroTemp} onChange={e => setFiltroTemp(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                <option value="">Temperatura</option>{TEMPERATURAS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f3f4f6' }}>
                    {['Lead', 'Assunto', 'Fase', 'Temp.', 'Origem', 'Próx. ação', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leadsFiltrados.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>Nenhum lead encontrado.</td></tr>}
                  {leadsFiltrados.map(l => {
                    const fc = FASE_CORES[l.fase || ''] || { bg: '#f3f4f6', color: '#6b7280' }
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 4, height: 38, borderRadius: 4, background: TEMP_COR[l.temp || ''] || '#e5e7eb', flexShrink: 0 }} />
                            <Initials nome={l.nome} />
                            <div>
                              <div style={{ fontWeight: 600, color: NAVY, fontSize: 13 }}>{l.nome}</div>
                              {l.wa && <a href={`https://wa.me/${l.wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#16a34a', textDecoration: 'none' }}>↗ WhatsApp</a>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#6b7280', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.assunto}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: fc.bg, color: fc.color }}>{l.fase}</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: TEMP_COR[l.temp || ''] || '#6b7280' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: TEMP_COR[l.temp || ''] || '#e5e7eb', display: 'inline-block' }} />{l.temp}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#6b7280' }}>{l.origem}</td>
                        <td style={{ padding: '12px 16px', color: '#6b7280' }}>{l.prox_acao || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => abrirEditar(l)} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>Editar</button>
                            <button onClick={() => excluirLead(l.id!, l.nome)} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Excluir</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FUNIL */}
        {!loading && aba === 'funil' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
            {FASES.map(fase => {
              const grupo = leads.filter(l => l.fase === fase)
              const fc = FASE_CORES[fase] || { bg: '#f3f4f6', color: '#6b7280' }
              return (
                <div key={fase} style={{ background: '#fff', borderRadius: 12, padding: 12, minHeight: 120, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${fc.color}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: fc.color, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{fase} ({grupo.length})</div>
                  {grupo.map(l => (
                    <div key={l.id} onClick={() => abrirEditar(l)}
                      style={{ background: '#f8f9fa', borderRadius: 8, padding: '8px 10px', marginBottom: 8, cursor: 'pointer', borderLeft: `3px solid ${TEMP_COR[l.temp || ''] || '#e5e7eb'}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#f8f9fa')}>
                      <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.assunto}</p>
                    </div>
                  ))}
                  {grupo.length === 0 && <p style={{ fontSize: 11, color: '#d1d5db' }}>Vazio</p>}
                </div>
              )
            })}
          </div>
        )}

        {/* HISTÓRICO */}
        {!loading && aba === 'historico' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <select style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                <option value="">Todos os leads</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
              <button onClick={() => { setHistForm({ data: new Date().toISOString().slice(0, 10) }); setModalHist(true) }}
                style={{ border: `1px solid ${GOLD}`, color: NAVY, background: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                + Registrar atendimento
              </button>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              {historico.length === 0 && <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 14 }}>Nenhum atendimento registrado.</div>}
              {historico.map((h, i) => (
                <div key={h.id} style={{ padding: '16px 20px', borderBottom: i < historico.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{h.lead_nome}</span>
                    <span style={{ fontSize: 11, background: '#f3f4f6', color: '#6b7280', padding: '3px 10px', borderRadius: 20 }}>{h.tipo}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>{h.data}{h.resultado ? ` · ${h.resultado}` : ''}</div>
                  <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{h.texto}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal Lead */}
      {modalLead && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
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
                  <label style={labelStyle}>{f.label}</label>
                  <input value={(form as any)[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inputStyle} />
                </div>
              ))}
              {[
                { label: 'Área jurídica', key: 'area', opts: AREAS },
                { label: 'Fase', key: 'fase', opts: FASES },
                { label: 'Temperatura', key: 'temp', opts: TEMPERATURAS },
                { label: 'Origem', key: 'origem', opts: ORIGENS },
              ].map(f => (
                <div key={f.key}>
                  <label style={labelStyle}>{f.label}</label>
                  <select value={(form as any)[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ ...inputStyle }}>
                    {f.opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label style={labelStyle}>Próx. ação</label>
                <input type="date" value={form.prox_acao || ''} onChange={e => setForm(p => ({ ...p, prox_acao: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Consulta agendada</label>
                <input type="date" value={form.consulta || ''} onChange={e => setForm(p => ({ ...p, consulta: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Observações</label>
                <textarea value={form.obs || ''} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} placeholder="Anotações relevantes..." style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModalLead(false)} style={{ padding: '9px 18px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarLead} disabled={saving} style={{ padding: '9px 18px', fontSize: 13, background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 8, cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Salvando...' : 'Salvar lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Histórico */}
      {modalHist && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 14, borderBottom: `2px solid ${GOLD}` }}>
              <div style={{ width: 4, height: 20, background: GOLD, borderRadius: 4 }} />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: NAVY }}>Registrar atendimento</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Lead *</label>
                <select value={histForm.lead_id || ''} onChange={e => { const lead = leads.find(l => l.id === e.target.value); setHistForm(p => ({ ...p, lead_id: e.target.value, lead_nome: lead?.nome || '' })) }} style={{ ...inputStyle }}>
                  <option value="">Selecione...</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Tipo</label>
                <select value={histForm.tipo || 'WhatsApp'} onChange={e => setHistForm(p => ({ ...p, tipo: e.target.value }))} style={{ ...inputStyle }}>
                  {TIPOS_CONTATO.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Data</label>
                <input type="date" value={histForm.data || ''} onChange={e => setHistForm(p => ({ ...p, data: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Resultado</label>
                <input value={histForm.resultado || ''} onChange={e => setHistForm(p => ({ ...p, resultado: e.target.value }))} placeholder="Ex: Agendou consulta" style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>O que foi tratado *</label>
                <textarea value={histForm.texto || ''} onChange={e => setHistForm(p => ({ ...p, texto: e.target.value }))} placeholder="Descreva o atendimento..." style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModalHist(false)} style={{ padding: '9px 18px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarHist} style={{ padding: '9px 18px', fontSize: 13, background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

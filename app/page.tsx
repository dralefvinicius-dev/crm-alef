'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, Lead, Historico, FASES, TEMPERATURAS, ORIGENS, AREAS, TIPOS_CONTATO } from '@/lib/supabase'

const FASE_CORES: Record<string, string> = {
  'Novo Lead': 'bg-blue-100 text-blue-800',
  'Contato Inicial': 'bg-green-100 text-green-800',
  'Consulta Agendada': 'bg-yellow-100 text-yellow-800',
  'Em Negociação': 'bg-pink-100 text-pink-800',
  'Contrato Assinado': 'bg-teal-100 text-teal-800',
  'Lead Perdido': 'bg-red-100 text-red-800',
}
const TEMP_CORES: Record<string, string> = {
  Quente: 'bg-red-100 text-red-700',
  Morno: 'bg-yellow-100 text-yellow-700',
  Frio: 'bg-blue-100 text-blue-700',
}

const LEAD_VAZIO: Lead = {
  nome: '', wa: '', email: '', cidade: 'Parauapebas', prof: '',
  assunto: '', area: 'Direito Civil', fase: 'Novo Lead',
  temp: 'Morno', origem: 'Indicação', prox_acao: '', consulta: '', obs: '',
}

export default function Home() {
  const [aba, setAba] = useState<'dashboard'|'leads'|'funil'|'historico'>('dashboard')
  const [leads, setLeads] = useState<Lead[]>([])
  const [historico, setHistorico] = useState<Historico[]>([])
  const [loading, setLoading] = useState(true)

  // Modal lead
  const [modalLead, setModalLead] = useState(false)
  const [form, setForm] = useState<Lead>(LEAD_VAZIO)
  const [editId, setEditId] = useState<string|null>(null)
  const [saving, setSaving] = useState(false)

  // Modal histórico
  const [modalHist, setModalHist] = useState(false)
  const [histForm, setHistForm] = useState<Partial<Historico>>({})

  // Filtros leads
  const [busca, setBusca] = useState('')
  const [filtroFase, setFiltroFase] = useState('')
  const [filtroTemp, setFiltroTemp] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    const [{ data: l }, { data: h }] = await Promise.all([
      supabase.from('leads').select('*').order('criado_em', { ascending: false }),
      supabase.from('historico').select('*').order('data', { ascending: false }),
    ])
    setLeads(l || [])
    setHistorico(h || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Stats
  const ativos = leads.filter(l => l.fase !== 'Lead Perdido' && l.fase !== 'Contrato Assinado').length
  const consultas = leads.filter(l => l.fase === 'Consulta Agendada').length
  const contratos = leads.filter(l => l.fase === 'Contrato Assinado').length
  const perdidos = leads.filter(l => l.fase === 'Lead Perdido').length
  const taxa = leads.length ? Math.round(contratos / leads.length * 100) : 0

  // Alertas leads frios
  const hoje = new Date()
  const leadsFrios = leads.filter(l => {
    if (!l.ultimo_contato || l.fase === 'Lead Perdido' || l.fase === 'Contrato Assinado') return false
    const dias = (hoje.getTime() - new Date(l.ultimo_contato).getTime()) / 86400000
    return dias >= 7
  })

  // Filtro tabela
  const leadsFiltrados = leads.filter(l => {
    if (busca && !`${l.nome} ${l.cidade} ${l.assunto}`.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroFase && l.fase !== filtroFase) return false
    if (filtroTemp && l.temp !== filtroTemp) return false
    return true
  })

  // Salvar lead
  const salvarLead = async () => {
    if (!form.nome.trim() || !form.assunto.trim()) return alert('Nome e assunto são obrigatórios.')
    setSaving(true)
    const payload = { ...form, ultimo_contato: form.ultimo_contato || new Date().toISOString().slice(0,10) }
    if (editId) {
      await supabase.from('leads').update(payload).eq('id', editId)
    } else {
      await supabase.from('leads').insert(payload)
    }
    setSaving(false)
    setModalLead(false)
    carregar()
  }

  const excluirLead = async (id: string, nome: string) => {
    if (!confirm(`Excluir lead "${nome}"?`)) return
    await supabase.from('leads').delete().eq('id', id)
    carregar()
  }

  const abrirEditar = (l: Lead) => {
    setForm({ ...l })
    setEditId(l.id || null)
    setModalLead(true)
  }

  const abrirNovo = () => {
    setForm({ ...LEAD_VAZIO })
    setEditId(null)
    setModalLead(true)
  }

  // Salvar histórico
  const salvarHist = async () => {
    if (!histForm.lead_id || !histForm.texto?.trim()) return alert('Lead e descrição são obrigatórios.')
    await supabase.from('historico').insert({
      ...histForm,
      data: histForm.data || new Date().toISOString().slice(0,10),
    })
    // Atualiza ultimo_contato do lead
    await supabase.from('leads').update({ ultimo_contato: histForm.data || new Date().toISOString().slice(0,10) }).eq('id', histForm.lead_id)
    setModalHist(false)
    setHistForm({})
    carregar()
  }

  // Gráfico simples por campo
  const barChart = (campo: keyof Lead) => {
    const m: Record<string, number> = {}
    leads.forEach(l => { const v = (l[campo] as string) || 'Não informado'; m[v] = (m[v] || 0) + 1 })
    const items = Object.entries(m).sort((a, b) => b[1] - a[1])
    const max = items[0]?.[1] || 1
    return items.map(([k, v]) => (
      <div key={k} className="flex items-center gap-2 mb-2">
        <span className="w-40 text-xs text-gray-500 text-right truncate" title={k}>{k}</span>
        <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
          <div className="bg-blue-600 h-full rounded transition-all" style={{ width: `${Math.round(v / max * 100)}%` }} />
        </div>
        <span className="text-xs font-medium w-4">{v}</span>
      </div>
    ))
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-semibold">CRM de Leads</h1>
          <p className="text-xs text-gray-500">Alef Vinicius Silva dos Santos · OAB/PA 35.567 · Parauapebas/PA</p>
        </div>
        <button onClick={abrirNovo} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 transition">
          + Novo lead
        </button>
      </div>

      {/* Nav */}
      <div className="flex gap-1 border-b mb-6">
        {(['dashboard','leads','funil','historico'] as const).map(v => (
          <button key={v} onClick={() => setAba(v)}
            className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px transition ${aba === v ? 'border-gray-900 font-medium text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {v === 'dashboard' ? 'Dashboard' : v === 'leads' ? 'Leads' : v === 'funil' ? 'Funil' : 'Histórico'}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-20 text-gray-400">Carregando...</div>}

      {!loading && aba === 'dashboard' && (
        <div>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Leads ativos', val: ativos, sub: '' },
              { label: 'Consultas agendadas', val: consultas, sub: '' },
              { label: 'Contratos fechados', val: contratos, sub: `Taxa: ${taxa}%` },
              { label: 'Leads perdidos', val: perdidos, sub: '' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                <div className="text-3xl font-semibold">{s.val}</div>
                {s.sub && <div className="text-xs text-gray-400 mt-1">{s.sub}</div>}
              </div>
            ))}
          </div>

          {/* Alerta frios */}
          {leadsFrios.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800 mb-6">
              ⚠️ <strong>{leadsFrios.length} lead(s)</strong> sem contato há 7+ dias: {leadsFrios.map(l => l.nome).join(', ')}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-medium mb-3">Por origem</h3>
              {barChart('origem')}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-medium mb-3">Por área jurídica</h3>
              {barChart('area')}
            </div>
          </div>
        </div>
      )}

      {!loading && aba === 'leads' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, cidade ou assunto..."
              className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
            <select value={filtroFase} onChange={e => setFiltroFase(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Todas as fases</option>
              {FASES.map(f => <option key={f}>{f}</option>)}
            </select>
            <select value={filtroTemp} onChange={e => setFiltroTemp(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Temperatura</option>
              {TEMPERATURAS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500 font-medium">
                  <th className="text-left px-4 py-3">Nome</th>
                  <th className="text-left px-4 py-3">Assunto</th>
                  <th className="text-left px-4 py-3">Fase</th>
                  <th className="text-left px-4 py-3">Temp.</th>
                  <th className="text-left px-4 py-3">Origem</th>
                  <th className="text-left px-4 py-3">Próx. ação</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {leadsFiltrados.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">Nenhum lead encontrado.</td></tr>
                )}
                {leadsFiltrados.map(l => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium">
                      {l.wa && (
                        <a href={`https://wa.me/${l.wa.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                          className="text-green-600 mr-1 hover:text-green-800">↗</a>
                      )}
                      {l.nome}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-32 truncate">{l.assunto}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${FASE_CORES[l.fase||''] || 'bg-gray-100 text-gray-600'}`}>{l.fase}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${TEMP_CORES[l.temp||''] || 'bg-gray-100 text-gray-600'}`}>{l.temp}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{l.origem}</td>
                    <td className="px-4 py-3 text-gray-600">{l.prox_acao || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => abrirEditar(l)} className="text-xs text-blue-600 hover:underline">Editar</button>
                        <button onClick={() => excluirLead(l.id!, l.nome)} className="text-xs text-red-500 hover:underline">Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && aba === 'funil' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {FASES.map(fase => {
            const grupo = leads.filter(l => l.fase === fase)
            return (
              <div key={fase} className="bg-white rounded-xl border border-gray-100 p-3 min-h-32">
                <h4 className="text-xs font-medium text-gray-500 mb-2">{fase} <span className="font-normal">({grupo.length})</span></h4>
                {grupo.map(l => (
                  <div key={l.id} onClick={() => abrirEditar(l)}
                    className="bg-gray-50 rounded-lg p-2 mb-2 cursor-pointer hover:bg-blue-50 transition border border-gray-100">
                    <p className="text-xs font-medium truncate">{l.nome}</p>
                    <p className="text-xs text-gray-500 truncate">{l.assunto}</p>
                  </div>
                ))}
                {grupo.length === 0 && <p className="text-xs text-gray-300">Vazio</p>}
              </div>
            )
          })}
        </div>
      )}

      {!loading && aba === 'historico' && (
        <div>
          <div className="flex gap-2 mb-4">
            <select onChange={e => { /* filtro handled below */ }}
              id="hist-filtro"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Todos os leads</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            <button onClick={() => {
              setHistForm({ data: new Date().toISOString().slice(0,10) })
              setModalHist(true)
            }} className="border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
              + Registrar atendimento
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 divide-y">
            {historico.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">Nenhum atendimento registrado.</div>
            )}
            {historico.map(h => (
              <div key={h.id} className="px-4 py-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">{h.lead_nome}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{h.tipo}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{h.data}{h.resultado ? ` · ${h.resultado}` : ''}</div>
                <p className="text-sm text-gray-700 mt-1">{h.texto}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Lead */}
      {modalLead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold mb-4">{editId ? 'Editar lead' : 'Novo lead'}</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Nome *', key: 'nome', full: true, placeholder: 'Nome completo' },
                { label: 'WhatsApp', key: 'wa', placeholder: '+55 94 99999-0000' },
                { label: 'E-mail', key: 'email', placeholder: 'email@...' },
                { label: 'Cidade', key: 'cidade', placeholder: 'Parauapebas' },
                { label: 'Profissão', key: 'prof', placeholder: 'Servidor público...' },
                { label: 'Assunto / Caso *', key: 'assunto', full: true, placeholder: 'Descreva brevemente' },
              ].map(f => (
                <div key={f.key} className={f.full ? 'col-span-2' : ''}>
                  <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                  <input value={(form as any)[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                </div>
              ))}
              {[
                { label: 'Área jurídica', key: 'area', opts: AREAS },
                { label: 'Fase', key: 'fase', opts: FASES },
                { label: 'Temperatura', key: 'temp', opts: TEMPERATURAS },
                { label: 'Origem', key: 'origem', opts: ORIGENS },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                  <select value={(form as any)[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    {f.opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Próx. ação</label>
                <input type="date" value={form.prox_acao || ''} onChange={e => setForm(p => ({ ...p, prox_acao: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Consulta agendada</label>
                <input type="date" value={form.consulta || ''} onChange={e => setForm(p => ({ ...p, consulta: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Observações</label>
                <textarea value={form.obs || ''} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))}
                  placeholder="Anotações relevantes..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none h-20" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModalLead(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={salvarLead} disabled={saving}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Histórico */}
      {modalHist && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-base font-semibold mb-4">Registrar atendimento</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Lead *</label>
                <select value={histForm.lead_id || ''} onChange={e => {
                  const lead = leads.find(l => l.id === e.target.value)
                  setHistForm(p => ({ ...p, lead_id: e.target.value, lead_nome: lead?.nome || '' }))
                }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Selecione...</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tipo</label>
                <select value={histForm.tipo || 'WhatsApp'} onChange={e => setHistForm(p => ({ ...p, tipo: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {TIPOS_CONTATO.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Data</label>
                <input type="date" value={histForm.data || ''} onChange={e => setHistForm(p => ({ ...p, data: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Resultado</label>
                <input value={histForm.resultado || ''} onChange={e => setHistForm(p => ({ ...p, resultado: e.target.value }))}
                  placeholder="Ex: Agendou consulta"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">O que foi tratado *</label>
                <textarea value={histForm.texto || ''} onChange={e => setHistForm(p => ({ ...p, texto: e.target.value }))}
                  placeholder="Descreva o atendimento..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none h-24" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModalHist(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={salvarHist} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Lead, Historico, FASES, TEMPERATURAS, ORIGENS, AREAS, TIPOS_CONTATO, CONTATOS_OPCOES, STATUS_OPCOES } from '@/lib/supabase'

const NAVY = '#0D1B2E'
const GOLD = '#C9A84C'

// Cores por etapa de Contatos (substitui contador automático)
const COR_POR_CONTATO: Record<string, { bg: string; border: string; text: string; tag: string }> = {
  'Contato Inicial': { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', tag: '#3b82f6' },
  '1 Rmkt':          { bg: '#ecfdf5', border: '#86efac', text: '#065f46', tag: '#10b981' },
  '2 Rmkt':          { bg: '#fefce8', border: '#fde047', text: '#a16207', tag: '#eab308' },
  '3 Rmkt':          { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', tag: '#dc2626' },
}
const corContato = (c: string | undefined) => COR_POR_CONTATO[c || 'Contato Inicial'] || COR_POR_CONTATO['Contato Inicial']

const FASE_CORES: Record<string, { bg: string; color: string; semaforo: string }> = {
  'Relatório Enviado':  { bg: '#dbeafe', color: '#1e40af', semaforo: '#3b82f6' },
  'Proposta Enviada':   { bg: '#fef3c7', color: '#92400e', semaforo: '#f59e0b' },
  'Contrato Enviado':   { bg: '#ede9fe', color: '#5b21b6', semaforo: '#8b5cf6' },
  'Contrato Assinado':  { bg: '#ccfbf1', color: '#134e4a', semaforo: '#0d9488' },
  'Lead Perdido':       { bg: '#fee2e2', color: '#991b1b', semaforo: '#dc2626' },
}
const TEMP_COR: Record<string, string> = { Quente: '#ef4444', Morno: '#f59e0b', Frio: '#3b82f6' }

const LEAD_VAZIO: Lead = {
  nome: '', wa: '', email: '', cidade: 'Parauapebas', prof: '',
  assunto: '', area: 'Direito Civil', fase: '',
  temp: 'Morno', origem: 'Indicação',
  data_contato: '', data_ultimo_contato: '', data_proxima_acao: '',
  contatos: 'Contato Inicial', status: '',
  obs: '', lead_premium: false,
}

const DIAS_SEM_CONTATO_ALERTA = 2
const DIAS_PARADO_FUNIL = 5
const DIAS_SEM_RESPOSTA_PROPOSTA = 3

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

// ============================================================
// COMPONENTE TabelaExcel — tabela com filtros, ordenação e colunas redimensionáveis
// ============================================================
type ColunaKey = 'nome' | 'wa' | 'fase' | 'contatos' | 'status' | 'data_contato' | 'data_ultimo_contato' | 'data_proxima_acao'
type OrdenacaoState = { coluna: ColunaKey; direcao: 'asc' | 'desc' } | null
type FiltrosColuna = Partial<Record<ColunaKey, Set<string>>>  // valores DESmarcados (excluídos)

function TabelaExcel({ leads, abrirEditar, formatarData, formatarDataRelativa, corContato, FASE_CORES, NAVY, GOLD }: {
  leads: Lead[]
  abrirEditar: (l: Lead) => void
  formatarData: (d: string | undefined | null) => string
  formatarDataRelativa: (d: string | undefined | null) => string
  corContato: (c: string | undefined) => { bg: string; border: string; text: string; tag: string }
  FASE_CORES: Record<string, { bg: string; color: string; semaforo: string }>
  NAVY: string
  GOLD: string
}) {
  const [ordenacao, setOrdenacao] = useState<OrdenacaoState>(null)
  const [filtros, setFiltros] = useState<FiltrosColuna>({})
  const [popoverAberto, setPopoverAberto] = useState<ColunaKey | null>(null)
  const [buscaFiltro, setBuscaFiltro] = useState('')

  // Larguras de coluna iniciais (px). Usuário pode arrastar a borda para redimensionar.
  const LARGURAS_INICIAIS: Record<ColunaKey, number> = {
    nome: 240, wa: 150, fase: 140, contatos: 130, status: 170,
    data_contato: 110, data_ultimo_contato: 130, data_proxima_acao: 120,
  }
  const [larguras, setLarguras] = useState<Record<ColunaKey, number>>(LARGURAS_INICIAIS)
  const [arrastando, setArrastando] = useState<ColunaKey | null>(null)

  // Fechar popover ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.col-popover') && !target.closest('.col-header-btn')) {
        setPopoverAberto(null)
        setBuscaFiltro('')
      }
    }
    if (popoverAberto) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverAberto])

  // Resize de colunas — eventos de mouse globais
  useEffect(() => {
    if (!arrastando) return
    const inicioX = { x: 0, largura: larguras[arrastando] }
    const onDown = (e: MouseEvent) => { inicioX.x = e.clientX }
    const onMove = (e: MouseEvent) => {
      if (inicioX.x === 0) return
      const delta = e.clientX - inicioX.x
      const nova = Math.max(60, inicioX.largura + delta)
      setLarguras(prev => ({ ...prev, [arrastando]: nova }))
    }
    const onUp = () => { setArrastando(null) }
    inicioX.x = (window as any).__inicioX || 0
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [arrastando, larguras])

  const iniciarResize = (col: ColunaKey, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = larguras[col]
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const nova = Math.max(60, startW + delta)
      setLarguras(prev => ({ ...prev, [col]: nova }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // Função para obter o valor "filtravel/ordenavel" de uma coluna
  const getValor = (l: Lead, col: ColunaKey): string => {
    switch (col) {
      case 'nome': return l.nome || ''
      case 'wa': return l.wa || ''
      case 'fase': return l.fase || ''
      case 'contatos': return l.contatos || 'Contato Inicial'
      case 'status': return l.status || ''
      case 'data_contato': return l.data_contato || ''
      case 'data_ultimo_contato': return l.data_ultimo_contato || ''
      case 'data_proxima_acao': return l.data_proxima_acao || ''
      default: return ''
    }
  }

  // Valores únicos por coluna — para colunas com lista pré-definida, mostra TODAS as opções
  const valoresUnicosPorColuna = useMemo(() => {
    const map: Record<ColunaKey, string[]> = {} as any
    const cols: ColunaKey[] = ['nome', 'wa', 'fase', 'contatos', 'status', 'data_contato', 'data_ultimo_contato', 'data_proxima_acao']

    cols.forEach(col => {
      const set = new Set<string>()
      // Adiciona valores existentes nos dados
      leads.forEach(l => set.add(getValor(l, col)))

      // Adiciona TODAS as opções pré-definidas (mesmo que ainda não usadas)
      if (col === 'fase') FASES.forEach(f => set.add(f))
      if (col === 'contatos') CONTATOS_OPCOES.forEach(c => set.add(c))
      if (col === 'status') STATUS_OPCOES.forEach(s => set.add(s))

      map[col] = Array.from(set).sort((a, b) => {
        // Vazios sempre por último
        if (a === '' && b !== '') return 1
        if (b === '' && a !== '') return -1
        // Datas: ordenar como data
        if (col.startsWith('data_')) return a.localeCompare(b)
        return a.localeCompare(b, 'pt-BR')
      })
    })
    return map
  }, [leads])

  // Aplica filtros e ordenação
  const leadsExibidos = useMemo(() => {
    let r = leads.filter(l => {
      for (const col of Object.keys(filtros) as ColunaKey[]) {
        const excluidos = filtros[col]
        if (excluidos && excluidos.has(getValor(l, col))) return false
      }
      return true
    })
    if (ordenacao) {
      const { coluna, direcao } = ordenacao
      r = [...r].sort((a, b) => {
        const va = getValor(a, coluna)
        const vb = getValor(b, coluna)
        if (va === '' && vb !== '') return 1
        if (vb === '' && va !== '') return -1
        if (coluna.startsWith('data_')) {
          const cmp = va.localeCompare(vb)
          return direcao === 'asc' ? cmp : -cmp
        }
        const cmp = va.localeCompare(vb, 'pt-BR')
        return direcao === 'asc' ? cmp : -cmp
      })
    }
    return r
  }, [leads, filtros, ordenacao])

  const ordenarColuna = (col: ColunaKey, direcao: 'asc' | 'desc') => {
    setOrdenacao({ coluna: col, direcao })
    setPopoverAberto(null)
    setBuscaFiltro('')
  }

  const toggleFiltroValor = (col: ColunaKey, valor: string) => {
    setFiltros(prev => {
      const atual = new Set(prev[col] || [])
      if (atual.has(valor)) atual.delete(valor)
      else atual.add(valor)
      const novo = { ...prev }
      if (atual.size === 0) delete novo[col]
      else novo[col] = atual
      return novo
    })
  }

  const marcarTodos = (col: ColunaKey) => {
    setFiltros(prev => {
      const novo = { ...prev }
      delete novo[col]
      return novo
    })
  }

  const desmarcarTodos = (col: ColunaKey) => {
    setFiltros(prev => ({ ...prev, [col]: new Set(valoresUnicosPorColuna[col]) }))
  }

  const limparTudo = () => {
    setOrdenacao(null)
    setFiltros({})
    setPopoverAberto(null)
    setBuscaFiltro('')
  }

  const resetarLarguras = () => {
    setLarguras(LARGURAS_INICIAIS)
  }

  const colunaTemFiltro = (col: ColunaKey) => filtros[col] && filtros[col]!.size > 0
  const colunaOrdenada = (col: ColunaKey) => ordenacao?.coluna === col

  const colunas: { key: ColunaKey; label: string }[] = [
    { key: 'nome', label: 'Nome' },
    { key: 'wa', label: 'WhatsApp' },
    { key: 'fase', label: 'Fase' },
    { key: 'contatos', label: 'Contatos' },
    { key: 'status', label: 'Status' },
    { key: 'data_contato', label: '1º contato' },
    { key: 'data_ultimo_contato', label: 'Últ. contato' },
    { key: 'data_proxima_acao', label: 'Próx. ação' },
  ]

  const valoresVisivelFiltro = popoverAberto
    ? valoresUnicosPorColuna[popoverAberto].filter(v => {
        if (!buscaFiltro) return true
        const exibido = popoverAberto.startsWith('data_') ? formatarData(v) : v
        return exibido.toLowerCase().includes(buscaFiltro.toLowerCase())
      })
    : []

  const temAlgumFiltroOuOrd = !!ordenacao || Object.keys(filtros).length > 0
  const larguraMudou = JSON.stringify(larguras) !== JSON.stringify(LARGURAS_INICIAIS)

  return (
    <div>
      <style>{`
        .tabela-redim { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
        .tabela-redim th { background: ${NAVY}; color: ${GOLD}; padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; position: relative; }
        .tabela-redim td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tabela-redim tr:hover td { background: #fafafa; }
        .resize-handle { position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: col-resize; background: transparent; transition: background 0.15s; user-select: none; }
        .resize-handle:hover, .resize-handle.active { background: ${GOLD}; }
        @media (max-width: 768px) {
          .tabela-mobile-hint { display: block !important; }
        }
      `}</style>

      {(temAlgumFiltroOuOrd || larguraMudou) && (
        <div style={{ background: '#fffbeb', border: `1px solid ${GOLD}`, borderRadius: 8, padding: '8px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: NAVY }}>
            Exibindo <strong>{leadsExibidos.length}</strong> de <strong>{leads.length}</strong> leads
            {ordenacao && <span style={{ marginLeft: 10, color: '#6b7280' }}>· Ordenado por <strong>{colunas.find(c => c.key === ordenacao.coluna)?.label}</strong> ({ordenacao.direcao === 'asc' ? '↑' : '↓'})</span>}
            {Object.keys(filtros).length > 0 && <span style={{ marginLeft: 10, color: '#6b7280' }}>· Filtros: {Object.keys(filtros).length}</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {larguraMudou && (
              <button onClick={resetarLarguras} style={{ background: '#fff', color: NAVY, border: `1px solid ${GOLD}`, borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                Resetar colunas
              </button>
            )}
            {temAlgumFiltroOuOrd && (
              <button onClick={limparTudo} style={{ background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                Limpar filtros e ordenação
              </button>
            )}
          </div>
        </div>
      )}

      <div className="tabela-mobile-hint" style={{ display: 'none', fontSize: 11, color: '#6b7280', marginBottom: 8, fontStyle: 'italic' }}>
        💡 Arraste a tabela para os lados para ver mais colunas. Clique no cabeçalho para filtrar/ordenar.
      </div>

      <div className="tabela-wrap">
        <div className="tabela-scroll" style={{ overflowX: 'auto' }}>
          <table className="tabela-redim">
            <colgroup>
              {colunas.map(c => <col key={c.key} style={{ width: larguras[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                {colunas.map(c => (
                  <th key={c.key} style={{ width: larguras[c.key] }}>
                    <button
                      className="col-header-btn"
                      onClick={() => { setPopoverAberto(popoverAberto === c.key ? null : c.key); setBuscaFiltro('') }}
                      style={{ background: 'none', border: 'none', color: GOLD, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', maxWidth: 'calc(100% - 10px)' }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                      <span style={{ opacity: colunaOrdenada(c.key) || colunaTemFiltro(c.key) ? 1 : 0.5, fontSize: 11, flexShrink: 0 }}>
                        {colunaOrdenada(c.key) ? (ordenacao!.direcao === 'asc' ? '▲' : '▼') : colunaTemFiltro(c.key) ? '⌖' : '⇅'}
                      </span>
                    </button>
                    {popoverAberto === c.key && (
                      <div className="col-popover" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 240, marginTop: 4, padding: 0, color: '#1f2937', textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal' }}>
                        <div style={{ padding: '8px 4px', borderBottom: '1px solid #f3f4f6' }}>
                          <button onClick={() => ordenarColuna(c.key, 'asc')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', padding: '7px 12px', cursor: 'pointer', fontSize: 12, color: NAVY, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 4 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <span>▲</span> Ordenar crescente (A→Z)
                          </button>
                          <button onClick={() => ordenarColuna(c.key, 'desc')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', padding: '7px 12px', cursor: 'pointer', fontSize: 12, color: NAVY, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 4 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <span>▼</span> Ordenar decrescente (Z→A)
                          </button>
                        </div>
                        <div style={{ padding: '8px 12px 6px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>Filtrar valores</div>
                        <div style={{ padding: '0 12px 6px' }}>
                          <input
                            type="text"
                            value={buscaFiltro}
                            onChange={e => setBuscaFiltro(e.target.value)}
                            placeholder="Buscar..."
                            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 9px', fontSize: 12, outline: 'none' }}
                            onClick={e => e.stopPropagation()}
                          />
                        </div>
                        <div style={{ padding: '0 12px 6px', display: 'flex', gap: 8 }}>
                          <button onClick={() => marcarTodos(c.key)} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Marcar todos</button>
                          <button onClick={() => desmarcarTodos(c.key)} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Desmarcar todos</button>
                        </div>
                        <div style={{ maxHeight: 220, overflowY: 'auto', padding: '0 4px 8px' }}>
                          {valoresVisivelFiltro.length === 0 && <div style={{ fontSize: 11, color: '#9ca3af', padding: '8px 12px' }}>Nenhum valor encontrado.</div>}
                          {valoresVisivelFiltro.map(v => {
                            const excluido = filtros[c.key]?.has(v)
                            const exibido = c.key.startsWith('data_') ? formatarData(v) : v
                            return (
                              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 4, color: NAVY }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <input type="checkbox" checked={!excluido} onChange={() => toggleFiltroValor(c.key, v)} style={{ cursor: 'pointer' }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={exibido || '(vazio)'}>{exibido || <em style={{ color: '#9ca3af' }}>(vazio)</em>}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <div
                      className={`resize-handle ${arrastando === c.key ? 'active' : ''}`}
                      onMouseDown={(e) => iniciarResize(c.key, e)}
                      title="Arrastar para redimensionar"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leadsExibidos.length === 0 && <tr><td colSpan={colunas.length} style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}>Sem leads.</td></tr>}
              {leadsExibidos.map(l => {
                const fc = FASE_CORES[l.fase || ''] || { bg: '#f3f4f6', color: '#6b7280', semaforo: '#9ca3af' }
                const cc = corContato(l.contatos)
                return (
                  <tr key={l.id} onClick={() => abrirEditar(l)} style={{ cursor: 'pointer' }}>
                    <td title={l.nome}><strong style={{ color: NAVY }}>{l.lead_premium && '💎 '}{l.nome}</strong></td>
                    <td>{l.wa ? <a href={`https://wa.me/${l.wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#16a34a' }}>{l.wa}</a> : '—'}</td>
                    <td>
                      {l.fase ? (
                        <span style={{ padding: '2px 7px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: fc.bg, color: fc.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: fc.semaforo, flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.fase}</span>
                        </span>
                      ) : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td>
                      <span style={{ padding: '2px 7px', borderRadius: 10, background: cc.bg, color: cc.text, fontSize: 11, fontWeight: 600, border: `1px solid ${cc.border}`, display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.contatos || 'Contato Inicial'}
                      </span>
                    </td>
                    <td style={{ fontSize: 11 }} title={l.status || ''}>{l.status || '—'}</td>
                    <td style={{ fontSize: 11 }}>{formatarData(l.data_contato)}</td>
                    <td style={{ fontSize: 11 }}>{formatarData(l.data_ultimo_contato)}<br /><span style={{ color: '#9ca3af', fontSize: 10 }}>{formatarDataRelativa(l.data_ultimo_contato)}</span></td>
                    <td style={{ fontSize: 11 }}>{l.data_proxima_acao ? formatarData(l.data_proxima_acao) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [aba, setAba] = useState<'dashboard' | 'leads' | 'tabela' | 'funil' | 'historico'>('dashboard')
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
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroContatos, setFiltroContatos] = useState('')
  const [filtroPremium, setFiltroPremium] = useState(false)
  const [filtroHistLead, setFiltroHistLead] = useState('')
  const [filtroHistTipo, setFiltroHistTipo] = useState('')
  const [filtroHistContatos, setFiltroHistContatos] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setErroGlobal(null)
    const [{ data: l, error: e1 }, { data: h, error: e2 }] = await Promise.all([
      supabase.from('leads').select('*').order('lead_premium', { ascending: false }).order('criado_em', { ascending: false }),
      supabase.from('historico').select('*').order('data', { ascending: false }),
    ])
    if (e1) setErroGlobal('Erro: ' + e1.message)
    if (e2) setErroGlobal('Erro: ' + e2.message)
    setLeads(l || []); setHistorico(h || []); setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const ehAtivo = (l: Lead) => l.fase !== 'Contrato Assinado' && l.fase !== 'Lead Perdido'

  const ativos = leads.filter(ehAtivo).length
  const contratos = leads.filter(l => l.fase === 'Contrato Assinado').length
  const perdidos = leads.filter(l => l.fase === 'Lead Perdido').length
  const decididos = contratos + perdidos
  const taxa = decididos > 0 ? Math.round(contratos / decididos * 100) : 0
  const premiumCount = leads.filter(l => l.lead_premium && ehAtivo(l)).length
  const propostasEnviadas = leads.filter(l => l.fase === 'Proposta Enviada').length

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

  // Propostas Enviadas sem resposta há 3+ dias
  const propostasSemResposta = useMemo(() => leads.filter(l => {
    if (l.fase !== 'Proposta Enviada' || !l.data_ultimo_contato) return false
    const d = diasEntre(l.data_ultimo_contato)
    return d !== null && d >= DIAS_SEM_RESPOSTA_PROPOSTA
  }).sort((a, b) => (a.data_ultimo_contato || '').localeCompare(b.data_ultimo_contato || '')), [leads])

  const acoesVencidas = useMemo(() => leads.filter(l => {
    if (!ehAtivo(l) || !l.data_proxima_acao) return false
    const d = diasEntre(l.data_proxima_acao); return d !== null && d >= 0
  }).sort((a, b) => (a.data_proxima_acao || '').localeCompare(b.data_proxima_acao || '')), [leads])

  const acoesProximas = useMemo(() => leads.filter(l => {
    if (!ehAtivo(l) || !l.data_proxima_acao) return false
    const d = diasEntre(l.data_proxima_acao); return d !== null && d < 0 && d >= -3
  }).sort((a, b) => (a.data_proxima_acao || '').localeCompare(b.data_proxima_acao || '')), [leads])

  const leadsSemContato = useMemo(() => leads.filter(l => {
    if (!ehAtivo(l) || !l.data_ultimo_contato) return false
    const d = diasEntre(l.data_ultimo_contato); return d !== null && d >= DIAS_SEM_CONTATO_ALERTA
  }).sort((a, b) => (a.data_ultimo_contato || '').localeCompare(b.data_ultimo_contato || '')), [leads])

  // Leads em "3 Rmkt" = sinal de alerta (limite)
  const leadsLimiteRmkt = useMemo(() => leads.filter(l => ehAtivo(l) && l.contatos === '3 Rmkt'), [leads])

  // Agrupamento por status
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {}
    leads.forEach(l => {
      if (!ehAtivo(l) || !l.status) return
      m[l.status] = (m[l.status] || 0) + 1
    })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [leads])

  type Urgencia = { lead: Lead; motivo: string; prioridade: number; cor: string }
  const leadsUrgentes = useMemo<Urgencia[]>(() => {
    const map = new Map<string, Urgencia>()
    propostasSemResposta.forEach(l => {
      if (!l.id) return
      const d = diasEntre(l.data_ultimo_contato)
      map.set(l.id, { lead: l, motivo: `📄 Proposta sem retorno há ${d}d`, prioridade: 1, cor: '#dc2626' })
    })
    acoesVencidas.forEach(l => {
      if (!l.id || map.has(l.id)) return
      const d = diasEntre(l.data_proxima_acao)
      const txt = d === 0 ? 'Ação prevista para hoje' : `Ação atrasada há ${d}d`
      map.set(l.id, { lead: l, motivo: txt, prioridade: 2, cor: '#dc2626' })
    })
    leadsLimiteRmkt.forEach(l => {
      if (!l.id || map.has(l.id)) return
      map.set(l.id, { lead: l, motivo: '⚠️ No 3º Rmkt — última chance', prioridade: 3, cor: '#dc2626' })
    })
    leadsSemContato.forEach(l => {
      if (!l.id || map.has(l.id)) return
      const d = diasEntre(l.data_ultimo_contato)
      map.set(l.id, { lead: l, motivo: `Sem contato há ${d}d`, prioridade: 4, cor: '#f59e0b' })
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.lead.lead_premium && !b.lead.lead_premium) return -1
      if (!a.lead.lead_premium && b.lead.lead_premium) return 1
      return a.prioridade - b.prioridade
    })
  }, [propostasSemResposta, acoesVencidas, leadsLimiteRmkt, leadsSemContato])

  const ultimasAtividades = useMemo(() => {
    return [...historico]
      .sort((a, b) => (b.criado_em || b.data || '').localeCompare(a.criado_em || a.data || ''))
      .slice(0, 5)
  }, [historico])

  const leadsFiltrados = leads.filter(l => {
    if (busca && !`${l.nome} ${l.cidade} ${l.assunto}`.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroFase && l.fase !== filtroFase) return false
    if (filtroTemp && l.temp !== filtroTemp) return false
    if (filtroStatus && l.status !== filtroStatus) return false
    if (filtroContatos && l.contatos !== filtroContatos) return false
    if (filtroPremium && !l.lead_premium) return false
    return true
  })

  const historicoFiltrado = historico.filter(h => {
    if (filtroHistLead && h.lead_id !== filtroHistLead) return false
    if (filtroHistTipo && h.tipo !== filtroHistTipo) return false
    if (filtroHistContatos) {
      const lead = leads.find(l => l.id === h.lead_id)
      if (!lead || lead.contatos !== filtroHistContatos) return false
    }
    return true
  })

  const salvarLead = async () => {
    if (!form.nome.trim() || !form.assunto.trim()) return alert('Nome e assunto são obrigatórios.')
    setSaving(true)
    const payload = {
      ...form,
      data_contato: form.data_contato || null,
      data_ultimo_contato: form.data_ultimo_contato || null,
      data_proxima_acao: form.data_proxima_acao || null,
      fase: form.fase || null,
      status: form.status || null,
      contatos: form.contatos || 'Contato Inicial',
    }
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

  const abrirEditar = (l: Lead) => {
    setForm({ ...l, contatos: l.contatos || 'Contato Inicial' })
    setEditId(l.id || null); setModalLead(true)
  }
  const abrirNovo = () => {
    setForm({ ...LEAD_VAZIO, data_contato: hojeStr(), data_ultimo_contato: hojeStr() })
    setEditId(null); setModalLead(true)
  }

  const abrirHistDoLead = (lead: Lead) => {
    setHistForm({ lead_id: lead.id, lead_nome: lead.nome, data: hojeStr(), tipo: 'WhatsApp' })
    setModalHist(true)
  }

  const salvarHist = async () => {
    if (!histForm.lead_id || !histForm.texto?.trim()) return alert('Lead e descrição são obrigatórios.')
    const { error } = await supabase.from('historico').insert({ ...histForm, data: histForm.data || hojeStr() })
    if (error) { alert('Erro: ' + error.message); return }
    await supabase.from('leads').update({ data_ultimo_contato: histForm.data || hojeStr() }).eq('id', histForm.lead_id)
    setModalHist(false); setHistForm({}); carregar()
  }

  const togglePremium = async (l: Lead) => {
    if (!l.id) return
    await supabase.from('leads').update({ lead_premium: !l.lead_premium }).eq('id', l.id)
    carregar()
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
    { id: 'tabela', label: 'Tabela', icon: '⊞' },
    { id: 'funil', label: 'Funil', icon: '◈' },
    { id: 'historico', label: 'Histórico', icon: '◷' },
  ] as const

  const inp: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }

  // Etiqueta de Contatos (componente reutilizável)
  const TagContatos = ({ c }: { c: string | undefined }) => {
    const cc = corContato(c)
    return (
      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: cc.tag + '15', color: cc.text, fontWeight: 600, whiteSpace: 'nowrap', border: `1px solid ${cc.border}` }}>
        📍 {c || 'Contato Inicial'}
      </span>
    )
  }

  // Card rico do lead (reaproveitado em Dashboard e Leads)
  const renderLeadCard = (l: Lead, opts: { motivoUrgencia?: string; corUrgencia?: string } = {}) => {
    const fc = FASE_CORES[l.fase || ''] || { bg: '#f3f4f6', color: '#6b7280', semaforo: '#9ca3af' }
    const ult = l.id ? ultAtendPorLead[l.id] : null
    const dias = diasEntre(l.data_ultimo_contato)
    const frio = ehAtivo(l) && dias !== null && dias >= DIAS_SEM_CONTATO_ALERTA
    const cc = corContato(l.contatos)
    return (
      <div key={l.id} style={{
        background: cc.bg,
        borderRadius: 12,
        padding: '14px 16px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        marginBottom: 10,
        borderLeft: `4px solid ${l.lead_premium ? GOLD : (TEMP_COR[l.temp || ''] || '#e5e7eb')}`,
        border: `1px solid ${cc.border}`,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Initials nome={l.nome} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{l.nome}</span>
              {l.lead_premium && <span title="Lead Premium" style={{ fontSize: 12 }}>💎</span>}
              {l.fase && (
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: fc.bg, color: fc.color, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: fc.semaforo, display: 'inline-block' }} />
                  {l.fase}
                </span>
              )}
              {!l.fase && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap' }}>⚠️ sem fase</span>}
              {l.temp && <span style={{ fontSize: 10, color: TEMP_COR[l.temp], fontWeight: 600 }}>● {l.temp}</span>}
              <TagContatos c={l.contatos} />
              {opts.motivoUrgencia && (
                <span style={{ fontSize: 10, fontWeight: 600, color: opts.corUrgencia || '#dc2626', background: (opts.corUrgencia || '#dc2626') + '15', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                  {opts.motivoUrgencia}
                </span>
              )}
              {frio && !opts.motivoUrgencia && <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600, background: '#fee2e2', padding: '1px 6px', borderRadius: 10 }}>❄️ sem contato há {dias}d</span>}
            </div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, lineHeight: 1.5 }}>{l.assunto}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: '#6b7280', marginBottom: ult ? 8 : 0 }}>
              <span><strong style={{ color: '#4b5563' }}>1º contato:</strong> {formatarData(l.data_contato)}</span>
              <span><strong style={{ color: '#4b5563' }}>Últ. contato:</strong> {formatarData(l.data_ultimo_contato)} {dias !== null && `(${formatarDataRelativa(l.data_ultimo_contato)})`}</span>
              {l.data_proxima_acao && <span><strong style={{ color: '#4b5563' }}>Próx. ação:</strong> {formatarData(l.data_proxima_acao)}</span>}
              {l.origem && <span><strong style={{ color: '#4b5563' }}>Origem:</strong> {l.origem}</span>}
            </div>
            {l.status && (
              <div style={{ fontSize: 11, color: '#5b21b6', background: '#f5f3ff', padding: '4px 10px', borderRadius: 6, marginBottom: 8, display: 'inline-block', fontWeight: 500 }}>
                💭 {l.status}
              </div>
            )}
            {ult && (
              <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${GOLD}`, marginBottom: 8 }}>
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
              {l.wa && <a href={`https://wa.me/${l.wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>↗ WhatsApp</a>}
              <button onClick={() => abrirHistDoLead(l)} style={{ padding: '5px 10px', background: '#fff', color: NAVY, border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>+ Atendimento</button>
              <button onClick={() => abrirEditar(l)} style={{ padding: '5px 10px', background: '#fff', color: NAVY, border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>Editar</button>
              <button onClick={() => togglePremium(l)} style={{ padding: '5px 10px', background: l.lead_premium ? GOLD : '#fff', color: l.lead_premium ? '#fff' : NAVY, border: `1px solid ${l.lead_premium ? GOLD : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>💎 {l.lead_premium ? 'Premium' : 'Premium'}</button>
              <button onClick={() => excluirLead(l.id!, l.nome)} style={{ padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>Excluir</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
        .funil-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 12px; }
        .dash-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 20px; }
        .agenda-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        .status-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px,1fr)); gap: 8px; }
        @media (max-width: 1024px) { .dash-grid { grid-template-columns: 1fr; } .agenda-grid { grid-template-columns: 1fr; } }
        @media (max-width: 768px) {
          .sidebar { display: none; }
          .bottomnav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: ${NAVY}; z-index: 20; border-top: 1px solid rgba(201,168,76,0.2); padding-bottom: env(safe-area-inset-bottom); overflow-x: auto; }
          .bottomnav button { flex: 1; min-width: 60px; background: none; border: none; color: rgba(255,255,255,0.6); padding: 10px 4px 8px; font-size: 10px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; }
          .bottomnav button.active { color: ${GOLD}; }
          .bottomnav button span.icon { font-size: 18px; }
          .main { margin-left: 0; padding: 16px; padding-bottom: 80px; }
          .topbar { display: flex !important; }
          .stats { grid-template-columns: repeat(2,1fr); gap: 10px; }
          .charts { grid-template-columns: 1fr; }
          .funil-grid { grid-template-columns: repeat(2,1fr); }
        }
        .topbar { display: none; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 12px 0 0; }
        .agenda-card { background: #fff; border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
        .agenda-item { padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
        .agenda-item:last-child { border-bottom: none; }
        .status-chip { background: #fff; padding: 8px 10px; border-radius: 8px; border: 1px solid #e5e7eb; cursor: pointer; font-size: 11px; display: flex; justify-content: space-between; align-items: center; gap: 6px; }
        .status-chip:hover { border-color: ${GOLD}; background: #fffbeb; }
        .status-chip.active { background: ${NAVY}; color: ${GOLD}; border-color: ${GOLD}; }
        .tabela-wrap { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
        .tabela-scroll { overflow-x: auto; }
        .tabela-real { width: 100%; border-collapse: collapse; font-size: 12px; }
        .tabela-real th { background: ${NAVY}; color: ${GOLD}; padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; position: sticky; top: 0; }
        .tabela-real td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; color: #374151; }
        .tabela-real tr:hover td { background: #fafafa; }
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
                {aba === 'dashboard' ? 'Dashboard' : aba === 'leads' ? 'Leads' : aba === 'tabela' ? 'Tabela' : aba === 'funil' ? 'Funil' : 'Histórico'}
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
              {acoesProximas.length > 0 && (
                <div className="agenda-grid">
                  <div className="agenda-card">
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#5b21b6', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>⏰ Próximas ações (3 dias)</div>
                    {acoesProximas.slice(0, 4).map(l => {
                      const d = diasEntre(l.data_proxima_acao)
                      return (
                        <div key={l.id} className="agenda-item" onClick={() => abrirEditar(l)} style={{ cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.lead_premium && '💎 '}{l.nome}</div>
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
                </div>
              )}

              <div className="stats">
                {[
                  { label: 'Leads ativos', val: ativos, cor: NAVY, sub: premiumCount > 0 ? `${premiumCount} premium 💎` : (leadsUrgentes.length > 0 ? `${leadsUrgentes.length} requerem atenção` : 'Tudo em dia') },
                  { label: 'Propostas enviadas', val: propostasEnviadas, cor: '#f59e0b', sub: 'aguardando retorno' },
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

              {propostasSemResposta.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
                  📄 <strong>{propostasSemResposta.length} proposta(s)</strong> sem resposta há 3+ dias — hora de cutucar: {propostasSemResposta.slice(0, 4).map(l => l.nome).join(', ')}{propostasSemResposta.length > 4 ? ` e mais ${propostasSemResposta.length - 4}` : ''}
                </div>
              )}
              {leadsLimiteRmkt.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
                  ⚠️ <strong>{leadsLimiteRmkt.length} lead(s)</strong> no 3º Rmkt (limite): {leadsLimiteRmkt.slice(0, 4).map(l => l.nome).join(', ')}{leadsLimiteRmkt.length > 4 ? ` e mais ${leadsLimiteRmkt.length - 4}` : ''}
                </div>
              )}
              {leadsSemContato.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#92400e', marginBottom: 16 }}>
                  ❄️ <strong>{leadsSemContato.length} lead(s)</strong> sem contato há 2+ dias: {leadsSemContato.slice(0, 5).map(l => l.nome).join(', ')}{leadsSemContato.length > 5 ? ` e mais ${leadsSemContato.length - 5}` : ''}
                </div>
              )}

              {statusCounts.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 10, borderBottom: `2px solid ${GOLD}`, paddingBottom: 8, display: 'inline-block' }}>
                    💭 Por status
                  </div>
                  <div className="status-grid">
                    {statusCounts.map(([s, q]) => (
                      <div key={s} className={`status-chip ${filtroStatus === s ? 'active' : ''}`} onClick={() => { setFiltroStatus(filtroStatus === s ? '' : s); setAba('leads') }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
                        <strong style={{ flexShrink: 0 }}>{q}</strong>
                      </div>
                    ))}
                  </div>
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
                      {leadsUrgentes.slice(0, 8).map(u => renderLeadCard(u.lead, { motivoUrgencia: u.motivo, corUrgencia: u.cor }))}
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
                              <span style={{ fontWeight: 600, fontSize: 12, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{lead?.lead_premium && '💎 '}{h.lead_nome}</span>
                              <span style={{ fontSize: 10, background: '#f3f4f6', color: '#6b7280', padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>{h.tipo}</span>
                            </div>
                            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>{formatarData(h.data)} · {formatarDataRelativa(h.data)}</div>
                            <p style={{ fontSize: 12, color: '#374151', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{h.texto}</p>
                          </div>
                        )
                      })
                    )}
                  </div>

                  <div style={{ marginTop: 14, background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Legenda · Contatos</div>
                    {CONTATOS_OPCOES.map(c => {
                      const cc = corContato(c)
                      return (
                        <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 11 }}>
                          <div style={{ width: 16, height: 16, borderRadius: 4, background: cc.bg, border: `1px solid ${cc.border}` }} />
                          <span style={{ color: cc.text, fontWeight: 600 }}>{c}</span>
                          {c === '3 Rmkt' && <span style={{ color: '#9ca3af', fontSize: 10 }}>(limite)</span>}
                        </div>
                      )
                    })}
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
                <select value={filtroContatos} onChange={e => setFiltroContatos(e.target.value)} style={{ ...inp, width: 'auto', flex: 'none' }}>
                  <option value="">Todos contatos</option>{CONTATOS_OPCOES.map(c => <option key={c}>{c}</option>)}
                </select>
                <select value={filtroTemp} onChange={e => setFiltroTemp(e.target.value)} style={{ ...inp, width: 'auto', flex: 'none' }}>
                  <option value="">Todas temperaturas</option>{TEMPERATURAS.map(t => <option key={t}>{t}</option>)}
                </select>
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inp, width: 'auto', flex: 'none' }}>
                  <option value="">Todos status</option>{STATUS_OPCOES.map(s => <option key={s}>{s}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', fontSize: 13, color: NAVY, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={filtroPremium} onChange={e => setFiltroPremium(e.target.checked)} />
                  💎 Só Premium
                </label>
              </div>
              {(filtroFase || filtroTemp || filtroStatus || filtroContatos || filtroPremium || busca) && (
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                  Mostrando {leadsFiltrados.length} de {leads.length} leads · <button onClick={() => { setFiltroFase(''); setFiltroTemp(''); setFiltroStatus(''); setFiltroContatos(''); setFiltroPremium(false); setBusca('') }} style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', textDecoration: 'underline', fontSize: 12, padding: 0 }}>Limpar filtros</button>
                </div>
              )}
              {leadsFiltrados.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  Nenhum lead encontrado.
                </div>
              ) : (
                leadsFiltrados.map(l => renderLeadCard(l))
              )}
            </div>
          )}

          {!loading && aba === 'tabela' && (
            <TabelaExcel
              leads={leads}
              abrirEditar={abrirEditar}
              formatarData={formatarData}
              formatarDataRelativa={formatarDataRelativa}
              corContato={corContato}
              FASE_CORES={FASE_CORES}
              NAVY={NAVY}
              GOLD={GOLD}
            />
          )}

          {!loading && aba === 'funil' && (
            <div className="funil-grid">
              {FASES.map(fase => {
                const grupo = leads.filter(l => l.fase === fase)
                const fc = FASE_CORES[fase] || { bg: '#f3f4f6', color: '#6b7280', semaforo: '#9ca3af' }
                return (
                  <div key={fase} style={{ background: '#fff', borderRadius: 12, padding: 12, minHeight: 120, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${fc.semaforo}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: fc.color, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{fase} ({grupo.length})</div>
                    {grupo.map(l => {
                      const dias = diasEntre(l.data_ultimo_contato)
                      const cc = corContato(l.contatos)
                      return (
                        <div key={l.id} onClick={() => abrirEditar(l)}
                          style={{ background: cc.bg, borderRadius: 8, padding: '8px 10px', marginBottom: 6, cursor: 'pointer', borderLeft: `3px solid ${l.lead_premium ? GOLD : (TEMP_COR[l.temp || ''] || '#e5e7eb')}`, border: `1px solid ${cc.border}` }}>
                          <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.lead_premium && '💎 '}{l.nome}</p>
                          <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.assunto}</p>
                          <div style={{ marginBottom: 4 }}>
                            <TagContatos c={l.contatos} />
                          </div>
                          <div style={{ fontSize: 10, color: '#9ca3af', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                            <span>📞 {formatarDataRelativa(l.data_ultimo_contato)}</span>
                            {l.data_proxima_acao && <span>⏰ {formatarData(l.data_proxima_acao)}</span>}
                          </div>
                        </div>
                      )
                    })}
                    {grupo.length === 0 && <p style={{ fontSize: 11, color: '#d1d5db', margin: 0 }}>Vazio</p>}
                  </div>
                )
              })}
              {/* Leads sem fase atribuída */}
              {leads.some(l => !l.fase) && (
                <div style={{ background: '#fff', borderRadius: 12, padding: 12, minHeight: 120, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid #9ca3af`, gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>⚠️ Sem fase atribuída ({leads.filter(l => !l.fase).length}) — clique para classificar</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 6 }}>
                    {leads.filter(l => !l.fase).map(l => {
                      const cc = corContato(l.contatos)
                      return (
                        <div key={l.id} onClick={() => abrirEditar(l)}
                          style={{ background: cc.bg, borderRadius: 8, padding: '8px 10px', cursor: 'pointer', borderLeft: `3px solid ${l.lead_premium ? GOLD : (TEMP_COR[l.temp || ''] || '#e5e7eb')}`, border: `1px solid ${cc.border}` }}>
                          <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: NAVY }}>{l.lead_premium && '💎 '}{l.nome}</p>
                          <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.assunto}</p>
                          <TagContatos c={l.contatos} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
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
                <select value={filtroHistContatos} onChange={e => setFiltroHistContatos(e.target.value)} style={{ ...inp, width: 'auto', flex: 'none' }}>
                  <option value="">Todos contatos</option>
                  {CONTATOS_OPCOES.map(c => <option key={c}>{c}</option>)}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{lead?.lead_premium && '💎 '}{h.lead_nome}</span>
                          {lead && <TagContatos c={lead.contatos} />}
                        </div>
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
              <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.lead_premium || false} onChange={e => setForm(p => ({ ...p, lead_premium: e.target.checked }))} />
                💎 Premium
              </label>
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
              <div>
                <label style={lbl}>Área jurídica</label>
                <select value={form.area || ''} onChange={e => setForm(p => ({ ...p, area: e.target.value }))} style={inp}>
                  {AREAS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Fase</label>
                <select value={form.fase || ''} onChange={e => setForm(p => ({ ...p, fase: e.target.value }))} style={inp}>
                  <option value="">— selecione —</option>
                  {FASES.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Temperatura</label>
                <select value={form.temp || ''} onChange={e => setForm(p => ({ ...p, temp: e.target.value }))} style={inp}>
                  {TEMPERATURAS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Origem</label>
                <select value={form.origem || ''} onChange={e => setForm(p => ({ ...p, origem: e.target.value }))} style={inp}>
                  {ORIGENS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Contatos</label>
                <select value={form.contatos || 'Contato Inicial'} onChange={e => setForm(p => ({ ...p, contatos: e.target.value }))} style={inp}>
                  {CONTATOS_OPCOES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={form.status || ''} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={inp}>
                  <option value="">— sem status definido —</option>
                  {STATUS_OPCOES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Data do contato</label>
                <input type="date" value={form.data_contato || ''} onChange={e => setForm(p => ({ ...p, data_contato: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Data do último contato</label>
                <input type="date" value={form.data_ultimo_contato || ''} onChange={e => setForm(p => ({ ...p, data_ultimo_contato: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Data da próxima ação</label>
                <input type="date" value={form.data_proxima_acao || ''} onChange={e => setForm(p => ({ ...p, data_proxima_acao: e.target.value }))} style={inp} />
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

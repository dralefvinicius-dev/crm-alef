'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Lead, Historico, Cliente, Movimentacao, FASES, TEMPERATURAS, ORIGENS, AREAS, TIPOS_CONTATO, CONTATOS_OPCOES, STATUS_OPCOES, FASES_JORNADA, TIPOS_MOVIMENTACAO, DOCS_CONSIGNADO, DIAS_PARA_ARQUIVAR_LEAD_PERDIDO } from '@/lib/supabase'

const NAVY = '#0D1B2E'
const GOLD = '#C9A84C'

const COR_POR_CONTATO: Record<string, { bg: string; border: string; text: string; tag: string }> = {
  'Contato Inicial': { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', tag: '#3b82f6' },
  '1 Rmkt':          { bg: '#ecfdf5', border: '#86efac', text: '#065f46', tag: '#10b981' },
  '2 Rmkt':          { bg: '#fefce8', border: '#fde047', text: '#a16207', tag: '#eab308' },
  '3 Rmkt':          { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', tag: '#dc2626' },
}
const corContato = (c: string | undefined) => COR_POR_CONTATO[c || 'Contato Inicial'] || COR_POR_CONTATO['Contato Inicial']

const FASE_CORES: Record<string, { bg: string; color: string; semaforo: string }> = {
  'Contracheque Não Enviado': { bg: '#f3f4f6', color: '#374151', semaforo: '#6b7280' },
  'Relatório Pendente':       { bg: '#fef9c3', color: '#854d0e', semaforo: '#eab308' },
  'Relatório Enviado':  { bg: '#dbeafe', color: '#1e40af', semaforo: '#3b82f6' },
  'Proposta Enviada':   { bg: '#fef3c7', color: '#92400e', semaforo: '#f59e0b' },
  'Contrato Enviado':   { bg: '#ede9fe', color: '#5b21b6', semaforo: '#8b5cf6' },
  'Contrato Assinado':  { bg: '#ccfbf1', color: '#134e4a', semaforo: '#0d9488' },
  'Lead Perdido':       { bg: '#fee2e2', color: '#991b1b', semaforo: '#dc2626' },
}

const FASE_JORNADA_CORES: Record<string, { bg: string; color: string; semaforo: string }> = {
  'Documentação':     { bg: '#fef3c7', color: '#92400e', semaforo: '#f59e0b' },
  'Petição Inicial':  { bg: '#ede9fe', color: '#5b21b6', semaforo: '#8b5cf6' },
  'Protocolo':        { bg: '#dbeafe', color: '#1e40af', semaforo: '#3b82f6' },
  'Acompanhamento':   { bg: '#ccfbf1', color: '#134e4a', semaforo: '#0d9488' },
}

const TEMP_COR: Record<string, string> = { Quente: '#ef4444', Morno: '#f59e0b', Frio: '#3b82f6' }

const LEAD_VAZIO: Lead = {
  nome: '', wa: '', email: '', cidade: '', prof: '',
  assunto: '', area: 'Direito Civil', fase: '',
  temp: 'Morno', origem: 'Indicação',
  data_contato: '', data_ultimo_contato: '', data_proxima_acao: '',
  contatos: 'Contato Inicial', status: '',
  obs: '', lead_premium: false, arquivado: false,
}

const DIAS_SEM_CONTATO_ALERTA = 2
const DIAS_PARADO_FUNIL = 5
const DIAS_SEM_RESPOSTA_PROPOSTA = 3

// Mapa de DDDs → região/estado e cidade-sugerida
const DDD_MAP: Record<string, { regiao: string; cidadeSugerida: string }> = {
  '11': { regiao: 'São Paulo (capital e Grande SP)', cidadeSugerida: 'São Paulo/SP' },
  '12': { regiao: 'Vale do Paraíba/SP', cidadeSugerida: 'São José dos Campos/SP' },
  '13': { regiao: 'Baixada Santista/SP', cidadeSugerida: 'Santos/SP' },
  '14': { regiao: 'Bauru/SP', cidadeSugerida: 'Bauru/SP' },
  '15': { regiao: 'Sorocaba/SP', cidadeSugerida: 'Sorocaba/SP' },
  '16': { regiao: 'Ribeirão Preto/SP', cidadeSugerida: 'Ribeirão Preto/SP' },
  '17': { regiao: 'São José do Rio Preto/SP', cidadeSugerida: 'São José do Rio Preto/SP' },
  '18': { regiao: 'Presidente Prudente/SP', cidadeSugerida: 'Presidente Prudente/SP' },
  '19': { regiao: 'Campinas/SP', cidadeSugerida: 'Campinas/SP' },
  '21': { regiao: 'Rio de Janeiro (capital)', cidadeSugerida: 'Rio de Janeiro/RJ' },
  '22': { regiao: 'Campos/RJ', cidadeSugerida: 'Campos dos Goytacazes/RJ' },
  '24': { regiao: 'Petrópolis/RJ', cidadeSugerida: 'Petrópolis/RJ' },
  '27': { regiao: 'Vitória/ES', cidadeSugerida: 'Vitória/ES' },
  '28': { regiao: 'Cachoeiro/ES', cidadeSugerida: 'Cachoeiro de Itapemirim/ES' },
  '31': { regiao: 'Belo Horizonte/MG', cidadeSugerida: 'Belo Horizonte/MG' },
  '32': { regiao: 'Juiz de Fora/MG', cidadeSugerida: 'Juiz de Fora/MG' },
  '33': { regiao: 'Governador Valadares/MG', cidadeSugerida: 'Governador Valadares/MG' },
  '34': { regiao: 'Uberlândia/MG', cidadeSugerida: 'Uberlândia/MG' },
  '35': { regiao: 'Poços de Caldas/MG', cidadeSugerida: 'Poços de Caldas/MG' },
  '37': { regiao: 'Divinópolis/MG', cidadeSugerida: 'Divinópolis/MG' },
  '38': { regiao: 'Montes Claros/MG', cidadeSugerida: 'Montes Claros/MG' },
  '41': { regiao: 'Curitiba/PR', cidadeSugerida: 'Curitiba/PR' },
  '42': { regiao: 'Ponta Grossa/PR', cidadeSugerida: 'Ponta Grossa/PR' },
  '43': { regiao: 'Londrina/PR', cidadeSugerida: 'Londrina/PR' },
  '44': { regiao: 'Maringá/PR', cidadeSugerida: 'Maringá/PR' },
  '45': { regiao: 'Cascavel/PR', cidadeSugerida: 'Cascavel/PR' },
  '46': { regiao: 'Francisco Beltrão/PR', cidadeSugerida: 'Francisco Beltrão/PR' },
  '47': { regiao: 'Joinville/SC', cidadeSugerida: 'Joinville/SC' },
  '48': { regiao: 'Florianópolis/SC', cidadeSugerida: 'Florianópolis/SC' },
  '49': { regiao: 'Chapecó/SC', cidadeSugerida: 'Chapecó/SC' },
  '51': { regiao: 'Porto Alegre/RS', cidadeSugerida: 'Porto Alegre/RS' },
  '53': { regiao: 'Pelotas/RS', cidadeSugerida: 'Pelotas/RS' },
  '54': { regiao: 'Caxias do Sul/RS', cidadeSugerida: 'Caxias do Sul/RS' },
  '55': { regiao: 'Santa Maria/RS', cidadeSugerida: 'Santa Maria/RS' },
  '61': { regiao: 'Brasília/DF', cidadeSugerida: 'Brasília/DF' },
  '62': { regiao: 'Goiânia/GO', cidadeSugerida: 'Goiânia/GO' },
  '63': { regiao: 'Tocantins', cidadeSugerida: 'Palmas/TO' },
  '64': { regiao: 'Rio Verde/GO', cidadeSugerida: 'Rio Verde/GO' },
  '65': { regiao: 'Cuiabá/MT', cidadeSugerida: 'Cuiabá/MT' },
  '66': { regiao: 'Rondonópolis/MT', cidadeSugerida: 'Rondonópolis/MT' },
  '67': { regiao: 'Mato Grosso do Sul', cidadeSugerida: 'Campo Grande/MS' },
  '68': { regiao: 'Acre', cidadeSugerida: 'Rio Branco/AC' },
  '69': { regiao: 'Rondônia', cidadeSugerida: 'Porto Velho/RO' },
  '71': { regiao: 'Salvador/BA', cidadeSugerida: 'Salvador/BA' },
  '73': { regiao: 'Ilhéus/BA', cidadeSugerida: 'Ilhéus/BA' },
  '74': { regiao: 'Juazeiro/BA', cidadeSugerida: 'Juazeiro/BA' },
  '75': { regiao: 'Feira de Santana/BA', cidadeSugerida: 'Feira de Santana/BA' },
  '77': { regiao: 'Vitória da Conquista/BA', cidadeSugerida: 'Vitória da Conquista/BA' },
  '79': { regiao: 'Sergipe', cidadeSugerida: 'Aracaju/SE' },
  '81': { regiao: 'Recife/PE', cidadeSugerida: 'Recife/PE' },
  '82': { regiao: 'Alagoas', cidadeSugerida: 'Maceió/AL' },
  '83': { regiao: 'Paraíba', cidadeSugerida: 'João Pessoa/PB' },
  '84': { regiao: 'Rio Grande do Norte', cidadeSugerida: 'Natal/RN' },
  '85': { regiao: 'Fortaleza/CE', cidadeSugerida: 'Fortaleza/CE' },
  '86': { regiao: 'Piauí (capital)', cidadeSugerida: 'Teresina/PI' },
  '87': { regiao: 'Petrolina/PE', cidadeSugerida: 'Petrolina/PE' },
  '88': { regiao: 'Juazeiro do Norte/CE', cidadeSugerida: 'Juazeiro do Norte/CE' },
  '89': { regiao: 'Picos/PI', cidadeSugerida: 'Picos/PI' },
  '91': { regiao: 'Belém/PA', cidadeSugerida: 'Belém/PA' },
  '92': { regiao: 'Amazonas', cidadeSugerida: 'Manaus/AM' },
  '93': { regiao: 'Santarém/PA', cidadeSugerida: 'Santarém/PA' },
  '94': { regiao: 'Sudeste do Pará', cidadeSugerida: 'Parauapebas/PA' },
  '95': { regiao: 'Roraima', cidadeSugerida: 'Boa Vista/RR' },
  '96': { regiao: 'Amapá', cidadeSugerida: 'Macapá/AP' },
  '97': { regiao: 'Interior do Amazonas', cidadeSugerida: 'Tefé/AM' },
  '98': { regiao: 'Maranhão (capital)', cidadeSugerida: 'São Luís/MA' },
  '99': { regiao: 'Interior do Maranhão', cidadeSugerida: 'Imperatriz/MA' },
}

// Extrai o DDD do telefone e retorna sugestão (ou null)
function sugestaoCidadePorDDD(telefone: string): { ddd: string; regiao: string; cidadeSugerida: string } | null {
  if (!telefone) return null
  // Remove tudo que não é número
  const apenasNum = telefone.replace(/\D/g, '')
  // Tenta extrair o DDD: pode estar após +55 (4 dígitos antes do DDD) ou logo no início
  let ddd = ''
  if (apenasNum.length >= 12 && apenasNum.startsWith('55')) {
    ddd = apenasNum.substring(2, 4)
  } else if (apenasNum.length >= 10) {
    ddd = apenasNum.substring(0, 2)
  }
  if (!ddd || !DDD_MAP[ddd]) return null
  return { ddd, ...DDD_MAP[ddd] }
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

const hojeStr = () => new Date().toISOString().slice(0, 10)
const diasEntre = (d: string | undefined | null) => {
  if (!d) return null
  const dt = new Date(d + 'T00:00:00')
  const hj = new Date(hojeStr() + 'T00:00:00')
  return Math.floor((hj.getTime() - dt.getTime()) / 86400000)
}
// Conta apenas dias úteis (seg-sex) entre data inicial e hoje
const diasUteisEntre = (d: string | undefined | null) => {
  if (!d) return null
  const dt = new Date(d + 'T00:00:00')
  const hj = new Date(hojeStr() + 'T00:00:00')
  let count = 0
  const atual = new Date(dt)
  while (atual <= hj) {
    const wd = atual.getDay()
    if (wd !== 0 && wd !== 6) count++
    atual.setDate(atual.getDate() + 1)
  }
  return Math.max(0, count - 1)  // excluir o dia inicial
}
// Adicionar N dias úteis a uma data
const adicionarDiasUteis = (d: string, n: number): string => {
  const dt = new Date(d + 'T00:00:00')
  let dias = n
  while (dias > 0) {
    dt.setDate(dt.getDate() + 1)
    const wd = dt.getDay()
    if (wd !== 0 && wd !== 6) dias--
  }
  return dt.toISOString().slice(0, 10)
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
// HELPER: localStorage de filtros (persistência)
// ============================================================
const STORAGE_KEY_FILTROS = 'crm_tabela_filtros_v4'

function carregarFiltrosSalvos(): { ordenacao: any; filtros: any; buscas: any; larguras: any } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FILTROS)
    if (!raw) return null
    const obj = JSON.parse(raw)
    // Reconstroi os Sets dos filtros
    const filtros: any = {}
    if (obj.filtros) {
      Object.keys(obj.filtros).forEach(k => {
        if (Array.isArray(obj.filtros[k])) filtros[k] = new Set(obj.filtros[k])
      })
    }
    return { ordenacao: obj.ordenacao || null, filtros, buscas: obj.buscas || {}, larguras: obj.larguras || null }
  } catch { return null }
}

function salvarFiltros(ordenacao: any, filtros: any, buscas: any, larguras: any) {
  if (typeof window === 'undefined') return
  try {
    const filtrosSerializaveis: any = {}
    Object.keys(filtros).forEach(k => {
      filtrosSerializaveis[k] = Array.from(filtros[k])
    })
    localStorage.setItem(STORAGE_KEY_FILTROS, JSON.stringify({
      ordenacao, filtros: filtrosSerializaveis, buscas, larguras
    }))
  } catch {}
}


// ============================================================
// COMPONENTE: TabelaExcel — filtro idêntico ao Excel
// Comportamento: filtros[col] = Set de valores SELECIONADOS
// Set ausente (undefined) = "sem filtro" = todos aparecem
// Set vazio = "nada selecionado" = tabela vazia, lista do popover continua visível
// buscas[col] = string de texto que filtra a tabela em tempo real (modo Google Sheets)
// ============================================================
type ColunaKey = 'nome' | 'wa' | 'fase' | 'contatos' | 'status' | 'data_contato' | 'data_ultimo_contato' | 'data_proxima_acao'
type OrdenacaoState = { coluna: ColunaKey; direcao: 'asc' | 'desc' } | null
type FiltrosColuna = Partial<Record<ColunaKey, Set<string>>>
type BuscasColuna = Partial<Record<ColunaKey, string>>

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
  const LARGURAS_INICIAIS: Record<ColunaKey, number> = {
    nome: 240, wa: 150, fase: 140, contatos: 130, status: 170,
    data_contato: 110, data_ultimo_contato: 130, data_proxima_acao: 120,
  }

  const salvos = typeof window !== 'undefined' ? carregarFiltrosSalvos() : null
  const [ordenacao, setOrdenacao] = useState<OrdenacaoState>(salvos?.ordenacao || null)
  const [filtros, setFiltros] = useState<FiltrosColuna>(salvos?.filtros || {})
  const [buscas, setBuscas] = useState<BuscasColuna>(salvos?.buscas || {})
  const [larguras, setLarguras] = useState<Record<ColunaKey, number>>(salvos?.larguras || LARGURAS_INICIAIS)
  const [popoverAberto, setPopoverAberto] = useState<ColunaKey | null>(null)

  useEffect(() => { salvarFiltros(ordenacao, filtros, buscas, larguras) }, [ordenacao, filtros, buscas, larguras])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.col-popover') && !target.closest('.col-header-btn')) {
        setPopoverAberto(null)
      }
    }
    if (popoverAberto) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverAberto])

  const iniciarResize = (col: ColunaKey, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = larguras[col]
    const onMove = (ev: MouseEvent) => {
      const nova = Math.max(60, startW + (ev.clientX - startX))
      setLarguras(prev => ({ ...prev, [col]: nova }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''; document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
  }

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

  // Valores únicos derivado de `leads` original (NÃO filtrado)
  // A lista do popover NUNCA muda conforme você marca/desmarca
  const valoresUnicosPorColuna = useMemo(() => {
    const map: Record<ColunaKey, string[]> = {} as any
    const cols: ColunaKey[] = ['nome', 'wa', 'fase', 'contatos', 'status', 'data_contato', 'data_ultimo_contato', 'data_proxima_acao']
    cols.forEach(col => {
      const set = new Set<string>()
      leads.forEach(l => set.add(getValor(l, col)))
      if (col === 'fase') FASES.forEach(f => set.add(f))
      if (col === 'contatos') CONTATOS_OPCOES.forEach(c => set.add(c))
      if (col === 'status') STATUS_OPCOES.forEach(s => set.add(s))
      map[col] = Array.from(set).sort((a, b) => {
        if (a === '' && b !== '') return 1
        if (b === '' && a !== '') return -1
        if (col.startsWith('data_')) return a.localeCompare(b)
        return a.localeCompare(b, 'pt-BR')
      })
    })
    return map
  }, [leads])

  const leadsExibidos = useMemo(() => {
    let r = leads.filter(l => {
      // 1) Filtro de busca por coluna (texto livre)
      for (const col of Object.keys(buscas) as ColunaKey[]) {
        const termo = (buscas[col] || '').trim().toLowerCase()
        if (!termo) continue
        const valor = getValor(l, col)
        const exibido = col.startsWith('data_') ? formatarData(valor) : valor
        if (!exibido.toLowerCase().includes(termo)) return false
      }
      // 2) Filtro de checkboxes (valores selecionados)
      for (const col of Object.keys(filtros) as ColunaKey[]) {
        const selecionados = filtros[col]
        if (selecionados !== undefined && !selecionados.has(getValor(l, col))) return false
      }
      return true
    })
    if (ordenacao) {
      const { coluna, direcao } = ordenacao
      r = [...r].sort((a, b) => {
        const va = getValor(a, coluna), vb = getValor(b, coluna)
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
  }, [leads, filtros, buscas, ordenacao])

  const ordenarColuna = (col: ColunaKey, direcao: 'asc' | 'desc') => {
    setOrdenacao({ coluna: col, direcao })
    setPopoverAberto(null)
  }

  const valorEstaMarcado = (col: ColunaKey, valor: string): boolean => {
    const sel = filtros[col]
    if (sel === undefined) return true
    return sel.has(valor)
  }

  const toggleValor = (col: ColunaKey, valor: string) => {
    setFiltros(prev => {
      const todos = valoresUnicosPorColuna[col]
      const atual = prev[col] !== undefined ? new Set(prev[col]) : new Set(todos)
      if (atual.has(valor)) atual.delete(valor)
      else atual.add(valor)
      const novo = { ...prev }
      if (atual.size === todos.length && todos.every(v => atual.has(v))) {
        delete novo[col]
      } else {
        novo[col] = atual
      }
      return novo
    })
  }

  // "Selecionar tudo" estilo Excel: alterna marcar/desmarcar todos visíveis
  const toggleSelecionarTudo = (col: ColunaKey, valoresVisiveis: string[]) => {
    setFiltros(prev => {
      const todos = valoresUnicosPorColuna[col]
      const atual = prev[col] !== undefined ? new Set(prev[col]) : new Set(todos)
      const todosVisiveisMarcados = valoresVisiveis.every(v => atual.has(v))
      if (todosVisiveisMarcados) {
        valoresVisiveis.forEach(v => atual.delete(v))
      } else {
        valoresVisiveis.forEach(v => atual.add(v))
      }
      const novo = { ...prev }
      if (atual.size === todos.length && todos.every(v => atual.has(v))) {
        delete novo[col]
      } else {
        novo[col] = atual
      }
      return novo
    })
  }

  const limparTudo = () => {
    setOrdenacao(null); setFiltros({}); setBuscas({}); setPopoverAberto(null)
  }

  const resetarLarguras = () => setLarguras(LARGURAS_INICIAIS)

  const colunaTemFiltro = (col: ColunaKey) => filtros[col] !== undefined
  const colunaTemBusca = (col: ColunaKey) => !!(buscas[col] || '').trim()
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

  const buscaAtiva = popoverAberto ? (buscas[popoverAberto] || '') : ''

  const valoresVisivelFiltro = popoverAberto
    ? valoresUnicosPorColuna[popoverAberto].filter(v => {
        if (!buscaAtiva) return true
        const exibido = popoverAberto.startsWith('data_') ? formatarData(v) : v
        return exibido.toLowerCase().includes(buscaAtiva.toLowerCase())
      })
    : []

  const todosVisiveisMarcados = popoverAberto && valoresVisivelFiltro.length > 0
    ? valoresVisivelFiltro.every(v => valorEstaMarcado(popoverAberto, v))
    : false

  const temAlgumFiltroOuOrd = !!ordenacao || Object.keys(filtros).length > 0 || Object.values(buscas).some(b => (b || '').trim().length > 0)
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
        .filtro-item-row:hover { background: #f9fafb; }
        @media (max-width: 768px) { .tabela-mobile-hint { display: block !important; } }
      `}</style>

      {(temAlgumFiltroOuOrd || larguraMudou) && (
        <div style={{ background: '#fffbeb', border: `1px solid ${GOLD}`, borderRadius: 8, padding: '8px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: NAVY }}>
            Exibindo <strong>{leadsExibidos.length}</strong> de <strong>{leads.length}</strong> leads
            {ordenacao && <span style={{ marginLeft: 10, color: '#6b7280' }}>· Ordenado por <strong>{colunas.find(c => c.key === ordenacao.coluna)?.label}</strong> ({ordenacao.direcao === 'asc' ? '↑' : '↓'})</span>}
            {Object.keys(filtros).length > 0 && <span style={{ marginLeft: 10, color: '#6b7280' }}>· Filtros: {Object.keys(filtros).length}</span>}
            {Object.values(buscas).filter(b => (b || '').trim()).length > 0 && <span style={{ marginLeft: 10, color: '#6b7280' }}>· 🔍 Buscas: {Object.values(buscas).filter(b => (b || '').trim()).length}</span>}
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
        💡 Arraste a tabela para os lados para ver mais colunas.
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
                      onClick={() => setPopoverAberto(popoverAberto === c.key ? null : c.key)}
                      style={{ background: 'none', border: 'none', color: GOLD, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', maxWidth: 'calc(100% - 10px)' }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                      <span style={{ opacity: colunaOrdenada(c.key) || colunaTemFiltro(c.key) || colunaTemBusca(c.key) ? 1 : 0.5, fontSize: 11, flexShrink: 0 }}>
                        {colunaTemBusca(c.key) ? '🔍' : colunaOrdenada(c.key) ? (ordenacao!.direcao === 'asc' ? '▲' : '▼') : colunaTemFiltro(c.key) ? '⌖' : '⇅'}
                      </span>
                    </button>
                    {popoverAberto === c.key && (
                      <div className="col-popover" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 280, marginTop: 4, padding: 0, color: '#1f2937', textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal' }}>
                        {/* SEÇÃO 1: Ordenação */}
                        <div style={{ padding: '8px 4px', borderBottom: '1px solid #f3f4f6' }}>
                          <button onClick={() => ordenarColuna(c.key, 'asc')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', padding: '7px 12px', cursor: 'pointer', fontSize: 12, color: NAVY, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 4 }}>
                            <span>▲</span> Ordenar crescente (A→Z)
                          </button>
                          <button onClick={() => ordenarColuna(c.key, 'desc')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', padding: '7px 12px', cursor: 'pointer', fontSize: 12, color: NAVY, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 4 }}>
                            <span>▼</span> Ordenar decrescente (Z→A)
                          </button>
                        </div>

                        {/* SEÇÃO 2: Busca — filtra TABELA em tempo real (modo Google Sheets) */}
                        <div style={{ padding: '8px 12px 6px', fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Buscar nesta coluna</span>
                          {buscaAtiva && (
                            <button
                              onClick={() => setBuscas(prev => { const n = { ...prev }; delete n[c.key]; return n })}
                              style={{ background: 'none', border: 'none', color: GOLD, fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline', textTransform: 'none', letterSpacing: 0 }}
                            >
                              limpar
                            </button>
                          )}
                        </div>
                        <div style={{ padding: '0 12px 8px' }}>
                          <input
                            type="text"
                            value={buscas[c.key] || ''}
                            onChange={e => setBuscas(prev => ({ ...prev, [c.key]: e.target.value }))}
                            placeholder="🔍 Digite e a tabela filtra..."
                            style={{ width: '100%', border: buscaAtiva ? `2px solid ${GOLD}` : '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none' }}
                            onClick={e => e.stopPropagation()}
                          />
                          {buscaAtiva && (
                            <div style={{ fontSize: 10, color: '#16a34a', marginTop: 4, fontWeight: 600 }}>
                              ✓ Filtrando tabela por "{buscaAtiva}"
                            </div>
                          )}
                        </div>

                        {/* SEÇÃO 3: Lista SEMPRE visível */}
                        <div style={{ maxHeight: 280, overflowY: 'auto', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6' }}>
                          {/* (Selecionar tudo) - clicar na linha inteira alterna */}
                          <div
                            className="filtro-item-row"
                            onClick={(e) => { e.stopPropagation(); toggleSelecionarTudo(c.key, valoresVisivelFiltro) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer', color: NAVY, fontWeight: 700, background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}
                          >
                            <input type="checkbox" checked={todosVisiveisMarcados} readOnly style={{ pointerEvents: 'none', flexShrink: 0 }} />
                            <span>{buscaAtiva ? '(Selecionar visíveis)' : '(Selecionar tudo)'}</span>
                          </div>

                          {/* Lista de valores */}
                          {valoresVisivelFiltro.length === 0 ? (
                            <div style={{ fontSize: 11, color: '#9ca3af', padding: '12px', fontStyle: 'italic', textAlign: 'center' }}>
                              Nenhum valor encontrado.
                            </div>
                          ) : (
                            valoresVisivelFiltro.map(v => {
                              const marcado = valorEstaMarcado(c.key, v)
                              const exibido = c.key.startsWith('data_') ? formatarData(v) : v
                              return (
                                <div
                                  key={v}
                                  className="filtro-item-row"
                                  onClick={(e) => { e.stopPropagation(); toggleValor(c.key, v) }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: NAVY }}
                                >
                                  <input type="checkbox" checked={marcado} readOnly style={{ pointerEvents: 'none', flexShrink: 0 }} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={exibido || '(vazio)'}>
                                    {exibido || <em style={{ color: '#9ca3af' }}>(vazio)</em>}
                                  </span>
                                </div>
                              )
                            })
                          )}
                        </div>

                        {/* SEÇÃO 4: rodapé */}
                        {colunaTemFiltro(c.key) && (
                          <div style={{ padding: '8px 12px' }}>
                            <button
                              onClick={() => setFiltros(prev => { const n = { ...prev }; delete n[c.key]; return n })}
                              style={{ background: 'none', border: 'none', color: GOLD, fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: 600 }}
                            >
                              Remover filtro desta coluna
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="resize-handle" onMouseDown={(e) => iniciarResize(c.key, e)} title="Arrastar para redimensionar" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leadsExibidos.length === 0 && <tr><td colSpan={colunas.length} style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}>Sem leads (nenhum bate com os filtros atuais).</td></tr>}
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




// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function Home() {
  const [aba, setAba] = useState<'dashboard' | 'leads' | 'tabela' | 'funil' | 'historico' | 'clientes'>('dashboard')
  const [subAbaCli, setSubAbaCli] = useState<'jornada' | 'acompanhamento'>('jornada')
  const [leads, setLeads] = useState<Lead[]>([])
  const [historico, setHistorico] = useState<Historico[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [loading, setLoading] = useState(true)
  const [erroGlobal, setErroGlobal] = useState<string | null>(null)
  const [mostrarArquivados, setMostrarArquivados] = useState(false)

  const [modalLead, setModalLead] = useState(false)
  const [form, setForm] = useState<Lead>(LEAD_VAZIO)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [modalHist, setModalHist] = useState(false)
  const [histForm, setHistForm] = useState<Partial<Historico>>({})

  const [modalCliente, setModalCliente] = useState(false)
  const [formCli, setFormCli] = useState<Cliente | null>(null)

  const [modalMov, setModalMov] = useState(false)
  const [movForm, setMovForm] = useState<Partial<Movimentacao>>({})
  const [clienteAtivoMov, setClienteAtivoMov] = useState<Cliente | null>(null)

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
    const [
      { data: l, error: e1 },
      { data: h, error: e2 },
      { data: c, error: e3 },
      { data: m, error: e4 },
    ] = await Promise.all([
      supabase.from('leads').select('*').order('lead_premium', { ascending: false }).order('criado_em', { ascending: false }),
      supabase.from('historico').select('*').order('data', { ascending: false }),
      supabase.from('clientes').select('*').order('criado_em', { ascending: false }),
      supabase.from('movimentacoes').select('*').order('data', { ascending: false }),
    ])
    if (e1) setErroGlobal('Erro leads: ' + e1.message)
    if (e2) setErroGlobal('Erro histórico: ' + e2.message)
    if (e3) setErroGlobal('Erro clientes: ' + e3.message)
    if (e4) setErroGlobal('Erro movimentações: ' + e4.message)
    setLeads(l || []); setHistorico(h || []); setClientes(c || []); setMovimentacoes(m || [])
    setLoading(false)

    // Auto-arquivar leads perdidos +15 dias
    const paraArquivar = (l || []).filter(x => {
      if (x.arquivado) return false
      if (x.fase !== 'Lead Perdido') return false
      const d = diasEntre(x.data_ultimo_contato)
      return d !== null && d >= DIAS_PARA_ARQUIVAR_LEAD_PERDIDO
    })
    if (paraArquivar.length > 0) {
      await Promise.all(paraArquivar.map(x => supabase.from('leads').update({ arquivado: true }).eq('id', x.id!)))
      const { data: l2 } = await supabase.from('leads').select('*').order('lead_premium', { ascending: false }).order('criado_em', { ascending: false })
      setLeads(l2 || [])
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Lista de leads filtrando arquivados
  const leadsVisiveis = mostrarArquivados ? leads : leads.filter(l => !l.arquivado)

  const ehAtivo = (l: Lead) => l.fase !== 'Contrato Assinado' && l.fase !== 'Lead Perdido'

  const ativos = leadsVisiveis.filter(ehAtivo).length
  const contratos = leadsVisiveis.filter(l => l.fase === 'Contrato Assinado').length
  const perdidos = leadsVisiveis.filter(l => l.fase === 'Lead Perdido').length
  const decididos = contratos + perdidos
  const taxa = decididos > 0 ? Math.round(contratos / decididos * 100) : 0
  const premiumCount = leadsVisiveis.filter(l => l.lead_premium && ehAtivo(l)).length
  const propostasEnviadas = leadsVisiveis.filter(l => l.fase === 'Proposta Enviada').length
  const arquivadosCount = leads.filter(l => l.arquivado).length

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

  // ====== Leads que precisam de você — nova prioridade ======
  const propostasSemResposta = useMemo(() => leadsVisiveis.filter(l => {
    if (l.fase !== 'Proposta Enviada' || !l.data_ultimo_contato) return false
    const d = diasEntre(l.data_ultimo_contato)
    return d !== null && d >= DIAS_SEM_RESPOSTA_PROPOSTA
  }), [leadsVisiveis])

  const acoesVencidas = useMemo(() => leadsVisiveis.filter(l => {
    if (!ehAtivo(l) || !l.data_proxima_acao) return false
    const d = diasEntre(l.data_proxima_acao); return d !== null && d >= 0
  }), [leadsVisiveis])

  const acoesProximas = useMemo(() => leadsVisiveis.filter(l => {
    if (!ehAtivo(l) || !l.data_proxima_acao) return false
    const d = diasEntre(l.data_proxima_acao); return d !== null && d < 0 && d >= -3
  }).sort((a, b) => (a.data_proxima_acao || '').localeCompare(b.data_proxima_acao || '')), [leadsVisiveis])

  const leadsSemContato = useMemo(() => leadsVisiveis.filter(l => {
    if (!ehAtivo(l) || !l.data_ultimo_contato) return false
    const d = diasEntre(l.data_ultimo_contato); return d !== null && d >= DIAS_SEM_CONTATO_ALERTA
  }), [leadsVisiveis])

  const leadsLimiteRmkt = useMemo(() => leadsVisiveis.filter(l => ehAtivo(l) && l.contatos === '3 Rmkt'), [leadsVisiveis])

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {}
    leadsVisiveis.forEach(l => {
      if (!ehAtivo(l) || !l.status) return
      m[l.status] = (m[l.status] || 0) + 1
    })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [leadsVisiveis])

  type Urgencia = { lead: Lead; motivo: string; prioridade: number; cor: string }
  const leadsUrgentes = useMemo<Urgencia[]>(() => {
    const map = new Map<string, Urgencia>()
    // PRIORIDADE 1: Contrato Enviado — ordena por último contato (mais antigo = mais urgente)
    const contratosEnviados = leadsVisiveis.filter(l => l.fase === 'Contrato Enviado')
      .sort((a, b) => (a.data_ultimo_contato || '').localeCompare(b.data_ultimo_contato || ''))
    contratosEnviados.forEach(l => {
      if (!l.id) return
      const d = diasEntre(l.data_ultimo_contato)
      map.set(l.id, { lead: l, motivo: d !== null ? `📋 Contrato enviado há ${d}d` : '📋 Contrato enviado', prioridade: 1, cor: '#7c3aed' })
    })
    // PRIORIDADE 2: Relatório Enviado — ordena por último contato (mais antigo = mais urgente)
    const relatoriosEnviados = leadsVisiveis.filter(l => l.fase === 'Relatório Enviado')
      .sort((a, b) => (a.data_ultimo_contato || '').localeCompare(b.data_ultimo_contato || ''))
    relatoriosEnviados.forEach(l => {
      if (!l.id || map.has(l.id)) return
      const d = diasEntre(l.data_ultimo_contato)
      map.set(l.id, { lead: l, motivo: d !== null ? `📄 Relatório enviado há ${d}d` : '📄 Relatório enviado', prioridade: 2, cor: '#3b82f6' })
    })
    // Outras urgências (mantidas)
    propostasSemResposta.forEach(l => {
      if (!l.id || map.has(l.id)) return
      const d = diasEntre(l.data_ultimo_contato)
      map.set(l.id, { lead: l, motivo: `📄 Proposta sem retorno há ${d}d`, prioridade: 3, cor: '#dc2626' })
    })
    acoesVencidas.forEach(l => {
      if (!l.id || map.has(l.id)) return
      const d = diasEntre(l.data_proxima_acao)
      const txt = d === 0 ? 'Ação prevista para hoje' : `Ação atrasada há ${d}d`
      map.set(l.id, { lead: l, motivo: txt, prioridade: 4, cor: '#dc2626' })
    })
    leadsLimiteRmkt.forEach(l => {
      if (!l.id || map.has(l.id)) return
      map.set(l.id, { lead: l, motivo: '⚠️ No 3º Rmkt — última chance', prioridade: 5, cor: '#dc2626' })
    })
    leadsSemContato.forEach(l => {
      if (!l.id || map.has(l.id)) return
      const d = diasEntre(l.data_ultimo_contato)
      map.set(l.id, { lead: l, motivo: `Sem contato há ${d}d`, prioridade: 6, cor: '#f59e0b' })
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.lead.lead_premium && !b.lead.lead_premium) return -1
      if (!a.lead.lead_premium && b.lead.lead_premium) return 1
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade
      // Dentro da mesma prioridade, ordena por último contato (mais antigo = mais urgente)
      return (a.lead.data_ultimo_contato || '').localeCompare(b.lead.data_ultimo_contato || '')
    })
  }, [leadsVisiveis, propostasSemResposta, acoesVencidas, leadsLimiteRmkt, leadsSemContato])

  const ultimasAtividades = useMemo(() => {
    return [...historico]
      .sort((a, b) => (b.criado_em || b.data || '').localeCompare(a.criado_em || a.data || ''))
      .slice(0, 5)
  }, [historico])

  const leadsFiltrados = leadsVisiveis.filter(l => {
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

  // ====== Ações ======
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

  const desarquivarLead = async (id: string) => {
    await supabase.from('leads').update({ arquivado: false }).eq('id', id)
    carregar()
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

  // ====== Clientes ======
  const salvarCliente = async () => {
    if (!formCli) return
    if (!formCli.nome.trim()) return alert('Nome obrigatório.')
    const payload = { ...formCli }
    // sanitiza datas vazias
    if (!payload.data_promocao) payload.data_promocao = undefined as any
    if (!payload.data_inicio_peticao) payload.data_inicio_peticao = undefined as any
    if (!payload.data_fim_peticao) payload.data_fim_peticao = undefined as any
    if (!payload.data_protocolo) payload.data_protocolo = undefined as any
    const { error } = formCli.id
      ? await supabase.from('clientes').update(payload).eq('id', formCli.id)
      : await supabase.from('clientes').insert(payload)
    if (error) { alert('Erro: ' + error.message); return }
    setModalCliente(false); setFormCli(null); carregar()
  }

  const avancarFaseCliente = async (c: Cliente, novaFase: string) => {
    const updates: any = { fase_jornada: novaFase }
    if (novaFase === 'Petição Inicial' && !c.data_inicio_peticao) updates.data_inicio_peticao = hojeStr()
    if (novaFase === 'Protocolo' && !c.data_fim_peticao) updates.data_fim_peticao = hojeStr()
    if (novaFase === 'Acompanhamento' && !c.data_protocolo) updates.data_protocolo = hojeStr()
    if (c.id) {
      await supabase.from('clientes').update(updates).eq('id', c.id)
      carregar()
    }
  }

  const abrirEditarCliente = (c: Cliente) => { setFormCli({ ...c }); setModalCliente(true) }

  const abrirNovaMov = (c: Cliente) => {
    setClienteAtivoMov(c)
    setMovForm({ cliente_id: c.id, data: hojeStr(), tipo: 'Andamento', prioridade: 'normal' })
    setModalMov(true)
  }

  const salvarMov = async () => {
    if (!movForm.cliente_id || !movForm.texto?.trim()) return alert('Descrição obrigatória.')
    const payload = { ...movForm, data: movForm.data || hojeStr() }
    if (!payload.prazo_resposta) (payload as any).prazo_resposta = null
    const { error } = await supabase.from('movimentacoes').insert(payload)
    if (error) { alert('Erro: ' + error.message); return }
    setModalMov(false); setMovForm({}); setClienteAtivoMov(null); carregar()
  }

  const barChart = (campo: keyof Lead) => {
    const m: Record<string, number> = {}
    leadsVisiveis.forEach(l => { const v = (l[campo] as string) || 'Não informado'; m[v] = (m[v] || 0) + 1 })
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
    { id: 'clientes', label: 'Clientes', icon: '★' },
  ] as const

  const inp: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }

  const TagContatos = ({ c }: { c: string | undefined }) => {
    const cc = corContato(c)
    return (
      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: cc.tag + '15', color: cc.text, fontWeight: 600, whiteSpace: 'nowrap', border: `1px solid ${cc.border}` }}>
        📍 {c || 'Contato Inicial'}
      </span>
    )
  }


  // Card de lead reutilizável
  const renderLeadCard = (l: Lead, opts: { motivoUrgencia?: string; corUrgencia?: string } = {}) => {
    const fc = FASE_CORES[l.fase || ''] || { bg: '#f3f4f6', color: '#6b7280', semaforo: '#9ca3af' }
    const ult = l.id ? ultAtendPorLead[l.id] : null
    const dias = diasEntre(l.data_ultimo_contato)
    const frio = ehAtivo(l) && dias !== null && dias >= DIAS_SEM_CONTATO_ALERTA
    const cc = corContato(l.contatos)
    return (
      <div key={l.id} style={{
        background: cc.bg, borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        marginBottom: 10, borderLeft: `4px solid ${l.lead_premium ? GOLD : (TEMP_COR[l.temp || ''] || '#e5e7eb')}`,
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
              {l.arquivado && <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, background: '#f3f4f6', padding: '1px 6px', borderRadius: 10 }}>📁 arquivado</span>}
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
              <button onClick={() => togglePremium(l)} style={{ padding: '5px 10px', background: l.lead_premium ? GOLD : '#fff', color: l.lead_premium ? '#fff' : NAVY, border: `1px solid ${l.lead_premium ? GOLD : '#e5e7eb'}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>💎 Premium</button>
              {l.arquivado && <button onClick={() => desarquivarLead(l.id!)} style={{ padding: '5px 10px', background: '#fff', color: '#0891b2', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>↺ Desarquivar</button>}
              <button onClick={() => excluirLead(l.id!, l.nome)} style={{ padding: '5px 10px', background: '#fff', color: '#dc2626', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>Excluir</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ====== Helpers da página Clientes ======
  const movimentacoesDoCliente = (cId: string | undefined) => {
    if (!cId) return []
    return movimentacoes.filter(m => m.cliente_id === cId)
  }

  const ultimaMovDoCliente = (cId: string | undefined) => {
    if (!cId) return null
    const list = movimentacoesDoCliente(cId)
    return list.length > 0 ? list[0] : null
  }

  // Status de prazo do cliente
  const getStatusPrazoCliente = (c: Cliente): { texto: string; cor: string; vencido: boolean } | null => {
    if (c.fase_jornada === 'Petição Inicial' && c.data_inicio_peticao) {
      const prazoLimite = adicionarDiasUteis(c.data_inicio_peticao, c.prazo_peticao_dias || 5)
      const diasRest = diasUteisEntre(hojeStr())! - diasUteisEntre(prazoLimite)!
      const venceu = hojeStr() > prazoLimite
      return {
        texto: venceu ? `⚠️ Prazo de petição vencido (${formatarData(prazoLimite)})` : `📅 Petição vence em ${formatarData(prazoLimite)}`,
        cor: venceu ? '#dc2626' : '#5b21b6',
        vencido: venceu,
      }
    }
    if (c.fase_jornada === 'Protocolo' && c.data_fim_peticao) {
      const prazoLimite = adicionarDiasUteis(c.data_fim_peticao, c.prazo_protocolo_dias || 2)
      const venceu = hojeStr() > prazoLimite
      return {
        texto: venceu ? `⚠️ Prazo de protocolo vencido (${formatarData(prazoLimite)})` : `📅 Protocolo vence em ${formatarData(prazoLimite)}`,
        cor: venceu ? '#dc2626' : '#1e40af',
        vencido: venceu,
      }
    }
    return null
  }

  // Card de cliente — usado nas fases 1-3
  const renderClienteCard = (c: Cliente) => {
    const fcj = FASE_JORNADA_CORES[c.fase_jornada || ''] || FASE_JORNADA_CORES['Documentação']
    const stPrazo = getStatusPrazoCliente(c)

    // Checklist de documentação (consignado)
    const ehConsignado = c.area === 'Bancário / Consignado'
    const docsObrig = DOCS_CONSIGNADO.filter(d => d.obrigatorio)
    const docsCompletos = ehConsignado
      ? docsObrig.every(d => (c as any)[d.key])
      : !!(c.doc_outros && c.doc_outros.trim())

    return (
      <div key={c.id} style={{
        background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        marginBottom: 10, borderLeft: `4px solid ${fcj.semaforo}`,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Initials nome={c.nome} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{c.nome}</span>
              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: fcj.bg, color: fcj.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: fcj.semaforo }} />
                {c.fase_jornada}
              </span>
              {c.area && <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '2px 7px', borderRadius: 10 }}>{c.area}</span>}
              {stPrazo && (
                <span style={{ fontSize: 10, fontWeight: 600, color: stPrazo.cor, background: stPrazo.cor + '15', padding: '2px 8px', borderRadius: 10 }}>
                  {stPrazo.texto}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, lineHeight: 1.5 }}>{c.assunto}</div>

            {/* FASE 1: Checklist documentação */}
            {c.fase_jornada === 'Documentação' && (
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: NAVY, marginBottom: 6 }}>📋 Documentação</div>
                {ehConsignado ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {DOCS_CONSIGNADO.map(d => (
                      <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!(c as any)[d.key]}
                          onChange={async (e) => {
                            await supabase.from('clientes').update({ [d.key]: e.target.checked }).eq('id', c.id!)
                            carregar()
                          }}
                        />
                        {d.label} {!d.obrigatorio && <span style={{ fontSize: 10, color: '#9ca3af' }}>(opcional)</span>}
                      </label>
                    ))}
                    {c.doc_outros && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}><strong>Adicionais:</strong> {c.doc_outros}</div>}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#374151' }}>
                    <div style={{ marginBottom: 4 }}><strong>Documentos:</strong> {c.doc_outros || <em style={{ color: '#9ca3af' }}>nada listado</em>}</div>
                  </div>
                )}
                {c.doc_observacoes && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, fontStyle: 'italic' }}>{c.doc_observacoes}</div>}
              </div>
            )}

            {/* FASE 2: Petição Inicial */}
            {c.fase_jornada === 'Petição Inicial' && (
              <div style={{ background: '#f5f3ff', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#5b21b6', marginBottom: 4 }}>✍️ Elaboração</div>
                <div style={{ fontSize: 12, color: '#374151' }}>
                  Início: {formatarData(c.data_inicio_peticao)} · Prazo: {c.prazo_peticao_dias || 5} dias úteis
                </div>
              </div>
            )}

            {/* FASE 3: Protocolo */}
            {c.fase_jornada === 'Protocolo' && (
              <div style={{ background: '#eff6ff', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>📤 A protocolar</div>
                <div style={{ fontSize: 12, color: '#374151' }}>
                  Petição finalizada em: {formatarData(c.data_fim_peticao)} · Prazo: {c.prazo_protocolo_dias || 2} dias úteis
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {c.wa && <a href={`https://wa.me/${c.wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>↗ WhatsApp</a>}
              <button onClick={() => abrirEditarCliente(c)} style={{ padding: '5px 10px', background: '#fff', color: NAVY, border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>Editar</button>
              {c.fase_jornada === 'Documentação' && (
                <button
                  onClick={() => avancarFaseCliente(c, 'Petição Inicial')}
                  disabled={!docsCompletos}
                  title={docsCompletos ? 'Avançar para Petição Inicial' : 'Marque os documentos obrigatórios primeiro'}
                  style={{ padding: '5px 10px', background: docsCompletos ? NAVY : '#e5e7eb', color: docsCompletos ? GOLD : '#9ca3af', border: `1px solid ${docsCompletos ? GOLD : '#e5e7eb'}`, borderRadius: 6, cursor: docsCompletos ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 600 }}
                >
                  ▶ Avançar p/ Petição
                </button>
              )}
              {c.fase_jornada === 'Petição Inicial' && (
                <button onClick={() => avancarFaseCliente(c, 'Protocolo')} style={{ padding: '5px 10px', background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  ▶ Avançar p/ Protocolo
                </button>
              )}
              {c.fase_jornada === 'Protocolo' && (
                <button onClick={() => avancarFaseCliente(c, 'Acompanhamento')} style={{ padding: '5px 10px', background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  ▶ Avançar p/ Acompanhamento
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Card de cliente em Acompanhamento (Fase 4)
  const renderClienteAcompanhamento = (c: Cliente) => {
    const ultMov = ultimaMovDoCliente(c.id)
    const movs = movimentacoesDoCliente(c.id)
    return (
      <div key={c.id} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 10, borderLeft: `4px solid #0d9488` }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Initials nome={c.nome} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{c.nome}</span>
              {c.numero_processo && <span style={{ fontSize: 11, background: '#ccfbf1', color: '#134e4a', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>📋 {c.numero_processo}</span>}
              {c.area && <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', padding: '2px 7px', borderRadius: 10 }}>{c.area}</span>}
              <span style={{ fontSize: 10, color: '#6b7280' }}>{movs.length} movimentações</span>
            </div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>{c.assunto}</div>
            {c.vara_comarca && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>🏛️ {c.vara_comarca}</div>}
            {c.data_protocolo && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Protocolada em {formatarData(c.data_protocolo)}</div>}
            {ultMov && (
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 8, borderLeft: `3px solid ${ultMov.prioridade === 'critica' ? '#dc2626' : ultMov.prioridade === 'conclusao' ? '#0d9488' : '#9ca3af'}` }}>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>
                  ÚLTIMA MOVIMENTAÇÃO · {ultMov.tipo} · {formatarData(ultMov.data)}
                  {ultMov.prioridade === 'critica' && <strong style={{ color: '#dc2626', marginLeft: 6 }}>· 🔴 CRÍTICA</strong>}
                </div>
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.4 }}>{ultMov.texto}</div>
                {ultMov.prazo_resposta && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: 600 }}>⚠️ Prazo: {formatarData(ultMov.prazo_resposta)}</div>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => abrirNovaMov(c)} style={{ padding: '5px 10px', background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>+ Movimentação</button>
              <button onClick={() => abrirEditarCliente(c)} style={{ padding: '5px 10px', background: '#fff', color: NAVY, border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>Editar</button>
              {c.wa && <a href={`https://wa.me/${c.wa.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#16a34a', color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>↗ WhatsApp</a>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ====== Estatísticas Clientes ======
  const clientesPorFase = useMemo(() => {
    const m: Record<string, Cliente[]> = { 'Documentação': [], 'Petição Inicial': [], 'Protocolo': [], 'Acompanhamento': [] }
    clientes.forEach(c => {
      const f = c.fase_jornada || 'Documentação'
      if (m[f]) m[f].push(c)
    })
    return m
  }, [clientes])

  const clientesFase1a3 = clientes.filter(c => c.fase_jornada !== 'Acompanhamento')
  const clientesFase4 = clientes.filter(c => c.fase_jornada === 'Acompanhamento')

  // Alertas para o dashboard de clientes
  const clientesComPrazoVencendo = useMemo(() => {
    return clientes.filter(c => {
      const st = getStatusPrazoCliente(c)
      return st !== null
    })
  }, [clientes])


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
        .clientes-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        @media (max-width: 1024px) {
          .dash-grid, .agenda-grid, .clientes-grid { grid-template-columns: 1fr; }
        }
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
          .clientes-grid { grid-template-columns: 1fr; }
        }
        .topbar { display: none; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 12px 0 0; }
        .agenda-card { background: #fff; border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
        .agenda-item { padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
        .agenda-item:last-child { border-bottom: none; }
        .status-chip { background: #fff; padding: 8px 10px; border-radius: 8px; border: 1px solid #e5e7eb; cursor: pointer; font-size: 11px; display: flex; justify-content: space-between; align-items: center; gap: 6px; }
        .status-chip:hover { border-color: ${GOLD}; background: #fffbeb; }
        .status-chip.active { background: ${NAVY}; color: ${GOLD}; border-color: ${GOLD}; }
        .tabela-wrap { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
        .subaba-btn { padding: 8px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer; font-size: 13px; color: ${NAVY}; font-weight: 500; }
        .subaba-btn.active { background: ${NAVY}; color: ${GOLD}; border-color: ${GOLD}; font-weight: 600; }
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
                {aba === 'dashboard' ? 'Dashboard' : aba === 'leads' ? 'Leads' : aba === 'tabela' ? 'Tabela' : aba === 'funil' ? 'Funil' : aba === 'historico' ? 'Histórico' : 'Clientes'}
              </h1>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '3px 0 0' }}>
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <button onClick={abrirNovo} style={{ background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>+ Novo lead</button>
          </div>

          {erroGlobal && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>{erroGlobal}</div>}
          {loading && <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>Carregando...</div>}


          {/* ============== DASHBOARD ============== */}
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
                  {clientesComPrazoVencendo.length > 0 && (
                    <div className="agenda-card">
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0d9488', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>⚖️ Prazos de clientes</div>
                      {clientesComPrazoVencendo.slice(0, 4).map(c => {
                        const st = getStatusPrazoCliente(c)
                        return (
                          <div key={c.id} className="agenda-item" onClick={() => { setAba('clientes'); abrirEditarCliente(c) }} style={{ cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                                <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.fase_jornada}</div>
                              </div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: st?.cor || '#6b7280', whiteSpace: 'nowrap' }}>
                                {st?.vencido ? 'VENCIDO' : 'PRAZO'}
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
                  { label: 'Leads ativos', val: ativos, cor: NAVY, sub: premiumCount > 0 ? `${premiumCount} premium 💎` : (leadsUrgentes.length > 0 ? `${leadsUrgentes.length} requerem atenção` : 'Tudo em dia') },
                  { label: 'Propostas enviadas', val: propostasEnviadas, cor: '#f59e0b', sub: 'aguardando retorno' },
                  { label: 'Contratos no mês', val: contratosMes, cor: GOLD, sub: `vs ${contratosMesAnt} no mês anterior` },
                  { label: 'Clientes ativos', val: clientesFase1a3.length, cor: '#0d9488', sub: `${clientesFase4.length} em acompanhamento` },
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
                  📄 <strong>{propostasSemResposta.length} proposta(s)</strong> sem resposta há 3+ dias: {propostasSemResposta.slice(0, 4).map(l => l.nome).join(', ')}{propostasSemResposta.length > 4 ? ` e mais ${propostasSemResposta.length - 4}` : ''}
                </div>
              )}
              {leadsLimiteRmkt.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
                  ⚠️ <strong>{leadsLimiteRmkt.length} lead(s)</strong> no 3º Rmkt: {leadsLimiteRmkt.slice(0, 4).map(l => l.nome).join(', ')}{leadsLimiteRmkt.length > 4 ? ` e mais ${leadsLimiteRmkt.length - 4}` : ''}
                </div>
              )}

              {statusCounts.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 10, borderBottom: `2px solid ${GOLD}`, paddingBottom: 8, display: 'inline-block' }}>💭 Por status</div>
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
                    <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>✅ Tudo em dia.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {leadsUrgentes.slice(0, 8).map(u => renderLeadCard(u.lead, { motivoUrgencia: u.motivo, corUrgencia: u.cor }))}
                      {leadsUrgentes.length > 8 && <div style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', padding: 8 }}>+ {leadsUrgentes.length - 8} lead(s)</div>}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 10, borderBottom: `2px solid ${GOLD}`, paddingBottom: 8, display: 'inline-block' }}>Última atividade</div>
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
                    {leadsVisiveis.length === 0 ? <div style={{ fontSize: 12, color: '#9ca3af' }}>Sem dados.</div> : barChart(c.campo)}
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* ============== LEADS ============== */}
          {!loading && aba === 'leads' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
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
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', fontSize: 13, color: NAVY, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={mostrarArquivados} onChange={e => setMostrarArquivados(e.target.checked)} />
                  📁 Arquivados ({arquivadosCount})
                </label>
              </div>
              {(filtroFase || filtroTemp || filtroStatus || filtroContatos || filtroPremium || busca) && (
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                  Mostrando {leadsFiltrados.length} de {leadsVisiveis.length} leads · <button onClick={() => { setFiltroFase(''); setFiltroTemp(''); setFiltroStatus(''); setFiltroContatos(''); setFiltroPremium(false); setBusca('') }} style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', textDecoration: 'underline', fontSize: 12, padding: 0 }}>Limpar filtros</button>
                </div>
              )}
              {leadsFiltrados.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>Nenhum lead encontrado.</div>
              ) : leadsFiltrados.map(l => renderLeadCard(l))}
            </div>
          )}

          {/* ============== TABELA ============== */}
          {!loading && aba === 'tabela' && (
            <div>
              <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: NAVY, cursor: 'pointer' }}>
                  <input type="checkbox" checked={mostrarArquivados} onChange={e => setMostrarArquivados(e.target.checked)} />
                  📁 Mostrar arquivados ({arquivadosCount})
                </label>
              </div>
              <TabelaExcel
                leads={leadsVisiveis}
                abrirEditar={abrirEditar}
                formatarData={formatarData}
                formatarDataRelativa={formatarDataRelativa}
                corContato={corContato}
                FASE_CORES={FASE_CORES}
                NAVY={NAVY}
                GOLD={GOLD}
              />
            </div>
          )}

          {/* ============== FUNIL ============== */}
          {!loading && aba === 'funil' && (
            <div className="funil-grid">
              {FASES.map(fase => {
                const grupo = leadsVisiveis.filter(l => l.fase === fase)
                const fc = FASE_CORES[fase] || { bg: '#f3f4f6', color: '#6b7280', semaforo: '#9ca3af' }
                return (
                  <div key={fase} style={{ background: '#fff', borderRadius: 12, padding: 12, minHeight: 120, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${fc.semaforo}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: fc.color, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{fase} ({grupo.length})</div>
                    {grupo.map(l => {
                      const cc = corContato(l.contatos)
                      return (
                        <div key={l.id} onClick={() => abrirEditar(l)} style={{ background: cc.bg, borderRadius: 8, padding: '8px 10px', marginBottom: 6, cursor: 'pointer', borderLeft: `3px solid ${l.lead_premium ? GOLD : (TEMP_COR[l.temp || ''] || '#e5e7eb')}`, border: `1px solid ${cc.border}` }}>
                          <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.lead_premium && '💎 '}{l.nome}</p>
                          <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.assunto}</p>
                          <div style={{ marginBottom: 4 }}><TagContatos c={l.contatos} /></div>
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
              {leadsVisiveis.some(l => !l.fase) && (
                <div style={{ background: '#fff', borderRadius: 12, padding: 12, minHeight: 120, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid #9ca3af`, gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>⚠️ Sem fase atribuída ({leadsVisiveis.filter(l => !l.fase).length}) — clique para classificar</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 6 }}>
                    {leadsVisiveis.filter(l => !l.fase).map(l => {
                      const cc = corContato(l.contatos)
                      return (
                        <div key={l.id} onClick={() => abrirEditar(l)} style={{ background: cc.bg, borderRadius: 8, padding: '8px 10px', cursor: 'pointer', borderLeft: `3px solid ${l.lead_premium ? GOLD : (TEMP_COR[l.temp || ''] || '#e5e7eb')}`, border: `1px solid ${cc.border}` }}>
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

          {/* ============== HISTÓRICO ============== */}
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


          {/* ============== CLIENTES ============== */}
          {!loading && aba === 'clientes' && (
            <div>
              {/* Sub-abas: Jornada (1-3) vs Acompanhamento (4) */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <button className={`subaba-btn ${subAbaCli === 'jornada' ? 'active' : ''}`} onClick={() => setSubAbaCli('jornada')}>
                  📋 Jornada do Cliente <span style={{ fontSize: 11, opacity: 0.8 }}>({clientesFase1a3.length})</span>
                </button>
                <button className={`subaba-btn ${subAbaCli === 'acompanhamento' ? 'active' : ''}`} onClick={() => setSubAbaCli('acompanhamento')}>
                  ⚖️ Acompanhamento de processos <span style={{ fontSize: 11, opacity: 0.8 }}>({clientesFase4.length})</span>
                </button>
              </div>

              {/* JORNADA: 3 colunas com fases 1, 2 e 3 */}
              {subAbaCli === 'jornada' && (
                <div>
                  {clientesFase1a3.length === 0 ? (
                    <div style={{ background: '#fff', borderRadius: 12, padding: 48, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                      <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Nenhum cliente em jornada ativa.</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>Quando um lead virar "Contrato Assinado", ele aparecerá aqui automaticamente.</div>
                    </div>
                  ) : (
                    <div className="clientes-grid">
                      {(['Documentação', 'Petição Inicial', 'Protocolo'] as const).map(fase => {
                        const fcj = FASE_JORNADA_CORES[fase]
                        const grupo = clientesPorFase[fase] || []
                        return (
                          <div key={fase}>
                            <div style={{ background: '#fff', borderRadius: 12, padding: '10px 14px', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderTop: `3px solid ${fcj.semaforo}` }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: fcj.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                {fase} <span style={{ color: '#9ca3af', fontWeight: 500 }}>({grupo.length})</span>
                              </div>
                            </div>
                            {grupo.length === 0 ? (
                              <div style={{ background: '#fff', borderRadius: 12, padding: 24, textAlign: 'center', color: '#d1d5db', fontSize: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>Vazio</div>
                            ) : grupo.map(c => renderClienteCard(c))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ACOMPANHAMENTO: fase 4 (lista) */}
              {subAbaCli === 'acompanhamento' && (
                <div>
                  {clientesFase4.length === 0 ? (
                    <div style={{ background: '#fff', borderRadius: 12, padding: 48, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                      <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Nenhum processo em acompanhamento ainda.</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>Avance um cliente da fase "Protocolo" para "Acompanhamento" e ele aparecerá aqui.</div>
                    </div>
                  ) : (
                    <div>
                      {clientesFase4.map(c => renderClienteAcompanhamento(c))}
                    </div>
                  )}
                </div>
              )}
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


      {/* ============== MODAL LEAD ============== */}
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
              ].map(f => (
                <div key={f.key} style={f.full ? { gridColumn: '1 / -1' } : {}}>
                  <label style={lbl}>{f.label}</label>
                  <input value={(form as any)[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inp} />
                </div>
              ))}

              {/* WhatsApp com sugestão de DDD */}
              <div>
                <label style={lbl}>WhatsApp</label>
                <input value={form.wa || ''} onChange={e => setForm(p => ({ ...p, wa: e.target.value }))} placeholder="+55 94 99999-0000" style={inp} />
                {(() => {
                  const sugestao = sugestaoCidadePorDDD(form.wa || '')
                  return sugestao ? (
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      📍 DDD {sugestao.ddd} · <span>{sugestao.regiao}</span>
                      {!form.cidade && (
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, cidade: sugestao.cidadeSugerida }))}
                          style={{ background: 'none', border: 'none', color: GOLD, fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontWeight: 600 }}
                        >
                          usar "{sugestao.cidadeSugerida}"
                        </button>
                      )}
                    </div>
                  ) : null
                })()}
              </div>

              {[
                { label: 'E-mail', key: 'email', placeholder: 'email@...' },
                { label: 'Cidade', key: 'cidade', placeholder: 'Ex: Parauapebas/PA' },
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

      {/* ============== MODAL HISTÓRICO ============== */}
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


      {/* ============== MODAL CLIENTE ============== */}
      {modalCliente && formCli && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 700, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 14, borderBottom: `2px solid ${GOLD}` }}>
              <div style={{ width: 4, height: 20, background: GOLD, borderRadius: 4 }} />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: NAVY }}>Editar cliente</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Nome *</label>
                <input value={formCli.nome} onChange={e => setFormCli(p => p ? { ...p, nome: e.target.value } : p)} style={inp} />
              </div>
              <div>
                <label style={lbl}>WhatsApp</label>
                <input value={formCli.wa || ''} onChange={e => setFormCli(p => p ? { ...p, wa: e.target.value } : p)} style={inp} />
              </div>
              <div>
                <label style={lbl}>E-mail</label>
                <input value={formCli.email || ''} onChange={e => setFormCli(p => p ? { ...p, email: e.target.value } : p)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Área jurídica</label>
                <select value={formCli.area || ''} onChange={e => setFormCli(p => p ? { ...p, area: e.target.value } : p)} style={inp}>
                  <option value="">— selecione —</option>
                  {AREAS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Fase atual</label>
                <select value={formCli.fase_jornada || ''} onChange={e => setFormCli(p => p ? { ...p, fase_jornada: e.target.value } : p)} style={inp}>
                  {FASES_JORNADA.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Assunto / Caso *</label>
                <input value={formCli.assunto} onChange={e => setFormCli(p => p ? { ...p, assunto: e.target.value } : p)} style={inp} />
              </div>

              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>📋 Documentação</div>
              </div>

              {formCli.area === 'Bancário / Consignado' ? (
                <div style={{ gridColumn: '1 / -1', background: '#f9fafb', padding: 10, borderRadius: 8 }}>
                  {DOCS_CONSIGNADO.map(d => (
                    <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!(formCli as any)[d.key]}
                        onChange={e => setFormCli(p => p ? { ...p, [d.key]: e.target.checked } : p)}
                      />
                      {d.label} {!d.obrigatorio && <span style={{ fontSize: 10, color: '#9ca3af' }}>(opcional)</span>}
                    </label>
                  ))}
                </div>
              ) : null}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Documentos adicionais / lista para outras áreas</label>
                <textarea value={formCli.doc_outros || ''} onChange={e => setFormCli(p => p ? { ...p, doc_outros: e.target.value } : p)} placeholder="Ex: RG, CPF, certidão de casamento..." style={{ ...inp, resize: 'vertical', minHeight: 60 }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Observações da documentação</label>
                <textarea value={formCli.doc_observacoes || ''} onChange={e => setFormCli(p => p ? { ...p, doc_observacoes: e.target.value } : p)} placeholder="O que falta, status, etc." style={{ ...inp, resize: 'vertical', minHeight: 50 }} />
              </div>

              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>⚖️ Datas e prazos</div>
              </div>

              <div>
                <label style={lbl}>Início petição</label>
                <input type="date" value={formCli.data_inicio_peticao || ''} onChange={e => setFormCli(p => p ? { ...p, data_inicio_peticao: e.target.value } : p)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Fim petição</label>
                <input type="date" value={formCli.data_fim_peticao || ''} onChange={e => setFormCli(p => p ? { ...p, data_fim_peticao: e.target.value } : p)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Data do protocolo</label>
                <input type="date" value={formCli.data_protocolo || ''} onChange={e => setFormCli(p => p ? { ...p, data_protocolo: e.target.value } : p)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Prazo petição (dias úteis)</label>
                <input type="number" min={1} max={30} value={formCli.prazo_peticao_dias ?? 5} onChange={e => setFormCli(p => p ? { ...p, prazo_peticao_dias: parseInt(e.target.value) || 5 } : p)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Prazo protocolo (dias úteis)</label>
                <input type="number" min={1} max={30} value={formCli.prazo_protocolo_dias ?? 2} onChange={e => setFormCli(p => p ? { ...p, prazo_protocolo_dias: parseInt(e.target.value) || 2 } : p)} style={inp} />
              </div>

              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>🏛️ Processo (após protocolo)</div>
              </div>

              <div>
                <label style={lbl}>Número do processo</label>
                <input value={formCli.numero_processo || ''} onChange={e => setFormCli(p => p ? { ...p, numero_processo: e.target.value } : p)} placeholder="0000000-00.0000.0.00.0000" style={inp} />
              </div>
              <div>
                <label style={lbl}>Vara / Comarca</label>
                <input value={formCli.vara_comarca || ''} onChange={e => setFormCli(p => p ? { ...p, vara_comarca: e.target.value } : p)} placeholder="Ex: 2ª Vara Cível de Parauapebas" style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Observações gerais</label>
                <textarea value={formCli.obs || ''} onChange={e => setFormCli(p => p ? { ...p, obs: e.target.value } : p)} style={{ ...inp, resize: 'vertical', minHeight: 60 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setModalCliente(false); setFormCli(null) }} style={{ flex: 1, padding: '12px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarCliente} style={{ flex: 2, padding: '12px', fontSize: 14, background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Salvar cliente</button>
            </div>
          </div>
        </div>
      )}

      {/* ============== MODAL MOVIMENTAÇÃO ============== */}
      {modalMov && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 14, borderBottom: `2px solid ${GOLD}` }}>
              <div style={{ width: 4, height: 20, background: GOLD, borderRadius: 4 }} />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: NAVY }}>Nova movimentação{clienteAtivoMov ? ` · ${clienteAtivoMov.nome}` : ''}</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Tipo</label>
                <select value={movForm.tipo || 'Andamento'} onChange={e => setMovForm(p => ({ ...p, tipo: e.target.value }))} style={inp}>
                  {TIPOS_MOVIMENTACAO.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Prioridade</label>
                <select value={movForm.prioridade || 'normal'} onChange={e => setMovForm(p => ({ ...p, prioridade: e.target.value }))} style={inp}>
                  <option value="critica">🔴 Crítica</option>
                  <option value="normal">⚪ Normal</option>
                  <option value="conclusao">🟢 Conclusão</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Data</label>
                <input type="date" value={movForm.data || ''} onChange={e => setMovForm(p => ({ ...p, data: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Prazo de resposta (opcional)</label>
                <input type="date" value={movForm.prazo_resposta || ''} onChange={e => setMovForm(p => ({ ...p, prazo_resposta: e.target.value }))} style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Descrição *</label>
                <textarea value={movForm.texto || ''} onChange={e => setMovForm(p => ({ ...p, texto: e.target.value }))} placeholder="Descreva a movimentação..." style={{ ...inp, resize: 'vertical', minHeight: 100 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setModalMov(false); setMovForm({}); setClienteAtivoMov(null) }} style={{ flex: 1, padding: '12px', fontSize: 14, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarMov} style={{ flex: 2, padding: '12px', fontSize: 14, background: NAVY, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

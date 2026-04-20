import React, { useState, useEffect } from 'react'
import { supabase } from './config/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { Plus, X, Edit2, Save, Search, Bell, ArrowLeft, Clock } from 'lucide-react'

const COLORES = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

const ESTATUS_COLORES = {
  'nuevo': 'bg-blue-100 text-blue-800',
  'en seguimiento': 'bg-yellow-100 text-yellow-800',
  'cerrado': 'bg-green-100 text-green-800',
  'perdido': 'bg-red-100 text-red-800'
}

const PROBABILIDAD_COLORES = {
  'alta': 'bg-green-100 text-green-800',
  'media': 'bg-yellow-100 text-yellow-800',
  'baja': 'bg-red-100 text-red-800'
}

function getSemaforo(updated_at) {
  if (!updated_at) return { color: 'bg-gray-300', label: 'Sin fecha', emoji: '⚪' }
  const dias = Math.floor((new Date() - new Date(updated_at)) / (1000 * 60 * 60 * 24))
  if (dias > 31) return { color: 'bg-blue-500', label: `${dias}d — Seguimiento mensual`, emoji: '🔵' }
  if (dias >= 15) return { color: 'bg-red-500', label: `${dias}d — Alerta urgente`, emoji: '🔴' }
  if (dias >= 7) return { color: 'bg-yellow-400', label: `${dias}d — Hay que escribirle`, emoji: '🟡' }
  return { color: 'bg-green-500', label: `${dias}d — Al día`, emoji: '🟢' }
}

const COLUMNAS = [
  { key: 'nuevo', label: 'Nuevo', color: 'border-blue-400', header: 'bg-blue-50' },
  { key: 'en seguimiento', label: 'En Seguimiento', color: 'border-yellow-400', header: 'bg-yellow-50' },
  { key: 'cerrado', label: 'Cerrado', color: 'border-green-400', header: 'bg-green-50' },
  { key: 'perdido', label: 'Perdido', color: 'border-red-400', header: 'bg-red-50' },
]

const clienteVacio = {
  nombre: '', telefono: '', correo: '', tiene_infonavit: false, tiene_terreno: false,
  ubicacion_terreno: '', fuente: '', tipo_interes: '', probabilidad_cierre: '',
  estatus: 'nuevo', asesor: '', proxima_accion: '', fecha_proximo_contacto: '', notas: ''
}

export default function App() {
  const [vista, setVista] = useState('dashboard')
  const [clientes, setClientes] = useState([])
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [clienteEditando, setClienteEditando] = useState(null)
  const [form, setForm] = useState(clienteVacio)
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [mostrarAlertas, setMostrarAlertas] = useState(false)
  const [filtroEstatus, setFiltroEstatus] = useState('')
  const [filtroFuente, setFiltroFuente] = useState('')
  const [filtroProbabilidad, setFiltroProbabilidad] = useState('')
  const [columnaActiva, setColumnaActiva] = useState('nuevo')
  const [clienteDetalle, setClienteDetalle] = useState(null)
  const [actividades, setActividades] = useState([])
  const [nuevaNota, setNuevaNota] = useState('')
  const [guardandoNota, setGuardandoNota] = useState(false)

  useEffect(() => {
    cargarClientes()
    const canal = supabase
      .channel('clientes-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => {
        cargarClientes()
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [])

  async function cargarClientes() {
    setCargando(true)
    const { data } = await supabase.from('clientes').select('*').order('created_at', { ascending: false })
    setClientes(data || [])
    setCargando(false)
  }

  async function guardarCliente() {
    if (!form.nombre) return alert('El nombre es obligatorio')
    if (clienteEditando) {
      await supabase.from('clientes').update(form).eq('id', clienteEditando)
    } else {
      await supabase.from('clientes').insert([form])
    }
    setMostrarFormulario(false)
    setClienteEditando(null)
    setForm(clienteVacio)
    cargarClientes()
  }

  async function eliminarCliente(id) {
    if (!window.confirm('¿Eliminar este cliente?')) return
    await supabase.from('clientes').delete().eq('id', id)
    cargarClientes()
  }

  async function cambiarEstatus(id, nuevoEstatus) {
    await supabase.from('clientes').update({ estatus: nuevoEstatus }).eq('id', id)
    cargarClientes()
  }

  function editarCliente(cliente) {
    setForm(cliente)
    setClienteEditando(cliente.id)
    setMostrarFormulario(true)
  }

  async function abrirDetalle(cliente) {
    setClienteDetalle(cliente)
    setVista('detalle')
    await cargarActividades(cliente.id)
  }

  async function cargarActividades(clienteId) {
    const { data } = await supabase
      .from('actividades')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
    setActividades(data || [])
  }

  async function agregarNota() {
    if (!nuevaNota.trim() || !clienteDetalle) return
    setGuardandoNota(true)
    await supabase.from('actividades').insert([{ cliente_id: clienteDetalle.id, nota: nuevaNota.trim() }])
    setNuevaNota('')
    await cargarActividades(clienteDetalle.id)
    setGuardandoNota(false)
  }

  async function eliminarActividad(id) {
    await supabase.from('actividades').delete().eq('id', id)
    if (clienteDetalle) await cargarActividades(clienteDetalle.id)
  }

  const vencidos = clientes.filter(c => {
    if (!c.fecha_proximo_contacto) return false
    return new Date(c.fecha_proximo_contacto) < new Date() && c.estatus !== 'cerrado' && c.estatus !== 'perdido'
  })

  const clientesFiltrados = clientes.filter(c => {
    const texto = busqueda.toLowerCase()
    const coincideTexto = !busqueda ||
      c.nombre?.toLowerCase().includes(texto) ||
      c.telefono?.toLowerCase().includes(texto) ||
      c.correo?.toLowerCase().includes(texto)
    const coincideEstatus = !filtroEstatus || c.estatus === filtroEstatus
    const coincideFuente = !filtroFuente || c.fuente === filtroFuente
    const coincideProbabilidad = !filtroProbabilidad || c.probabilidad_cierre === filtroProbabilidad
    return coincideTexto && coincideEstatus && coincideFuente && coincideProbabilidad
  })

  const porEstatus = ['nuevo', 'en seguimiento', 'cerrado', 'perdido'].map(e => ({
    name: e, value: clientes.filter(c => c.estatus === e).length
  })).filter(e => e.value > 0)

  const porFuente = [...new Set(clientes.map(c => c.fuente).filter(Boolean))].map(f => ({
    name: f, value: clientes.filter(c => c.fuente === f).length
  }))

  const porMes = () => {
    const meses = {}
    clientes.forEach(c => {
      if (c.fecha_llegada) {
        const mes = c.fecha_llegada.slice(0, 7)
        meses[mes] = (meses[mes] || 0) + 1
      }
    })
    return Object.entries(meses).map(([mes, total]) => ({ mes, total })).slice(-6)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-brand-dark text-white px-4 py-3 shadow sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.jpeg" alt="MC Arquitectos" className="w-9 h-9 rounded-full object-cover border-2 border-brand-gold" />
            <div>
              <h1 className="text-sm font-bold leading-tight text-brand-gold">MC Arquitectos</h1>
              <p className="text-gray-300 text-xs">{clientes.length} clientes</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setVista('dashboard')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${vista === 'dashboard' ? 'bg-brand-gold text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
              Dashboard
            </button>
            <button onClick={() => setVista('clientes')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${vista === 'clientes' ? 'bg-brand-gold text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
              Clientes
            </button>
            <button onClick={() => setVista('kanban')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${vista === 'kanban' ? 'bg-brand-gold text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
              Pipeline
            </button>
            <button onClick={() => setMostrarAlertas(v => !v)} className="relative ml-1 p-1.5 rounded-lg hover:bg-gray-700">
              <Bell size={16} className="text-gray-300" />
              {vencidos.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {vencidos.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Panel de alertas */}
      {mostrarAlertas && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-3">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-bold text-red-700">🔔 Seguimientos vencidos ({vencidos.length})</h3>
              <button onClick={() => setMostrarAlertas(false)} className="text-red-400"><X size={16} /></button>
            </div>
            {vencidos.length === 0 ? (
              <p className="text-sm text-green-600">✅ Todo al día, sin seguimientos vencidos</p>
            ) : (
              <div className="space-y-1">
                {vencidos.map(c => (
                  <div key={c.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-100">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{c.nombre}</span>
                      <span className="text-xs text-red-500 ml-2">Vencido: {c.fecha_proximo_contacto}</span>
                    </div>
                    <button onClick={() => editarCliente(c)} className="text-brand-gold text-xs">Actualizar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* DASHBOARD */}
        {vista === 'dashboard' && (
          <div>
            {vencidos.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <h3 className="text-sm font-bold text-red-700 mb-3">🔔 Seguimientos vencidos — {vencidos.length} cliente(s)</h3>
                <div className="space-y-2">
                  {vencidos.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-100">
                      <div>
                        <span className="text-sm font-medium text-gray-800">{c.nombre}</span>
                        <span className="text-xs text-red-500 ml-2">📅 {c.fecha_proximo_contacto}</span>
                        {c.proxima_accion && <span className="text-xs text-gray-400 ml-2">— {c.proxima_accion}</span>}
                      </div>
                      <button onClick={() => editarCliente(c)} className="text-xs bg-brand-gold text-white px-2 py-1 rounded-lg">Actualizar</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Total Leads', value: clientes.length },
                { label: 'Nuevos', value: clientes.filter(c => c.estatus === 'nuevo').length },
                { label: 'Seguimiento', value: clientes.filter(c => c.estatus === 'en seguimiento').length },
                { label: 'Cerrados', value: clientes.filter(c => c.estatus === 'cerrado').length },
              ].map((t, i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <p className="text-gray-500 text-xs">{t.label}</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">{t.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-700 mb-3 text-sm">Leads por mes</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={porMes()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#B8892A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-700 mb-3 text-sm">Leads por estatus</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={porEstatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                      {porEstatus.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-3 text-sm">Leads por fuente</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={porFuente} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#454852" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* CLIENTES */}
        {vista === 'clientes' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Clientes</h2>
              <button onClick={() => { setForm(clienteVacio); setClienteEditando(null); setMostrarFormulario(true) }}
                className="flex items-center gap-1.5 bg-brand-gold text-white px-3 py-2 rounded-lg hover:bg-yellow-700 text-sm font-medium">
                <Plus size={15} /> Nuevo
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                <input type="text" placeholder="Buscar por nombre, teléfono..." value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              </div>
              <select value={filtroEstatus} onChange={e => setFiltroEstatus(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
                <option value="">Todos los estatus</option>
                {['nuevo', 'en seguimiento', 'cerrado', 'perdido'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={filtroFuente} onChange={e => setFiltroFuente(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
                <option value="">Todas las fuentes</option>
                {['Facebook', 'WhatsApp', 'Instagram', 'Recomendación', 'Otro'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={filtroProbabilidad} onChange={e => setFiltroProbabilidad(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
                <option value="">Toda probabilidad</option>
                {['alta', 'media', 'baja'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-400 mb-3">{clientesFiltrados.length} resultado(s)</p>

            {cargando ? (
              <div className="text-center py-20 text-gray-400">Cargando...</div>
            ) : clientesFiltrados.length === 0 ? (
              <div className="text-center py-20 text-gray-400">No hay clientes que coincidan</div>
            ) : (
              <>
                <div className="md:hidden space-y-3">
                  {clientesFiltrados.map(c => (
                    <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <button onClick={() => abrirDetalle(c)} className="font-semibold text-gray-800 hover:text-brand-gold text-left">{c.nombre}</button>
                          <p className="text-sm text-gray-500">{c.telefono}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => editarCliente(c)} className="text-brand-gold"><Edit2 size={15} /></button>
                          <button onClick={() => eliminarCliente(c.id)} className="text-red-400"><X size={15} /></button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTATUS_COLORES[c.estatus] || ''}`}>{c.estatus}</span>
                        {c.probabilidad_cierre && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PROBABILIDAD_COLORES[c.probabilidad_cierre] || ''}`}>{c.probabilidad_cierre}</span>}
                        {c.fuente && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{c.fuente}</span>}
                      </div>
                      {c.proxima_accion && <p className="text-xs text-gray-500 mt-2">📋 {c.proxima_accion}</p>}
                    </div>
                  ))}
                </div>

                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['Nombre', 'Teléfono', 'Fuente', 'Tipo', 'Probabilidad', 'Estatus', 'Asesor', 'Acciones'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {clientesFiltrados.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3"><button onClick={() => abrirDetalle(c)} className="font-medium text-gray-800 hover:text-brand-gold text-left">{c.nombre}</button></td>
                          <td className="px-4 py-3 text-gray-500">{c.telefono}</td>
                          <td className="px-4 py-3 text-gray-500">{c.fuente}</td>
                          <td className="px-4 py-3 text-gray-500">{c.tipo_interes}</td>
                          <td className="px-4 py-3">
                            {c.probabilidad_cierre && (
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${PROBABILIDAD_COLORES[c.probabilidad_cierre] || ''}`}>
                                {c.probabilidad_cierre}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${ESTATUS_COLORES[c.estatus] || ''}`}>
                              {c.estatus}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{c.asesor}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button onClick={() => editarCliente(c)} className="text-brand-gold hover:text-yellow-700"><Edit2 size={15} /></button>
                              <button onClick={() => eliminarCliente(c.id)} className="text-red-400 hover:text-red-600"><X size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* DETALLE DEL CLIENTE */}
        {vista === 'detalle' && clienteDetalle && (
          <div>
            <button onClick={() => setVista('clientes')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
              <ArrowLeft size={16} /> Volver a Clientes
            </button>

            {/* Info del cliente */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{clienteDetalle.nombre}</h2>
                  <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                    {clienteDetalle.telefono && <span>📞 {clienteDetalle.telefono}</span>}
                    {clienteDetalle.correo && <span>📧 {clienteDetalle.correo}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {clienteDetalle.asesor && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">👤 {clienteDetalle.asesor}</span>}
                    {clienteDetalle.fuente && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">📌 {clienteDetalle.fuente}</span>}
                    {clienteDetalle.tipo_interes && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">🏗 {clienteDetalle.tipo_interes}</span>}
                    {clienteDetalle.estatus && <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTATUS_COLORES[clienteDetalle.estatus] || ''}`}>{clienteDetalle.estatus}</span>}
                    {clienteDetalle.probabilidad_cierre && <span className={`text-xs px-2 py-1 rounded-full font-medium ${PROBABILIDAD_COLORES[clienteDetalle.probabilidad_cierre] || ''}`}>{clienteDetalle.probabilidad_cierre}</span>}
                  </div>
                  {clienteDetalle.proxima_accion && <p className="text-xs text-gray-400 mt-2">📋 {clienteDetalle.proxima_accion}</p>}
                  {clienteDetalle.fecha_proximo_contacto && <p className="text-xs text-gray-400 mt-1">📅 Próximo contacto: {clienteDetalle.fecha_proximo_contacto}</p>}
                  {clienteDetalle.notas && <p className="text-sm text-gray-500 mt-2 italic">"{clienteDetalle.notas}"</p>}
                </div>
                <button onClick={() => editarCliente(clienteDetalle)}
                  className="text-brand-gold hover:text-yellow-700 ml-4"><Edit2 size={18} /></button>
              </div>
            </div>

            {/* Agregar nota */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">+ Agregar nota</h3>
              <textarea
                value={nuevaNota}
                onChange={e => setNuevaNota(e.target.value)}
                placeholder="Ej: Le envié cotización, visitó terreno en Cumbres..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-none"
              />
              <div className="flex justify-end mt-2">
                <button onClick={agregarNota} disabled={guardandoNota || !nuevaNota.trim()}
                  className="flex items-center gap-1.5 bg-brand-gold text-white px-4 py-2 rounded-lg hover:bg-yellow-700 text-sm font-medium disabled:opacity-40">
                  <Save size={14} /> {guardandoNota ? 'Guardando...' : 'Guardar nota'}
                </button>
              </div>
            </div>

            {/* Historial */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Historial de actividad</h3>
              {actividades.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Sin actividad registrada todavía</p>
              ) : (
                <div className="space-y-3">
                  {actividades.map(a => (
                    <div key={a.id} className="flex items-start gap-3 border-l-2 border-brand-gold pl-3">
                      <div className="flex-1">
                        <p className="text-sm text-gray-800">{a.nota}</p>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Clock size={11} />
                          {new Date(a.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button onClick={() => eliminarActividad(a.id)} className="text-gray-300 hover:text-red-400 mt-0.5"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* KANBAN / PIPELINE */}
        {vista === 'kanban' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Pipeline</h2>
              <button onClick={() => { setForm(clienteVacio); setClienteEditando(null); setMostrarFormulario(true) }}
                className="flex items-center gap-1.5 bg-brand-gold text-white px-3 py-2 rounded-lg hover:bg-yellow-700 text-sm font-medium">
                <Plus size={15} /> Nuevo
              </button>
            </div>

            {/* Pestañas móvil */}
            <div className="md:hidden flex gap-1 mb-4 bg-white rounded-xl p-1 shadow-sm border border-gray-100 overflow-x-auto">
              {COLUMNAS.map(col => (
                <button key={col.key} onClick={() => setColumnaActiva(col.key)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${columnaActiva === col.key ? 'bg-brand-gold text-white' : 'text-gray-500'}`}>
                  {col.label} ({clientes.filter(c => c.estatus === col.key).length})
                </button>
              ))}
            </div>

            {/* Vista móvil - una columna a la vez */}
            <div className="md:hidden space-y-3">
              {clientes.filter(c => c.estatus === columnaActiva).map(c => (
                <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-brand-gold">
                  <div className="flex justify-between items-start mb-2">
                    <button onClick={() => abrirDetalle(c)} className="font-semibold text-gray-800 text-sm hover:text-brand-gold text-left">{c.nombre}</button>
                    <div className="flex gap-2">
                      <button onClick={() => editarCliente(c)} className="text-brand-gold"><Edit2 size={13} /></button>
                      <button onClick={() => eliminarCliente(c.id)} className="text-red-400"><X size={13} /></button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{c.telefono}</p>
                  {c.probabilidad_cierre && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PROBABILIDAD_COLORES[c.probabilidad_cierre] || ''}`}>
                      {c.probabilidad_cierre}
                    </span>
                  )}
                  {(() => { const s = getSemaforo(c.updated_at); return <span className="ml-1 text-xs" title={s.label}>{s.emoji} {s.label}</span> })()}
                  {c.proxima_accion && <p className="text-xs text-gray-400 mt-2">📋 {c.proxima_accion}</p>}
                  <div className="mt-3 flex gap-1 flex-wrap">
                    {COLUMNAS.filter(col => col.key !== c.estatus).map(col => (
                      <button key={col.key} onClick={() => cambiarEstatus(c.id, col.key)}
                        className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600">
                        → {col.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {clientes.filter(c => c.estatus === columnaActiva).length === 0 && (
                <div className="text-center py-10 text-gray-300 text-sm">Sin clientes aquí</div>
              )}
            </div>

            {/* Vista desktop - 4 columnas */}
            <div className="hidden md:grid grid-cols-4 gap-4">
              {COLUMNAS.map(col => (
                <div key={col.key} className={`rounded-xl border-t-4 ${col.color} bg-white shadow-sm`}>
                  <div className={`px-4 py-3 ${col.header} rounded-t-xl flex justify-between items-center`}>
                    <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                    <span className="bg-white text-gray-500 text-xs font-bold px-2 py-0.5 rounded-full">
                      {clientes.filter(c => c.estatus === col.key).length}
                    </span>
                  </div>
                  <div className="p-3 space-y-3 min-h-40">
                    {clientes.filter(c => c.estatus === col.key).map(c => (
                      <div key={c.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100 hover:shadow-sm">
                        <div className="flex justify-between items-start mb-1">
                          <button onClick={() => abrirDetalle(c)} className="font-semibold text-gray-800 text-sm leading-tight hover:text-brand-gold text-left">{c.nombre}</button>
                          <div className="flex gap-1 ml-1">
                            <button onClick={() => editarCliente(c)} className="text-brand-gold hover:text-yellow-700"><Edit2 size={12} /></button>
                            <button onClick={() => eliminarCliente(c.id)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">{c.telefono}</p>
                        {c.fuente && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{c.fuente}</span>}
                        {c.probabilidad_cierre && (
                          <span className={`ml-1 text-xs px-2 py-0.5 rounded-full font-medium ${PROBABILIDAD_COLORES[c.probabilidad_cierre] || ''}`}>
                            {c.probabilidad_cierre}
                          </span>
                        )}
                        {(() => { const s = getSemaforo(c.updated_at); return <p className="text-xs mt-1" title={s.label}>{s.emoji} {s.label}</p> })()}
                        {c.proxima_accion && <p className="text-xs text-gray-400 mt-1">📋 {c.proxima_accion}</p>}
                        <div className="mt-2 flex gap-1 flex-wrap">
                          {COLUMNAS.filter(dest => dest.key !== col.key).map(dest => (
                            <button key={dest.key} onClick={() => cambiarEstatus(c.id, dest.key)}
                              className="text-xs px-2 py-0.5 bg-white border border-gray-200 hover:bg-gray-100 rounded text-gray-500">
                              → {dest.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {clientes.filter(c => c.estatus === col.key).length === 0 && (
                      <div className="text-center py-6 text-gray-300 text-xs">Sin clientes</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL FORMULARIO */}
      {mostrarFormulario && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
              <h3 className="text-base font-bold text-gray-800">{clienteEditando ? 'Editar cliente' : 'Nuevo cliente'}</h3>
              <button onClick={() => setMostrarFormulario(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: 'Nombre *', key: 'nombre', type: 'text' },
                { label: 'Teléfono', key: 'telefono', type: 'text' },
                { label: 'Correo', key: 'correo', type: 'email' },
                { label: 'Ubicación del terreno', key: 'ubicacion_terreno', type: 'text' },
                { label: 'Asesor', key: 'asesor', type: 'text' },
                { label: 'Próxima acción', key: 'proxima_accion', type: 'text' },
                { label: 'Fecha próximo contacto', key: 'fecha_proximo_contacto', type: 'date' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input type={type} value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
              ))}

              {[
                { label: 'Fuente', key: 'fuente', options: ['Facebook', 'WhatsApp', 'Instagram', 'Recomendación', 'Otro'] },
                { label: 'Tipo de interés', key: 'tipo_interes', options: ['Construcción nueva', 'Remodelación', 'Solo informándose', 'Cliente potencial calificado'] },
                { label: 'Probabilidad de cierre', key: 'probabilidad_cierre', options: ['alta', 'media', 'baja'] },
                { label: 'Estatus', key: 'estatus', options: ['nuevo', 'en seguimiento', 'cerrado', 'perdido'] },
              ].map(({ label, key, options }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <select value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
                    <option value="">Seleccionar...</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}

              <div className="col-span-1 md:col-span-2 flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.tiene_infonavit} onChange={e => setForm({ ...form, tiene_infonavit: e.target.checked })}
                    className="w-4 h-4 accent-yellow-600" />
                  Tiene INFONAVIT
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.tiene_terreno} onChange={e => setForm({ ...form, tiene_terreno: e.target.checked })}
                    className="w-4 h-4 accent-yellow-600" />
                  Tiene terreno
                </label>
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <textarea value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setMostrarFormulario(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={guardarCliente}
                className="flex items-center gap-2 bg-brand-gold text-white px-5 py-2 rounded-lg hover:bg-yellow-700 text-sm font-medium">
                <Save size={15} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

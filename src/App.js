import React, { useState, useEffect } from 'react'
import { supabase } from './config/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { Users, Plus, X, Edit2, Save } from 'lucide-react'

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

  useEffect(() => { cargarClientes() }, [])

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

  function editarCliente(cliente) {
    setForm(cliente)
    setClienteEditando(cliente.id)
    setMostrarFormulario(true)
  }

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
      <div className="bg-indigo-700 text-white px-4 py-3 shadow sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-white bg-opacity-20 p-1.5 rounded-lg">
              <Users size={18} />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight">MC Arquitectos CRM</h1>
              <p className="text-indigo-200 text-xs">{clientes.length} clientes</p>
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setVista('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${vista === 'dashboard' ? 'bg-white text-indigo-700' : 'text-white hover:bg-indigo-600'}`}>
              Dashboard
            </button>
            <button onClick={() => setVista('clientes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${vista === 'clientes' ? 'bg-white text-indigo-700' : 'text-white hover:bg-indigo-600'}`}>
              Clientes
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* DASHBOARD */}
        {vista === 'dashboard' && (
          <div>
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
                    <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
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
                  <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
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
                className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium">
                <Plus size={15} /> Nuevo
              </button>
            </div>

            {cargando ? (
              <div className="text-center py-20 text-gray-400">Cargando...</div>
            ) : clientes.length === 0 ? (
              <div className="text-center py-20 text-gray-400">No hay clientes aún</div>
            ) : (
              <>
                {/* Vista móvil - tarjetas */}
                <div className="md:hidden space-y-3">
                  {clientes.map(c => (
                    <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold text-gray-800">{c.nombre}</p>
                          <p className="text-sm text-gray-500">{c.telefono}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => editarCliente(c)} className="text-indigo-500"><Edit2 size={15} /></button>
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

                {/* Vista desktop - tabla */}
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
                      {clientes.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{c.nombre}</td>
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
                              <button onClick={() => editarCliente(c)} className="text-indigo-500 hover:text-indigo-700"><Edit2 size={15} /></button>
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
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
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
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="">Seleccionar...</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}

              <div className="col-span-1 md:col-span-2 flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.tiene_infonavit} onChange={e => setForm({ ...form, tiene_infonavit: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600" />
                  Tiene INFONAVIT
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.tiene_terreno} onChange={e => setForm({ ...form, tiene_terreno: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600" />
                  Tiene terreno
                </label>
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <textarea value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setMostrarFormulario(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={guardarCliente}
                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium">
                <Save size={15} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

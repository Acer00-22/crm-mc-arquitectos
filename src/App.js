import React, { useState, useEffect, useRef } from 'react'
import { supabase } from './config/supabase'
import { Plus, X, Edit2, Save, Search, Bell, ArrowLeft, Clock, Eye, EyeOff, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'

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
]

const clienteVacio = {
  nombre: '', telefono: '', correo: '', oportunidad: '', tiene_infonavit: false, tiene_terreno: false,
  ubicacion_terreno: '', fuente: '', tipo_interes: '', probabilidad_cierre: '',
  estatus: 'nuevo', asesor: '', proxima_accion: '', fecha_proximo_contacto: '', notas: ''
}

export default function App() {
  const [usuario, setUsuario] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mc_usuario')) } catch { return null }
  })
  const [loginForm, setLoginForm] = useState({ nombre: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginCargando, setLoginCargando] = useState(false)
  const [mostrarPassword, setMostrarPassword] = useState(false)

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
  const [mostrarCambioPassword, setMostrarCambioPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ nuevoNombre: '', actual: '', nueva: '', confirmar: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordOk, setPasswordOk] = useState(false)
  const [citas, setCitas] = useState([])
  const [tareas, setTareas] = useState([])
  const [mesCalendario, setMesCalendario] = useState(() => {
    const h = new Date(); return { year: h.getFullYear(), month: h.getMonth() }
  })
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [mostrarFormCita, setMostrarFormCita] = useState(false)
  const [mostrarFormTarea, setMostrarFormTarea] = useState(false)
  const [formCita, setFormCita] = useState({ titulo: '', fecha: '', hora: '', asesor: '', notas: '', cliente_id: '' })
  const [formTarea, setFormTarea] = useState({ titulo: '', descripcion: '', prioridad: 'media', fecha_limite: '', asesor: '' })
  const [campanas, setCampanas] = useState([])
  const [campanaDetalle, setCampanaDetalle] = useState(null)
  const [campanaClientes, setCampanaClientes] = useState([])
  const [mostrarFormCampana, setMostrarFormCampana] = useState(false)
  const [formCampana, setFormCampana] = useState({ nombre: '', descripcion: '', filtro_estatus: '', filtro_fuente: '' })
  const [importModal, setImportModal] = useState(false)
  const [importPreview, setImportPreview] = useState([])
  const [importCargando, setImportCargando] = useState(false)
  const [importResultado, setImportResultado] = useState(null)
  const importInputRef = useRef(null)

  async function iniciarSesion(e) {
    e.preventDefault()
    setLoginCargando(true)
    setLoginError('')
    const { data, error } = await supabase.rpc('login_usuario', {
      p_nombre: loginForm.nombre.trim(),
      p_password: loginForm.password
    })
    if (error) { setLoginError('Error de conexión, intenta de nuevo'); setLoginCargando(false); return }
    const encontrado = data && data.length > 0 ? data[0] : null
    if (encontrado) {
      localStorage.setItem('mc_usuario', JSON.stringify(encontrado))
      setUsuario(encontrado)
    } else {
      setLoginError('Usuario o contraseña incorrectos')
    }
    setLoginCargando(false)
  }

  function cerrarSesion() {
    localStorage.removeItem('mc_usuario')
    setUsuario(null)
    setLoginForm({ nombre: '', password: '' })
  }

  useEffect(() => {
    if (!usuario) return
    cargarClientes()
    cargarCitas()
    cargarTareas()
    cargarCampanas()
    const canal = supabase
      .channel('clientes-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => cargarClientes())
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [usuario])

  async function cargarCitas() {
    const { data } = await supabase.from('citas').select('*, clientes(nombre)').order('fecha').order('hora')
    setCitas(data || [])
  }

  async function cargarTareas() {
    const { data } = await supabase.from('tareas').select('*').order('fecha_limite').order('created_at', { ascending: false })
    setTareas(data || [])
  }

  async function guardarCita(e) {
    e.preventDefault()
    const datos = { ...formCita, cliente_id: formCita.cliente_id || null, asesor: formCita.asesor || usuario.nombre }
    await supabase.from('citas').insert([datos])
    setMostrarFormCita(false)
    setFormCita({ titulo: '', fecha: '', hora: '', asesor: '', notas: '', cliente_id: '' })
    cargarCitas()
  }

  async function eliminarCita(id) {
    await supabase.from('citas').delete().eq('id', id)
    cargarCitas()
  }

  async function guardarTarea(e) {
    e.preventDefault()
    const datos = { ...formTarea, asesor: formTarea.asesor || usuario.nombre }
    await supabase.from('tareas').insert([datos])
    setMostrarFormTarea(false)
    setFormTarea({ titulo: '', descripcion: '', prioridad: 'media', fecha_limite: '', asesor: '' })
    cargarTareas()
  }

  async function completarTarea(id, completada) {
    await supabase.from('tareas').update({ completada }).eq('id', id)
    cargarTareas()
  }

  async function eliminarTarea(id) {
    await supabase.from('tareas').delete().eq('id', id)
    cargarTareas()
  }

  async function cargarCampanas() {
    const { data } = await supabase.from('campanas').select('*').order('created_at', { ascending: false })
    setCampanas(data || [])
  }

  async function crearCampana(e) {
    e.preventDefault()
    const { data: nueva } = await supabase.from('campanas').insert([formCampana]).select().single()
    if (nueva) {
      const clientesFiltro = clientes.filter(c => {
        const okEstatus = !formCampana.filtro_estatus || c.estatus === formCampana.filtro_estatus
        const okFuente = !formCampana.filtro_fuente || c.fuente === formCampana.filtro_fuente
        return okEstatus && okFuente
      })
      if (clientesFiltro.length > 0) {
        await supabase.from('campana_clientes').insert(
          clientesFiltro.map(c => ({ campana_id: nueva.id, cliente_id: c.id }))
        )
      }
    }
    setMostrarFormCampana(false)
    setFormCampana({ nombre: '', descripcion: '', filtro_estatus: '', filtro_fuente: '' })
    cargarCampanas()
  }

  async function abrirCampana(campana) {
    setCampanaDetalle(campana)
    setVista('campana')
    const { data } = await supabase
      .from('campana_clientes')
      .select('*, clientes(nombre, telefono, estatus, fuente, asesor)')
      .eq('campana_id', campana.id)
    setCampanaClientes(data || [])
  }

  async function actualizarResultado(id, resultado) {
    await supabase.from('campana_clientes').update({ resultado }).eq('id', id)
    setCampanaClientes(prev => prev.map(c => c.id === id ? { ...c, resultado } : c))
  }

  async function eliminarCampana(id) {
    if (!window.confirm('¿Eliminar esta campaña?')) return
    await supabase.from('campanas').delete().eq('id', id)
    cargarCampanas()
  }

  async function cambiarEstatusCampana(id, estatus) {
    await supabase.from('campanas').update({ estatus }).eq('id', id)
    cargarCampanas()
  }

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

  async function marcarContactado(id) {
    await supabase.from('clientes').update({ updated_at: new Date().toISOString() }).eq('id', id)
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

  function exportarCSV() {
    const columnas = ['Nombre', 'Oportunidad', 'Teléfono', 'Correo', 'Estatus', 'Asesor', 'Fuente', 'Tipo de interés', 'Probabilidad', 'Tiene INFONAVIT', 'Tiene terreno', 'Ubicación terreno', 'Próxima acción', 'Fecha próximo contacto', 'Notas']
    const filas = clientesFiltrados.map(c => [
      c.nombre, c.oportunidad, c.telefono, c.correo, c.estatus, c.asesor, c.fuente,
      c.tipo_interes, c.probabilidad_cierre,
      c.tiene_infonavit ? 'Sí' : 'No', c.tiene_terreno ? 'Sí' : 'No',
      c.ubicacion_terreno, c.proxima_accion, c.fecha_proximo_contacto, c.notas
    ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`))
    const csv = '\uFEFF' + [columnas.join(','), ...filas.map(f => f.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const filename = `clientes-mc-arquitectos-${new Date().toISOString().slice(0, 10)}.csv`
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(blob, filename)
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 200)
    }
  }

  const CAMPO_ALIASES = {
    nombre: ['nombre', 'name', 'client', 'cliente'],
    oportunidad: ['oportunidad', 'opportunity', 'proyecto', 'deal'],
    telefono: ['telefono', 'teléfono', 'tel', 'phone', 'celular', 'movil', 'móvil', 'whatsapp'],
    correo: ['correo', 'email', 'e-mail', 'mail'],
    tiene_infonavit: ['infonavit', 'tiene_infonavit', 'crédito', 'credito'],
    tiene_terreno: ['terreno', 'tiene_terreno'],
    ubicacion_terreno: ['ubicacion', 'ubicación', 'ubicacion_terreno', 'ubicación_terreno', 'colonia', 'direccion', 'dirección'],
    fuente: ['fuente', 'source', 'origen'],
    tipo_interes: ['tipo_interes', 'tipo', 'interes', 'interés', 'tipo de interes', 'tipo de interés'],
    probabilidad_cierre: ['probabilidad', 'probabilidad_cierre', 'prioridad'],
    estatus: ['estatus', 'status', 'estado'],
    asesor: ['asesor', 'vendedor', 'agente', 'responsable'],
    proxima_accion: ['proxima_accion', 'próxima_acción', 'accion', 'acción', 'siguiente paso'],
    fecha_proximo_contacto: ['fecha_proximo_contacto', 'fecha', 'próxima fecha', 'fecha contacto'],
    notas: ['notas', 'nota', 'comentarios', 'observaciones']
  }

  function normalizarHeader(h) {
    return (h || '').toString().toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
  }

  function detectarCampo(header) {
    const h = normalizarHeader(header)
    for (const [campo, aliases] of Object.entries(CAMPO_ALIASES)) {
      if (aliases.some(a => normalizarHeader(a) === h || h.includes(normalizarHeader(a)))) return campo
    }
    return null
  }

  function parsearBooleano(val) {
    if (typeof val === 'boolean') return val
    const s = (val || '').toString().toLowerCase().trim()
    return s === 'si' || s === 'sí' || s === 'yes' || s === '1' || s === 'true'
  }

  function procesarExcel(file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (rows.length < 2) { alert('El archivo no tiene datos'); return }

        const headers = rows[0]
        const mapeo = headers.map(h => detectarCampo(h))

        const clientes_import = rows.slice(1)
          .filter(row => row.some(cell => cell !== ''))
          .map(row => {
            const obj = { ...clienteVacio }
            headers.forEach((_, i) => {
              const campo = mapeo[i]
              if (!campo) return
              const val = row[i]
              if (campo === 'tiene_infonavit' || campo === 'tiene_terreno') {
                obj[campo] = parsearBooleano(val)
              } else if (campo === 'estatus') {
                const s = (val || '').toString().toLowerCase().trim()
                obj[campo] = ['nuevo', 'en seguimiento', 'cerrado', 'perdido'].includes(s) ? s : 'nuevo'
              } else if (campo === 'probabilidad_cierre') {
                const s = (val || '').toString().toLowerCase().trim()
                obj[campo] = ['alta', 'media', 'baja'].includes(s) ? s : (val ? val.toString() : '')
              } else {
                obj[campo] = val !== undefined && val !== null ? val.toString().trim() : ''
              }
            })
            if (usuario?.rol === 'asesor' && !obj.asesor) obj.asesor = usuario.nombre
            return obj
          })
          .filter(c => c.nombre)

        setImportPreview(clientes_import)
        setImportResultado(null)
      } catch {
        alert('No se pudo leer el archivo. Asegúrate de que sea .xlsx o .csv')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function confirmarImportacion() {
    if (importPreview.length === 0) return
    setImportCargando(true)
    const { error } = await supabase.from('clientes').insert(importPreview)
    if (error) {
      setImportResultado({ ok: false, msg: 'Error al importar: ' + error.message })
    } else {
      await cargarClientes()
      setImportResultado({ ok: true, msg: `${importPreview.length} clientes importados correctamente` })
      setImportPreview([])
    }
    setImportCargando(false)
  }

  async function guardarPerfil(e) {
    e.preventDefault()
    setPasswordError('')
    setPasswordOk(false)
    let cambios = {}

    if (passwordForm.nuevoNombre && passwordForm.nuevoNombre.trim() !== usuario.nombre) {
      cambios.nombre = passwordForm.nuevoNombre.trim()
    }

    if (passwordForm.nueva) {
      if (passwordForm.actual !== usuario.password) {
        setPasswordError('La contraseña actual es incorrecta')
        return
      }
      if (passwordForm.nueva.length < 4) {
        setPasswordError('La nueva contraseña debe tener al menos 4 caracteres')
        return
      }
      if (passwordForm.nueva !== passwordForm.confirmar) {
        setPasswordError('Las contraseñas nuevas no coinciden')
        return
      }
      cambios.password = passwordForm.nueva
    }

    if (Object.keys(cambios).length === 0) {
      setPasswordError('No hay cambios que guardar')
      return
    }

    await supabase.from('usuarios').update(cambios).eq('id', usuario.id)
    const actualizado = { ...usuario, ...cambios }
    localStorage.setItem('mc_usuario', JSON.stringify(actualizado))
    setUsuario(actualizado)
    setPasswordForm({ nuevoNombre: actualizado.nombre, actual: '', nueva: '', confirmar: '' })
    setPasswordOk(true)
  }

  const clientesVisibles = usuario?.rol === 'asesor'
    ? clientes.filter(c => c.asesor?.toLowerCase() === usuario.nombre.toLowerCase())
    : clientes

  const vencidos = clientesVisibles.filter(c => {
    if (!c.fecha_proximo_contacto) return false
    return new Date(c.fecha_proximo_contacto) < new Date() && c.estatus !== 'cerrado' && c.estatus !== 'perdido'
  })

  const clientesFiltrados = clientesVisibles.filter(c => {
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

  if (!usuario) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
          <div className="flex flex-col items-center mb-6">
            <img src="/logo.jpeg" alt="MC Arquitectos" className="w-16 h-16 rounded-full object-cover border-2 border-brand-gold mb-3" />
            <h1 className="text-xl font-bold text-gray-800">MC Arquitectos</h1>
            <p className="text-sm text-gray-400">CRM — Inicia sesión</p>
          </div>
          <form onSubmit={iniciarSesion} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
              <input
                type="text"
                value={loginForm.nombre}
                onChange={e => setLoginForm({ ...loginForm, nombre: e.target.value })}
                placeholder="Ej: Carlos"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
              <div className="relative">
                <input
                  type={mostrarPassword ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                  required
                />
                <button type="button" onClick={() => setMostrarPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {mostrarPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {loginError && <p className="text-xs text-red-500 text-center">{loginError}</p>}
            <button
              type="submit"
              disabled={loginCargando}
              className="w-full bg-brand-gold text-white py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-700 disabled:opacity-50">
              {loginCargando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-brand-dark text-white shadow sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <img src="/logo.jpeg" alt="MC Arquitectos" className="w-8 h-8 rounded-full object-cover border-2 border-brand-gold" />
            <div className="hidden sm:block">
              <h1 className="text-xs font-bold leading-tight text-brand-gold">MC Arquitectos</h1>
              <p className="text-gray-300 text-xs">{clientesVisibles.length} clientes</p>
            </div>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 justify-end">
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
            <button onClick={() => setVista('agenda')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${vista === 'agenda' ? 'bg-brand-gold text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
              Agenda
            </button>
            <button onClick={() => setVista('campanas')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${vista === 'campanas' || vista === 'campana' ? 'bg-brand-gold text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
              Campañas
            </button>
            <button onClick={() => setMostrarAlertas(v => !v)} className="relative ml-1 p-1.5 rounded-lg hover:bg-gray-700">
              <Bell size={16} className="text-gray-300" />
              {vencidos.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {vencidos.length}
                </span>
              )}
            </button>
            <div className="ml-2 flex items-center gap-1.5 border-l border-gray-600 pl-2">
              <span className="text-xs text-gray-300 hidden sm:block">{usuario.nombre}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${usuario.rol === 'dueño' ? 'bg-brand-gold text-white' : 'bg-gray-600 text-gray-200'}`}>
                {usuario.rol}
              </span>
              <button onClick={() => { setMostrarCambioPassword(true); setPasswordError(''); setPasswordOk(false); setPasswordForm({ nuevoNombre: usuario.nombre, actual: '', nueva: '', confirmar: '' }) }} className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-700">
                🔑
              </button>
              <button onClick={cerrarSesion} className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-700">
                Salir
              </button>
            </div>
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
                { label: 'Total Leads', value: clientesVisibles.length },
                { label: 'Nuevos', value: clientesVisibles.filter(c => c.estatus === 'nuevo').length },
                { label: 'Seguimiento', value: clientesVisibles.filter(c => c.estatus === 'en seguimiento').length },
                { label: 'Cerrados', value: clientesVisibles.filter(c => c.estatus === 'cerrado').length },
              ].map((t, i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <p className="text-gray-500 text-xs">{t.label}</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">{t.value}</p>
                </div>
              ))}
            </div>

            {/* CARDS ESTILO SALESFORCE */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

              {/* CERRAR TRATOS */}
              {(() => {
                const altaProb = clientesVisibles.filter(c => c.probabilidad_cierre === 'alta').length
                const cerrados = clientesVisibles.filter(c => c.estatus === 'cerrado').length
                const perdidos = clientesVisibles.filter(c => c.estatus === 'perdido').length
                const total = clientesVisibles.length
                const r = 40, circ = 2 * Math.PI * r
                const pct = total > 0 ? cerrados / total : 0
                return (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <div className="px-5 pt-5 pb-2">
                      <h3 className="font-bold text-gray-800 text-sm">Cerrar Tratos</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Oportunidades activas</p>
                    </div>
                    <div className="flex items-center gap-6 px-5 py-4 flex-1">
                      <div className="relative flex-shrink-0">
                        <svg width="100" height="100" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
                          <circle cx="50" cy="50" r={r} fill="none" stroke="#10b981" strokeWidth="10"
                            strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
                            transform="rotate(-90 50 50)" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-bold text-gray-800">{total}</span>
                          <span className="text-xs text-gray-400">Total</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0"></span>
                          <span className="text-gray-600">{altaProb} Alta probabilidad</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0"></span>
                          <span className="text-gray-600">{cerrados} Cerrados</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0"></span>
                          <span className="text-gray-600">{perdidos} Perdidos</span>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-gray-100 px-5 py-3">
                      <button onClick={() => setVista('pipeline')} className="text-sm text-brand-gold font-medium hover:underline">Ver Pipeline →</button>
                    </div>
                  </div>
                )
              })()}

              {/* SEMÁFORO DE SEGUIMIENTO */}
              {(() => {
                const activos = clientesVisibles.filter(c => c.estatus === 'en seguimiento')
                const verdes = activos.filter(c => getSemaforo(c.updated_at).emoji === '🟢').length
                const amarillos = activos.filter(c => getSemaforo(c.updated_at).emoji === '🟡').length
                const rojos = activos.filter(c => getSemaforo(c.updated_at).emoji === '🔴').length
                const total = activos.length
                const r = 40, circ = 2 * Math.PI * r
                const pct = total > 0 ? verdes / total : 0
                return (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <div className="px-5 pt-5 pb-2">
                      <h3 className="font-bold text-gray-800 text-sm">Seguimiento Activo</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Clientes en seguimiento</p>
                    </div>
                    <div className="flex items-center gap-6 px-5 py-4 flex-1">
                      <div className="relative flex-shrink-0">
                        <svg width="100" height="100" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
                          <circle cx="50" cy="50" r={r} fill="none" stroke="#f59e0b" strokeWidth="10"
                            strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
                            transform="rotate(-90 50 50)" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-bold text-gray-800">{total}</span>
                          <span className="text-xs text-gray-400">Activos</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0"></span>
                          <span className="text-gray-600">{verdes} Al día</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 flex-shrink-0"></span>
                          <span className="text-gray-600">{amarillos} Por escribir</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0"></span>
                          <span className="text-gray-600">{rojos} Urgentes</span>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-gray-100 px-5 py-3">
                      <button onClick={() => setVista('clientes')} className="text-sm text-brand-gold font-medium hover:underline">Ver Clientes →</button>
                    </div>
                  </div>
                )
              })()}

              {/* NUEVOS ESTE MES */}
              {(() => {
                const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30)
                const nuevosEsteMes = clientesVisibles.filter(c => c.created_at && new Date(c.created_at) >= hace30)
                const fbs = nuevosEsteMes.filter(c => c.fuente === 'Facebook').length
                const wsp = nuevosEsteMes.filter(c => c.fuente === 'WhatsApp').length
                const rec = nuevosEsteMes.filter(c => c.fuente === 'Recomendación').length
                const total = nuevosEsteMes.length
                const r = 40, circ = 2 * Math.PI * r
                const pct = clientesVisibles.length > 0 ? total / clientesVisibles.length : 0
                return (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <div className="px-5 pt-5 pb-2">
                      <h3 className="font-bold text-gray-800 text-sm">Nuevos Leads</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Creados en los últimos 30 días</p>
                    </div>
                    <div className="flex items-center gap-6 px-5 py-4 flex-1">
                      <div className="relative flex-shrink-0">
                        <svg width="100" height="100" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
                          <circle cx="50" cy="50" r={r} fill="none" stroke="#6366f1" strokeWidth="10"
                            strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
                            transform="rotate(-90 50 50)" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-bold text-gray-800">{total}</span>
                          <span className="text-xs text-gray-400">Nuevos</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0"></span>
                          <span className="text-gray-600">{fbs} Facebook</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0"></span>
                          <span className="text-gray-600">{wsp} WhatsApp</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-400 flex-shrink-0"></span>
                          <span className="text-gray-600">{rec} Recomendación</span>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-gray-100 px-5 py-3">
                      <button onClick={() => setVista('clientes')} className="text-sm text-brand-gold font-medium hover:underline">Ver Clientes →</button>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* FILA 2: Pipeline este mes + Próximos a vencer + Eventos de hoy */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* PIPELINE ESTE MES */}
              {(() => {
                const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30)
                const nuevos = clientesVisibles.filter(c => c.created_at && new Date(c.created_at) >= hace30)
                const r = 40, circ = 2 * Math.PI * r
                const upstream = nuevos.filter(c => getSemaforo(c.updated_at).emoji === '🟢').length
                const past = nuevos.filter(c => getSemaforo(c.updated_at).emoji === '🟡' || getSemaforo(c.updated_at).emoji === '🔴').length
                const noAct = nuevos.filter(c => getSemaforo(c.updated_at).emoji === '⚪').length
                const pct = nuevos.length > 0 ? upstream / nuevos.length : 0
                return (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <div className="px-5 pt-5 pb-2">
                      <h3 className="font-bold text-gray-800 text-sm">Pipeline Este Mes</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Leads creados en los últimos 30 días</p>
                    </div>
                    <div className="flex items-center gap-6 px-5 py-4 flex-1">
                      <div className="relative flex-shrink-0">
                        <svg width="100" height="100" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
                          <circle cx="50" cy="50" r={r} fill="none" stroke="#B8892A" strokeWidth="10"
                            strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
                            transform="rotate(-90 50 50)" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-bold text-gray-800">{nuevos.length}</span>
                          <span className="text-xs text-gray-400">Leads</span>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0"></span>
                          <span className="text-gray-600">{upstream} Con actividad reciente</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 flex-shrink-0"></span>
                          <span className="text-gray-600">{past} Actividad pasada</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0"></span>
                          <span className="text-gray-600">{noAct} Sin actividad</span>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-gray-100 px-5 py-3">
                      <button onClick={() => setVista('pipeline')} className="text-sm text-brand-gold font-medium hover:underline">Ver Pipeline →</button>
                    </div>
                  </div>
                )
              })()}

              {/* EVENTOS DE HOY */}
              {(() => {
                const hoy = new Date().toISOString().slice(0, 10)
                const eventosHoy = citas.filter(c => c.fecha === hoy)
                return (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <div className="px-5 pt-5 pb-2">
                      <h3 className="font-bold text-gray-800 text-sm">Eventos de Hoy</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    </div>
                    <div className="px-5 py-4 flex-1">
                      {eventosHoy.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-6 text-gray-400">
                          <span className="text-3xl mb-2">📅</span>
                          <p className="text-sm">Sin eventos programados hoy</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {eventosHoy.map(e => (
                            <div key={e.id} className="flex items-start gap-3 bg-yellow-50 rounded-xl px-3 py-2.5">
                              <div className="w-8 h-8 rounded-lg bg-brand-gold text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {e.hora ? e.hora.slice(0, 5) : '—'}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-800">{e.titulo}</p>
                                {e.asesor && <p className="text-xs text-gray-400">{e.asesor}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="border-t border-gray-100 px-5 py-3">
                      <button onClick={() => setVista('agenda')} className="text-sm text-brand-gold font-medium hover:underline">Ver Agenda →</button>
                    </div>
                  </div>
                )
              })()}

              {/* PRÓXIMOS A VENCER */}
              {(() => {
                const urgentes = clientesVisibles
                  .filter(c => c.estatus !== 'cerrado' && c.estatus !== 'perdido' && c.updated_at)
                  .map(c => {
                    const dias = Math.floor((new Date() - new Date(c.updated_at)) / (1000 * 60 * 60 * 24))
                    return { ...c, dias }
                  })
                  .filter(c => c.dias >= 5)
                  .sort((a, b) => b.dias - a.dias)
                  .slice(0, 5)
                return (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <div className="px-5 pt-5 pb-2">
                      <h3 className="font-bold text-gray-800 text-sm">Próximos a Vencer</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Clientes sin contacto reciente</p>
                    </div>
                    <div className="px-4 py-3 flex-1 space-y-2 overflow-y-auto max-h-52">
                      {urgentes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-6 text-gray-400">
                          <span className="text-3xl mb-2">✅</span>
                          <p className="text-sm">¡Todo al día!</p>
                        </div>
                      ) : urgentes.map(c => {
                        const sem = getSemaforo(c.updated_at)
                        return (
                          <div key={c.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                            <span className="text-base flex-shrink-0">{sem.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{c.nombre}</p>
                              <p className="text-xs text-gray-400">{c.dias} días sin contacto</p>
                            </div>
                            <button
                              onClick={() => marcarContactado(c.id)}
                              title="Marcar como contactado"
                              className="w-7 h-7 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center flex-shrink-0 transition-colors group">
                              <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-green-500" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    <div className="border-t border-gray-100 px-5 py-3">
                      <button onClick={() => setVista('clientes')} className="text-sm text-brand-gold font-medium hover:underline">Ver Clientes →</button>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* CLIENTES */}
        {vista === 'clientes' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Clientes</h2>
              <div className="flex gap-2">
                <button onClick={exportarCSV}
                  className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium">
                  ⬇ Exportar
                </button>
                <button onClick={() => { setImportModal(true); setImportPreview([]); setImportResultado(null) }}
                  className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium">
                  <Upload size={15} /> Importar
                </button>
                <button onClick={() => { setForm({ ...clienteVacio, asesor: usuario?.rol === 'asesor' ? usuario.nombre : '' }); setClienteEditando(null); setMostrarFormulario(true) }}
                  className="flex items-center gap-1.5 bg-brand-gold text-white px-3 py-2 rounded-lg hover:bg-yellow-700 text-sm font-medium">
                  <Plus size={15} /> Nuevo
                </button>
              </div>
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
                        {['Nombre', 'Oportunidad', 'Teléfono', 'Fuente', 'Tipo', 'Probabilidad', 'Estatus', 'Asesor', 'Acciones'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {clientesFiltrados.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3"><button onClick={() => abrirDetalle(c)} className="font-medium text-gray-800 hover:text-brand-gold text-left">{c.nombre}</button></td>
                          <td className="px-4 py-3 text-gray-500">{c.oportunidad}</td>
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
                <div className="flex flex-col gap-2 ml-4">
                  {clienteDetalle.telefono && (
                    <a
                      href={`https://wa.me/52${clienteDetalle.telefono.replace(/\D/g, '').slice(-10)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
                      💬 WhatsApp
                    </a>
                  )}
                  <button onClick={() => editarCliente(clienteDetalle)}
                    className="text-brand-gold hover:text-yellow-700"><Edit2 size={18} /></button>
                </div>
              </div>
            </div>

            {/* Agendar cita rápida */}
            <div className="mb-4">
              <button onClick={() => { setFormCita({ titulo: `Cita con ${clienteDetalle.nombre}`, fecha: '', hora: '', asesor: usuario.nombre, notas: '', cliente_id: clienteDetalle.id }); setMostrarFormCita(true) }}
                className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 w-full justify-center">
                📅 Agendar cita con este cliente
              </button>
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

        {/* AGENDA */}
        {vista === 'agenda' && (() => {
          const hoy = new Date()
          const { year, month } = mesCalendario
          const primerDia = new Date(year, month, 1).getDay()
          const diasEnMes = new Date(year, month + 1, 0).getDate()
          const nombreMes = new Date(year, month).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
          const citasVisibles = usuario?.rol === 'asesor' ? citas.filter(c => c.asesor === usuario.nombre) : citas
          const tareasVisibles = usuario?.rol === 'asesor' ? tareas.filter(t => t.asesor === usuario.nombre) : tareas
          const citasDia = diaSeleccionado ? citasVisibles.filter(c => c.fecha === diaSeleccionado) : []
          const PRIORIDAD_COLORES = { alta: 'bg-red-100 text-red-700 border-red-200', media: 'bg-yellow-100 text-yellow-700 border-yellow-200', baja: 'bg-green-100 text-green-700 border-green-200' }

          return (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Agenda</h2>
                <div className="flex gap-2">
                  <button onClick={() => { setFormTarea({ titulo: '', descripcion: '', prioridad: 'media', fecha_limite: '', asesor: usuario.nombre }); setMostrarFormTarea(true) }}
                    className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                    ✅ Nueva tarea
                  </button>
                  <button onClick={() => { setFormCita({ titulo: '', fecha: diaSeleccionado || '', hora: '', asesor: usuario.nombre, notas: '', cliente_id: '' }); setMostrarFormCita(true) }}
                    className="flex items-center gap-1.5 bg-brand-gold text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-yellow-700">
                    <Plus size={15} /> Nueva cita
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Calendario */}
                <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex justify-between items-center mb-4">
                    <button onClick={() => setMesCalendario(m => { const d = new Date(m.year, m.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">‹</button>
                    <h3 className="text-sm font-semibold text-gray-700 capitalize">{nombreMes}</h3>
                    <button onClick={() => setMesCalendario(m => { const d = new Date(m.year, m.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">›</button>
                  </div>
                  <div className="grid grid-cols-7 mb-2">
                    {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => (
                      <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {Array(primerDia).fill(null).map((_, i) => <div key={`v${i}`} />)}
                    {Array.from({ length: diasEnMes }, (_, i) => i + 1).map(dia => {
                      const fechaStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
                      const tieneCitas = citasVisibles.some(c => c.fecha === fechaStr)
                      const esHoy = hoy.getDate() === dia && hoy.getMonth() === month && hoy.getFullYear() === year
                      const seleccionado = diaSeleccionado === fechaStr
                      return (
                        <button key={dia} onClick={() => setDiaSeleccionado(seleccionado ? null : fechaStr)}
                          className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-medium transition-colors
                            ${seleccionado ? 'bg-brand-gold text-white' : esHoy ? 'bg-brand-dark text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                          {dia}
                          {tieneCitas && <span className={`absolute bottom-1 w-1 h-1 rounded-full ${seleccionado ? 'bg-white' : 'bg-brand-gold'}`} />}
                        </button>
                      )
                    })}
                  </div>

                  {/* Citas del día seleccionado */}
                  {diaSeleccionado && (
                    <div className="mt-4 border-t pt-4">
                      <h4 className="text-xs font-semibold text-gray-500 mb-2">
                        {new Date(diaSeleccionado + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </h4>
                      {citasDia.length === 0 ? (
                        <p className="text-xs text-gray-400">Sin citas este día</p>
                      ) : citasDia.map(c => (
                        <div key={c.id} className="flex items-start justify-between bg-blue-50 rounded-lg px-3 py-2 mb-2 border border-blue-100">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{c.titulo}</p>
                            <p className="text-xs text-gray-500">{c.hora && `🕐 ${c.hora.slice(0,5)}`} {c.asesor && `· ${c.asesor}`} {c.clientes?.nombre && `· 👤 ${c.clientes.nombre}`}</p>
                            {c.notas && <p className="text-xs text-gray-400 mt-0.5">{c.notas}</p>}
                          </div>
                          <button onClick={() => eliminarCita(c.id)} className="text-gray-300 hover:text-red-400 ml-2"><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Próximas citas */}
                  {!diaSeleccionado && (
                    <div className="mt-4 border-t pt-4">
                      <h4 className="text-xs font-semibold text-gray-500 mb-2">Próximas citas</h4>
                      {citasVisibles.filter(c => c.fecha >= new Date().toISOString().slice(0,10)).slice(0, 5).length === 0 ? (
                        <p className="text-xs text-gray-400">No hay citas próximas</p>
                      ) : citasVisibles.filter(c => c.fecha >= new Date().toISOString().slice(0,10)).slice(0, 5).map(c => (
                        <div key={c.id} className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-2 mb-2">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{c.titulo}</p>
                            <p className="text-xs text-gray-500">📅 {c.fecha} {c.hora && `· 🕐 ${c.hora.slice(0,5)}`} {c.clientes?.nombre && `· 👤 ${c.clientes.nombre}`}</p>
                          </div>
                          <button onClick={() => eliminarCita(c.id)} className="text-gray-300 hover:text-red-400 ml-2"><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tareas */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Tareas pendientes</h3>
                  {tareasVisibles.filter(t => !t.completada).length === 0 && (
                    <p className="text-xs text-gray-400 mb-3">Sin tareas pendientes 🎉</p>
                  )}
                  <div className="space-y-2 mb-4">
                    {tareasVisibles.filter(t => !t.completada).sort((a, b) => {
                      const p = { alta: 0, media: 1, baja: 2 }
                      return p[a.prioridad] - p[b.prioridad]
                    }).map(t => (
                      <div key={t.id} className={`rounded-lg px-3 py-2 border ${PRIORIDAD_COLORES[t.prioridad]}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-2">
                            <input type="checkbox" checked={false} onChange={() => completarTarea(t.id, true)}
                              className="mt-0.5 accent-yellow-600 cursor-pointer" />
                            <div>
                              <p className="text-sm font-medium">{t.titulo}</p>
                              {t.descripcion && <p className="text-xs opacity-70 mt-0.5">{t.descripcion}</p>}
                              {t.fecha_limite && <p className="text-xs opacity-60 mt-0.5">📅 {t.fecha_limite}</p>}
                            </div>
                          </div>
                          <button onClick={() => eliminarTarea(t.id)} className="opacity-40 hover:opacity-80 ml-1"><X size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {tareasVisibles.filter(t => t.completada).length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 mb-2">Completadas</h4>
                      {tareasVisibles.filter(t => t.completada).slice(0, 5).map(t => (
                        <div key={t.id} className="flex items-center justify-between px-3 py-2 mb-1">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={true} onChange={() => completarTarea(t.id, false)}
                              className="accent-yellow-600 cursor-pointer" />
                            <span className="text-xs text-gray-400 line-through">{t.titulo}</span>
                          </div>
                          <button onClick={() => eliminarTarea(t.id)} className="text-gray-200 hover:text-red-400"><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* CAMPAÑAS - LISTA */}
        {vista === 'campanas' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Campañas</h2>
              <button onClick={() => setMostrarFormCampana(true)}
                className="flex items-center gap-1.5 bg-brand-gold text-white px-3 py-2 rounded-lg hover:bg-yellow-700 text-sm font-medium">
                <Plus size={15} /> Nueva campaña
              </button>
            </div>

            {campanas.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-4xl mb-3">📢</p>
                <p className="text-sm">No hay campañas todavía</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campanas.map(c => {
                  const ESTATUS_CAM = { activa: 'bg-green-100 text-green-700', pausada: 'bg-yellow-100 text-yellow-700', terminada: 'bg-gray-100 text-gray-500' }
                  return (
                    <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <button onClick={() => abrirCampana(c)} className="font-semibold text-gray-800 hover:text-brand-gold text-left">{c.nombre}</button>
                          {c.descripcion && <p className="text-xs text-gray-400 mt-0.5">{c.descripcion}</p>}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTATUS_CAM[c.estatus]}`}>{c.estatus}</span>
                      </div>
                      <div className="flex gap-1 flex-wrap mt-2 mb-3">
                        {c.filtro_estatus && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Estatus: {c.filtro_estatus}</span>}
                        {c.filtro_fuente && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Fuente: {c.filtro_fuente}</span>}
                        <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString('es-MX')}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => abrirCampana(c)} className="flex-1 text-xs bg-brand-gold text-white px-3 py-1.5 rounded-lg hover:bg-yellow-700">Ver clientes</button>
                        {c.estatus === 'activa' && <button onClick={() => cambiarEstatusCampana(c.id, 'pausada')} className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200">Pausar</button>}
                        {c.estatus === 'pausada' && <button onClick={() => cambiarEstatusCampana(c.id, 'activa')} className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200">Reactivar</button>}
                        {c.estatus !== 'terminada' && <button onClick={() => cambiarEstatusCampana(c.id, 'terminada')} className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200">Terminar</button>}
                        <button onClick={() => eliminarCampana(c.id)} className="text-red-400 hover:text-red-600 px-2"><X size={14} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* CAMPAÑA - DETALLE */}
        {vista === 'campana' && campanaDetalle && (
          <div>
            <button onClick={() => setVista('campanas')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
              <ArrowLeft size={16} /> Volver a Campañas
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{campanaDetalle.nombre}</h2>
                  {campanaDetalle.descripcion && <p className="text-sm text-gray-500 mt-1">{campanaDetalle.descripcion}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                {[
                  { label: 'Total', value: campanaClientes.length, color: 'text-gray-800' },
                  { label: 'Pendientes', value: campanaClientes.filter(c => c.resultado === 'pendiente').length, color: 'text-gray-500' },
                  { label: 'Contactados', value: campanaClientes.filter(c => c.resultado === 'contactado').length, color: 'text-blue-600' },
                  { label: 'Interesados', value: campanaClientes.filter(c => c.resultado === 'interesado').length, color: 'text-green-600' },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                    <p className="text-xs text-gray-400">{m.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {campanaClientes.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No hay clientes en esta campaña</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['Cliente', 'Teléfono', 'Fuente', 'Asesor', 'Resultado'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {campanaClientes.map(cc => {
                        const RESULTADO_COLORES = { pendiente: 'bg-gray-100 text-gray-600', contactado: 'bg-blue-100 text-blue-700', interesado: 'bg-green-100 text-green-700', 'no interesado': 'bg-red-100 text-red-600' }
                        return (
                          <tr key={cc.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-800">{cc.clientes?.nombre}</td>
                            <td className="px-4 py-3 text-gray-500">{cc.clientes?.telefono}</td>
                            <td className="px-4 py-3 text-gray-500">{cc.clientes?.fuente}</td>
                            <td className="px-4 py-3 text-gray-500">{cc.clientes?.asesor}</td>
                            <td className="px-4 py-3">
                              <select value={cc.resultado} onChange={e => actualizarResultado(cc.id, e.target.value)}
                                className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${RESULTADO_COLORES[cc.resultado]}`}>
                                <option value="pendiente">Pendiente</option>
                                <option value="contactado">Contactado</option>
                                <option value="interesado">Interesado</option>
                                <option value="no interesado">No interesado</option>
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-gray-100">
                  {campanaClientes.map(cc => {
                    const RESULTADO_COLORES = { pendiente: 'bg-gray-100 text-gray-600', contactado: 'bg-blue-100 text-blue-700', interesado: 'bg-green-100 text-green-700', 'no interesado': 'bg-red-100 text-red-600' }
                    return (
                      <div key={cc.id} className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-800">{cc.clientes?.nombre}</p>
                            <p className="text-xs text-gray-400">{cc.clientes?.telefono} · {cc.clientes?.asesor}</p>
                          </div>
                          <select value={cc.resultado} onChange={e => actualizarResultado(cc.id, e.target.value)}
                            className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${RESULTADO_COLORES[cc.resultado]}`}>
                            <option value="pendiente">Pendiente</option>
                            <option value="contactado">Contactado</option>
                            <option value="interesado">Interesado</option>
                            <option value="no interesado">No interesado</option>
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* KANBAN / PIPELINE */}
        {vista === 'kanban' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Pipeline</h2>
              <button onClick={() => { setForm({ ...clienteVacio, asesor: usuario?.rol === 'asesor' ? usuario.nombre : '' }); setClienteEditando(null); setMostrarFormulario(true) }}
                className="flex items-center gap-1.5 bg-brand-gold text-white px-3 py-2 rounded-lg hover:bg-yellow-700 text-sm font-medium">
                <Plus size={15} /> Nuevo
              </button>
            </div>

            {/* Pestañas móvil */}
            <div className="md:hidden flex gap-1 mb-4 bg-white rounded-xl p-1 shadow-sm border border-gray-100 overflow-x-auto">
              {COLUMNAS.map(col => (
                <button key={col.key} onClick={() => setColumnaActiva(col.key)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${columnaActiva === col.key ? 'bg-brand-gold text-white' : 'text-gray-500'}`}>
                  {col.label} ({clientesVisibles.filter(c => c.estatus === col.key).length})
                </button>
              ))}
            </div>

            {/* Vista móvil - una columna a la vez */}
            <div className="md:hidden space-y-3">
              {clientesVisibles.filter(c => c.estatus === columnaActiva).map(c => (
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
              {clientesVisibles.filter(c => c.estatus === columnaActiva).length === 0 && (
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
                      {clientesVisibles.filter(c => c.estatus === col.key).length}
                    </span>
                  </div>
                  <div className="p-3 space-y-3 min-h-40">
                    {clientesVisibles.filter(c => c.estatus === col.key).map(c => (
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
                    {clientesVisibles.filter(c => c.estatus === col.key).length === 0 && (
                      <div className="text-center py-6 text-gray-300 text-xs">Sin clientes</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* TABLA HISTORIAL */}
            {(() => {
              const historial = clientesVisibles.filter(c => c.estatus === 'cerrado' || c.estatus === 'perdido')
              if (historial.length === 0) return null
              return (
                <div className="mt-8">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">Historial de clientes ({historial.length})</h3>
                  {/* Móvil */}
                  <div className="md:hidden space-y-2">
                    {historial.map(c => (
                      <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <div className="flex justify-between items-start">
                          <div>
                            <button onClick={() => abrirDetalle(c)} className="font-medium text-gray-800 hover:text-brand-gold text-left text-sm">{c.nombre}</button>
                            <p className="text-xs text-gray-400">{c.telefono}</p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTATUS_COLORES[c.estatus]}`}>{c.estatus}</span>
                        </div>
                        <div className="flex gap-2 mt-2 text-xs text-gray-400">
                          {c.asesor && <span>👤 {c.asesor}</span>}
                          {c.fuente && <span>📌 {c.fuente}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop */}
                  <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Nombre', 'Teléfono', 'Asesor', 'Fuente', 'Probabilidad', 'Estatus', 'Acciones'].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {historial.map(c => (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3"><button onClick={() => abrirDetalle(c)} className="font-medium text-gray-800 hover:text-brand-gold">{c.nombre}</button></td>
                            <td className="px-4 py-3 text-gray-500">{c.telefono}</td>
                            <td className="px-4 py-3 text-gray-500">{c.asesor}</td>
                            <td className="px-4 py-3 text-gray-500">{c.fuente}</td>
                            <td className="px-4 py-3">{c.probabilidad_cierre && <span className={`px-2 py-1 rounded-full text-xs font-medium ${PROBABILIDAD_COLORES[c.probabilidad_cierre]}`}>{c.probabilidad_cierre}</span>}</td>
                            <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${ESTATUS_COLORES[c.estatus]}`}>{c.estatus}</span></td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button onClick={() => editarCliente(c)} className="text-brand-gold hover:text-yellow-700"><Edit2 size={14} /></button>
                                <button onClick={() => eliminarCliente(c.id)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* MODAL NUEVA CAMPAÑA */}
      {mostrarFormCampana && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-gray-800">Nueva campaña</h3>
              <button onClick={() => setMostrarFormCampana(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={crearCampana} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                <input type="text" required value={formCampana.nombre} onChange={e => setFormCampana({ ...formCampana, nombre: e.target.value })}
                  placeholder="Ej: Seguimiento leads Facebook abril"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                <textarea rows={2} value={formCampana.descripcion} onChange={e => setFormCampana({ ...formCampana, descripcion: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-none" />
              </div>
              <div className="border-t pt-3">
                <p className="text-xs text-gray-400 mb-2">Agregar clientes automáticamente por filtro (opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Estatus</label>
                    <select value={formCampana.filtro_estatus} onChange={e => setFormCampana({ ...formCampana, filtro_estatus: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
                      <option value="">Todos</option>
                      {['nuevo', 'en seguimiento', 'cerrado', 'perdido'].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Fuente</label>
                    <select value={formCampana.filtro_fuente} onChange={e => setFormCampana({ ...formCampana, filtro_fuente: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
                      <option value="">Todas</option>
                      {['Facebook', 'WhatsApp', 'Instagram', 'Recomendación', 'Otro'].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                {(formCampana.filtro_estatus || formCampana.filtro_fuente) && (
                  <p className="text-xs text-brand-gold mt-2">
                    Se agregarán {clientes.filter(c => {
                      const okE = !formCampana.filtro_estatus || c.estatus === formCampana.filtro_estatus
                      const okF = !formCampana.filtro_fuente || c.fuente === formCampana.filtro_fuente
                      return okE && okF
                    }).length} clientes automáticamente
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setMostrarFormCampana(false)} className="text-sm text-gray-500">Cancelar</button>
                <button type="submit" className="flex items-center gap-2 bg-brand-gold text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-yellow-700">
                  <Save size={14} /> Crear campaña
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVA CITA */}
      {mostrarFormCita && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-gray-800">Nueva cita</h3>
              <button onClick={() => setMostrarFormCita(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={guardarCita} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Título *</label>
                <input type="text" required value={formCita.titulo} onChange={e => setFormCita({ ...formCita, titulo: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha *</label>
                  <input type="date" required value={formCita.fecha} onChange={e => setFormCita({ ...formCita, fecha: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hora</label>
                  <input type="time" value={formCita.hora} onChange={e => setFormCita({ ...formCita, hora: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Asesor</label>
                <input type="text" value={formCita.asesor} onChange={e => setFormCita({ ...formCita, asesor: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <textarea rows={2} value={formCita.notas} onChange={e => setFormCita({ ...formCita, notas: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setMostrarFormCita(false)} className="text-sm text-gray-500">Cancelar</button>
                <button type="submit" className="flex items-center gap-2 bg-brand-gold text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-yellow-700">
                  <Save size={14} /> Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVA TAREA */}
      {mostrarFormTarea && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-gray-800">Nueva tarea</h3>
              <button onClick={() => setMostrarFormTarea(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={guardarTarea} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Título *</label>
                <input type="text" required value={formTarea.titulo} onChange={e => setFormTarea({ ...formTarea, titulo: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                <textarea rows={2} value={formTarea.descripcion} onChange={e => setFormTarea({ ...formTarea, descripcion: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Prioridad</label>
                  <select value={formTarea.prioridad} onChange={e => setFormTarea({ ...formTarea, prioridad: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300">
                    <option value="alta">🔴 Alta</option>
                    <option value="media">🟡 Media</option>
                    <option value="baja">🟢 Baja</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha límite</label>
                  <input type="date" value={formTarea.fecha_limite} onChange={e => setFormTarea({ ...formTarea, fecha_limite: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setMostrarFormTarea(false)} className="text-sm text-gray-500">Cancelar</button>
                <button type="submit" className="flex items-center gap-2 bg-brand-gold text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-yellow-700">
                  <Save size={14} /> Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR EXCEL */}
      {importModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-bold text-gray-800">Importar clientes desde Excel</h2>
              <button onClick={() => setImportModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              {importResultado ? (
                <div className={`rounded-xl p-4 text-sm font-medium ${importResultado.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {importResultado.msg}
                  {importResultado.ok && (
                    <button onClick={() => setImportModal(false)} className="ml-4 underline">Cerrar</button>
                  )}
                </div>
              ) : importPreview.length === 0 ? (
                <>
                  <p className="text-sm text-gray-500">Sube un archivo <strong>.xlsx</strong> o <strong>.csv</strong>. El sistema detecta automáticamente las columnas: nombre, teléfono, correo, asesor, estatus, fuente, probabilidad, INFONAVIT, terreno, notas, etc.</p>
                  <div
                    onClick={() => importInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-brand-gold hover:bg-yellow-50 transition-colors">
                    <Upload size={32} className="mx-auto mb-2 text-gray-400" />
                    <p className="text-sm font-medium text-gray-600">Haz clic para seleccionar archivo</p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx, .xls o .csv</p>
                  </div>
                  <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    onChange={e => { if (e.target.files[0]) procesarExcel(e.target.files[0]); e.target.value = '' }} />
                </>
              ) : (
                <>
                  <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700">
                    Se detectaron <strong>{importPreview.length} clientes</strong>. Revisa la vista previa antes de importar.
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Nombre', 'Teléfono', 'Correo', 'Estatus', 'Asesor', 'Fuente'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 5).map((c, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-2 font-medium text-gray-800">{c.nombre || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{c.telefono || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{c.correo || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{c.estatus || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{c.asesor || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{c.fuente || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.length > 5 && (
                      <p className="text-xs text-gray-400 px-3 py-2">...y {importPreview.length - 5} más</p>
                    )}
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setImportPreview([])}
                      className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                      Cambiar archivo
                    </button>
                    <button onClick={confirmarImportacion} disabled={importCargando}
                      className="flex-1 bg-brand-gold text-white py-2.5 rounded-xl text-sm font-bold hover:bg-yellow-700 disabled:opacity-50">
                      {importCargando ? 'Importando...' : `Importar ${importPreview.length} clientes`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL MI PERFIL */}
      {mostrarCambioPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-bold text-gray-800">Mi perfil</h3>
              <button onClick={() => setMostrarCambioPassword(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={guardarPerfil} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mi nombre</label>
                <input
                  type="text"
                  value={passwordForm.nuevoNombre}
                  onChange={e => setPasswordForm({ ...passwordForm, nuevoNombre: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                />
              </div>
              <div className="border-t pt-4">
                <p className="text-xs text-gray-400 mb-3">Cambiar contraseña (opcional)</p>
                {[
                  { label: 'Contraseña actual', key: 'actual' },
                  { label: 'Nueva contraseña', key: 'nueva' },
                  { label: 'Confirmar nueva contraseña', key: 'confirmar' },
                ].map(({ label, key }) => (
                  <div key={key} className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input
                      type="password"
                      value={passwordForm[key]}
                      onChange={e => setPasswordForm({ ...passwordForm, [key]: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    />
                  </div>
                ))}
              </div>
              {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
              {passwordOk && <p className="text-xs text-green-600">✅ Perfil actualizado correctamente</p>}
              <button type="submit" className="w-full bg-brand-gold text-white py-2.5 rounded-lg font-medium text-sm hover:bg-yellow-700">
                Guardar cambios
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL FORMULARIO */}
      {mostrarFormulario && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-2xl flex flex-col h-full md:h-auto md:max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b flex-shrink-0">
              <h3 className="text-base font-bold text-gray-800">{clienteEditando ? 'Editar cliente' : 'Nuevo cliente'}</h3>
              <button onClick={() => setMostrarFormulario(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto flex-1">
              {[
                { label: 'Nombre *', key: 'nombre', type: 'text' },
                { label: 'Teléfono', key: 'telefono', type: 'text' },
                { label: 'Correo', key: 'correo', type: 'email' },
                { label: 'Oportunidad', key: 'oportunidad', type: 'text' },
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
                { label: 'Tipo de interés', key: 'tipo_interes', options: ['Construcción nueva', 'Remodelación', 'Venta de casa', 'Solo informándose', 'Cliente potencial calificado'] },
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
            <div className="flex justify-end gap-3 p-4 border-t flex-shrink-0 bg-white">
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

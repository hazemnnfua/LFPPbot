// ═══════════════════════════════════════
// Persistencia simple en JSON para las postulaciones a árbitro.
// Así no se pierden si el bot se reinicia (ej. redeploy en Railway).
// ═══════════════════════════════════════
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'postulaciones.json');

function load() {
  if (!fs.existsSync(FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    console.error('Error leyendo postulaciones.json:', err);
    return {};
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getPostulacion(id) {
  const data = load();
  return data[id] || null;
}

function setPostulacion(id, postulacion) {
  const data = load();
  data[id] = postulacion;
  save(data);
}

// Evita que alguien mande varias postulaciones mientras tiene una sin resolver
function tienePendiente(userId) {
  const data = load();
  return Object.values(data).some(p => p.userId === userId && p.estado === 'pendiente');
}

const COOLDOWN_RECHAZO_MS = 24 * 60 * 60 * 1000; // 24 horas

// Revisa el historial del usuario y devuelve por qué NO puede postular ahora mismo,
// o null si sí puede. Motivos:
//  - 'aceptada': ya fue aceptado alguna vez (ya tiene el rol) -> nunca puede volver a postular
//  - 'cooldown': fue rechazado hace menos de 24h -> debe esperar, se informa cuándo puede reintentar
function obtenerRestriccion(userId) {
  const data = load();
  const postulaciones = Object.values(data).filter(p => p.userId === userId);

  const aceptada = postulaciones.find(p => p.estado === 'aceptada');
  if (aceptada) {
    return { tipo: 'aceptada', postulacion: aceptada };
  }

  const rechazos = postulaciones
    .filter(p => p.estado === 'rechazada' && p.fechaRevision)
    .sort((a, b) => new Date(b.fechaRevision) - new Date(a.fechaRevision));

  if (rechazos.length > 0) {
    const ultimoRechazo = rechazos[0];
    const desde = Date.now() - new Date(ultimoRechazo.fechaRevision).getTime();
    if (desde < COOLDOWN_RECHAZO_MS) {
      const disponibleEn = new Date(new Date(ultimoRechazo.fechaRevision).getTime() + COOLDOWN_RECHAZO_MS);
      return { tipo: 'cooldown', disponibleEn };
    }
  }

  return null;
}

module.exports = { load, save, getPostulacion, setPostulacion, tienePendiente, obtenerRestriccion };

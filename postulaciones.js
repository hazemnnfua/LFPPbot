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

module.exports = { load, save, getPostulacion, setPostulacion, tienePendiente };

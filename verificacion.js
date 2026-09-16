// ═══════════════════════════════════════
// Persistencia del vínculo Discord ↔ Roblox, una vez confirmado por OAuth.
// Mismo patrón que postulaciones.js.
// ═══════════════════════════════════════
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'verificaciones.json');

function load() {
  if (!fs.existsSync(FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    console.error('Error leyendo verificaciones.json:', err);
    return {};
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getVerificacionPorDiscordId(discordId) {
  const data = load();
  return data[discordId] || null;
}

// Devuelve [discordId, info] del dueño actual de ese robloxId, o null.
function getVerificacionPorRobloxId(robloxId) {
  const data = load();
  const entry = Object.entries(data).find(([, v]) => String(v.robloxId) === String(robloxId));
  return entry || null;
}

function guardarVerificacion(discordId, info) {
  const data = load();
  data[discordId] = info;
  save(data);
}

function eliminarVerificacion(discordId) {
  const data = load();
  delete data[discordId];
  save(data);
}

module.exports = {
  getVerificacionPorDiscordId,
  getVerificacionPorRobloxId,
  guardarVerificacion,
  eliminarVerificacion,
};

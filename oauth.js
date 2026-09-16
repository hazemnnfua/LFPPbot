// ═══════════════════════════════════════
// OAuth2 de Roblox ("Iniciar sesión con Roblox").
// Flujo: generamos un link de autorización con un "state" único que
// mapea a un discordId → el usuario inicia sesión en Roblox (en la
// página oficial, nunca vemos su contraseña) → Roblox redirige a
// nuestro servidor con un "code" → lo canjeamos por un access_token →
// pedimos el userinfo (id, username) → listo, verificado al instante.
//
// Requiere crear una app OAuth en https://create.roblox.com/dashboard/credentials
// y configurar en el .env:
//   ROBLOX_CLIENT_ID=...
//   ROBLOX_CLIENT_SECRET=...
//   ROBLOX_REDIRECT_URI=https://tu-dominio-publico/auth/roblox/callback
// ═══════════════════════════════════════
const crypto = require('crypto');

const CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const REDIRECT_URI = process.env.ROBLOX_REDIRECT_URI;

const PENDIENTES = new Map(); // state -> { discordId, expiresAt }
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos para completar el login

function crearLinkVerificacion(discordId) {
  const state = crypto.randomBytes(16).toString('hex');
  PENDIENTES.set(state, { discordId, expiresAt: Date.now() + STATE_TTL_MS });

  const url = new URL('https://apis.roblox.com/oauth/v1/authorize');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', 'openid profile');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);

  return url.toString();
}

// Devuelve { discordId } si el state es válido y no expiró, o null.
function resolverState(state) {
  const pendiente = PENDIENTES.get(state);
  if (!pendiente) return null;
  PENDIENTES.delete(state); // un solo uso
  if (Date.now() > pendiente.expiresAt) return null;
  return pendiente;
}

async function intercambiarCodigo(code) {
  const res = await fetch('https://apis.roblox.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error(`Roblox token exchange falló: ${res.status} ${await res.text()}`);
  return res.json(); // { access_token, id_token, expires_in, ... }
}

async function obtenerUserinfo(accessToken) {
  const res = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Roblox userinfo falló: ${res.status}`);
  return res.json(); // { sub: robloxId, preferred_username, name, picture, created_at }
}

module.exports = { crearLinkVerificacion, resolverState, intercambiarCodigo, obtenerUserinfo };

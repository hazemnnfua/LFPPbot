// ═══════════════════════════════════════════════════════════════
// deploy-commands.js — Registra TODOS los slash commands del bot
// Correr con: node deploy-commands.js  (cada vez que cambies comandos)
// ═══════════════════════════════════════════════════════════════
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [

  // ─── ÁRBITROS ──────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('postular-arbitro')
    .setDescription('Postúlate para ser árbitro de la LFPP'),

  // ─── VERIFICACIÓN ──────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('verificar')
    .setDescription('Vincula tu cuenta de Roblox con tu Discord'),
  new SlashCommandBuilder()
    .setName('verificar-reset')
    .setDescription('(Admin) Elimina el vínculo de Roblox de un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord').setRequired(true)),
  new SlashCommandBuilder()
    .setName('quien-es')
    .setDescription('(Admin) Qué cuenta Roblox tiene un usuario de Discord')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord').setRequired(true)),

  // ─── ADMIN — MERCADO ───────────────────────────────────────
  new SlashCommandBuilder()
    .setName('mercado-abrir')
    .setDescription('(Admin) Abre la ventana de fichajes'),
  new SlashCommandBuilder()
    .setName('mercado-cerrar')
    .setDescription('(Admin) Cierra la ventana de fichajes y cancela ofertas pendientes'),
  new SlashCommandBuilder()
    .setName('registrar-club')
    .setDescription('(Admin) Registra un club en el sistema de mercado')
    .addStringOption(o => o.setName('nombre').setDescription('Nombre exacto del club').setRequired(true))
    .addUserOption(o => o.setName('presidente').setDescription('Discord del presidente (opcional)').setRequired(false)),
  new SlashCommandBuilder()
    .setName('asignar-presidente')
    .setDescription('(Admin) Asigna un presidente a un club')
    .addStringOption(o => o.setName('club').setDescription('Nombre del club').setRequired(true))
    .addUserOption(o => o.setName('usuario').setDescription('Discord del nuevo presidente').setRequired(true)),
  new SlashCommandBuilder()
    .setName('registrar-jugador')
    .setDescription('(Admin) Registra un jugador en el sistema de mercado')
    .addUserOption(o => o.setName('usuario').setDescription('Discord del jugador').setRequired(true))
    .addStringOption(o => o.setName('roblox').setDescription('Usuario de Roblox').setRequired(true))
    .addStringOption(o => o.setName('club').setDescription('Club actual (o AGENTE_LIBRE)').setRequired(true))
    .addIntegerOption(o => o.setName('valor').setDescription('Valor de mercado en Soles LFPP').setRequired(true))
    .addStringOption(o => o.setName('posicion').setDescription('Posición (POR, DEF, MED, DEL, DT)').setRequired(false)),
  new SlashCommandBuilder()
    .setName('actualizar-valor')
    .setDescription('(Admin) Actualiza el valor de mercado de un jugador')
    .addStringOption(o => o.setName('roblox').setDescription('Usuario de Roblox').setRequired(true))
    .addIntegerOption(o => o.setName('valor').setDescription('Nuevo valor en Soles LFPP').setRequired(true)),
  new SlashCommandBuilder()
    .setName('add-presupuesto')
    .setDescription('(Admin) Añade presupuesto a un club')
    .addStringOption(o => o.setName('club').setDescription('Nombre del club').setRequired(true))
    .addIntegerOption(o => o.setName('monto').setDescription('Cantidad de Soles LFPP').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo del ajuste').setRequired(false)),
  new SlashCommandBuilder()
    .setName('bono-victoria')
    .setDescription('(Admin) Aplica el bono de victoria a un club')
    .addStringOption(o => o.setName('club').setDescription('Nombre del club ganador').setRequired(true)),
  new SlashCommandBuilder()
    .setName('sancionar-jugador')
    .setDescription('(Admin) Sanciona a un jugador N jornadas')
    .addStringOption(o => o.setName('roblox').setDescription('Usuario de Roblox').setRequired(true))
    .addIntegerOption(o => o.setName('jornadas').setDescription('Número de jornadas de sanción').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo de la sanción').setRequired(true)),
  new SlashCommandBuilder()
    .setName('levantar-sancion')
    .setDescription('(Admin) Levanta la sanción de un jugador')
    .addStringOption(o => o.setName('roblox').setDescription('Usuario de Roblox').setRequired(true)),
  new SlashCommandBuilder()
    .setName('rescindir-forzar')
    .setDescription('(Admin) Rescinde el contrato de un jugador sin costo')
    .addStringOption(o => o.setName('roblox').setDescription('Usuario de Roblox').setRequired(true)),

  // ─── PRESIDENTE — MERCADO ──────────────────────────────────
  new SlashCommandBuilder()
    .setName('ofrecer')
    .setDescription('Haz una oferta de fichaje por un jugador')
    .addStringOption(o => o.setName('jugador').setDescription('Usuario de Roblox del jugador').setRequired(true))
    .addIntegerOption(o => o.setName('monto').setDescription('Oferta en Soles LFPP').setRequired(true)),
  new SlashCommandBuilder()
    .setName('prestar')
    .setDescription('Haz una oferta de préstamo por un jugador')
    .addStringOption(o => o.setName('jugador').setDescription('Usuario de Roblox del jugador').setRequired(true))
    .addIntegerOption(o => o.setName('duracion').setDescription('Jornadas de préstamo').setRequired(true))
    .addIntegerOption(o => o.setName('monto').setDescription('Cuota en Soles LFPP (0 si es gratis)').setRequired(false)),
  new SlashCommandBuilder()
    .setName('pagar-clausula')
    .setDescription('Paga la cláusula de rescisión de un jugador para ficharlo directamente')
    .addStringOption(o => o.setName('jugador').setDescription('Usuario de Roblox del jugador').setRequired(true)),

  // ─── JUGADOR — MERCADO ─────────────────────────────────────
  new SlashCommandBuilder()
    .setName('mis-ofertas')
    .setDescription('Ve las ofertas pendientes que tienes'),
  new SlashCommandBuilder()
    .setName('aceptar-oferta')
    .setDescription('Acepta una oferta de fichaje o préstamo')
    .addStringOption(o => o.setName('id').setDescription('ID de la oferta (primeros 8 caracteres)').setRequired(true)),
  new SlashCommandBuilder()
    .setName('rechazar-oferta')
    .setDescription('Rechaza una oferta de fichaje o préstamo')
    .addStringOption(o => o.setName('id').setDescription('ID de la oferta (primeros 8 caracteres)').setRequired(true)),
  new SlashCommandBuilder()
    .setName('rescindir')
    .setDescription('Rescindir tu contrato actual (pagas tu cláusula de rescisión)'),
  new SlashCommandBuilder()
    .setName('mi-contrato')
    .setDescription('Ver tu contrato actual, valor y cláusula'),

  // ─── CONSULTAS — TODOS ─────────────────────────────────────
  new SlashCommandBuilder()
    .setName('plantilla')
    .setDescription('Ver la plantilla y economía de un club')
    .addStringOption(o => o.setName('club').setDescription('Nombre del club').setRequired(true)),
  new SlashCommandBuilder()
    .setName('agentes-libres')
    .setDescription('Ver todos los jugadores sin club'),
  new SlashCommandBuilder()
    .setName('valor-jugador')
    .setDescription('Ver el valor de mercado y cláusula de un jugador')
    .addStringOption(o => o.setName('jugador').setDescription('Usuario de Roblox').setRequired(true)),
  new SlashCommandBuilder()
    .setName('presupuesto')
    .setDescription('Ver el presupuesto e historial económico de un club')
    .addStringOption(o => o.setName('club').setDescription('Nombre del club').setRequired(true)),
  new SlashCommandBuilder()
    .setName('mercado-estado')
    .setDescription('Ver si el mercado está abierto y la configuración actual'),

  // ─── MÚSICA ──────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce música desde YouTube, Spotify, SoundCloud o un nombre de canción')
    .addStringOption(o => o.setName('busqueda').setDescription('Link (YouTube/Spotify/SoundCloud) o nombre de la canción').setRequired(true)),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Salta a la siguiente canción de la cola'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Detiene la música y vacía la cola'),
  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa la reproducción actual'),
  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Reanuda la reproducción pausada'),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Muestra la cola de reproducción actual'),
  new SlashCommandBuilder()
    .setName('volumen')
    .setDescription('Ajusta el volumen de la música')
    .addIntegerOption(o => o.setName('nivel').setDescription('Nivel de volumen (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Saca al bot del canal de voz'),

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
      console.error('❌ Falta CLIENT_ID o GUILD_ID en el .env');
      process.exit(1);
    }
    console.log(`Registrando ${commands.length} comandos slash...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log(`✅ ${commands.length} comandos registrados correctamente.`);
  } catch (err) {
    console.error('❌ Error registrando comandos:', err);
  }
})();

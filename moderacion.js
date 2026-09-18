// ═══════════════════════════════════════════════════════════════
// moderacion.js — Módulo de moderación MULTI-SERVIDOR
// Cada servidor tiene su propia configuración (canal de logs, antilinks,
// filtro de palabras, límite de warns, canales exentos) guardada en
// moderacion.json. Se configura con /modconfig.
//
// Comandos: /ban /unban /kick /timeout /untimeout /warn /warnings
//           /unwarn /clearwarns /clear /modconfig
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  InteractionContextType,
  AuditLogEvent,
} = require('discord.js');

const DB_PATH = path.join(__dirname, 'moderacion.json');
const EFIMERO = MessageFlags.Ephemeral;

// Si este canal existe y su servidor aún no tiene canal de logs configurado,
// se usa como canal de logs inicial (una sola vez). Después cada servidor
// puede cambiarlo con /modconfig logs canal.
const CANAL_LOGS_INICIAL = '1535834413252874282';

const COLOR = {
  ban: 0xe74c3c,
  kick: 0xe67e22,
  timeout: 0xf1c40f,
  warn: 0xf39c12,
  ok: 0x2ecc71,
  info: 0x3498db,
  automod: 0x9b59b6,
  borrado: 0x95a5a6,
  editado: 0x5dade2,
};

// ═══════════════════════════════════════
// BASE DE DATOS (JSON)
// ═══════════════════════════════════════
let db = { guilds: {}, warns: {} };

function cargarDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      db = { guilds: raw.guilds || {}, warns: raw.warns || {} };
    }
  } catch (err) {
    console.error('[moderacion] No pude leer moderacion.json:', err);
  }
}

function guardarDB() {
  try {
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_PATH);
  } catch (err) {
    console.error('[moderacion] No pude guardar moderacion.json:', err);
  }
}

cargarDB();

function configPorDefecto() {
  return {
    logChannelId: null,
    antilinks: { enabled: false, dominiosPermitidos: [] },
    palabras: { enabled: false, lista: [] },
    warns: { limite: 0, accion: 'timeout', minutos: 60 },
    canalesExentos: [],
  };
}

function getConfig(guildId) {
  const def = configPorDefecto();
  const actual = db.guilds[guildId] || {};
  return {
    ...def,
    ...actual,
    antilinks: { ...def.antilinks, ...(actual.antilinks || {}) },
    palabras: { ...def.palabras, ...(actual.palabras || {}) },
    warns: { ...def.warns, ...(actual.warns || {}) },
  };
}

function setConfig(guildId, cfg) {
  db.guilds[guildId] = cfg;
  guardarDB();
}

function getWarns(guildId, userId) {
  return db.warns[guildId]?.[userId] || [];
}

function setWarns(guildId, userId, lista) {
  if (!db.warns[guildId]) db.warns[guildId] = {};
  if (lista.length) db.warns[guildId][userId] = lista;
  else delete db.warns[guildId][userId];
  guardarDB();
}

// ═══════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════
const recientes = new Set(); // dedupe de bans/unbans hechos por el bot
const borradosPorBot = new Set(); // mensajes borrados por el bot (no re-loguear)

function marcar(set, clave, ms = 15000) {
  set.add(clave);
  setTimeout(() => set.delete(clave), ms);
}

const responderError = (interaction, texto) =>
  interaction.reply({ content: texto, flags: EFIMERO });

function parseDuracion(texto) {
  const m = /^(\d+)\s*([smhd])$/i.exec((texto || '').trim());
  if (!m) return null;
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()];
  const ms = parseInt(m[1], 10) * mult;
  if (ms < 1000 || ms > 28 * 86400000) return null;
  return ms;
}

function formatearDuracion(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ') || '0s';
}

function normalizarTexto(t) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function enviarLog(guild, embed) {
  const cfg = getConfig(guild.id);
  if (!cfg.logChannelId) return;
  try {
    const canal = await guild.channels.fetch(cfg.logChannelId);
    if (canal?.isTextBased()) await canal.send({ embeds: [embed] });
  } catch (err) {
    console.error(`[moderacion] No pude enviar el log en "${guild.name}":`, err.message);
  }
}

async function enviarDM(usuario, guild, titulo, color, motivo, extra) {
  try {
    await usuario.send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(titulo)
          .setDescription(`**Servidor:** ${guild.name}\n**Motivo:** ${motivo}${extra ? `\n${extra}` : ''}`)
          .setTimestamp(),
      ],
    });
    return true;
  } catch {
    return false;
  }
}

function embedAccion({ color, titulo, usuario, moderador, motivo, campos = [] }) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(titulo)
    .setThumbnail(usuario.displayAvatarURL())
    .addFields(
      { name: 'Usuario', value: `${usuario} (\`${usuario.id}\`)`, inline: true },
      { name: 'Moderador', value: moderador ? `${moderador}` : 'Desconocido', inline: true },
      ...campos,
      { name: 'Motivo', value: String(motivo).slice(0, 1024) },
    )
    .setTimestamp();
}

function validarObjetivo(interaction, miembro, propiedadBot, verbo) {
  if (miembro.id === interaction.user.id) return `❌ No puedes ${verbo} a ti mismo.`;
  if (miembro.id === interaction.client.user.id) return '❌ No puedo hacerme eso a mí mismo.';
  if (miembro.id === interaction.guild.ownerId) return '❌ No puedes moderar al dueño del servidor.';
  if (
    !interaction.esOwnerBot &&
    interaction.guild.ownerId !== interaction.user.id &&
    miembro.roles.highest.position >= interaction.member.roles.highest.position
  ) {
    return '❌ No puedes moderar a alguien con un rol igual o superior al tuyo.';
  }
  if (!miembro[propiedadBot]) {
    return `❌ No puedo ${verbo} a ese usuario (su rol está por encima del mío o me faltan permisos).`;
  }
  return null;
}

async function buscarEjecutor(guild, tipo, objetivoId) {
  try {
    const logs = await guild.fetchAuditLogs({ type: tipo, limit: 6 });
    const entrada = logs.entries.find((e) => e.target?.id === objetivoId && Date.now() - e.createdTimestamp < 15000);
    return entrada?.executor || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════
// COMANDOS DE MODERACIÓN
// ═══════════════════════════════════════
async function cmdBan(interaction) {
  const usuario = interaction.options.getUser('usuario', true);
  const motivo = interaction.options.getString('motivo') || 'Sin motivo especificado';
  const dias = interaction.options.getInteger('borrar_mensajes_dias') ?? 0;
  const guild = interaction.guild;

  const miembro = await guild.members.fetch(usuario.id).catch(() => null);
  if (miembro) {
    const problema = validarObjetivo(interaction, miembro, 'bannable', 'banear');
    if (problema) return responderError(interaction, problema);
  } else if (usuario.id === interaction.user.id) {
    return responderError(interaction, '❌ No puedes banearte a ti mismo.');
  }

  const dmOk = await enviarDM(usuario, guild, '🔨 Has sido baneado', COLOR.ban, motivo);

  marcar(recientes, `ban:${guild.id}:${usuario.id}`);
  try {
    await guild.members.ban(usuario.id, {
      reason: `${interaction.user.tag}: ${motivo}`,
      deleteMessageSeconds: dias * 86400,
    });
  } catch (err) {
    recientes.delete(`ban:${guild.id}:${usuario.id}`);
    console.error('[moderacion] Error al banear:', err);
    return responderError(interaction, '❌ No pude banear a ese usuario. Revisa mis permisos y la posición de mi rol.');
  }

  const embed = embedAccion({
    color: COLOR.ban,
    titulo: '🔨 Usuario baneado',
    usuario,
    moderador: interaction.user,
    motivo,
    campos: [{ name: 'DM enviado', value: dmOk ? 'Sí' : 'No (DMs cerrados)', inline: true }],
  });
  await interaction.reply({ embeds: [embed] });
  await enviarLog(guild, embed);
}

async function cmdUnban(interaction) {
  const id = interaction.options.getString('id', true).trim();
  const motivo = interaction.options.getString('motivo') || 'Sin motivo especificado';
  const guild = interaction.guild;

  if (!/^\d{15,25}$/.test(id)) return responderError(interaction, '❌ Debes dar la **ID** numérica del usuario baneado.');

  marcar(recientes, `unban:${guild.id}:${id}`);
  let usuario;
  try {
    usuario = (await guild.members.unban(id, `${interaction.user.tag}: ${motivo}`)) || (await interaction.client.users.fetch(id));
  } catch {
    recientes.delete(`unban:${guild.id}:${id}`);
    return responderError(interaction, '❌ Ese usuario no está baneado (o la ID es inválida).');
  }

  const embed = embedAccion({
    color: COLOR.ok,
    titulo: '✅ Usuario desbaneado',
    usuario,
    moderador: interaction.user,
    motivo,
  });
  await interaction.reply({ embeds: [embed] });
  await enviarLog(guild, embed);
}

async function cmdKick(interaction) {
  const usuario = interaction.options.getUser('usuario', true);
  const motivo = interaction.options.getString('motivo') || 'Sin motivo especificado';
  const guild = interaction.guild;

  const miembro = await guild.members.fetch(usuario.id).catch(() => null);
  if (!miembro) return responderError(interaction, '❌ Ese usuario no está en el servidor.');

  const problema = validarObjetivo(interaction, miembro, 'kickable', 'expulsar');
  if (problema) return responderError(interaction, problema);

  const dmOk = await enviarDM(usuario, guild, '👢 Has sido expulsado', COLOR.kick, motivo);

  try {
    await miembro.kick(`${interaction.user.tag}: ${motivo}`);
  } catch (err) {
    console.error('[moderacion] Error al expulsar:', err);
    return responderError(interaction, '❌ No pude expulsar a ese usuario.');
  }

  const embed = embedAccion({
    color: COLOR.kick,
    titulo: '👢 Usuario expulsado',
    usuario,
    moderador: interaction.user,
    motivo,
    campos: [{ name: 'DM enviado', value: dmOk ? 'Sí' : 'No (DMs cerrados)', inline: true }],
  });
  await interaction.reply({ embeds: [embed] });
  await enviarLog(guild, embed);
}

async function cmdTimeout(interaction) {
  const usuario = interaction.options.getUser('usuario', true);
  const duracionTxt = interaction.options.getString('duracion', true);
  const motivo = interaction.options.getString('motivo') || 'Sin motivo especificado';
  const guild = interaction.guild;

  const ms = parseDuracion(duracionTxt);
  if (!ms) {
    return responderError(interaction, '❌ Duración inválida. Usa formatos como `30s`, `10m`, `2h` o `1d` (máximo 28 días).');
  }

  const miembro = await guild.members.fetch(usuario.id).catch(() => null);
  if (!miembro) return responderError(interaction, '❌ Ese usuario no está en el servidor.');

  const problema = validarObjetivo(interaction, miembro, 'moderatable', 'aislar');
  if (problema) return responderError(interaction, problema);

  try {
    await miembro.timeout(ms, `${interaction.user.tag}: ${motivo}`);
  } catch (err) {
    console.error('[moderacion] Error al aislar:', err);
    return responderError(interaction, '❌ No pude aislar a ese usuario.');
  }

  const dmOk = await enviarDM(usuario, guild, '🔇 Has sido aislado (timeout)', COLOR.timeout, motivo, `**Duración:** ${formatearDuracion(ms)}`);

  const embed = embedAccion({
    color: COLOR.timeout,
    titulo: '🔇 Usuario aislado',
    usuario,
    moderador: interaction.user,
    motivo,
    campos: [
      { name: 'Duración', value: formatearDuracion(ms), inline: true },
      { name: 'DM enviado', value: dmOk ? 'Sí' : 'No (DMs cerrados)', inline: true },
    ],
  });
  await interaction.reply({ embeds: [embed] });
  await enviarLog(guild, embed);
}

async function cmdUntimeout(interaction) {
  const usuario = interaction.options.getUser('usuario', true);
  const motivo = interaction.options.getString('motivo') || 'Sin motivo especificado';
  const guild = interaction.guild;

  const miembro = await guild.members.fetch(usuario.id).catch(() => null);
  if (!miembro) return responderError(interaction, '❌ Ese usuario no está en el servidor.');
  if (!miembro.isCommunicationDisabled()) return responderError(interaction, '❌ Ese usuario no está aislado.');
  if (!miembro.moderatable) return responderError(interaction, '❌ No puedo modificar a ese usuario.');

  await miembro.timeout(null, `${interaction.user.tag}: ${motivo}`);

  const embed = embedAccion({
    color: COLOR.ok,
    titulo: '🔈 Timeout removido',
    usuario,
    moderador: interaction.user,
    motivo,
  });
  await interaction.reply({ embeds: [embed] });
  await enviarLog(guild, embed);
}

// ─── WARNS ───────────────────────────────────────────────────
async function cmdWarn(interaction) {
  const usuario = interaction.options.getUser('usuario', true);
  const motivo = interaction.options.getString('motivo', true);
  const guild = interaction.guild;

  if (usuario.bot) return responderError(interaction, '❌ No puedes advertir a un bot.');

  const miembro = await guild.members.fetch(usuario.id).catch(() => null);
  if (miembro) {
    if (usuario.id === interaction.user.id) return responderError(interaction, '❌ No puedes advertirte a ti mismo.');
    if (
      !interaction.esOwnerBot &&
      guild.ownerId !== interaction.user.id &&
      miembro.roles.highest.position >= interaction.member.roles.highest.position
    ) {
      return responderError(interaction, '❌ No puedes advertir a alguien con un rol igual o superior al tuyo.');
    }
  }

  const lista = getWarns(guild.id, usuario.id);
  const warn = {
    id: crypto.randomUUID().slice(0, 8),
    modId: interaction.user.id,
    motivo,
    fecha: new Date().toISOString(),
  };
  lista.push(warn);
  setWarns(guild.id, usuario.id, lista);

  const dmOk = await enviarDM(usuario, guild, '⚠️ Has recibido una advertencia', COLOR.warn, motivo, `**Advertencias totales:** ${lista.length}`);

  const embed = embedAccion({
    color: COLOR.warn,
    titulo: '⚠️ Usuario advertido',
    usuario,
    moderador: interaction.user,
    motivo,
    campos: [
      { name: 'Advertencias totales', value: String(lista.length), inline: true },
      { name: 'ID del warn', value: `\`${warn.id}\``, inline: true },
      { name: 'DM enviado', value: dmOk ? 'Sí' : 'No (DMs cerrados)', inline: true },
    ],
  });
  await interaction.reply({ embeds: [embed] });
  await enviarLog(guild, embed);

  // ─── Sanción automática al llegar al límite ───
  const cfg = getConfig(guild.id);
  const { limite, accion, minutos } = cfg.warns;
  if (limite > 0 && lista.length >= limite && miembro) {
    const motivoAuto = `Alcanzó ${lista.length} advertencias (límite del servidor: ${limite})`;
    let aplicada = false;
    try {
      if (accion === 'timeout' && miembro.moderatable) {
        await miembro.timeout(minutos * 60000, motivoAuto);
        aplicada = true;
      } else if (accion === 'kick' && miembro.kickable) {
        await enviarDM(usuario, guild, '👢 Has sido expulsado', COLOR.kick, motivoAuto);
        await miembro.kick(motivoAuto);
        aplicada = true;
      } else if (accion === 'ban' && miembro.bannable) {
        await enviarDM(usuario, guild, '🔨 Has sido baneado', COLOR.ban, motivoAuto);
        marcar(recientes, `ban:${guild.id}:${usuario.id}`);
        await guild.members.ban(usuario.id, { reason: motivoAuto });
        aplicada = true;
      }
    } catch (err) {
      console.error('[moderacion] Error en sanción automática por warns:', err);
    }

    if (aplicada) {
      setWarns(guild.id, usuario.id, []);
      const detalle = accion === 'timeout' ? `timeout de ${formatearDuracion(minutos * 60000)}` : accion === 'kick' ? 'expulsión' : 'ban';
      const embedAuto = embedAccion({
        color: COLOR.automod,
        titulo: '🤖 Sanción automática por warns',
        usuario,
        moderador: interaction.client.user,
        motivo: motivoAuto,
        campos: [{ name: 'Acción', value: detalle, inline: true }],
      });
      await interaction.followUp({ embeds: [embedAuto] });
      await enviarLog(guild, embedAuto);
    }
  }
}

async function cmdWarnings(interaction) {
  const usuario = interaction.options.getUser('usuario', true);
  const lista = getWarns(interaction.guild.id, usuario.id);

  if (!lista.length) {
    return interaction.reply({ content: `✅ ${usuario} no tiene advertencias.`, flags: EFIMERO });
  }

  const lineas = lista
    .slice(-15)
    .reverse()
    .map((w) => `\`${w.id}\` • <t:${Math.floor(new Date(w.fecha).getTime() / 1000)}:d> • por <@${w.modId}>\n> ${w.motivo}`);

  const embed = new EmbedBuilder()
    .setColor(COLOR.warn)
    .setTitle(`⚠️ Advertencias de ${usuario.tag}`)
    .setDescription(lineas.join('\n\n').slice(0, 4000))
    .setFooter({ text: `Total: ${lista.length}` });

  await interaction.reply({ embeds: [embed], flags: EFIMERO });
}

async function cmdUnwarn(interaction) {
  const usuario = interaction.options.getUser('usuario', true);
  const id = interaction.options.getString('id', true).trim().toLowerCase();
  const guild = interaction.guild;

  const lista = getWarns(guild.id, usuario.id);
  const idx = lista.findIndex((w) => w.id === id);
  if (idx === -1) return responderError(interaction, '❌ No encontré una advertencia con esa ID para ese usuario.');

  const [quitada] = lista.splice(idx, 1);
  setWarns(guild.id, usuario.id, lista);

  const embed = embedAccion({
    color: COLOR.ok,
    titulo: '🧹 Advertencia eliminada',
    usuario,
    moderador: interaction.user,
    motivo: `Warn \`${quitada.id}\` eliminado (motivo original: ${quitada.motivo})`,
    campos: [{ name: 'Advertencias restantes', value: String(lista.length), inline: true }],
  });
  await interaction.reply({ embeds: [embed] });
  await enviarLog(guild, embed);
}

async function cmdClearWarns(interaction) {
  const usuario = interaction.options.getUser('usuario', true);
  const guild = interaction.guild;

  const lista = getWarns(guild.id, usuario.id);
  if (!lista.length) return responderError(interaction, '❌ Ese usuario no tiene advertencias.');

  setWarns(guild.id, usuario.id, []);

  const embed = embedAccion({
    color: COLOR.ok,
    titulo: '🧹 Advertencias reiniciadas',
    usuario,
    moderador: interaction.user,
    motivo: `Se eliminaron ${lista.length} advertencias`,
  });
  await interaction.reply({ embeds: [embed] });
  await enviarLog(guild, embed);
}

// ─── CLEAR ───────────────────────────────────────────────────
async function cmdClear(interaction) {
  const cantidad = interaction.options.getInteger('cantidad', true);
  const usuario = interaction.options.getUser('usuario');
  const canal = interaction.channel;

  await interaction.deferReply({ flags: EFIMERO });

  try {
    let mensajes = await canal.messages.fetch({ limit: usuario ? 100 : cantidad });
    if (usuario) mensajes = mensajes.filter((m) => m.author.id === usuario.id);
    const aBorrar = [...mensajes.values()].slice(0, cantidad);

    if (!aBorrar.length) return interaction.editReply('❌ No encontré mensajes para borrar.');

    aBorrar.forEach((m) => marcar(borradosPorBot, m.id));
    const borrados = await canal.bulkDelete(aBorrar, true); // ignora mensajes de más de 14 días

    await interaction.editReply(
      `✅ Se borraron **${borrados.size}** mensajes${usuario ? ` de ${usuario}` : ''}.` +
        (borrados.size < aBorrar.length ? '\n⚠️ Algunos tenían más de 14 días y Discord no permite borrarlos en masa.' : ''),
    );

    await enviarLog(
      interaction.guild,
      new EmbedBuilder()
        .setColor(COLOR.info)
        .setTitle('🧽 Mensajes borrados (/clear)')
        .addFields(
          { name: 'Moderador', value: `${interaction.user}`, inline: true },
          { name: 'Canal', value: `${canal}`, inline: true },
          { name: 'Cantidad', value: String(borrados.size), inline: true },
          ...(usuario ? [{ name: 'Filtrado por', value: `${usuario}`, inline: true }] : []),
        )
        .setTimestamp(),
    );
  } catch (err) {
    console.error('[moderacion] Error en /clear:', err);
    await interaction.editReply('❌ No pude borrar los mensajes. Revisa que tenga permiso de **Gestionar mensajes** en este canal.');
  }
}

// ═══════════════════════════════════════
// /modconfig — CONFIGURACIÓN POR SERVIDOR
// ═══════════════════════════════════════
function dominioDe(enlace) {
  return enlace
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#:]/)[0];
}

async function cmdModConfig(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    return responderError(interaction, '🚫 Necesitas el permiso **Gestionar servidor** para usar esto.');
  }

  const guild = interaction.guild;
  const grupo = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  const cfg = getConfig(guild.id);

  // ─── ver ───
  if (!grupo && sub === 'ver') {
    const lista = (arr, fmt = (x) => x) => (arr.length ? arr.map(fmt).join(', ').slice(0, 900) : '*ninguno*');
    const embed = new EmbedBuilder()
      .setColor(COLOR.info)
      .setTitle(`⚙️ Moderación — ${guild.name}`)
      .addFields(
        { name: '📝 Canal de logs', value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : '*no configurado*' },
        { name: '🔗 Antilinks', value: `${cfg.antilinks.enabled ? '✅ Activado' : '❌ Desactivado'}\nDominios permitidos: ${lista(cfg.antilinks.dominiosPermitidos, (d) => `\`${d}\``)}` },
        { name: '🤬 Filtro de palabras', value: `${cfg.palabras.enabled ? '✅ Activado' : '❌ Desactivado'}\nPalabras en la lista: **${cfg.palabras.lista.length}**` },
        {
          name: '⚠️ Warns automáticos',
          value: cfg.warns.limite > 0
            ? `Al llegar a **${cfg.warns.limite}** warns → **${cfg.warns.accion}**${cfg.warns.accion === 'timeout' ? ` (${cfg.warns.minutos} min)` : ''}`
            : '*desactivado*',
        },
        { name: '🚪 Canales exentos del automod', value: lista(cfg.canalesExentos, (id) => `<#${id}>`) },
      );
    return interaction.reply({ embeds: [embed], flags: EFIMERO });
  }

  // ─── logs ───
  if (grupo === 'logs') {
    if (sub === 'canal') {
      const opcion = interaction.options.getChannel('canal', true);
      const canal = guild.channels.cache.get(opcion.id) ?? opcion;
      const yo = await guild.members.fetchMe();
      const permisos = canal.permissionsFor(yo);
      if (!permisos?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return responderError(interaction, `❌ No tengo permisos para **ver, enviar mensajes y adjuntar enlaces** en ${canal}.`);
      }
      cfg.logChannelId = canal.id;
      setConfig(guild.id, cfg);
      return interaction.reply({ content: `✅ Los logs de este servidor ahora se enviarán a ${canal}.`, flags: EFIMERO });
    }
    if (sub === 'quitar') {
      cfg.logChannelId = null;
      setConfig(guild.id, cfg);
      return interaction.reply({ content: '✅ Logs desactivados en este servidor.', flags: EFIMERO });
    }
  }

  // ─── antilinks ───
  if (grupo === 'antilinks') {
    if (sub === 'estado') {
      cfg.antilinks.enabled = interaction.options.getBoolean('activar', true);
      setConfig(guild.id, cfg);
      return interaction.reply({ content: `✅ Antilinks **${cfg.antilinks.enabled ? 'activado' : 'desactivado'}**.`, flags: EFIMERO });
    }
    if (sub === 'permitir') {
      const dominio = dominioDe(interaction.options.getString('dominio', true).trim());
      if (!dominio.includes('.')) return responderError(interaction, '❌ Escribe un dominio válido, por ejemplo `youtube.com`.');
      if (cfg.antilinks.dominiosPermitidos.length >= 50) return responderError(interaction, '❌ Máximo 50 dominios permitidos.');
      if (!cfg.antilinks.dominiosPermitidos.includes(dominio)) cfg.antilinks.dominiosPermitidos.push(dominio);
      setConfig(guild.id, cfg);
      return interaction.reply({ content: `✅ Dominio permitido: \`${dominio}\` (incluye sus subdominios).`, flags: EFIMERO });
    }
    if (sub === 'quitar') {
      const dominio = dominioDe(interaction.options.getString('dominio', true).trim());
      const antes = cfg.antilinks.dominiosPermitidos.length;
      cfg.antilinks.dominiosPermitidos = cfg.antilinks.dominiosPermitidos.filter((d) => d !== dominio);
      if (cfg.antilinks.dominiosPermitidos.length === antes) return responderError(interaction, '❌ Ese dominio no estaba en la lista.');
      setConfig(guild.id, cfg);
      return interaction.reply({ content: `✅ Dominio \`${dominio}\` quitado de la lista permitida.`, flags: EFIMERO });
    }
  }

  // ─── palabras ───
  if (grupo === 'palabras') {
    if (sub === 'estado') {
      cfg.palabras.enabled = interaction.options.getBoolean('activar', true);
      setConfig(guild.id, cfg);
      return interaction.reply({ content: `✅ Filtro de palabras **${cfg.palabras.enabled ? 'activado' : 'desactivado'}**.`, flags: EFIMERO });
    }
    if (sub === 'agregar') {
      const nuevas = interaction.options
        .getString('palabras', true)
        .split(',')
        .map((p) => normalizarTexto(p.trim()))
        .filter((p) => p.length >= 2 && p.length <= 40);
      if (!nuevas.length) return responderError(interaction, '❌ No detecté palabras válidas (2 a 40 caracteres, separadas por coma).');
      let agregadas = 0;
      for (const p of nuevas) {
        if (cfg.palabras.lista.length >= 300) break;
        if (!cfg.palabras.lista.includes(p)) {
          cfg.palabras.lista.push(p);
          agregadas++;
        }
      }
      setConfig(guild.id, cfg);
      return interaction.reply({ content: `✅ Se agregaron **${agregadas}** palabra(s). Total: **${cfg.palabras.lista.length}**.`, flags: EFIMERO });
    }
    if (sub === 'quitar') {
      const palabra = normalizarTexto(interaction.options.getString('palabra', true).trim());
      const antes = cfg.palabras.lista.length;
      cfg.palabras.lista = cfg.palabras.lista.filter((p) => p !== palabra);
      if (cfg.palabras.lista.length === antes) return responderError(interaction, '❌ Esa palabra no estaba en la lista.');
      setConfig(guild.id, cfg);
      return interaction.reply({ content: '✅ Palabra eliminada de la lista.', flags: EFIMERO });
    }
    if (sub === 'lista') {
      const texto = cfg.palabras.lista.length ? cfg.palabras.lista.map((p) => `||${p}||`).join(' ').slice(0, 1900) : '*La lista está vacía.*';
      return interaction.reply({ content: `**Palabras prohibidas (${cfg.palabras.lista.length}):**\n${texto}`, flags: EFIMERO });
    }
  }

  // ─── warns automáticos ───
  if (grupo === 'warns' && sub === 'limite') {
    const limite = interaction.options.getInteger('limite', true);
    const accion = interaction.options.getString('accion') || cfg.warns.accion;
    const minutos = interaction.options.getInteger('minutos') || cfg.warns.minutos;
    cfg.warns = { limite, accion, minutos };
    setConfig(guild.id, cfg);
    return interaction.reply({
      content: limite === 0
        ? '✅ Sanción automática por warns **desactivada**.'
        : `✅ Al llegar a **${limite}** warns → **${accion}**${accion === 'timeout' ? ` (${minutos} min)` : ''}.`,
      flags: EFIMERO,
    });
  }

  // ─── canales exentos ───
  if (grupo === 'exentos') {
    const canal = interaction.options.getChannel('canal', true);
    if (sub === 'canal-agregar') {
      if (!cfg.canalesExentos.includes(canal.id)) cfg.canalesExentos.push(canal.id);
      setConfig(guild.id, cfg);
      return interaction.reply({ content: `✅ ${canal} ahora está exento del antilinks y del filtro de palabras.`, flags: EFIMERO });
    }
    if (sub === 'canal-quitar') {
      cfg.canalesExentos = cfg.canalesExentos.filter((id) => id !== canal.id);
      setConfig(guild.id, cfg);
      return interaction.reply({ content: `✅ ${canal} ya no está exento.`, flags: EFIMERO });
    }
  }
}

// ═══════════════════════════════════════
// AUTOMOD: ANTILINKS + FILTRO DE PALABRAS
// ═══════════════════════════════════════
const REGEX_LINK = /(?:https?:\/\/|www\.)[^\s<>]+|(?:discord(?:app)?\.com\/invite|discord\.gg|dsc\.gg)\/[^\s<>]+|\b[a-z0-9-]{2,}(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|gg|xyz|tv|app|dev|info|site|online|shop|link|store|club|top|ly|gl)\b(?:\/[^\s<>]*)?/gi;

function enlaceBloqueado(texto, permitidos) {
  const encontrados = texto.match(REGEX_LINK) || [];
  return (
    encontrados.find((enlace) => {
      const dominio = dominioDe(enlace);
      return !permitidos.some((p) => dominio === p || dominio.endsWith(`.${p}`));
    }) || null
  );
}

function palabraProhibida(texto, lista) {
  const t = normalizarTexto(texto);
  for (const palabra of lista) {
    const esc = palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(t)) return palabra;
  }
  return null;
}

async function aplicarViolacion(message, tipo, detalle) {
  marcar(borradosPorBot, message.id);
  const borrado = await message.delete().then(() => true).catch(() => false);
  if (!borrado) return false;

  const aviso = await message.channel
    .send({ content: `${message.author}, ${tipo === 'link' ? '🔗 no se permiten enlaces aquí.' : '🚫 ese lenguaje no está permitido aquí.'}` })
    .catch(() => null);
  if (aviso) setTimeout(() => aviso.delete().catch(() => {}), 5000);

  await enviarLog(
    message.guild,
    new EmbedBuilder()
      .setColor(COLOR.automod)
      .setTitle(tipo === 'link' ? '🔗 Automod — enlace bloqueado' : '🤬 Automod — palabra bloqueada')
      .addFields(
        { name: 'Usuario', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
        { name: 'Canal', value: `${message.channel}`, inline: true },
        { name: 'Detalle', value: detalle.slice(0, 1024) },
        { name: 'Mensaje', value: (message.content || '—').slice(0, 1024) },
      )
      .setTimestamp(),
  );
  return true;
}

async function revisarMensaje(message) {
  if (!message.guild || !message.author || message.author.bot || message.webhookId || message.system) return false;
  if (!message.content) return false;

  const cfg = getConfig(message.guild.id);
  if (!cfg.antilinks.enabled && !cfg.palabras.enabled) return false;
  if (cfg.canalesExentos.includes(message.channelId) || cfg.canalesExentos.includes(message.channel?.parentId)) return false;

  const miembro = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (miembro?.permissions.has(PermissionFlagsBits.ManageMessages)) return false; // staff exento

  if (cfg.antilinks.enabled) {
    const enlace = enlaceBloqueado(message.content, cfg.antilinks.dominiosPermitidos);
    if (enlace) return aplicarViolacion(message, 'link', `Enlace: \`${enlace.slice(0, 200)}\``);
  }
  if (cfg.palabras.enabled) {
    const palabra = palabraProhibida(message.content, cfg.palabras.lista);
    if (palabra) return aplicarViolacion(message, 'palabra', `Palabra: ||${palabra}||`);
  }
  return false;
}

// ═══════════════════════════════════════
// INICIALIZACIÓN: eventos + logs
// ═══════════════════════════════════════
async function manejarInteraccion(interaction) {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;

  const mapa = {
    ban: cmdBan,
    unban: cmdUnban,
    kick: cmdKick,
    timeout: cmdTimeout,
    untimeout: cmdUntimeout,
    warn: cmdWarn,
    warnings: cmdWarnings,
    unwarn: cmdUnwarn,
    clearwarns: cmdClearWarns,
    clear: cmdClear,
    modconfig: cmdModConfig,
  };

  const handler = mapa[interaction.commandName];
  if (!handler) return;

  try {
    await handler(interaction);
  } catch (err) {
    console.error(`[moderacion] Error en /${interaction.commandName}:`, err);
    const msg = { content: '❌ Ocurrió un error inesperado ejecutando el comando.', flags: EFIMERO };
    if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
}

function iniciarModeracion(client) {
  // Canal de logs inicial (una sola vez, solo si ese servidor no tiene uno)
  client.once('clientReady', async () => {
    try {
      const canal = await client.channels.fetch(CANAL_LOGS_INICIAL).catch(() => null);
      if (canal?.guild) {
        const cfg = getConfig(canal.guild.id);
        if (!cfg.logChannelId) {
          cfg.logChannelId = canal.id;
          setConfig(canal.guild.id, cfg);
          console.log(`[moderacion] Canal de logs inicial asignado a "${canal.guild.name}".`);
        }
      }
    } catch (err) {
      console.error('[moderacion] No pude asignar el canal de logs inicial:', err.message);
    }
  });

  client.on('interactionCreate', manejarInteraccion);

  // Automod
  client.on('messageCreate', async (message) => {
    try {
      await revisarMensaje(message);
    } catch (err) {
      console.error('[moderacion] Error en automod:', err);
    }
  });

  // Mensaje borrado
  client.on('messageDelete', async (message) => {
    try {
      if (!message.guild || message.author?.bot) return;
      if (borradosPorBot.has(message.id)) return;
      if (!getConfig(message.guild.id).logChannelId) return;

      const contenido = message.content || (message.partial ? '*(no disponible: mensaje antiguo)*' : '*(sin texto)*');
      const adjuntos = message.attachments?.size ? `\n📎 ${message.attachments.size} archivo(s) adjunto(s)` : '';

      await enviarLog(
        message.guild,
        new EmbedBuilder()
          .setColor(COLOR.borrado)
          .setTitle('🗑️ Mensaje borrado')
          .addFields(
            { name: 'Autor', value: message.author ? `${message.author} (\`${message.author.id}\`)` : '*desconocido*', inline: true },
            { name: 'Canal', value: `${message.channel}`, inline: true },
            { name: 'Contenido', value: `${contenido}${adjuntos}`.slice(0, 1024) },
          )
          .setTimestamp(),
      );
    } catch (err) {
      console.error('[moderacion] Error en log de mensaje borrado:', err.message);
    }
  });

  // Mensaje editado (+ automod sobre la edición)
  client.on('messageUpdate', async (viejo, nuevo) => {
    try {
      if (nuevo.partial) nuevo = await nuevo.fetch();
      if (!nuevo.guild || nuevo.author?.bot) return;
      if (viejo.content === nuevo.content) return;
      if (await revisarMensaje(nuevo)) return;
      if (!getConfig(nuevo.guild.id).logChannelId) return;

      await enviarLog(
        nuevo.guild,
        new EmbedBuilder()
          .setColor(COLOR.editado)
          .setTitle('✏️ Mensaje editado')
          .setURL(nuevo.url)
          .addFields(
            { name: 'Autor', value: `${nuevo.author} (\`${nuevo.author.id}\`)`, inline: true },
            { name: 'Canal', value: `${nuevo.channel}`, inline: true },
            { name: 'Antes', value: (viejo.content || '*(desconocido)*').slice(0, 1024) },
            { name: 'Después', value: (nuevo.content || '*(sin texto)*').slice(0, 1024) },
          )
          .setTimestamp(),
      );
    } catch (err) {
      console.error('[moderacion] Error en messageUpdate:', err.message);
    }
  });

  // Bans/unbans hechos manualmente (fuera del bot)
  client.on('guildBanAdd', async (ban) => {
    try {
      if (recientes.has(`ban:${ban.guild.id}:${ban.user.id}`)) return;
      if (ban.partial) ban = await ban.fetch().catch(() => ban);
      const ejecutor = await buscarEjecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      await enviarLog(
        ban.guild,
        embedAccion({
          color: COLOR.ban,
          titulo: '🔨 Usuario baneado (manual)',
          usuario: ban.user,
          moderador: ejecutor,
          motivo: ban.reason || 'Sin motivo especificado',
        }),
      );
    } catch (err) {
      console.error('[moderacion] Error en guildBanAdd:', err.message);
    }
  });

  client.on('guildBanRemove', async (ban) => {
    try {
      if (recientes.has(`unban:${ban.guild.id}:${ban.user.id}`)) return;
      const ejecutor = await buscarEjecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
      await enviarLog(
        ban.guild,
        embedAccion({
          color: COLOR.ok,
          titulo: '✅ Usuario desbaneado (manual)',
          usuario: ban.user,
          moderador: ejecutor,
          motivo: 'Desbaneo hecho desde Discord',
        }),
      );
    } catch (err) {
      console.error('[moderacion] Error en guildBanRemove:', err.message);
    }
  });

  console.log('[moderacion] Módulo de moderación iniciado.');
}

// ═══════════════════════════════════════
// DEFINICIÓN DE SLASH COMMANDS (los usa deploy-commands.js)
// ═══════════════════════════════════════
const soloServidor = InteractionContextType.Guild;

const comandosDefinicion = [
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea a un usuario del servidor')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuario a banear').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo del ban').setMaxLength(400))
    .addIntegerOption((o) => o.setName('borrar_mensajes_dias').setDescription('Días de mensajes a borrar (0-7)').setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(soloServidor),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Desbanea a un usuario por su ID')
    .addStringOption((o) => o.setName('id').setDescription('ID del usuario baneado').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo del desbaneo').setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(soloServidor),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa a un usuario del servidor')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuario a expulsar').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo de la expulsión').setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setContexts(soloServidor),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Aísla temporalmente a un usuario')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuario a aislar').setRequired(true))
    .addStringOption((o) => o.setName('duracion').setDescription('Ej: 30s, 10m, 2h, 1d (máx. 28d)').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo del timeout').setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(soloServidor),

  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Quita el timeout a un usuario')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(soloServidor),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Advierte a un usuario')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuario a advertir').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo de la advertencia').setRequired(true).setMaxLength(400))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(soloServidor),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Ver las advertencias de un usuario')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(soloServidor),

  new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Elimina una advertencia específica de un usuario')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption((o) => o.setName('id').setDescription('ID del warn (se ve en /warnings)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(soloServidor),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Elimina todas las advertencias de un usuario')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(soloServidor),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Borra mensajes del canal actual')
    .addIntegerOption((o) => o.setName('cantidad').setDescription('Cantidad de mensajes (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('usuario').setDescription('Borrar solo los mensajes de este usuario'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(soloServidor),

  new SlashCommandBuilder()
    .setName('modconfig')
    .setDescription('Configura la moderación de este servidor')
    .addSubcommandGroup((g) =>
      g
        .setName('logs')
        .setDescription('Canal de logs de moderación')
        .addSubcommand((s) =>
          s
            .setName('canal')
            .setDescription('Define el canal donde se envían los logs')
            .addChannelOption((o) =>
              o.setName('canal').setDescription('Canal de texto').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true),
            ),
        )
        .addSubcommand((s) => s.setName('quitar').setDescription('Desactiva los logs')),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('antilinks')
        .setDescription('Bloqueo de enlaces')
        .addSubcommand((s) =>
          s
            .setName('estado')
            .setDescription('Activa o desactiva el antilinks')
            .addBooleanOption((o) => o.setName('activar').setDescription('true = activar, false = desactivar').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('permitir')
            .setDescription('Permite un dominio (ej. youtube.com)')
            .addStringOption((o) => o.setName('dominio').setDescription('Dominio a permitir').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('quitar')
            .setDescription('Quita un dominio de la lista permitida')
            .addStringOption((o) => o.setName('dominio').setDescription('Dominio a quitar').setRequired(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('palabras')
        .setDescription('Filtro de palabras prohibidas')
        .addSubcommand((s) =>
          s
            .setName('estado')
            .setDescription('Activa o desactiva el filtro')
            .addBooleanOption((o) => o.setName('activar').setDescription('true = activar, false = desactivar').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('agregar')
            .setDescription('Agrega palabras (separadas por coma)')
            .addStringOption((o) => o.setName('palabras').setDescription('Ej: palabra1, palabra2').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('quitar')
            .setDescription('Quita una palabra de la lista')
            .addStringOption((o) => o.setName('palabra').setDescription('Palabra a quitar').setRequired(true)),
        )
        .addSubcommand((s) => s.setName('lista').setDescription('Muestra la lista de palabras (solo tú la ves)')),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('warns')
        .setDescription('Sanción automática por acumulación de warns')
        .addSubcommand((s) =>
          s
            .setName('limite')
            .setDescription('Define cuántos warns activan una sanción (0 = desactivar)')
            .addIntegerOption((o) => o.setName('limite').setDescription('Cantidad de warns (0-20)').setRequired(true).setMinValue(0).setMaxValue(20))
            .addStringOption((o) =>
              o
                .setName('accion')
                .setDescription('Sanción a aplicar')
                .addChoices({ name: 'Timeout', value: 'timeout' }, { name: 'Kick', value: 'kick' }, { name: 'Ban', value: 'ban' }),
            )
            .addIntegerOption((o) => o.setName('minutos').setDescription('Minutos de timeout (solo si la acción es timeout)').setMinValue(1).setMaxValue(40320)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('exentos')
        .setDescription('Canales exentos de antilinks y filtro de palabras')
        .addSubcommand((s) =>
          s
            .setName('canal-agregar')
            .setDescription('Exenta un canal o categoría')
            .addChannelOption((o) =>
              o.setName('canal').setDescription('Canal o categoría').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory).setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName('canal-quitar')
            .setDescription('Quita la exención de un canal o categoría')
            .addChannelOption((o) =>
              o.setName('canal').setDescription('Canal o categoría').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory).setRequired(true),
            ),
        ),
    )
    .addSubcommand((s) => s.setName('ver').setDescription('Muestra la configuración actual de este servidor'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(soloServidor),
];

// ═══════════════════════════════════════
// COMANDOS CON PREFIJO §
// • El dueño del bot (OWNER_ID en index.js) puede usarlos SIEMPRE, en
//   cualquier servidor, saltándose permisos y jerarquía.
// • Los demás necesitan el permiso de Discord correspondiente en ESE
//   servidor (ban → Banear, kick → Expulsar, etc.) y siguen sujetos a
//   la jerarquía de roles. Todo se guarda en la config de cada servidor.
// • También existe §modconfig para configurar logs/antilinks/palabras.
// ═══════════════════════════════════════

// Permiso de Discord exigido a quien NO es el dueño del bot
const PERMISO_PREFIJO = {
  ban: PermissionFlagsBits.BanMembers,
  unban: PermissionFlagsBits.BanMembers,
  kick: PermissionFlagsBits.KickMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  untimeout: PermissionFlagsBits.ModerateMembers,
  warn: PermissionFlagsBits.ModerateMembers,
  warnings: PermissionFlagsBits.ModerateMembers,
  unwarn: PermissionFlagsBits.ModerateMembers,
  clearwarns: PermissionFlagsBits.ModerateMembers,
  clear: PermissionFlagsBits.ManageMessages,
  modconfig: PermissionFlagsBits.ManageGuild,
};

// Alias cómodos
const ALIAS_PREFIJO = {
  mute: 'timeout',
  unmute: 'untimeout',
  silenciar: 'timeout',
  purge: 'clear',
  purgar: 'clear',
  warns: 'warnings',
  advertencias: 'warnings',
  expulsar: 'kick',
  banear: 'ban',
  desbanear: 'unban',
  config: 'modconfig',
  mod: 'modconfig',
};

const COMANDOS_PREFIJO = {
  ban: { fn: cmdBan, uso: '§ban <@usuario|id> [motivo]' },
  unban: { fn: cmdUnban, uso: '§unban <id> [motivo]' },
  kick: { fn: cmdKick, uso: '§kick <@usuario|id> [motivo]' },
  timeout: { fn: cmdTimeout, uso: '§timeout <@usuario|id> <duración: 30s|10m|2h|1d> [motivo]' },
  untimeout: { fn: cmdUntimeout, uso: '§untimeout <@usuario|id> [motivo]' },
  warn: { fn: cmdWarn, uso: '§warn <@usuario|id> <motivo>' },
  warnings: { fn: cmdWarnings, uso: '§warnings <@usuario|id>' },
  unwarn: { fn: cmdUnwarn, uso: '§unwarn <@usuario|id> <id del warn>' },
  clearwarns: { fn: cmdClearWarns, uso: '§clearwarns <@usuario|id>' },
  clear: { fn: cmdClear, uso: '§clear <1-100> [@usuario|id]' },
};

const REGEX_USUARIO = /^<@!?(\d{15,25})>$|^(\d{15,25})$/;

async function resolverUsuario(client, token) {
  const m = REGEX_USUARIO.exec(token || '');
  if (!m) return null;
  return client.users.fetch(m[1] || m[2]).catch(() => null);
}

// Devuelve { users, strings, ints } o null si los argumentos son inválidos
async function parsearArgumentosPrefijo(cmd, args, client) {
  const opts = { users: {}, strings: {}, ints: {} };
  const resto = (desde) => args.slice(desde).join(' ').trim().slice(0, 400) || null;
  const pedirUsuario = async (i) => {
    const u = await resolverUsuario(client, args[i]);
    if (u) opts.users.usuario = u;
    return !!u;
  };

  switch (cmd) {
    case 'ban':
    case 'kick':
    case 'untimeout':
      if (!(await pedirUsuario(0))) return null;
      opts.strings.motivo = resto(1);
      break;
    case 'unban':
      if (!args[0]) return null;
      opts.strings.id = args[0];
      opts.strings.motivo = resto(1);
      break;
    case 'timeout':
      if (!(await pedirUsuario(0)) || !args[1]) return null;
      opts.strings.duracion = args[1];
      opts.strings.motivo = resto(2);
      break;
    case 'warn':
      if (!(await pedirUsuario(0)) || !resto(1)) return null;
      opts.strings.motivo = resto(1);
      break;
    case 'warnings':
    case 'clearwarns':
      if (!(await pedirUsuario(0))) return null;
      break;
    case 'unwarn':
      if (!(await pedirUsuario(0)) || !args[1]) return null;
      opts.strings.id = args[1];
      break;
    case 'clear': {
      const n = parseInt(args[0], 10);
      if (!n || n < 1 || n > 100) return null;
      opts.ints.cantidad = n;
      if (args[1] && !(await pedirUsuario(1))) return null;
      break;
    }
    default:
      return null;
  }
  return opts;
}

function crearInteraccionPrefijo(message, opts, cmd, esOwnerBot) {
  const enviar = async (contenido) => {
    const { flags, ...resto } = typeof contenido === 'string' ? { content: contenido } : contenido;
    const payload = { ...resto, allowedMentions: { repliedUser: false, parse: [] } };
    const enviado = await message.reply(payload).catch(() => message.channel.send(payload).catch(() => null));
    if (cmd === 'clear' && enviado) setTimeout(() => enviado.delete().catch(() => {}), 5000);
    return enviado;
  };

  return {
    esPrefijo: true,
    esOwnerBot,
    guild: message.guild,
    guildId: message.guild.id,
    channel: message.channel,
    member: message.member,
    user: message.author,
    client: message.client,
    memberPermissions: esOwnerBot ? { has: () => true } : message.member.permissions,
    replied: false,
    deferred: false,
    reply: enviar,
    followUp: enviar,
    editReply: enviar,
    deferReply: async () => {},
    options: {
      getUser: (n) => opts.users[n] ?? null,
      getString: (n) => opts.strings[n] ?? null,
      getInteger: (n) => opts.ints[n] ?? null,
    },
  };
}

// ─── §modconfig: configuración por servidor sin usar slash ──────────
const USO_MODCONFIG = [
  '**Configuración de este servidor** (también disponible con `/modconfig`)',
  '`§modconfig ver`',
  '`§modconfig logs <#canal | off>`',
  '`§modconfig antilinks on|off`',
  '`§modconfig antilinks permitir|quitar <dominio>`',
  '`§modconfig palabras on|off`',
  '`§modconfig palabras agregar <palabra1, palabra2>`',
  '`§modconfig palabras quitar <palabra>`',
  '`§modconfig warns <límite 0-20> [timeout|kick|ban] [minutos]`',
  '`§modconfig exentos agregar|quitar <#canal>`',
].join('\n');

function resolverCanalId(token) {
  const m = /^<#(\d{15,25})>$|^(\d{15,25})$/.exec((token || '').trim());
  return m ? m[1] || m[2] : null;
}

async function cmdModConfigPrefijo(message, args) {
  const responder = (texto) =>
    message.reply({ content: texto, allowedMentions: { repliedUser: false, parse: [] } }).catch(() => {});

  const guildId = message.guild.id;
  const cfg = getConfig(guildId);
  const sub = (args[0] || '').toLowerCase();
  const valor = (args[1] || '').toLowerCase();
  const resto = args.slice(2).join(' ').trim();

  if (!sub || sub === 'ayuda' || sub === 'help') return responder(USO_MODCONFIG);

  if (sub === 'ver') {
    const embed = new EmbedBuilder()
      .setColor(COLOR.info)
      .setTitle(`⚙️ Configuración de moderación — ${message.guild.name}`)
      .addFields(
        { name: 'Canal de logs', value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'Sin configurar' },
        {
          name: 'Antilinks',
          value: `${cfg.antilinks.enabled ? 'Activado' : 'Desactivado'}\nDominios permitidos: ${
            cfg.antilinks.dominiosPermitidos.length ? cfg.antilinks.dominiosPermitidos.join(', ') : 'ninguno'
          }`,
        },
        {
          name: 'Filtro de palabras',
          value: `${cfg.palabras.enabled ? 'Activado' : 'Desactivado'} — ${cfg.palabras.lista.length} palabra(s)`,
        },
        {
          name: 'Warns automáticos',
          value: cfg.warns.limite
            ? `A los ${cfg.warns.limite} warns → ${cfg.warns.accion}${cfg.warns.accion === 'timeout' ? ` (${cfg.warns.minutos} min)` : ''}`
            : 'Desactivado',
        },
        {
          name: 'Canales exentos',
          value: cfg.canalesExentos.length ? cfg.canalesExentos.map((c) => `<#${c}>`).join(' ') : 'ninguno',
        },
      )
      .setTimestamp();
    return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => {});
  }

  if (sub === 'logs') {
    if (valor === 'off' || valor === 'quitar' || valor === 'ninguno') {
      cfg.logChannelId = null;
      setConfig(guildId, cfg);
      return responder('✅ Canal de logs desactivado en este servidor.');
    }
    const id = resolverCanalId(args[1]);
    if (!id) return responder('❌ Uso: `§modconfig logs <#canal | off>`');
    const canal = await message.guild.channels.fetch(id).catch(() => null);
    if (!canal?.isTextBased()) return responder('❌ Ese canal no existe o no es de texto.');
    cfg.logChannelId = id;
    setConfig(guildId, cfg);
    return responder(`✅ Los logs de moderación de este servidor se enviarán a <#${id}>.`);
  }

  if (sub === 'antilinks' || sub === 'antilink') {
    if (valor === 'on' || valor === 'off') {
      cfg.antilinks.enabled = valor === 'on';
      setConfig(guildId, cfg);
      return responder(`✅ Antilinks ${cfg.antilinks.enabled ? 'activado' : 'desactivado'} en este servidor.`);
    }
    if (valor === 'permitir' || valor === 'quitar') {
      const dominio = normalizarTexto(resto).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      if (!dominio) return responder('❌ Uso: `§modconfig antilinks permitir|quitar <dominio>`');
      const lista = new Set(cfg.antilinks.dominiosPermitidos);
      if (valor === 'permitir') lista.add(dominio);
      else lista.delete(dominio);
      cfg.antilinks.dominiosPermitidos = [...lista];
      setConfig(guildId, cfg);
      return responder(
        `✅ Dominio \`${dominio}\` ${valor === 'permitir' ? 'agregado a' : 'quitado de'} la lista de permitidos.`,
      );
    }
    if (valor === 'lista') {
      const l = cfg.antilinks.dominiosPermitidos;
      return responder(l.length ? `🔗 Dominios permitidos: ${l.join(', ')}` : '🔗 No hay dominios permitidos.');
    }
    return responder('❌ Uso: `§modconfig antilinks on|off | permitir <dominio> | quitar <dominio> | lista`');
  }

  if (sub === 'palabras' || sub === 'palabra') {
    if (valor === 'on' || valor === 'off') {
      cfg.palabras.enabled = valor === 'on';
      setConfig(guildId, cfg);
      return responder(`✅ Filtro de palabras ${cfg.palabras.enabled ? 'activado' : 'desactivado'} en este servidor.`);
    }
    if (valor === 'agregar') {
      const nuevas = resto.split(',').map((p) => normalizarTexto(p).trim()).filter(Boolean);
      if (!nuevas.length) return responder('❌ Uso: `§modconfig palabras agregar <palabra1, palabra2>`');
      cfg.palabras.lista = [...new Set([...cfg.palabras.lista, ...nuevas])];
      setConfig(guildId, cfg);
      return responder(`✅ Agregada(s) ${nuevas.length} palabra(s). Total: ${cfg.palabras.lista.length}.`);
    }
    if (valor === 'quitar') {
      const p = normalizarTexto(resto).trim();
      if (!p) return responder('❌ Uso: `§modconfig palabras quitar <palabra>`');
      const antes = cfg.palabras.lista.length;
      cfg.palabras.lista = cfg.palabras.lista.filter((x) => x !== p);
      setConfig(guildId, cfg);
      return responder(antes === cfg.palabras.lista.length ? '❌ Esa palabra no estaba en la lista.' : `✅ Palabra quitada. Total: ${cfg.palabras.lista.length}.`);
    }
    if (valor === 'lista') {
      return responder(
        cfg.palabras.lista.length
          ? `🚫 Palabras filtradas (${cfg.palabras.lista.length}): ||${cfg.palabras.lista.join(', ').slice(0, 1800)}||`
          : '🚫 La lista de palabras está vacía.',
      );
    }
    return responder('❌ Uso: `§modconfig palabras on|off | agregar <p1, p2> | quitar <p> | lista`');
  }

  if (sub === 'warns' || sub === 'warn') {
    const limite = parseInt(args[1], 10);
    if (isNaN(limite) || limite < 0 || limite > 20) {
      return responder('❌ Uso: `§modconfig warns <límite 0-20> [timeout|kick|ban] [minutos]` (0 = desactivar)');
    }
    cfg.warns.limite = limite;
    const accion = (args[2] || '').toLowerCase();
    if (['timeout', 'kick', 'ban'].includes(accion)) cfg.warns.accion = accion;
    const minutos = parseInt(args[3], 10);
    if (!isNaN(minutos) && minutos > 0 && minutos <= 40320) cfg.warns.minutos = minutos;
    setConfig(guildId, cfg);
    return responder(
      limite === 0
        ? '✅ Sanción automática por warns desactivada.'
        : `✅ A los **${limite}** warns se aplicará **${cfg.warns.accion}**${cfg.warns.accion === 'timeout' ? ` de ${cfg.warns.minutos} minutos` : ''}.`,
    );
  }

  if (sub === 'exentos' || sub === 'exento') {
    const id = resolverCanalId(args[2]);
    if (!['agregar', 'quitar'].includes(valor) || !id) {
      return responder('❌ Uso: `§modconfig exentos agregar|quitar <#canal>`');
    }
    const lista = new Set(cfg.canalesExentos);
    if (valor === 'agregar') lista.add(id);
    else lista.delete(id);
    cfg.canalesExentos = [...lista];
    setConfig(guildId, cfg);
    return responder(`✅ <#${id}> ${valor === 'agregar' ? 'ahora está exento' : 'ya no está exento'} del automod.`);
  }

  return responder(USO_MODCONFIG);
}

// Devuelve true si el comando era de moderación (y fue manejado)
// opciones.esOwnerBot = true → el dueño del bot; se salta permisos y jerarquía.
async function manejarComandoPrefijo(message, cmd, args, opciones = {}) {
  if (!message.guild || !message.member) return false;

  const esOwnerBot = opciones.esOwnerBot === true;
  const nombre = ALIAS_PREFIJO[cmd] || cmd;
  const def = COMANDOS_PREFIJO[nombre];
  if (!def && nombre !== 'modconfig') return false;

  // Permisos: el dueño del bot siempre puede; el resto necesita el permiso
  // correspondiente EN ESE SERVIDOR.
  if (!esOwnerBot) {
    const permiso = PERMISO_PREFIJO[nombre];
    if (!permiso || !message.member.permissions.has(permiso)) {
      await message
        .reply({ content: '❌ No tienes permisos para usar ese comando en este servidor.', allowedMentions: { repliedUser: false } })
        .catch(() => {});
      return true;
    }
  }

  try {
    if (nombre === 'modconfig') {
      await cmdModConfigPrefijo(message, args.filter(Boolean));
      return true;
    }

    const opts = await parsearArgumentosPrefijo(nombre, args.filter(Boolean), message.client);
    if (!opts) {
      await message.reply({ content: `❌ Uso: \`${def.uso}\``, allowedMentions: { repliedUser: false } });
      return true;
    }
    if (nombre === 'clear') {
      marcar(borradosPorBot, message.id);
      await message.delete().catch(() => {}); // que el propio comando no cuente como mensaje a borrar
    }
    await def.fn(crearInteraccionPrefijo(message, opts, nombre, esOwnerBot));
  } catch (err) {
    console.error(`[moderacion] Error en §${nombre}:`, err);
    await message.channel.send('❌ Ocurrió un error inesperado ejecutando el comando.').catch(() => {});
  }
  return true;
}

module.exports = {
  iniciarModeracion,
  comandosDefinicion,
  manejarComandoPrefijo,
  // usados por panel.js para el panel de configuración dentro de Discord
  getConfig,
  setConfig,
};

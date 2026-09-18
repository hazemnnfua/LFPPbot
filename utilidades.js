// ═══════════════════════════════════════════════════════════════
// utilidades.js — Módulo multifunción (multi-servidor)
// Parte 1: base de datos, contexto unificado y helpers.
// Todos los comandos funcionan con / y con el prefijo §.
// El dueño del bot puede usar TODO con § sin importar permisos.
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  InteractionContextType,
  version: djsVersion,
} = require('discord.js');

const DB_PATH = path.join(__dirname, 'utilidades.json');
const EFIMERO = MessageFlags.Ephemeral;
const COLOR = { info: 0x3498db, ok: 0x2ecc71, error: 0xe74c3c, fun: 0x9b59b6, nivel: 0xf1c40f };

let db = { guilds: {}, xp: {} };

function cargarDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      db = { guilds: raw.guilds || {}, xp: raw.xp || {} };
    }
  } catch (err) {
    console.error('[utilidades] No pude leer utilidades.json:', err);
  }
}

let guardadoPendiente = false;
function guardarDB() {
  if (guardadoPendiente) return;
  guardadoPendiente = true;
  setTimeout(() => {
    guardadoPendiente = false;
    try {
      const tmp = `${DB_PATH}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, DB_PATH);
    } catch (err) {
      console.error('[utilidades] No pude guardar utilidades.json:', err);
    }
  }, 1500);
}

cargarDB();

function configPorDefecto() {
  return {
    bienvenida: { enabled: false, canalId: null, mensaje: '¡Bienvenido {usuario} a **{servidor}**! Ahora somos {miembros}.' },
    despedida: { enabled: false, canalId: null, mensaje: '{nombre} salió del servidor. Quedamos {miembros}.' },
    autorol: { roles: [] },
    niveles: { enabled: false, canalId: null, anunciar: true },
  };
}

function getCfgUtil(guildId) {
  const def = configPorDefecto();
  const act = db.guilds[guildId] || {};
  return {
    bienvenida: { ...def.bienvenida, ...(act.bienvenida || {}) },
    despedida: { ...def.despedida, ...(act.despedida || {}) },
    autorol: { ...def.autorol, ...(act.autorol || {}) },
    niveles: { ...def.niveles, ...(act.niveles || {}) },
  };
}

function setCfgUtil(guildId, cfg) {
  db.guilds[guildId] = cfg;
  guardarDB();
}

const nivelDesdeXp = (xp) => Math.floor(0.1 * Math.sqrt(xp));
const xpParaNivel = (n) => Math.pow(n / 0.1, 2);

function getXp(guildId, userId) {
  return db.xp[guildId]?.[userId] || { xp: 0, mensajes: 0 };
}

function setXp(guildId, userId, datos) {
  if (!db.xp[guildId]) db.xp[guildId] = {};
  db.xp[guildId][userId] = datos;
  guardarDB();
}

const snipes = new Map();
const afks = new Map();
const ultimoXp = new Map();

function parseDuracion(texto) {
  const m = /^(\d+)\s*(s|m|h|d)$/i.exec((texto || '').trim());
  if (!m) return null;
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()];
  const ms = parseInt(m[1], 10) * mult;
  if (ms < 1000 || ms > 30 * 86400000) return null;
  return ms;
}

function formatearMs(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ') || '0s';
}

const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];
const barra = (actual, total, largo = 14) => {
  const llenos = Math.max(0, Math.min(largo, Math.round((actual / total) * largo)));
  return '█'.repeat(llenos) + '░'.repeat(largo - llenos);
};

function plantilla(texto, member) {
  return String(texto)
    .replaceAll('{usuario}', `<@${member.id}>`)
    .replaceAll('{nombre}', member.user.username)
    .replaceAll('{tag}', member.user.tag)
    .replaceAll('{servidor}', member.guild.name)
    .replaceAll('{miembros}', String(member.guild.memberCount))
    .slice(0, 1900);
}

const REGEX_ID = /(\d{15,25})/;

async function resolverUsuario(client, token) {
  const m = REGEX_ID.exec(token || '');
  if (!m) return null;
  return client.users.fetch(m[1]).catch(() => null);
}

function resolverCanal(guild, token) {
  const m = REGEX_ID.exec(token || '');
  if (m) return guild.channels.cache.get(m[1]) || null;
  return guild.channels.cache.find((c) => c.name.toLowerCase() === (token || '').toLowerCase()) || null;
}

function resolverRol(guild, token) {
  const m = REGEX_ID.exec(token || '');
  if (m) return guild.roles.cache.get(m[1]) || null;
  return guild.roles.cache.find((r) => r.name.toLowerCase() === (token || '').toLowerCase()) || null;
}

function ctxDesdeInteraccion(interaction, def) {
  const valores = {};
  for (const a of def.args || []) {
    const g = {
      user: () => interaction.options.getUser(a.n),
      string: () => interaction.options.getString(a.n),
      int: () => interaction.options.getInteger(a.n),
      channel: () => interaction.options.getChannel(a.n),
      role: () => interaction.options.getRole(a.n),
      bool: () => interaction.options.getBoolean(a.n),
    }[a.t];
    valores[a.n] = g ? g() : null;
  }
  return {
    esPrefijo: false,
    esOwnerBot: false,
    guild: interaction.guild,
    channel: interaction.channel,
    member: interaction.member,
    user: interaction.user,
    client: interaction.client,
    opt: (n) => valores[n] ?? null,
    responder: (payload, efimero = false) => {
      const cuerpo = typeof payload === 'string' ? { content: payload } : payload;
      if (efimero) cuerpo.flags = EFIMERO;
      return interaction.replied || interaction.deferred ? interaction.followUp(cuerpo) : interaction.reply(cuerpo);
    },
  };
}

async function ctxDesdeMensaje(message, def, args, esOwnerBot) {
  const valores = {};
  const lista = def.args || [];
  let i = 0;
  for (const a of lista) {
    const esUltimo = a === lista[lista.length - 1];
    let token = args[i];
    if (a.t === 'string' && (a.rest || esUltimo)) token = args.slice(i).join(' ') || null;
    if (a.t === 'user') valores[a.n] = await resolverUsuario(message.client, token);
    else if (a.t === 'channel') valores[a.n] = resolverCanal(message.guild, token);
    else if (a.t === 'role') valores[a.n] = resolverRol(message.guild, token);
    else if (a.t === 'int') valores[a.n] = token != null && !isNaN(parseInt(token, 10)) ? parseInt(token, 10) : null;
    else if (a.t === 'bool') valores[a.n] = token ? ['si', 'sí', 'true', 'on', '1'].includes(token.toLowerCase()) : null;
    else valores[a.n] = token ?? null;
    i++;
  }
  return {
    esPrefijo: true,
    esOwnerBot,
    guild: message.guild,
    channel: message.channel,
    member: message.member,
    user: message.author,
    client: message.client,
    mensaje: message,
    opt: (n) => valores[n] ?? null,
    responder: (payload) => {
      const cuerpo = typeof payload === 'string' ? { content: payload } : { ...payload };
      delete cuerpo.flags;
      cuerpo.allowedMentions = cuerpo.allowedMentions || { repliedUser: false, parse: ['users'] };
      return message.reply(cuerpo).catch(() => message.channel.send(cuerpo).catch(() => null));
    },
  };
}

const P = PermissionFlagsBits;
const CMDS = {};

// ────────── INFORMACIÓN ──────────
Object.assign(CMDS, {
  ping: {
    cat: 'Información',
    desc: 'Muestra la latencia del bot',
    run: async (ctx) => {
      await ctx.responder({
        embeds: [new EmbedBuilder().setColor(COLOR.info).setTitle('🏓 Pong').setDescription(`**WebSocket:** ${Math.round(ctx.client.ws.ping)}ms`)],
      });
    },
  },
  botinfo: {
    cat: 'Información',
    desc: 'Información técnica del bot',
    run: async (ctx) => {
      const c = ctx.client;
      const usuarios = c.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);
      const embed = new EmbedBuilder()
        .setColor(COLOR.info)
        .setTitle(`🤖 ${c.user.username}`)
        .setThumbnail(c.user.displayAvatarURL())
        .addFields(
          { name: 'Servidores', value: String(c.guilds.cache.size), inline: true },
          { name: 'Usuarios', value: String(usuarios), inline: true },
          { name: 'Canales', value: String(c.channels.cache.size), inline: true },
          { name: 'Encendido', value: `<t:${Math.floor((Date.now() - c.uptime) / 1000)}:R>`, inline: true },
          { name: 'Memoria', value: `${(process.memoryUsage().heapUsed / 1048576).toFixed(1)} MB`, inline: true },
          { name: 'discord.js / Node', value: `v${djsVersion} / ${process.version}`, inline: true },
          { name: 'Configuración', value: 'Usa `/panel` para configurarlo en tu servidor.' },
        )
        .setTimestamp();
      await ctx.responder({ embeds: [embed] });
    },
  },
  uptime: {
    cat: 'Información',
    desc: 'Cuánto tiempo lleva encendido el bot',
    run: async (ctx) => ctx.responder(`⏱️ Encendido hace **${formatearMs(ctx.client.uptime)}**.`),
  },
  avatar: {
    cat: 'Información',
    desc: 'Muestra el avatar de un usuario',
    args: [{ n: 'usuario', t: 'user', d: 'Usuario (opcional)' }],
    run: async (ctx) => {
      const u = ctx.opt('usuario') || ctx.user;
      const url = u.displayAvatarURL({ size: 1024, extension: 'png' });
      await ctx.responder({ embeds: [new EmbedBuilder().setColor(COLOR.info).setTitle(`Avatar de ${u.username}`).setImage(url).setURL(url)] });
    },
  },
  banner: {
    cat: 'Información',
    desc: 'Muestra el banner de un usuario',
    args: [{ n: 'usuario', t: 'user', d: 'Usuario (opcional)' }],
    run: async (ctx) => {
      const base = ctx.opt('usuario') || ctx.user;
      const u = await ctx.client.users.fetch(base.id, { force: true }).catch(() => null);
      const url = u?.bannerURL({ size: 1024 });
      if (!url) return ctx.responder('❌ Ese usuario no tiene banner.');
      await ctx.responder({ embeds: [new EmbedBuilder().setColor(COLOR.info).setTitle(`Banner de ${u.username}`).setImage(url)] });
    },
  },
  userinfo: {
    cat: 'Información',
    desc: 'Información detallada de un usuario',
    args: [{ n: 'usuario', t: 'user', d: 'Usuario (opcional)' }],
    run: async (ctx) => {
      const u = ctx.opt('usuario') || ctx.user;
      const m = await ctx.guild.members.fetch(u.id).catch(() => null);
      const roles = m ? m.roles.cache.filter((r) => r.id !== ctx.guild.id).map((r) => `${r}`).slice(0, 15).join(' ') : null;
      const embed = new EmbedBuilder()
        .setColor(m?.displayHexColor && m.displayHexColor !== '#000000' ? m.displayHexColor : COLOR.info)
        .setTitle(`👤 ${u.tag}`)
        .setThumbnail(u.displayAvatarURL({ size: 512 }))
        .addFields(
          { name: 'ID', value: `\`${u.id}\``, inline: true },
          { name: 'Bot', value: u.bot ? 'Sí' : 'No', inline: true },
          { name: 'Cuenta creada', value: `<t:${Math.floor(u.createdTimestamp / 1000)}:D>`, inline: true },
        );
      if (m) {
        embed.addFields(
          { name: 'Se unió', value: m.joinedTimestamp ? `<t:${Math.floor(m.joinedTimestamp / 1000)}:R>` : 'Desconocido', inline: true },
          { name: 'Rol más alto', value: `${m.roles.highest}`, inline: true },
          { name: 'Aislado', value: m.isCommunicationDisabled() ? 'Sí' : 'No', inline: true },
          { name: `Roles (${Math.max(0, m.roles.cache.size - 1)})`, value: roles || 'Ninguno' },
        );
      }
      await ctx.responder({ embeds: [embed] });
    },
  },
  serverinfo: {
    cat: 'Información',
    desc: 'Información del servidor',
    run: async (ctx) => {
      const g = ctx.guild;
      const canales = g.channels.cache;
      const embed = new EmbedBuilder()
        .setColor(COLOR.info)
        .setTitle(`🏠 ${g.name}`)
        .setThumbnail(g.iconURL({ size: 512 }) || null)
        .addFields(
          { name: 'ID', value: `\`${g.id}\``, inline: true },
          { name: 'Dueño', value: `<@${g.ownerId}>`, inline: true },
          { name: 'Creado', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true },
          { name: 'Miembros', value: String(g.memberCount), inline: true },
          { name: 'Roles', value: String(g.roles.cache.size), inline: true },
          { name: 'Emojis', value: String(g.emojis.cache.size), inline: true },
          { name: 'Canales', value: `💬 ${canales.filter((c) => c.type === ChannelType.GuildText).size} · 🔊 ${canales.filter((c) => c.type === ChannelType.GuildVoice).size} · 📂 ${canales.filter((c) => c.type === ChannelType.GuildCategory).size}`, inline: true },
          { name: 'Boosts', value: `Nivel ${g.premiumTier} (${g.premiumSubscriptionCount || 0})`, inline: true },
        );
      if (g.bannerURL()) embed.setImage(g.bannerURL({ size: 1024 }));
      await ctx.responder({ embeds: [embed] });
    },
  },
  roleinfo: {
    cat: 'Información',
    desc: 'Información de un rol',
    args: [{ n: 'rol', t: 'role', d: 'Rol', req: true }],
    run: async (ctx) => {
      const r = ctx.opt('rol');
      if (!r) return ctx.responder('❌ No encontré ese rol.');
      await ctx.responder({
        embeds: [new EmbedBuilder()
          .setColor(r.hexColor === '#000000' ? COLOR.info : r.hexColor)
          .setTitle(`🎭 ${r.name}`)
          .addFields(
            { name: 'ID', value: `\`${r.id}\``, inline: true },
            { name: 'Miembros', value: String(r.members.size), inline: true },
            { name: 'Color', value: r.hexColor, inline: true },
            { name: 'Posición', value: String(r.position), inline: true },
            { name: 'Mencionable', value: r.mentionable ? 'Sí' : 'No', inline: true },
            { name: 'Separado', value: r.hoist ? 'Sí' : 'No', inline: true },
          )],
      });
    },
  },
  channelinfo: {
    cat: 'Información',
    desc: 'Información de un canal',
    args: [{ n: 'canal', t: 'channel', d: 'Canal (opcional)' }],
    run: async (ctx) => {
      const c = ctx.opt('canal') || ctx.channel;
      const embed = new EmbedBuilder()
        .setColor(COLOR.info)
        .setTitle(`#️⃣ ${c.name}`)
        .addFields(
          { name: 'ID', value: `\`${c.id}\``, inline: true },
          { name: 'Tipo', value: String(ChannelType[c.type] ?? c.type), inline: true },
          { name: 'Creado', value: `<t:${Math.floor(c.createdTimestamp / 1000)}:D>`, inline: true },
          { name: 'NSFW', value: c.nsfw ? 'Sí' : 'No', inline: true },
          { name: 'Slowmode', value: c.rateLimitPerUser ? `${c.rateLimitPerUser}s` : 'Desactivado', inline: true },
          { name: 'Categoría', value: c.parent?.name || 'Ninguna', inline: true },
        );
      if (c.topic) embed.setDescription(c.topic.slice(0, 1000));
      await ctx.responder({ embeds: [embed] });
    },
  },
  servericon: {
    cat: 'Información',
    desc: 'Muestra el icono del servidor',
    run: async (ctx) => {
      const url = ctx.guild.iconURL({ size: 1024 });
      if (!url) return ctx.responder('❌ Este servidor no tiene icono.');
      await ctx.responder({ embeds: [new EmbedBuilder().setColor(COLOR.info).setTitle(ctx.guild.name).setImage(url)] });
    },
  },
  emojis: {
    cat: 'Información',
    desc: 'Lista los emojis del servidor',
    run: async (ctx) => {
      const lista = ctx.guild.emojis.cache.map((e) => `${e}`).join(' ') || 'Este servidor no tiene emojis.';
      await ctx.responder({ embeds: [new EmbedBuilder().setColor(COLOR.info).setTitle(`😀 Emojis (${ctx.guild.emojis.cache.size})`).setDescription(lista.slice(0, 4000))] });
    },
  },
  miembros: {
    cat: 'Información',
    desc: 'Cuántos miembros tiene el servidor',
    run: async (ctx) => ctx.responder(`👥 **${ctx.guild.memberCount}** miembros en **${ctx.guild.name}**.`),
  },
  id: {
    cat: 'Información',
    desc: 'Muestra la ID de un usuario',
    args: [{ n: 'usuario', t: 'user', d: 'Usuario (opcional)' }],
    run: async (ctx) => {
      const u = ctx.opt('usuario') || ctx.user;
      await ctx.responder(`🆔 ${u.tag} → \`${u.id}\``);
    },
  },
  invitar: {
    cat: 'Información',
    desc: 'Link para invitar el bot a tu servidor',
    run: async (ctx) => {
      const url = `https://discord.com/oauth2/authorize?client_id=${ctx.client.user.id}&permissions=1374389534327&scope=bot%20applications.commands`;
      await ctx.responder({ embeds: [new EmbedBuilder().setColor(COLOR.ok).setTitle('➕ Invitar el bot').setDescription(`[Agrégalo a tu servidor](${url})\n\nDespués usa \`/panel\` para configurarlo.`)] });
    },
  },
  ayuda: {
    cat: 'Información',
    desc: 'Lista todos los comandos del bot',
    args: [{ n: 'categoria', t: 'string', d: 'Categoría (opcional)' }],
    run: async (ctx) => {
      const filtro = (ctx.opt('categoria') || '').toLowerCase();
      const cats = {};
      for (const [nombre, def] of Object.entries(CMDS)) (cats[def.cat] ||= []).push(nombre);
      cats['Moderación'] = ['ban', 'unban', 'kick', 'timeout', 'untimeout', 'warn', 'warnings', 'unwarn', 'clearwarns', 'clear', 'modconfig'];
      cats['Música'] = ['play', 'skip', 'stop', 'pause', 'resume', 'queue', 'volumen', 'leave'];
      cats['Configuración'] = ['panel'];
      const embed = new EmbedBuilder()
        .setColor(COLOR.info)
        .setTitle('📖 Comandos disponibles')
        .setDescription('Todos funcionan con `/` y con el prefijo `§`.\nConfigura el bot en tu servidor con `/panel`.');
      for (const [cat, lista] of Object.entries(cats)) {
        if (filtro && !cat.toLowerCase().includes(filtro)) continue;
        embed.addFields({ name: `${cat} (${lista.length})`, value: lista.map((c) => `\`${c}\``).join(' ').slice(0, 1000) });
      }
      await ctx.responder({ embeds: [embed] });
    },
  },
});

// ────────── HERRAMIENTAS ──────────
Object.assign(CMDS, {
  decir: {
    cat: 'Herramientas',
    desc: 'El bot repite tu mensaje',
    perm: P.ManageMessages,
    args: [{ n: 'texto', t: 'string', d: 'Texto a enviar', req: true, rest: true }],
    run: async (ctx) => {
      const texto = ctx.opt('texto');
      if (!texto) return ctx.responder('❌ Escribe algo.');
      if (ctx.esPrefijo) {
        await ctx.mensaje.delete().catch(() => {});
        return ctx.channel.send({ content: texto.slice(0, 1900), allowedMentions: { parse: [] } });
      }
      await ctx.responder('✅ Enviado.', true);
      await ctx.channel.send({ content: texto.slice(0, 1900), allowedMentions: { parse: [] } });
    },
  },
  embed: {
    cat: 'Herramientas',
    desc: 'Crea un embed: titulo | descripcion | #color',
    perm: P.ManageMessages,
    args: [{ n: 'contenido', t: 'string', d: 'titulo | descripcion | #hexcolor', req: true, rest: true }],
    run: async (ctx) => {
      const partes = String(ctx.opt('contenido') || '').split('|').map((p) => p.trim());
      if (!partes[0]) return ctx.responder('❌ Uso: `§embed Título | Descripción | #3498db`');
      const color = /^#?[0-9a-f]{6}$/i.test(partes[2] || '') ? parseInt(partes[2].replace('#', ''), 16) : COLOR.info;
      const embed = new EmbedBuilder().setColor(color).setTitle(partes[0].slice(0, 256));
      if (partes[1]) embed.setDescription(partes[1].slice(0, 4000));
      if (ctx.esPrefijo) await ctx.mensaje.delete().catch(() => {});
      else await ctx.responder('✅ Enviado.', true);
      await ctx.channel.send({ embeds: [embed] });
    },
  },
  encuesta: {
    cat: 'Herramientas',
    desc: 'Crea una encuesta de sí/no',
    args: [{ n: 'pregunta', t: 'string', d: 'Pregunta', req: true, rest: true }],
    run: async (ctx) => {
      const pregunta = ctx.opt('pregunta');
      if (!pregunta) return ctx.responder('❌ Escribe la pregunta.');
      const embed = new EmbedBuilder()
        .setColor(COLOR.info)
        .setTitle('📊 Encuesta')
        .setDescription(pregunta.slice(0, 2000))
        .setFooter({ text: `Encuesta de ${ctx.user.tag}` })
        .setTimestamp();
      if (ctx.esPrefijo) await ctx.mensaje.delete().catch(() => {});
      else await ctx.responder('✅ Encuesta creada.', true);
      const msg = await ctx.channel.send({ embeds: [embed] });
      await msg.react('✅').catch(() => {});
      await msg.react('❌').catch(() => {});
    },
  },
  recordatorio: {
    cat: 'Herramientas',
    desc: 'Te recuerda algo pasado un tiempo (ej: 10m)',
    args: [
      { n: 'tiempo', t: 'string', d: 'Ej: 30s, 10m, 2h, 1d', req: true },
      { n: 'texto', t: 'string', d: 'Qué recordarte', req: true, rest: true },
    ],
    run: async (ctx) => {
      const ms = parseDuracion(ctx.opt('tiempo'));
      const texto = ctx.opt('texto');
      if (!ms || !texto) return ctx.responder('❌ Uso: `§recordatorio 10m sacar la ropa` (máx. 30 días)');
      await ctx.responder(`⏰ Te lo recuerdo en **${formatearMs(ms)}**.`);
      setTimeout(() => {
        ctx.channel.send({ content: `⏰ <@${ctx.user.id}> recordatorio: ${texto.slice(0, 1500)}` }).catch(() => {});
      }, ms);
    },
  },
  calcular: {
    cat: 'Herramientas',
    desc: 'Calculadora simple',
    args: [{ n: 'operacion', t: 'string', d: 'Ej: (5+3)*2', req: true, rest: true }],
    run: async (ctx) => {
      const expr = String(ctx.opt('operacion') || '').replace(/x/gi, '*').replace(/,/g, '.');
      if (!/^[0-9+\-*/%(). ]+$/.test(expr)) return ctx.responder('❌ Solo se permiten números y `+ - * / % ( )`.');
      let resultado;
      try {
        resultado = Function(`"use strict"; return (${expr});`)();
      } catch {
        return ctx.responder('❌ Operación inválida.');
      }
      if (typeof resultado !== 'number' || !isFinite(resultado)) return ctx.responder('❌ Resultado inválido.');
      await ctx.responder(`🧮 \`${expr}\` = **${resultado}**`);
    },
  },
  base64: {
    cat: 'Herramientas',
    desc: 'Codifica o decodifica texto en base64',
    args: [
      { n: 'modo', t: 'string', d: 'codificar o decodificar', req: true },
      { n: 'texto', t: 'string', d: 'Texto', req: true, rest: true },
    ],
    run: async (ctx) => {
      const modo = String(ctx.opt('modo') || '').toLowerCase();
      const texto = ctx.opt('texto') || '';
      if (!['codificar', 'decodificar', 'encode', 'decode'].includes(modo)) {
        return ctx.responder('❌ Uso: `§base64 codificar|decodificar <texto>`');
      }
      try {
        const out = ['codificar', 'encode'].includes(modo)
          ? Buffer.from(texto, 'utf8').toString('base64')
          : Buffer.from(texto, 'base64').toString('utf8');
        await ctx.responder(`\`\`\`${out.slice(0, 1800) || '(vacío)'}\`\`\``);
      } catch {
        await ctx.responder('❌ No pude procesar ese texto.');
      }
    },
  },
  qr: {
    cat: 'Herramientas',
    desc: 'Genera un código QR',
    args: [{ n: 'texto', t: 'string', d: 'Texto o link', req: true, rest: true }],
    run: async (ctx) => {
      const texto = ctx.opt('texto');
      if (!texto) return ctx.responder('❌ Escribe el texto o link.');
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(texto.slice(0, 500))}`;
      await ctx.responder({ embeds: [new EmbedBuilder().setColor(COLOR.info).setTitle('🔳 Código QR').setImage(url)] });
    },
  },
  tiempo: {
    cat: 'Herramientas',
    desc: 'Genera un timestamp de Discord a futuro',
    args: [{ n: 'duracion', t: 'string', d: 'Ej: 2h', req: true }],
    run: async (ctx) => {
      const ms = parseDuracion(ctx.opt('duracion'));
      if (!ms) return ctx.responder('❌ Uso: `§tiempo 2h`');
      const ts = Math.floor((Date.now() + ms) / 1000);
      await ctx.responder(`🕒 <t:${ts}:F> (<t:${ts}:R>)\nCódigo: \`<t:${ts}:R>\``);
    },
  },
  contar: {
    cat: 'Herramientas',
    desc: 'Cuenta caracteres y palabras de un texto',
    args: [{ n: 'texto', t: 'string', d: 'Texto', req: true, rest: true }],
    run: async (ctx) => {
      const t = ctx.opt('texto') || '';
      await ctx.responder(`🔠 **${t.length}** caracteres · **${t.trim().split(/\s+/).filter(Boolean).length}** palabras.`);
    },
  },
  invertir: {
    cat: 'Herramientas',
    desc: 'Invierte un texto',
    args: [{ n: 'texto', t: 'string', d: 'Texto', req: true, rest: true }],
    run: async (ctx) => ctx.responder(`🔄 ${[...String(ctx.opt('texto') || '')].reverse().join('').slice(0, 1900)}`),
  },
  sorteo: {
    cat: 'Herramientas',
    desc: 'Crea un sorteo por reacciones',
    perm: P.ManageMessages,
    args: [
      { n: 'duracion', t: 'string', d: 'Ej: 10m, 2h', req: true },
      { n: 'premio', t: 'string', d: 'Premio', req: true, rest: true },
    ],
    run: async (ctx) => {
      const ms = parseDuracion(ctx.opt('duracion'));
      const premio = ctx.opt('premio');
      if (!ms || !premio) return ctx.responder('❌ Uso: `§sorteo 10m Nitro Classic`');
      const fin = Math.floor((Date.now() + ms) / 1000);
      const embed = new EmbedBuilder()
        .setColor(COLOR.fun)
        .setTitle('🎉 ¡SORTEO!')
        .setDescription(`**Premio:** ${premio.slice(0, 500)}\n**Termina:** <t:${fin}:R>\n\nReacciona con 🎉 para participar.`)
        .setFooter({ text: `Sorteo de ${ctx.user.tag}` });
      if (!ctx.esPrefijo) await ctx.responder('✅ Sorteo creado.', true);
      const msg = await ctx.channel.send({ embeds: [embed] });
      await msg.react('🎉').catch(() => {});
      setTimeout(async () => {
        try {
          const fresco = await ctx.channel.messages.fetch(msg.id);
          const reaccion = fresco.reactions.cache.get('🎉');
          const users = reaccion ? (await reaccion.users.fetch()).filter((u) => !u.bot) : null;
          if (!users || users.size === 0) return ctx.channel.send('🎉 El sorteo terminó pero nadie participó.');
          const ganador = azar([...users.values()]);
          await ctx.channel.send(`🎉 ¡Felicidades <@${ganador.id}>! Ganaste **${premio.slice(0, 200)}**.`);
        } catch (err) {
          console.error('[utilidades] Error cerrando sorteo:', err.message);
        }
      }, ms);
    },
  },
});

// ────────── GESTIÓN ──────────
Object.assign(CMDS, {
  lock: {
    cat: 'Gestión',
    desc: 'Bloquea el canal (nadie puede escribir)',
    perm: P.ManageChannels,
    args: [{ n: 'canal', t: 'channel', d: 'Canal (opcional)' }],
    run: async (ctx) => {
      const canal = ctx.opt('canal') || ctx.channel;
      await canal.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: false }).catch(() => null);
      await ctx.responder(`🔒 ${canal} bloqueado.`);
    },
  },
  unlock: {
    cat: 'Gestión',
    desc: 'Desbloquea el canal',
    perm: P.ManageChannels,
    args: [{ n: 'canal', t: 'channel', d: 'Canal (opcional)' }],
    run: async (ctx) => {
      const canal = ctx.opt('canal') || ctx.channel;
      await canal.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: null }).catch(() => null);
      await ctx.responder(`🔓 ${canal} desbloqueado.`);
    },
  },
  slowmode: {
    cat: 'Gestión',
    desc: 'Define el modo lento del canal (0-21600 s)',
    perm: P.ManageChannels,
    args: [
      { n: 'segundos', t: 'int', d: 'Segundos (0 desactiva)', req: true, min: 0, max: 21600 },
      { n: 'canal', t: 'channel', d: 'Canal (opcional)' },
    ],
    run: async (ctx) => {
      const seg = ctx.opt('segundos');
      if (seg == null || seg < 0 || seg > 21600) return ctx.responder('❌ Uso: `§slowmode <0-21600>`');
      const canal = ctx.opt('canal') || ctx.channel;
      await canal.setRateLimitPerUser(seg).catch(() => null);
      await ctx.responder(seg === 0 ? `🐇 Modo lento desactivado en ${canal}.` : `🐌 Modo lento de **${seg}s** en ${canal}.`);
    },
  },
  nuke: {
    cat: 'Gestión',
    desc: 'Clona el canal y borra el original (limpieza total)',
    perm: P.ManageChannels,
    run: async (ctx) => {
      const canal = ctx.channel;
      const nuevo = await canal.clone().catch(() => null);
      if (!nuevo) return ctx.responder('❌ No pude clonar el canal.');
      await nuevo.setPosition(canal.position).catch(() => {});
      await canal.delete().catch(() => {});
      await nuevo.send({ embeds: [new EmbedBuilder().setColor(COLOR.ok).setTitle('💥 Canal reiniciado').setDescription(`Por ${ctx.user}`)] }).catch(() => {});
    },
  },
  apodo: {
    cat: 'Gestión',
    desc: 'Cambia el apodo de un usuario (vacío = quitar)',
    perm: P.ManageNicknames,
    args: [
      { n: 'usuario', t: 'user', d: 'Usuario', req: true },
      { n: 'apodo', t: 'string', d: 'Nuevo apodo (vacío para quitar)', rest: true },
    ],
    run: async (ctx) => {
      const u = ctx.opt('usuario');
      if (!u) return ctx.responder('❌ Menciona a un usuario.');
      const m = await ctx.guild.members.fetch(u.id).catch(() => null);
      if (!m) return ctx.responder('❌ Ese usuario no está en el servidor.');
      if (!m.manageable) return ctx.responder('❌ No puedo cambiarle el apodo (su rol está por encima del mío).');
      const nuevo = (ctx.opt('apodo') || '').slice(0, 32) || null;
      await m.setNickname(nuevo, `Por ${ctx.user.tag}`).catch(() => null);
      await ctx.responder(nuevo ? `✏️ Apodo de ${u} cambiado a **${nuevo}**.` : `✏️ Apodo de ${u} removido.`);
    },
  },
  rol: {
    cat: 'Gestión',
    desc: 'Da o quita un rol a un usuario',
    perm: P.ManageRoles,
    args: [
      { n: 'usuario', t: 'user', d: 'Usuario', req: true },
      { n: 'rol', t: 'role', d: 'Rol', req: true },
    ],
    run: async (ctx) => {
      const u = ctx.opt('usuario');
      const r = ctx.opt('rol');
      if (!u || !r) return ctx.responder('❌ Uso: `§rol @usuario @rol`');
      const m = await ctx.guild.members.fetch(u.id).catch(() => null);
      if (!m) return ctx.responder('❌ Ese usuario no está en el servidor.');
      if (r.position >= ctx.guild.members.me.roles.highest.position) return ctx.responder('❌ Ese rol está por encima del mío.');
      if (!ctx.esOwnerBot && ctx.guild.ownerId !== ctx.user.id && r.position >= ctx.member.roles.highest.position) {
        return ctx.responder('❌ Ese rol está por encima del tuyo.');
      }
      if (m.roles.cache.has(r.id)) {
        await m.roles.remove(r).catch(() => null);
        return ctx.responder(`➖ Le quité ${r} a ${u}.`);
      }
      await m.roles.add(r).catch(() => null);
      await ctx.responder(`➕ Le di ${r} a ${u}.`);
    },
  },
  anuncio: {
    cat: 'Gestión',
    desc: 'Envía un anuncio con embed a un canal',
    perm: P.ManageMessages,
    args: [
      { n: 'canal', t: 'channel', d: 'Canal destino', req: true },
      { n: 'texto', t: 'string', d: 'Contenido del anuncio', req: true, rest: true },
    ],
    run: async (ctx) => {
      const canal = ctx.opt('canal');
      const texto = ctx.opt('texto');
      if (!canal?.isTextBased() || !texto) return ctx.responder('❌ Uso: `§anuncio #canal <texto>`');
      const embed = new EmbedBuilder()
        .setColor(COLOR.ok)
        .setTitle('📢 Anuncio')
        .setDescription(texto.slice(0, 4000))
        .setFooter({ text: `Por ${ctx.user.tag}` })
        .setTimestamp();
      await canal.send({ embeds: [embed] }).catch(() => null);
      await ctx.responder(`✅ Anuncio enviado a ${canal}.`, true);
    },
  },
  snipe: {
    cat: 'Gestión',
    desc: 'Muestra el último mensaje borrado del canal',
    perm: P.ManageMessages,
    run: async (ctx) => {
      const s = snipes.get(ctx.channel.id);
      if (!s) return ctx.responder('❌ No hay mensajes borrados recientes aquí.');
      await ctx.responder({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.info)
          .setAuthor({ name: s.autorTag, iconURL: s.avatar || undefined })
          .setDescription(s.contenido || '*(sin texto)*')
          .setFooter({ text: 'Mensaje borrado' })
          .setTimestamp(s.fecha)],
      });
    },
  },
  afk: {
    cat: 'Gestión',
    desc: 'Te marca como AFK; aviso a quien te mencione',
    args: [{ n: 'motivo', t: 'string', d: 'Motivo (opcional)', rest: true }],
    run: async (ctx) => {
      const motivo = (ctx.opt('motivo') || 'Sin motivo').slice(0, 200);
      afks.set(`${ctx.guild.id}:${ctx.user.id}`, { motivo, desde: Date.now() });
      await ctx.responder(`💤 Te marqué como AFK: ${motivo}`);
    },
  },
});

// ────────── NIVELES Y DIVERSIÓN ──────────
Object.assign(CMDS, {
  rank: {
    cat: 'Niveles',
    desc: 'Muestra tu nivel y XP en el servidor',
    args: [{ n: 'usuario', t: 'user', d: 'Usuario (opcional)' }],
    run: async (ctx) => {
      const u = ctx.opt('usuario') || ctx.user;
      const datos = getXp(ctx.guild.id, u.id);
      const nivel = nivelDesdeXp(datos.xp);
      const actual = Math.floor(datos.xp - xpParaNivel(nivel));
      const necesario = Math.max(1, Math.floor(xpParaNivel(nivel + 1) - xpParaNivel(nivel)));
      const todos = Object.entries(db.xp[ctx.guild.id] || {}).sort((a, b) => b[1].xp - a[1].xp);
      const puesto = todos.findIndex(([id]) => id === u.id) + 1;
      await ctx.responder({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.nivel)
          .setTitle(`📈 Nivel de ${u.username}`)
          .setThumbnail(u.displayAvatarURL())
          .addFields(
            { name: 'Nivel', value: String(nivel), inline: true },
            { name: 'XP total', value: String(Math.floor(datos.xp)), inline: true },
            { name: 'Puesto', value: puesto ? `#${puesto}` : 'Sin ranking', inline: true },
            { name: 'Progreso', value: `${barra(actual, necesario)} ${actual}/${necesario}` },
          )],
      });
    },
  },
  top: {
    cat: 'Niveles',
    desc: 'Ranking de niveles del servidor',
    run: async (ctx) => {
      const lista = Object.entries(db.xp[ctx.guild.id] || {}).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
      if (!lista.length) return ctx.responder('❌ Todavía no hay datos de niveles en este servidor.');
      const medallas = ['🥇', '🥈', '🥉'];
      const texto = lista
        .map(([id, d], i) => `${medallas[i] || `**${i + 1}.**`} <@${id}> — Nivel **${nivelDesdeXp(d.xp)}** (${Math.floor(d.xp)} XP)`)
        .join('\n');
      await ctx.responder({ embeds: [new EmbedBuilder().setColor(COLOR.nivel).setTitle(`🏆 Top de ${ctx.guild.name}`).setDescription(texto)] });
    },
  },
  '8ball': {
    cat: 'Diversión',
    desc: 'Pregúntale a la bola mágica',
    args: [{ n: 'pregunta', t: 'string', d: 'Tu pregunta', req: true, rest: true }],
    run: async (ctx) => {
      const respuestas = ['Sí, sin duda.', 'Definitivamente no.', 'Puede ser...', 'Pregunta después.', 'Todo apunta a que sí.', 'Lo veo difícil.', 'Obvio.', 'Ni de broma.', 'Mejor no te digo.', 'Seguro.'];
      if (!ctx.opt('pregunta')) return ctx.responder('❌ Hazme una pregunta.');
      await ctx.responder({
        embeds: [new EmbedBuilder().setColor(COLOR.fun).setTitle('🎱 Bola mágica').addFields(
          { name: 'Pregunta', value: String(ctx.opt('pregunta')).slice(0, 500) },
          { name: 'Respuesta', value: azar(respuestas) },
        )],
      });
    },
  },
  moneda: {
    cat: 'Diversión',
    desc: 'Lanza una moneda',
    run: async (ctx) => ctx.responder(`🪙 Salió **${azar(['cara', 'sello'])}**.`),
  },
  dado: {
    cat: 'Diversión',
    desc: 'Tira un dado',
    args: [{ n: 'caras', t: 'int', d: 'Número de caras (por defecto 6)', min: 2, max: 1000 }],
    run: async (ctx) => {
      const caras = ctx.opt('caras') || 6;
      await ctx.responder(`🎲 Tiraste un d${caras} y salió **${Math.floor(Math.random() * caras) + 1}**.`);
    },
  },
  elegir: {
    cat: 'Diversión',
    desc: 'Elige una opción al azar (sepáralas con comas)',
    args: [{ n: 'opciones', t: 'string', d: 'opcion1, opcion2, opcion3', req: true, rest: true }],
    run: async (ctx) => {
      const ops = String(ctx.opt('opciones') || '').split(',').map((o) => o.trim()).filter(Boolean);
      if (ops.length < 2) return ctx.responder('❌ Dame al menos 2 opciones separadas por comas.');
      await ctx.responder(`🤔 Elijo: **${azar(ops).slice(0, 200)}**`);
    },
  },
  ship: {
    cat: 'Diversión',
    desc: 'Calcula la compatibilidad entre dos personas',
    args: [
      { n: 'usuario1', t: 'user', d: 'Primera persona', req: true },
      { n: 'usuario2', t: 'user', d: 'Segunda persona (opcional)' },
    ],
    run: async (ctx) => {
      const a = ctx.opt('usuario1');
      const b = ctx.opt('usuario2') || ctx.user;
      if (!a) return ctx.responder('❌ Menciona al menos a una persona.');
      const semilla = [...`${a.id}${b.id}`].reduce((x, c) => x + c.charCodeAt(0), 0);
      const pct = semilla % 101;
      await ctx.responder({
        embeds: [new EmbedBuilder().setColor(0xff69b4).setTitle('💘 Ship').setDescription(
          `**${a.username}** 💞 **${b.username}**\n\n${barra(pct, 100)} **${pct}%**\n${pct > 80 ? '¡Se casan!' : pct > 50 ? 'Hay futuro.' : pct > 25 ? 'Complicado...' : 'Mejor como amigos.'}`,
        )],
      });
    },
  },
  rate: {
    cat: 'Diversión',
    desc: 'El bot le pone nota a lo que digas',
    args: [{ n: 'cosa', t: 'string', d: 'Qué calificar', req: true, rest: true }],
    run: async (ctx) => {
      const cosa = String(ctx.opt('cosa') || '');
      if (!cosa) return ctx.responder('❌ Dime qué califico.');
      const semilla = [...cosa].reduce((x, c) => x + c.charCodeAt(0), 0);
      await ctx.responder(`⭐ Le doy a **${cosa.slice(0, 200)}** un **${semilla % 11}/10**.`);
    },
  },
});

// ═════════════════════════════════════
// SLASH COMMANDS + ENRUTADORES
// ═════════════════════════════════════
const soloServidor = [InteractionContextType.Guild];

function construirSlash(nombre, def) {
  const b = new SlashCommandBuilder().setName(nombre).setDescription(def.desc.slice(0, 100)).setContexts(soloServidor);
  const metodo = { user: 'addUserOption', string: 'addStringOption', int: 'addIntegerOption', channel: 'addChannelOption', role: 'addRoleOption', bool: 'addBooleanOption' };
  const ordenados = [...(def.args || [])].sort((a, b2) => (b2.req ? 1 : 0) - (a.req ? 1 : 0));
  for (const a of ordenados) {
    b[metodo[a.t]]((o) => {
      o.setName(a.n).setDescription((a.d || a.n).slice(0, 100)).setRequired(!!a.req);
      if (a.t === 'int') {
        if (a.min != null) o.setMinValue(a.min);
        if (a.max != null) o.setMaxValue(a.max);
      }
      return o;
    });
  }
  if (def.perm) b.setDefaultMemberPermissions(def.perm);
  return b;
}

const comandosDefinicion = Object.entries(CMDS).map(([n, d]) => construirSlash(n, d));
const nombresComandos = new Set(Object.keys(CMDS));

const ALIAS = {
  help: 'ayuda', comandos: 'ayuda', av: 'avatar', pfp: 'avatar',
  ui: 'userinfo', si: 'serverinfo', say: 'decir',
  bloquear: 'lock', desbloquear: 'unlock', nick: 'apodo', role: 'rol',
  giveaway: 'sorteo', poll: 'encuesta', calc: 'calcular',
  coinflip: 'moneda', roll: 'dado', choose: 'elegir',
  nivel: 'rank', ranking: 'top', leaderboard: 'top', remind: 'recordatorio',
};

async function manejarSlash(interaction) {
  const def = CMDS[interaction.commandName];
  if (!def) return false;
  try {
    await def.run(ctxDesdeInteraccion(interaction, def));
  } catch (err) {
    console.error(`[utilidades] Error en /${interaction.commandName}:`, err);
    const aviso = { content: '❌ Ocurrió un error ejecutando el comando.', flags: EFIMERO };
    await (interaction.replied || interaction.deferred ? interaction.followUp(aviso) : interaction.reply(aviso)).catch(() => {});
  }
  return true;
}

// opciones.esOwnerBot = true → el dueño del bot usa TODO sin permisos
async function manejarPrefijo(message, cmd, args, opciones = {}) {
  const nombre = nombresComandos.has(cmd) ? cmd : ALIAS[cmd];
  const def = CMDS[nombre];
  if (!def || !message.guild || !message.member) return false;

  const esOwnerBot = opciones.esOwnerBot === true;
  if (!esOwnerBot && def.perm && !message.member.permissions.has(def.perm)) {
    await message.reply({ content: '❌ No tienes permisos para usar ese comando aquí.', allowedMentions: { repliedUser: false } }).catch(() => {});
    return true;
  }

  try {
    const ctx = await ctxDesdeMensaje(message, def, args.filter(Boolean), esOwnerBot);
    await def.run(ctx);
  } catch (err) {
    console.error(`[utilidades] Error en §${nombre}:`, err);
    await message.channel.send('❌ Ocurrió un error ejecutando el comando.').catch(() => {});
  }
  return true;
}

// ═════════════════════════════════════
// EVENTOS: niveles, AFK, snipe, bienvenida, despedida, autorol
// ═════════════════════════════════════
function iniciarUtilidades(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const cfg = getCfgUtil(message.guild.id);

    const claveAfk = `${message.guild.id}:${message.author.id}`;
    if (afks.has(claveAfk) && !message.content.startsWith('§')) {
      const info = afks.get(claveAfk);
      afks.delete(claveAfk);
      message.reply({ content: `👋 Bienvenido de vuelta. Estuviste AFK **${formatearMs(Date.now() - info.desde)}**.`, allowedMentions: { repliedUser: false } }).catch(() => {});
    }
    for (const u of message.mentions.users.values()) {
      const info = afks.get(`${message.guild.id}:${u.id}`);
      if (info) {
        message.reply({ content: `💤 **${u.username}** está AFK: ${info.motivo} (hace ${formatearMs(Date.now() - info.desde)})`, allowedMentions: { repliedUser: false, parse: [] } }).catch(() => {});
        break;
      }
    }

    if (!cfg.niveles.enabled) return;
    const clave = `${message.guild.id}:${message.author.id}`;
    if (Date.now() - (ultimoXp.get(clave) || 0) < 60000) return;
    ultimoXp.set(clave, Date.now());

    const datos = getXp(message.guild.id, message.author.id);
    const nivelAntes = nivelDesdeXp(datos.xp);
    datos.xp += 15 + Math.floor(Math.random() * 11);
    datos.mensajes = (datos.mensajes || 0) + 1;
    setXp(message.guild.id, message.author.id, datos);

    const nivelAhora = nivelDesdeXp(datos.xp);
    if (nivelAhora > nivelAntes && cfg.niveles.anunciar) {
      const canal = cfg.niveles.canalId ? message.guild.channels.cache.get(cfg.niveles.canalId) : message.channel;
      canal?.send({ content: `🎉 ¡${message.author} subió al **nivel ${nivelAhora}**!` }).catch(() => {});
    }
  });

  client.on('messageDelete', (message) => {
    if (!message.guild || message.author?.bot) return;
    snipes.set(message.channel.id, {
      autorTag: message.author?.tag || 'Desconocido',
      avatar: message.author?.displayAvatarURL() || null,
      contenido: (message.content || '').slice(0, 1000),
      fecha: new Date(),
    });
  });

  client.on('guildMemberAdd', async (member) => {
    const cfg = getCfgUtil(member.guild.id);
    if (cfg.bienvenida.enabled && cfg.bienvenida.canalId) {
      const canal = member.guild.channels.cache.get(cfg.bienvenida.canalId);
      if (canal?.isTextBased()) {
        canal.send({
          content: `<@${member.id}>`,
          embeds: [new EmbedBuilder()
            .setColor(COLOR.ok)
            .setTitle('👋 ¡Bienvenido!')
            .setDescription(plantilla(cfg.bienvenida.mensaje, member))
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp()],
        }).catch(() => {});
      }
    }
    for (const rolId of cfg.autorol.roles) {
      const rol = member.guild.roles.cache.get(rolId);
      if (rol && rol.position < member.guild.members.me.roles.highest.position) {
        member.roles.add(rol, 'Autorol').catch(() => {});
      }
    }
  });

  client.on('guildMemberRemove', (member) => {
    const cfg = getCfgUtil(member.guild.id);
    if (!cfg.despedida.enabled || !cfg.despedida.canalId) return;
    const canal = member.guild.channels.cache.get(cfg.despedida.canalId);
    if (!canal?.isTextBased()) return;
    canal.send({
      embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('👋 Se fue un miembro').setDescription(plantilla(cfg.despedida.mensaje, member)).setTimestamp()],
    }).catch(() => {});
  });

  console.log(`[utilidades] Módulo cargado con ${comandosDefinicion.length} comandos.`);
}

module.exports = {
  comandosDefinicion,
  manejarSlash,
  manejarPrefijo,
  iniciarUtilidades,
  getCfgUtil,
  setCfgUtil,
  nombresComandos,
  ALIAS,
};

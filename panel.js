// ═══════════════════════════════════════════════════════════════
// panel.js — Panel de configuración DENTRO de Discord (/panel)
//
// Cualquier persona que tenga el bot en su servidor puede configurarlo
// desde aquí, sin tocar código ni archivos. Todo es efímero (solo lo ve
// quien abre el panel) y se guarda por servidor.
//
// Requisitos: permiso "Gestionar servidor" — o ser el dueño del bot,
// que siempre puede usarlo con / o con §panel.
//
// Secciones: Logs · Antilinks · Palabras · Warns · Canales exentos
//            Bienvenida · Despedida · Autorol · Niveles
// ═══════════════════════════════════════════════════════════════
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  InteractionContextType,
} = require('discord.js');

const moderacion = require('./moderacion');
const utilidades = require('./utilidades');

const EFIMERO = MessageFlags.Ephemeral;
const COLOR = 0x5865f2;

const comandosDefinicion = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Abre el panel de configuración del bot para este servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts([InteractionContextType.Guild]),
];

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
const si = (v) => (v ? '✅ Activado' : '❌ Desactivado');
const canal = (id) => (id ? `<#${id}>` : '*sin configurar*');

function puedeUsar(interaction, ownerId) {
  if (interaction.user.id === ownerId) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function embedInicio(guild) {
  const mod = moderacion.getConfig(guild.id);
  const uti = utilidades.getCfgUtil(guild.id);
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('⚙️ Panel de configuración')
    .setDescription(`Configurando **${guild.name}**.\nElige una sección en el menú de abajo. Todo lo que hagas aquí solo afecta a este servidor.`)
    .addFields(
      { name: '📋 Logs', value: canal(mod.logChannelId), inline: true },
      { name: '🔗 Antilinks', value: si(mod.antilinks.enabled), inline: true },
      { name: '🚫 Palabras', value: `${si(mod.palabras.enabled)} (${mod.palabras.lista.length})`, inline: true },
      { name: '⚠️ Warns', value: mod.warns.limite ? `${mod.warns.limite} → ${mod.warns.accion}` : 'Desactivado', inline: true },
      { name: '🙈 Exentos', value: `${mod.canalesExentos.length} canal(es)`, inline: true },
      { name: '👋 Bienvenida', value: si(uti.bienvenida.enabled), inline: true },
      { name: '🚪 Despedida', value: si(uti.despedida.enabled), inline: true },
      { name: '🎭 Autorol', value: `${uti.autorol.roles.length} rol(es)`, inline: true },
      { name: '📈 Niveles', value: si(uti.niveles.enabled), inline: true },
    )
    .setFooter({ text: 'Solo tú puedes ver este panel' });
}

function menuSecciones(seleccion) {
  const opciones = [
    { label: 'Canal de logs', value: 'logs', emoji: '📋', description: 'Dónde se registran las acciones de moderación' },
    { label: 'Antilinks', value: 'antilinks', emoji: '🔗', description: 'Bloquear links y permitir dominios' },
    { label: 'Palabras prohibidas', value: 'palabras', emoji: '🚫', description: 'Filtro de lenguaje del servidor' },
    { label: 'Warns automáticos', value: 'warns', emoji: '⚠️', description: 'Sanción al acumular advertencias' },
    { label: 'Canales exentos', value: 'exentos', emoji: '🙈', description: 'Canales donde el automod no actúa' },
    { label: 'Bienvenida', value: 'bienvenida', emoji: '👋', description: 'Mensaje al entrar alguien' },
    { label: 'Despedida', value: 'despedida', emoji: '🚪', description: 'Mensaje al salir alguien' },
    { label: 'Autorol', value: 'autorol', emoji: '🎭', description: 'Roles automáticos al entrar' },
    { label: 'Niveles (XP)', value: 'niveles', emoji: '📈', description: 'Sistema de experiencia por mensajes' },
  ];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('panel_seccion')
      .setPlaceholder('Elige qué configurar…')
      .addOptions(opciones.map((o) => ({ ...o, default: o.value === seleccion }))),
  );
}

const btn = (id, label, estilo = ButtonStyle.Secondary, emoji) => {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(estilo);
  if (emoji) b.setEmoji(emoji);
  return b;
};

// ═══════════════════════════════════════
// VISTAS DE CADA SECCIÓN
// ═══════════════════════════════════════
function vista(seccion, guild) {
  const mod = moderacion.getConfig(guild.id);
  const uti = utilidades.getCfgUtil(guild.id);
  const embed = new EmbedBuilder().setColor(COLOR);
  const filas = [menuSecciones(seccion)];

  switch (seccion) {
    case 'logs':
      embed.setTitle('📋 Canal de logs').setDescription(
        `Aquí se registran bans, kicks, timeouts, warns, mensajes borrados y editados.\n\n**Actual:** ${canal(mod.logChannelId)}`,
      );
      filas.push(
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('panel_logs_canal')
            .setPlaceholder('Elige el canal de logs')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
        new ActionRowBuilder().addComponents(
          btn('panel_logs_off', 'Desactivar logs', ButtonStyle.Danger, '🚫'),
          btn('panel_inicio', 'Volver', ButtonStyle.Secondary, '🏠'),
        ),
      );
      break;

    case 'antilinks':
      embed.setTitle('🔗 Antilinks').setDescription(
        `Borra automáticamente los mensajes con links (excepto los de moderadores y los canales exentos).\n\n**Estado:** ${si(mod.antilinks.enabled)}\n**Dominios permitidos:** ${mod.antilinks.dominiosPermitidos.join(', ') || '*ninguno*'}`,
      );
      filas.push(
        new ActionRowBuilder().addComponents(
          btn('panel_antilinks_toggle', mod.antilinks.enabled ? 'Desactivar' : 'Activar', mod.antilinks.enabled ? ButtonStyle.Danger : ButtonStyle.Success, '🔁'),
          btn('panel_antilinks_add', 'Permitir dominio', ButtonStyle.Primary, '➕'),
          btn('panel_antilinks_del', 'Quitar dominio', ButtonStyle.Secondary, '➖'),
          btn('panel_inicio', 'Volver', ButtonStyle.Secondary, '🏠'),
        ),
      );
      break;

    case 'palabras':
      embed.setTitle('🚫 Palabras prohibidas').setDescription(
        `El bot borra los mensajes que contengan estas palabras y avisa en los logs.\n\n**Estado:** ${si(mod.palabras.enabled)}\n**Palabras (${mod.palabras.lista.length}):** ${mod.palabras.lista.length ? `||${mod.palabras.lista.join(', ').slice(0, 900)}||` : '*ninguna*'}`,
      );
      filas.push(
        new ActionRowBuilder().addComponents(
          btn('panel_palabras_toggle', mod.palabras.enabled ? 'Desactivar' : 'Activar', mod.palabras.enabled ? ButtonStyle.Danger : ButtonStyle.Success, '🔁'),
          btn('panel_palabras_add', 'Agregar palabras', ButtonStyle.Primary, '➕'),
          btn('panel_palabras_del', 'Quitar palabra', ButtonStyle.Secondary, '➖'),
          btn('panel_inicio', 'Volver', ButtonStyle.Secondary, '🏠'),
        ),
      );
      break;

    case 'warns':
      embed.setTitle('⚠️ Warns automáticos').setDescription(
        `Sanción automática cuando alguien acumula advertencias.\n\n**Límite:** ${mod.warns.limite || 'desactivado'}\n**Acción:** ${mod.warns.accion}\n**Minutos de timeout:** ${mod.warns.minutos}`,
      );
      filas.push(
        new ActionRowBuilder().addComponents(
          btn('panel_warns_config', 'Configurar', ButtonStyle.Primary, '✏️'),
          btn('panel_warns_off', 'Desactivar', ButtonStyle.Danger, '🚫'),
          btn('panel_inicio', 'Volver', ButtonStyle.Secondary, '🏠'),
        ),
      );
      break;

    case 'exentos':
      embed.setTitle('🙈 Canales exentos').setDescription(
        `En estos canales no actúan el antilinks ni el filtro de palabras.\n\n**Actuales:** ${mod.canalesExentos.map((c) => `<#${c}>`).join(' ') || '*ninguno*'}\n\nElige abajo los canales exentos (la selección reemplaza la lista).`,
      );
      filas.push(
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('panel_exentos_canales')
            .setPlaceholder('Elige los canales exentos')
            .setMinValues(0)
            .setMaxValues(20)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory),
        ),
        new ActionRowBuilder().addComponents(btn('panel_inicio', 'Volver', ButtonStyle.Secondary, '🏠')),
      );
      break;

    case 'bienvenida':
    case 'despedida': {
      const esB = seccion === 'bienvenida';
      const cfg = esB ? uti.bienvenida : uti.despedida;
      embed.setTitle(esB ? '👋 Mensaje de bienvenida' : '🚪 Mensaje de despedida').setDescription(
        `**Estado:** ${si(cfg.enabled)}\n**Canal:** ${canal(cfg.canalId)}\n**Mensaje:**\n>>> ${cfg.mensaje}`,
      ).setFooter({ text: 'Variables: {usuario} {nombre} {tag} {servidor} {miembros}' });
      filas.push(
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(`panel_${seccion}_canal`)
            .setPlaceholder('Elige el canal')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
        new ActionRowBuilder().addComponents(
          btn(`panel_${seccion}_toggle`, cfg.enabled ? 'Desactivar' : 'Activar', cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success, '🔁'),
          btn(`panel_${seccion}_msg`, 'Editar mensaje', ButtonStyle.Primary, '✏️'),
          btn('panel_inicio', 'Volver', ButtonStyle.Secondary, '🏠'),
        ),
      );
      break;
    }

    case 'autorol':
      embed.setTitle('🎭 Autorol').setDescription(
        `Roles que se dan automáticamente a quien entra al servidor.\n\n**Actuales:** ${uti.autorol.roles.map((r) => `<@&${r}>`).join(' ') || '*ninguno*'}\n\nElige abajo los roles (la selección reemplaza la lista). El rol del bot debe estar por encima.`,
      );
      filas.push(
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder().setCustomId('panel_autorol_roles').setPlaceholder('Elige los roles automáticos').setMinValues(0).setMaxValues(5),
        ),
        new ActionRowBuilder().addComponents(btn('panel_inicio', 'Volver', ButtonStyle.Secondary, '🏠')),
      );
      break;

    case 'niveles':
      embed.setTitle('📈 Sistema de niveles').setDescription(
        `Los miembros ganan XP al escribir (máx. una vez por minuto). Consulta con \`/rank\` y \`/top\`.\n\n**Estado:** ${si(uti.niveles.enabled)}\n**Anuncios de subida:** ${uti.niveles.anunciar ? 'Sí' : 'No'}\n**Canal de anuncios:** ${uti.niveles.canalId ? canal(uti.niveles.canalId) : '*el canal donde escriba*'}`,
      );
      filas.push(
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('panel_niveles_canal')
            .setPlaceholder('Canal para anunciar subidas de nivel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
        new ActionRowBuilder().addComponents(
          btn('panel_niveles_toggle', uti.niveles.enabled ? 'Desactivar' : 'Activar', uti.niveles.enabled ? ButtonStyle.Danger : ButtonStyle.Success, '🔁'),
          btn('panel_niveles_anuncio', uti.niveles.anunciar ? 'Silenciar anuncios' : 'Activar anuncios', ButtonStyle.Primary, '🔔'),
          btn('panel_inicio', 'Volver', ButtonStyle.Secondary, '🏠'),
        ),
      );
      break;

    default:
      return { embeds: [embedInicio(guild)], components: [menuSecciones(null)] };
  }

  return { embeds: [embed], components: filas.filter(Boolean) };
}

// ═══════════════════════════════════════
// MODALES
// ═══════════════════════════════════════
function modal(id, titulo, campos) {
  const m = new ModalBuilder().setCustomId(id).setTitle(titulo.slice(0, 45));
  for (const c of campos) {
    m.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(c.id)
          .setLabel(c.label.slice(0, 45))
          .setStyle(c.largo ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(c.req !== false)
          .setValue(c.valor ? String(c.valor).slice(0, 400) : '')
          .setPlaceholder((c.hint || '').slice(0, 100)),
      ),
    );
  }
  return m;
}

// ═══════════════════════════════════════
// MANEJADOR PRINCIPAL
// ═══════════════════════════════════════
async function manejarPanel(interaction, ownerId) {
  const id = interaction.isChatInputCommand() ? 'panel' : interaction.customId;
  if (id !== 'panel' && !id.startsWith('panel_')) return false;
  if (!interaction.guild) return false;

  if (!puedeUsar(interaction, ownerId)) {
    await interaction.reply({ content: '❌ Necesitas el permiso **Gestionar servidor** para usar el panel.', flags: EFIMERO }).catch(() => {});
    return true;
  }

  const guild = interaction.guild;
  const mod = moderacion.getConfig(guild.id);
  const uti = utilidades.getCfgUtil(guild.id);
  const actualizar = (seccion) => interaction.update(vista(seccion, guild)).catch(() => {});

  try {
    // ─── Abrir panel ───
    if (id === 'panel') {
      await interaction.reply({ embeds: [embedInicio(guild)], components: [menuSecciones(null)], flags: EFIMERO });
      return true;
    }
    if (id === 'panel_inicio') {
      await interaction.update({ embeds: [embedInicio(guild)], components: [menuSecciones(null)] });
      return true;
    }
    if (id === 'panel_seccion') {
      await actualizar(interaction.values[0]);
      return true;
    }

    // ─── LOGS ───
    if (id === 'panel_logs_canal') {
      mod.logChannelId = interaction.values[0];
      moderacion.setConfig(guild.id, mod);
      return actualizar('logs'), true;
    }
    if (id === 'panel_logs_off') {
      mod.logChannelId = null;
      moderacion.setConfig(guild.id, mod);
      return actualizar('logs'), true;
    }

    // ─── ANTILINKS ───
    if (id === 'panel_antilinks_toggle') {
      mod.antilinks.enabled = !mod.antilinks.enabled;
      moderacion.setConfig(guild.id, mod);
      return actualizar('antilinks'), true;
    }
    if (id === 'panel_antilinks_add' || id === 'panel_antilinks_del') {
      await interaction.showModal(modal(`${id}_modal`, id.endsWith('add') ? 'Permitir dominio' : 'Quitar dominio', [
        { id: 'dominio', label: 'Dominio', hint: 'ejemplo: youtube.com' },
      ]));
      return true;
    }

    // ─── PALABRAS ───
    if (id === 'panel_palabras_toggle') {
      mod.palabras.enabled = !mod.palabras.enabled;
      moderacion.setConfig(guild.id, mod);
      return actualizar('palabras'), true;
    }
    if (id === 'panel_palabras_add') {
      await interaction.showModal(modal('panel_palabras_add_modal', 'Agregar palabras', [
        { id: 'palabras', label: 'Palabras separadas por coma', largo: true, hint: 'palabra1, palabra2, palabra3' },
      ]));
      return true;
    }
    if (id === 'panel_palabras_del') {
      await interaction.showModal(modal('panel_palabras_del_modal', 'Quitar palabra', [{ id: 'palabra', label: 'Palabra a quitar' }]));
      return true;
    }

    // ─── WARNS ───
    if (id === 'panel_warns_config') {
      await interaction.showModal(modal('panel_warns_modal', 'Warns automáticos', [
        { id: 'limite', label: 'Límite de warns (0-20)', valor: mod.warns.limite, hint: '3' },
        { id: 'accion', label: 'Acción: timeout, kick o ban', valor: mod.warns.accion, hint: 'timeout' },
        { id: 'minutos', label: 'Minutos de timeout', valor: mod.warns.minutos, req: false, hint: '60' },
      ]));
      return true;
    }
    if (id === 'panel_warns_off') {
      mod.warns.limite = 0;
      moderacion.setConfig(guild.id, mod);
      return actualizar('warns'), true;
    }

    // ─── EXENTOS ───
    if (id === 'panel_exentos_canales') {
      mod.canalesExentos = [...interaction.values];
      moderacion.setConfig(guild.id, mod);
      return actualizar('exentos'), true;
    }

    // ─── BIENVENIDA / DESPEDIDA ───
    for (const sec of ['bienvenida', 'despedida']) {
      if (id === `panel_${sec}_canal`) {
        uti[sec].canalId = interaction.values[0];
        uti[sec].enabled = true;
        utilidades.setCfgUtil(guild.id, uti);
        return actualizar(sec), true;
      }
      if (id === `panel_${sec}_toggle`) {
        uti[sec].enabled = !uti[sec].enabled;
        utilidades.setCfgUtil(guild.id, uti);
        return actualizar(sec), true;
      }
      if (id === `panel_${sec}_msg`) {
        await interaction.showModal(modal(`panel_${sec}_msg_modal`, `Mensaje de ${sec}`, [
          { id: 'mensaje', label: 'Mensaje', largo: true, valor: uti[sec].mensaje, hint: '{usuario} {servidor} {miembros}' },
        ]));
        return true;
      }
    }

    // ─── AUTOROL ───
    if (id === 'panel_autorol_roles') {
      uti.autorol.roles = [...interaction.values];
      utilidades.setCfgUtil(guild.id, uti);
      return actualizar('autorol'), true;
    }

    // ─── NIVELES ───
    if (id === 'panel_niveles_toggle') {
      uti.niveles.enabled = !uti.niveles.enabled;
      utilidades.setCfgUtil(guild.id, uti);
      return actualizar('niveles'), true;
    }
    if (id === 'panel_niveles_anuncio') {
      uti.niveles.anunciar = !uti.niveles.anunciar;
      utilidades.setCfgUtil(guild.id, uti);
      return actualizar('niveles'), true;
    }
    if (id === 'panel_niveles_canal') {
      uti.niveles.canalId = interaction.values[0];
      utilidades.setCfgUtil(guild.id, uti);
      return actualizar('niveles'), true;
    }

    // ─── RESPUESTAS DE MODALES ───
    if (interaction.isModalSubmit()) {
      const val = (c) => interaction.fields.getTextInputValue(c).trim();
      const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let seccion = 'inicio';
      let aviso = '✅ Guardado.';

      if (id === 'panel_antilinks_add_modal' || id === 'panel_antilinks_del_modal') {
        const dominio = norm(val('dominio')).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        const lista = new Set(mod.antilinks.dominiosPermitidos);
        if (id.includes('_add_')) lista.add(dominio);
        else lista.delete(dominio);
        mod.antilinks.dominiosPermitidos = [...lista].filter(Boolean);
        moderacion.setConfig(guild.id, mod);
        seccion = 'antilinks';
      } else if (id === 'panel_palabras_add_modal') {
        const nuevas = val('palabras').split(',').map((p) => norm(p).trim()).filter(Boolean);
        mod.palabras.lista = [...new Set([...mod.palabras.lista, ...nuevas])];
        moderacion.setConfig(guild.id, mod);
        seccion = 'palabras';
        aviso = `✅ Agregadas ${nuevas.length} palabra(s).`;
      } else if (id === 'panel_palabras_del_modal') {
        const p = norm(val('palabra'));
        mod.palabras.lista = mod.palabras.lista.filter((x) => x !== p);
        moderacion.setConfig(guild.id, mod);
        seccion = 'palabras';
      } else if (id === 'panel_warns_modal') {
        const limite = parseInt(val('limite'), 10);
        if (isNaN(limite) || limite < 0 || limite > 20) {
          await interaction.reply({ content: '❌ El límite debe ser un número entre 0 y 20.', flags: EFIMERO });
          return true;
        }
        mod.warns.limite = limite;
        const accion = val('accion').toLowerCase();
        if (['timeout', 'kick', 'ban'].includes(accion)) mod.warns.accion = accion;
        const minutos = parseInt(val('minutos') || '', 10);
        if (!isNaN(minutos) && minutos > 0 && minutos <= 40320) mod.warns.minutos = minutos;
        moderacion.setConfig(guild.id, mod);
        seccion = 'warns';
      } else if (id === 'panel_bienvenida_msg_modal' || id === 'panel_despedida_msg_modal') {
        const sec = id.includes('bienvenida') ? 'bienvenida' : 'despedida';
        uti[sec].mensaje = val('mensaje').slice(0, 1000);
        utilidades.setCfgUtil(guild.id, uti);
        seccion = sec;
      } else {
        return false;
      }

      await interaction.reply({ ...vista(seccion, guild), content: aviso, flags: EFIMERO });
      return true;
    }
  } catch (err) {
    console.error('[panel] Error:', err);
    const aviso = { content: '❌ Ocurrió un error en el panel.', flags: EFIMERO };
    await (interaction.replied || interaction.deferred ? interaction.followUp(aviso) : interaction.reply(aviso)).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { comandosDefinicion, manejarPanel };

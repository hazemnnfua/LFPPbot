// ═══════════════════════════════════════════════════════════════
// mercado-comandos.js — Handlers de todos los comandos del mercado
// ═══════════════════════════════════════════════════════════════
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
} = require('discord.js');
const mercado = require('./mercado');
const verificacionDB = require('./verificacion');

// ─── COLORES ─────────────────────────────────────────────────
const COLOR = {
  VERDE:    0x2ecc71,
  ROJO:     0xe74c3c,
  ORO:      0xf1c40f,
  AZUL:     0x3498db,
  NARANJA:  0xe67e22,
  GRIS:     0x95a5a6,
  MORADO:   0x9b59b6,
};

// ─── HELPER: embed de error ───────────────────────────────────
function embedError(msg) {
  return { embeds: [new EmbedBuilder().setColor(COLOR.ROJO).setDescription(msg)], ephemeral: true };
}
function embedOk(msg) {
  return { embeds: [new EmbedBuilder().setColor(COLOR.VERDE).setDescription(msg)], ephemeral: true };
}

// ─── HELPER: resolver robloxUser del ejecutor ────────────────
function getRobloxDelEjecutor(discordId) {
  const v = verificacionDB.getVerificacionPorDiscordId(discordId);
  return v ? v.robloxUsername : null;
}

// ─── HELPER: fila de botones aceptar/rechazar ─────────────────
function botonesAceptarRechazar(prefijo, id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefijo}_aceptar_${id}`).setLabel('✅ Aceptar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${prefijo}_rechazar_${id}`).setLabel('❌ Rechazar').setStyle(ButtonStyle.Danger),
  );
}

// ─── HELPER: embed de oferta ─────────────────────────────────
function embedOferta(o, j, titulo, color) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(titulo)
    .addFields(
      { name: '👤 Jugador',        value: `**${o.jugadorRoblox}** | ${j.posicion}`, inline: true },
      { name: '📌 Club actual',    value: o.clubActual === 'AGENTE_LIBRE' ? '🟢 Agente libre' : o.clubActual, inline: true },
      { name: '🏟️ Club oferente',  value: o.clubOferente, inline: true },
      { name: '💰 Oferta',         value: `**${mercado.fmt(o.monto)} Soles LFPP**`, inline: true },
      { name: '📋 Tipo',           value: o.tipo, inline: true },
      { name: '🔖 ID oferta',      value: `\`${o.id.slice(0,8)}\``, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'LFPP — Mercado de Fichajes' });
}

// ════════════════════════════════════════════════════════════════
//  ADMIN — mercado-abrir
// ════════════════════════════════════════════════════════════════
async function cmdMercadoAbrir(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply(embedError('🚫 Solo los admins pueden usar este comando.'));

  mercado.abrirVentana(interaction.user.tag);

  const embed = new EmbedBuilder()
    .setColor(COLOR.VERDE)
    .setTitle('🟢 ¡MERCADO DE FICHAJES ABIERTO!')
    .setDescription('La ventana de fichajes ha sido **abierta**. Los presidentes ya pueden hacer ofertas con `/ofrecer`.')
    .addFields({ name: '📋 Comandos disponibles', value: '`/ofrecer` `/prestar` `/pagar-clausula` `/rescindir` `/mis-ofertas` `/mi-contrato`' })
    .setTimestamp()
    .setFooter({ text: `Abierto por ${interaction.user.tag}` });

  await interaction.reply({ embeds: [embed] });

  // Anunciar en el canal de mercado si está configurado
  const canalId = process.env.CANAL_MERCADO_ID;
  if (canalId && canalId !== interaction.channelId) {
    try {
      const canal = await client.channels.fetch(canalId);
      await canal.send({ embeds: [embed] });
    } catch {}
  }
}

// ════════════════════════════════════════════════════════════════
//  ADMIN — mercado-cerrar
// ════════════════════════════════════════════════════════════════
async function cmdMercadoCerrar(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply(embedError('🚫 Solo los admins.'));

  mercado.cerrarVentana(interaction.user.tag);

  const embed = new EmbedBuilder()
    .setColor(COLOR.ROJO)
    .setTitle('🔴 MERCADO DE FICHAJES CERRADO')
    .setDescription('La ventana de fichajes ha sido **cerrada**. Las ofertas pendientes han sido canceladas.')
    .setTimestamp()
    .setFooter({ text: `Cerrado por ${interaction.user.tag}` });

  await interaction.reply({ embeds: [embed] });

  const canalId = process.env.CANAL_MERCADO_ID;
  if (canalId && canalId !== interaction.channelId) {
    try { const c = await client.channels.fetch(canalId); await c.send({ embeds: [embed] }); } catch {}
  }
}

// ════════════════════════════════════════════════════════════════
//  ADMIN — registrar-club
// ════════════════════════════════════════════════════════════════
async function cmdRegistrarClub(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply(embedError('🚫 Solo los admins.'));

  const nombre      = interaction.options.getString('nombre');
  const presidente  = interaction.options.getUser('presidente');
  const presId      = presidente ? presidente.id : null;

  const res = mercado.registrarClub(nombre, presId, interaction.user.tag);
  if (!res.ok) return interaction.reply(embedError(res.msg));

  const cfg = mercado.getConfig();
  return interaction.reply({ embeds: [
    new EmbedBuilder().setColor(COLOR.ORO)
      .setTitle(`🏟️ Club registrado: ${nombre}`)
      .addFields(
        { name: 'Presupuesto inicial', value: `**${mercado.fmt(cfg.presupuestoInicial)} Soles LFPP**`, inline: true },
        { name: 'Presidente',          value: presidente ? `<@${presId}>` : '— (asignar con `/asignar-presidente`)', inline: true },
      )
      .setTimestamp()
  ]});
}

// ════════════════════════════════════════════════════════════════
//  ADMIN — asignar-presidente
// ════════════════════════════════════════════════════════════════
async function cmdAsignarPresidente(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply(embedError('🚫 Solo los admins.'));

  const club = interaction.options.getString('club');
  const user = interaction.options.getUser('usuario');
  const res  = mercado.setPresidente(club, user.id, interaction.user.tag);
  if (!res.ok) return interaction.reply(embedError(res.msg));
  return interaction.reply(embedOk(`✅ <@${user.id}> es ahora el **Presidente** de **${club}**.`));
}

// ════════════════════════════════════════════════════════════════
//  ADMIN — registrar-jugador
// ════════════════════════════════════════════════════════════════
async function cmdRegistrarJugador(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply(embedError('🚫 Solo los admins.'));

  const discordUser = interaction.options.getUser('usuario');
  const roblox      = interaction.options.getString('roblox');
  const club        = interaction.options.getString('club');
  const valor       = interaction.options.getInteger('valor');
  const posicion    = interaction.options.getString('posicion') || '—';

  const res = mercado.registrarJugador(roblox, discordUser.id, club, valor, posicion, interaction.user.tag);
  if (!res.ok) return interaction.reply(embedError(res.msg));

  const j = mercado.getJugador(roblox);
  return interaction.reply({ embeds: [
    new EmbedBuilder().setColor(COLOR.AZUL)
      .setTitle(`✅ Jugador registrado: ${roblox}`)
      .addFields(
        { name: 'Discord',   value: `<@${discordUser.id}>`, inline: true },
        { name: 'Club',      value: club, inline: true },
        { name: 'Posición',  value: posicion, inline: true },
        { name: 'Valor',     value: `**${mercado.fmt(valor)} Soles LFPP**`, inline: true },
        { name: 'Cláusula',  value: `**${mercado.fmt(j.clausula)} Soles LFPP**`, inline: true },
      )
      .setTimestamp()
  ]});
}

// ════════════════════════════════════════════════════════════════
//  ADMIN — actualizar-valor
// ════════════════════════════════════════════════════════════════
async function cmdActualizarValor(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply(embedError('🚫 Solo los admins.'));

  const roblox    = interaction.options.getString('roblox');
  const nuevoVal  = interaction.options.getInteger('valor');
  const res       = mercado.actualizarValor(roblox, nuevoVal, interaction.user.tag);
  if (!res.ok) return interaction.reply(embedError(res.msg));

  const j = mercado.getJugador(roblox);
  return interaction.reply(embedOk(`✅ Valor de **${roblox}** actualizado a **${mercado.fmt(nuevoVal)} Soles LFPP**.\nCláusula nueva: **${mercado.fmt(j.clausula)} Soles LFPP**.`));
}

// ════════════════════════════════════════════════════════════════
//  ADMIN — add-presupuesto
// ════════════════════════════════════════════════════════════════
async function cmdAddPresupuesto(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply(embedError('🚫 Solo los admins.'));

  const club   = interaction.options.getString('club');
  const monto  = interaction.options.getInteger('monto');
  const motivo = interaction.options.getString('motivo') || 'Ajuste de administración';
  const res    = mercado.addPresupuesto(club, monto, motivo, interaction.user.tag);
  if (!res.ok) return interaction.reply(embedError(res.msg));

  return interaction.reply(embedOk(`✅ **${mercado.fmt(monto)} Soles LFPP** añadidos a **${club}**.\nPresupuesto actual: **${mercado.fmt(res.presupuesto)} Soles LFPP**.`));
}

// ════════════════════════════════════════════════════════════════
//  ADMIN — bono-victoria
// ════════════════════════════════════════════════════════════════
async function cmdBonoVictoria(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply(embedError('🚫 Solo los admins.'));

  const club = interaction.options.getString('club');
  const res  = mercado.aplicarBonoVictoria(club, interaction.user.tag);
  if (!res.ok) return interaction.reply(embedError(res.msg));

  return interaction.reply(embedOk(`🏆 Bono de victoria aplicado a **${club}**: +**${mercado.fmt(res.bono)} Soles LFPP**.\nPresupuesto actual: **${mercado.fmt(res.presupuesto)} Soles LFPP**.`));
}

// ════════════════════════════════════════════════════════════════
//  ADMIN — sancionar-jugador
// ════════════════════════════════════════════════════════════════
async function cmdSancionar(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply(embedError('🚫 Solo los admins.'));

  const roblox   = interaction.options.getString('roblox');
  const jornadas = interaction.options.getInteger('jornadas');
  const motivo   = interaction.options.getString('motivo');
  const res      = mercado.sancionar(roblox, jornadas, motivo, interaction.user.tag);
  if (!res.ok) return interaction.reply(embedError(res.msg));

  await interaction.reply(embedOk(`⛔ **${roblox}** sancionado por **${jornadas} jornada(s)**.\nMotivo: ${motivo}`));

  // Intentar avisar al jugador por DM
  const j = mercado.getJugador(roblox);
  if (j?.discordId) {
    try {
      const user = await client.users.fetch(j.discordId);
      await user.send({ embeds: [
        new EmbedBuilder().setColor(COLOR.ROJO)
          .setTitle('⛔ Has sido sancionado — LFPP')
          .addFields(
            { name: 'Jornadas',  value: String(jornadas), inline: true },
            { name: 'Motivo',    value: motivo, inline: true },
          )
          .setFooter({ text: 'Puedes apelar por ticket.' })
      ]});
    } catch {}
  }
}

// ════════════════════════════════════════════════════════════════
//  ADMIN — levantar-sancion
// ════════════════════════════════════════════════════════════════
async function cmdLevantarSancion(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply(embedError('🚫 Solo los admins.'));

  const roblox = interaction.options.getString('roblox');
  const res    = mercado.levantarSancion(roblox, interaction.user.tag);
  if (!res.ok) return interaction.reply(embedError(res.msg));

  await interaction.reply(embedOk(`✅ Sanción de **${roblox}** levantada.`));
  const j = mercado.getJugador(roblox);
  if (j?.discordId) {
    try {
      const user = await client.users.fetch(j.discordId);
      await user.send(embedOk('✅ Tu sanción ha sido levantada por la administración de la LFPP.'));
    } catch {}
  }
}

// ════════════════════════════════════════════════════════════════
//  ADMIN — rescindir-forzar
// ════════════════════════════════════════════════════════════════
async function cmdRescindirForzar(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply(embedError('🚫 Solo los admins.'));

  const roblox = interaction.options.getString('roblox');
  const res    = mercado.rescindirForzosa(roblox, interaction.user.tag);
  if (!res.ok) return interaction.reply(embedError(res.msg));

  await interaction.reply(embedOk(`✅ **${roblox}** desvinculado de **${res.clubAnterior}** y convertido en agente libre.`));
  const j = mercado.getJugador(roblox);
  if (j?.discordId) {
    try {
      const user = await client.users.fetch(j.discordId);
      await user.send({ embeds: [new EmbedBuilder().setColor(COLOR.NARANJA)
        .setTitle('📋 Rescisión forzosa — LFPP')
        .setDescription(`La administración ha rescindido tu contrato con **${res.clubAnterior}**. Ahora eres **agente libre**.`)
      ]});
    } catch {}
  }
}

// ════════════════════════════════════════════════════════════════
//  PRESIDENTE — /ofrecer (fichaje)
// ════════════════════════════════════════════════════════════════
async function cmdOfrecer(interaction, client) {
  const miRoblox = getRobloxDelEjecutor(interaction.user.id);
  if (!miRoblox) return interaction.reply(embedError('❌ No tienes una cuenta de Roblox verificada. Usa `/verificar` primero.'));

  // Detectar qué club preside
  const clubes = mercado.getAllClubes();
  const miClub = Object.values(clubes).find(c => c.presidenteId === interaction.user.id);
  if (!miClub) return interaction.reply(embedError('❌ No eres presidente de ningún club registrado. Pide a un admin que te asigne con `/asignar-presidente`.'));

  const robloxObj = interaction.options.getString('jugador');
  const monto     = interaction.options.getInteger('monto');

  const res = mercado.crearOferta({ tipo: 'FICHAJE', clubOferente: miClub.nombre, jugadorRoblox: robloxObj, monto });
  if (!res.ok) return interaction.reply(embedError(res.msg));

  const { ofertaId, oferta: o, jugador: j } = res;

  await interaction.reply(embedOk(`📨 Oferta enviada por **${robloxObj}** — **${mercado.fmt(monto)} Soles LFPP**.`));

  // Notificar según la etapa
  if (o.etapa === 'jugador') {
    // Agente libre → notificar al jugador directamente
    await notificarJugadorOferta(client, j, o, ofertaId);
  } else {
    // Tiene club → notificar al presidente del club vendedor
    await notificarClubOferta(client, clubes, o, ofertaId);
  }

  // Publicar en canal mercado
  await publicarEnMercado(client, embedOferta(o, j, `📨 Nueva oferta: ${o.tipo}`, COLOR.ORO));
}

// ════════════════════════════════════════════════════════════════
//  PRESIDENTE — /prestar
// ════════════════════════════════════════════════════════════════
async function cmdPrestar(interaction, client) {
  const clubes = mercado.getAllClubes();
  const miClub = Object.values(clubes).find(c => c.presidenteId === interaction.user.id);
  if (!miClub) return interaction.reply(embedError('❌ No eres presidente de ningún club.'));

  const robloxObj = interaction.options.getString('jugador');
  const monto     = interaction.options.getInteger('monto') || 0;
  const duracion  = interaction.options.getInteger('duracion') || 5;

  const res = mercado.crearOferta({ tipo: 'PRESTAMO', clubOferente: miClub.nombre, jugadorRoblox: robloxObj, monto, duracion });
  if (!res.ok) return interaction.reply(embedError(res.msg));

  const { ofertaId, oferta: o, jugador: j } = res;
  await interaction.reply(embedOk(`📨 Oferta de préstamo enviada — **${robloxObj}** por **${duracion} jornadas**.`));

  if (o.etapa === 'jugador') await notificarJugadorOferta(client, j, o, ofertaId);
  else await notificarClubOferta(client, clubes, o, ofertaId);
  await publicarEnMercado(client, embedOferta(o, j, `📨 Nueva oferta: PRÉSTAMO`, COLOR.MORADO));
}

// ════════════════════════════════════════════════════════════════
//  JUGADOR — /mis-ofertas
// ════════════════════════════════════════════════════════════════
async function cmdMisOfertas(interaction) {
  const miRoblox = getRobloxDelEjecutor(interaction.user.id);
  if (!miRoblox) return interaction.reply(embedError('❌ No tienes cuenta Roblox verificada.'));

  const ofertas = mercado.getOfertasPendientesJugador(miRoblox);
  if (!ofertas.length) return interaction.reply(embedError('No tienes ofertas pendientes en este momento.'));

  const embed = new EmbedBuilder()
    .setColor(COLOR.AZUL)
    .setTitle(`📋 Tus ofertas pendientes (${ofertas.length})`)
    .setDescription(ofertas.map(o =>
      `• **${o.tipo}** de **${o.clubOferente}** — ${mercado.fmt(o.monto)} Soles LFPP | \`${o.id.slice(0,8)}\``
    ).join('\n'))
    .setFooter({ text: 'Usa /aceptar-oferta o /rechazar-oferta con el ID.' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ════════════════════════════════════════════════════════════════
//  JUGADOR — /aceptar-oferta / /rechazar-oferta
// ════════════════════════════════════════════════════════════════
async function cmdResponderOfertaJugador(interaction, client, aceptar) {
  const miRoblox = getRobloxDelEjecutor(interaction.user.id);
  if (!miRoblox) return interaction.reply(embedError('❌ No tienes cuenta Roblox verificada.'));

  const ofId = interaction.options.getString('id');
  const o    = mercado.getOferta(ofId) || Object.values(mercado.getOfertas()).find(of => of.id.startsWith(ofId) && of.jugadorRoblox === miRoblox);
  if (!o) return interaction.reply(embedError('❌ Oferta no encontrada. Verifica el ID con `/mis-ofertas`.'));
  if (o.jugadorRoblox !== miRoblox) return interaction.reply(embedError('❌ Esa oferta no es para ti.'));

  const res = mercado.responderOfertaJugador(o.id, aceptar, interaction.user.tag);
  if (!res.ok) return interaction.reply(embedError(res.msg));

  if (!aceptar) {
    await interaction.reply(embedOk(`✅ Rechazaste la oferta de **${o.clubOferente}**.`));
    await notificarClubRechazo(client, o);
    return;
  }

  // Aceptada → publicar en mercado
  await interaction.reply(embedOk(`🎉 ¡Fichaje completado! Ahora juegas en **${o.clubOferente}**.`));
  const embedFichaje = new EmbedBuilder()
    .setColor(COLOR.VERDE)
    .setTitle(`🎉 FICHAJE OFICIAL — LFPP`)
    .addFields(
      { name: '👤 Jugador',    value: `**${o.jugadorRoblox}**`, inline: true },
      { name: '📤 Sale de',    value: o.clubActual === 'AGENTE_LIBRE' ? '🟢 Agente libre' : o.clubActual, inline: true },
      { name: '📥 Llega a',    value: `**${o.clubOferente}**`, inline: true },
      { name: '💰 Monto',      value: `${mercado.fmt(o.monto)} Soles LFPP`, inline: true },
      { name: '📋 Tipo',       value: o.tipo, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'LFPP — Mercado de Fichajes' });

  await publicarEnMercado(client, embedFichaje);
}

// ════════════════════════════════════════════════════════════════
//  JUGADOR — /rescindir
// ════════════════════════════════════════════════════════════════
async function cmdRescindir(interaction, client) {
  const miRoblox = getRobloxDelEjecutor(interaction.user.id);
  if (!miRoblox) return interaction.reply(embedError('❌ No tienes cuenta Roblox verificada.'));

  const j = mercado.getJugador(miRoblox);
  if (!j) return interaction.reply(embedError('❌ No estás registrado en el sistema de mercado.'));
  if (j.club === 'AGENTE_LIBRE') return interaction.reply(embedError('Ya eres agente libre.'));

  // Confirmar con botones antes de ejecutar
  const embed = new EmbedBuilder()
    .setColor(COLOR.NARANJA)
    .setTitle('⚠️ Confirmar rescisión de contrato')
    .setDescription(`Vas a rescindir tu contrato con **${j.club}**.\n\nDeberás pagar tu cláusula de rescisión: **${mercado.fmt(j.clausula)} Soles LFPP** (se le paga al club).\n\n¿Estás seguro?`)
    .setFooter({ text: 'Esta acción no se puede deshacer.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rescindir_confirmar_${miRoblox}`).setLabel('Sí, rescindir').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`rescindir_cancelar_${miRoblox}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
  );

  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// ════════════════════════════════════════════════════════════════
//  JUGADOR — /mi-contrato
// ════════════════════════════════════════════════════════════════
async function cmdMiContrato(interaction) {
  const miRoblox = getRobloxDelEjecutor(interaction.user.id);
  if (!miRoblox) return interaction.reply(embedError('❌ No tienes cuenta Roblox verificada.'));

  const j = mercado.getJugador(miRoblox);
  if (!j) return interaction.reply(embedError('❌ No estás registrado en el sistema de mercado.'));

  const embed = new EmbedBuilder()
    .setColor(COLOR.AZUL)
    .setTitle(`📋 Tu contrato — ${miRoblox}`)
    .addFields(
      { name: '🏟️ Club',           value: j.club === 'AGENTE_LIBRE' ? '🟢 Agente libre' : j.club, inline: true },
      { name: '🎯 Posición',        value: j.posicion, inline: true },
      { name: '💰 Valor de mercado',value: `${mercado.fmt(j.valor)} Soles LFPP`, inline: true },
      { name: '🔒 Cláusula',        value: `${mercado.fmt(j.clausula)} Soles LFPP`, inline: true },
      { name: '📅 Contrato',        value: j.contrato ? `${j.contrato.jornadasRestantes} jornadas restantes` : '—', inline: true },
      { name: '⛔ Suspendido',      value: j.suspendido ? `Sí — ${j.jornadasSuspension}j (${j.motivoSancion})` : 'No', inline: true },
    )
    .setFooter({ text: 'LFPP — Mercado de Fichajes' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ════════════════════════════════════════════════════════════════
//  CONSULTA — /plantilla
// ════════════════════════════════════════════════════════════════
async function cmdPlantilla(interaction) {
  const clubNombre = interaction.options.getString('club');
  const club       = mercado.getClub(clubNombre);
  if (!club) return interaction.reply(embedError(`Club **${clubNombre}** no encontrado.`));

  const jugadores = club.jugadores.map(u => {
    const j = mercado.getJugador(u);
    return j ? `• **${u}** | ${j.posicion} | ${mercado.fmt(j.valor)} S. ${j.suspendido ? '⛔' : ''}` : `• ${u}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLOR.ORO)
    .setTitle(`🏟️ Plantilla — ${clubNombre}`)
    .addFields(
      { name: `Jugadores (${jugadores.length})`, value: jugadores.join('\n') || 'Sin jugadores registrados.' },
      { name: '💰 Presupuesto',  value: `${mercado.fmt(club.presupuesto)} Soles LFPP`, inline: true },
      { name: '📤 Gastos',       value: `${mercado.fmt(club.gastos)} Soles LFPP`, inline: true },
      { name: '📥 Ingresos',     value: `${mercado.fmt(club.ingresos)} Soles LFPP`, inline: true },
    )
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════════
//  CONSULTA — /agentes-libres
// ════════════════════════════════════════════════════════════════
async function cmdAgentesLibres(interaction) {
  const libres = mercado.getAgenteLibres();
  if (!libres.length) return interaction.reply(embedError('No hay agentes libres en este momento.'));

  const embed = new EmbedBuilder()
    .setColor(COLOR.VERDE)
    .setTitle(`🟢 Agentes libres (${libres.length})`)
    .setDescription(libres.map(j =>
      `• **${j.robloxUser}** | ${j.posicion} | ${mercado.fmt(j.valor)} Soles LFPP`
    ).join('\n'))
    .setFooter({ text: 'Usa /ofrecer para ficharlos.' });

  return interaction.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════════
//  CONSULTA — /valor-jugador
// ════════════════════════════════════════════════════════════════
async function cmdValorJugador(interaction) {
  const roblox = interaction.options.getString('jugador');
  const j      = mercado.getJugador(roblox);
  if (!j) return interaction.reply(embedError(`Jugador **${roblox}** no encontrado.`));

  const embed = new EmbedBuilder()
    .setColor(COLOR.AZUL)
    .setTitle(`💰 Valor de mercado — ${roblox}`)
    .addFields(
      { name: 'Club',            value: j.club === 'AGENTE_LIBRE' ? '🟢 Agente libre' : j.club, inline: true },
      { name: 'Posición',        value: j.posicion, inline: true },
      { name: 'Valor',           value: `**${mercado.fmt(j.valor)} Soles LFPP**`, inline: true },
      { name: 'Cláusula',        value: `**${mercado.fmt(j.clausula)} Soles LFPP**`, inline: true },
      { name: 'Contrato',        value: j.contrato ? `${j.contrato.jornadasRestantes}j restantes` : '—', inline: true },
    );

  return interaction.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════════
//  CONSULTA — /presupuesto
// ════════════════════════════════════════════════════════════════
async function cmdPresupuesto(interaction) {
  const clubNombre = interaction.options.getString('club');
  const club       = mercado.getClub(clubNombre);
  if (!club) return interaction.reply(embedError(`Club **${clubNombre}** no encontrado.`));

  const historial = mercado.getEconomiaClub(clubNombre).slice(0, 8);
  const embed = new EmbedBuilder()
    .setColor(COLOR.ORO)
    .setTitle(`💰 Economía de ${clubNombre}`)
    .addFields(
      { name: '💵 Presupuesto disponible', value: `**${mercado.fmt(club.presupuesto)} Soles LFPP**`, inline: true },
      { name: '📤 Total gastado',           value: `${mercado.fmt(club.gastos)} Soles LFPP`, inline: true },
      { name: '📥 Total ingresado',         value: `${mercado.fmt(club.ingresos)} Soles LFPP`, inline: true },
      { name: '📋 Últimos movimientos', value: historial.map(h =>
        `${h.monto >= 0 ? '▲' : '▼'} ${mercado.fmt(Math.abs(h.monto))} — ${h.desc}`
      ).join('\n') || '—' },
    )
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════════
//  CONSULTA — /mercado-estado
// ════════════════════════════════════════════════════════════════
async function cmdMercadoEstado(interaction) {
  const cfg = mercado.getConfig();
  const embed = new EmbedBuilder()
    .setColor(cfg.ventanaAbierta ? COLOR.VERDE : COLOR.ROJO)
    .setTitle(cfg.ventanaAbierta ? '🟢 Mercado ABIERTO' : '🔴 Mercado CERRADO')
    .addFields(
      { name: 'Moneda',              value: cfg.moneda, inline: true },
      { name: 'Presupuesto inicial', value: `${mercado.fmt(cfg.presupuestoInicial)} Soles LFPP`, inline: true },
      { name: 'Cláusula (x)',        value: `×${cfg.multiplicadorClausula}`, inline: true },
      { name: 'Bono victoria',       value: `${mercado.fmt(cfg.bonoVictoria)} Soles LFPP`, inline: true },
      { name: 'Apertura',            value: cfg.fechaApertura ? new Date(cfg.fechaApertura).toLocaleString('es-PE') : '—', inline: true },
      { name: 'Cierre',              value: cfg.fechaCierre   ? new Date(cfg.fechaCierre).toLocaleString('es-PE') : '—', inline: true },
    )
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════════
//  PAGAR CLÁUSULA (fichaje directo)
// ════════════════════════════════════════════════════════════════
async function cmdPagarClausula(interaction, client) {
  const clubes = mercado.getAllClubes();
  const miClub = Object.values(clubes).find(c => c.presidenteId === interaction.user.id);
  if (!miClub) return interaction.reply(embedError('❌ No eres presidente de ningún club.'));

  const roblox = interaction.options.getString('jugador');
  const j      = mercado.getJugador(roblox);
  if (!j) return interaction.reply(embedError(`Jugador **${roblox}** no encontrado.`));

  // Confirmar
  const embed = new EmbedBuilder()
    .setColor(COLOR.NARANJA)
    .setTitle('⚠️ Confirmar pago de cláusula')
    .setDescription(`Vas a pagar la cláusula de rescisión de **${roblox}** para ficharlo directamente.\n\nCosto: **${mercado.fmt(j.clausula)} Soles LFPP**\n\nEl club **${j.club}** no puede rechazar esto.`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`clausula_confirmar_${miClub.nombre}_${roblox}`).setLabel('Confirmar pago').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`clausula_cancelar`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
  );

  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// ════════════════════════════════════════════════════════════════
//  BOTONES — manejador central
// ════════════════════════════════════════════════════════════════
async function manejarBotonMercado(interaction, client) {
  const id = interaction.customId;

  // ── rescindir confirmar/cancelar ──────────────────────────
  if (id.startsWith('rescindir_confirmar_')) {
    const roblox = id.replace('rescindir_confirmar_', '');
    const miRoblox = getRobloxDelEjecutor(interaction.user.id);
    if (roblox !== miRoblox) return interaction.reply(embedError('❌ No eres ese jugador.'));

    const res = mercado.rescindirVoluntaria(roblox);
    if (!res.ok) return interaction.update({ embeds: [new EmbedBuilder().setColor(COLOR.ROJO).setDescription(res.msg)], components: [] });

    await interaction.update({ embeds: [new EmbedBuilder().setColor(COLOR.VERDE)
      .setDescription(`✅ Rescisión completada. Pagaste **${mercado.fmt(res.clausula)} Soles LFPP** a **${res.clubAnterior}**. Ahora eres agente libre.`)
    ], components: [] });

    await publicarEnMercado(client, new EmbedBuilder()
      .setColor(COLOR.GRIS)
      .setTitle('📋 Rescisión de contrato — LFPP')
      .addFields(
        { name: '👤 Jugador',    value: roblox, inline: true },
        { name: '📤 Sale de',    value: res.clubAnterior, inline: true },
        { name: '💰 Cláusula',   value: `${mercado.fmt(res.clausula)} Soles LFPP`, inline: true },
      ).setTimestamp()
    );
    return;
  }

  if (id.startsWith('rescindir_cancelar')) {
    return interaction.update({ embeds: [new EmbedBuilder().setColor(COLOR.GRIS).setDescription('Rescisión cancelada.')], components: [] });
  }

  // ── pagar cláusula confirmar ──────────────────────────────
  if (id.startsWith('clausula_confirmar_')) {
    const partes = id.replace('clausula_confirmar_', '').split('_');
    const roblox = partes.pop();
    const clubN  = partes.join('_');
    const res    = mercado.pagarClausula(clubN, roblox);
    if (!res.ok) return interaction.update({ embeds: [new EmbedBuilder().setColor(COLOR.ROJO).setDescription(res.msg)], components: [] });

    await interaction.update({ embeds: [new EmbedBuilder().setColor(COLOR.VERDE)
      .setDescription(`✅ Cláusula pagada. **${roblox}** ahora juega en **${clubN}**.`)
    ], components: [] });

    await publicarEnMercado(client, new EmbedBuilder()
      .setColor(COLOR.ORO)
      .setTitle('💥 CLÁUSULA PAGADA — Fichaje directo')
      .addFields(
        { name: '👤 Jugador',  value: `**${roblox}**`, inline: true },
        { name: '📥 Llega a',  value: `**${clubN}**`, inline: true },
        { name: '💰 Cláusula', value: `${mercado.fmt(res.clausula)} Soles LFPP`, inline: true },
      ).setTimestamp()
    );
    return;
  }

  if (id === 'clausula_cancelar') {
    return interaction.update({ embeds: [new EmbedBuilder().setColor(COLOR.GRIS).setDescription('Operación cancelada.')], components: [] });
  }

  // ── respuesta del club vendedor ───────────────────────────
  if (id.startsWith('club_aceptar_') || id.startsWith('club_rechazar_')) {
    const aceptar  = id.startsWith('club_aceptar_');
    const ofertaId = id.replace('club_aceptar_', '').replace('club_rechazar_', '');
    const o        = mercado.getOferta(ofertaId);
    if (!o) return interaction.reply(embedError('Oferta no encontrada.'));

    // Verificar que quien responde es presidente del club vendedor
    const club = mercado.getClub(o.clubActual);
    if (!club || club.presidenteId !== interaction.user.id)
      return interaction.reply(embedError('❌ Solo el presidente de tu club puede responder esta oferta.'));

    const res = mercado.responderOfertaClub(ofertaId, aceptar, interaction.user.tag);
    if (!res.ok) return interaction.reply(embedError(res.msg));

    if (!aceptar) {
      await interaction.update({ embeds: [new EmbedBuilder().setColor(COLOR.ROJO)
        .setDescription(`❌ **${o.clubActual}** rechazó la oferta de **${o.clubOferente}** por **${o.jugadorRoblox}**.`)
      ], components: [] });
      await notificarClubRechazo(client, o);
      return;
    }

    // Aceptó → notificar al jugador
    await interaction.update({ embeds: [new EmbedBuilder().setColor(COLOR.VERDE)
      .setDescription(`✅ **${o.clubActual}** aceptó la oferta. Ahora esperando respuesta de **${o.jugadorRoblox}**.`)
    ], components: [] });

    const j = mercado.getJugador(o.jugadorRoblox);
    await notificarJugadorOferta(client, j, o, ofertaId);
    return;
  }

  // ── respuesta del jugador (botón en DM) ───────────────────
  if (id.startsWith('jug_aceptar_') || id.startsWith('jug_rechazar_')) {
    const aceptar  = id.startsWith('jug_aceptar_');
    const ofertaId = id.replace('jug_aceptar_', '').replace('jug_rechazar_', '');
    const o        = mercado.getOferta(ofertaId);
    if (!o) return interaction.reply(embedError('Oferta no encontrada.'));

    // Verificar que el que responde es el jugador correcto
    const miRoblox = getRobloxDelEjecutor(interaction.user.id);
    if (!miRoblox || miRoblox !== o.jugadorRoblox)
      return interaction.reply(embedError('❌ Solo el jugador al que va dirigida la oferta puede responder.'));

    const res = mercado.responderOfertaJugador(ofertaId, aceptar, interaction.user.tag);
    if (!res.ok) return interaction.update({ embeds: [new EmbedBuilder().setColor(COLOR.ROJO).setDescription(res.msg)], components: [] });

    if (!aceptar) {
      await interaction.update({ embeds: [new EmbedBuilder().setColor(COLOR.ROJO)
        .setDescription('❌ Rechazaste la oferta.')
      ], components: [] });
      await notificarClubRechazo(client, o);
      return;
    }

    await interaction.update({ embeds: [new EmbedBuilder().setColor(COLOR.VERDE)
      .setDescription(`🎉 ¡Fichaje aceptado! Ahora juegas en **${o.clubOferente}**.`)
    ], components: [] });

    await publicarEnMercado(client, new EmbedBuilder()
      .setColor(COLOR.VERDE)
      .setTitle('🎉 FICHAJE OFICIAL — LFPP')
      .addFields(
        { name: '👤 Jugador',  value: `**${o.jugadorRoblox}**`, inline: true },
        { name: '📤 Sale de',  value: o.clubActual === 'AGENTE_LIBRE' ? '🟢 Agente libre' : o.clubActual, inline: true },
        { name: '📥 Llega a',  value: `**${o.clubOferente}**`, inline: true },
        { name: '💰 Monto',    value: `${mercado.fmt(o.monto)} Soles LFPP`, inline: true },
        { name: '📋 Tipo',     value: o.tipo, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'LFPP — Mercado de Fichajes' })
    );
    return;
  }
}

// ─── HELPERS INTERNOS ────────────────────────────────────────
async function notificarJugadorOferta(client, j, o, ofertaId) {
  if (!j?.discordId) return;
  try {
    const user = await client.users.fetch(j.discordId);
    await user.send({
      embeds: [embedOferta(o, j, `📨 Tienes una oferta — ${o.tipo}`, COLOR.ORO)
        .setDescription(`**${o.clubOferente}** quiere ficharte por **${mercado.fmt(o.monto)} Soles LFPP**.\n¿Aceptas?`)
      ],
      components: [botonesAceptarRechazar('jug', ofertaId)],
    });
  } catch {}
}

async function notificarClubOferta(client, clubes, o, ofertaId) {
  const clubVend = clubes[o.clubActual];
  if (!clubVend?.presidenteId) return;
  try {
    const user = await client.users.fetch(clubVend.presidenteId);
    const j    = mercado.getJugador(o.jugadorRoblox);
    await user.send({
      embeds: [embedOferta(o, j, `📨 Oferta por tu jugador — ${o.tipo}`, COLOR.ORO)
        .setDescription(`**${o.clubOferente}** ofrece **${mercado.fmt(o.monto)} Soles LFPP** por **${o.jugadorRoblox}**.\n¿Aceptas la venta?`)
      ],
      components: [botonesAceptarRechazar('club', ofertaId)],
    });
  } catch {}
}

async function notificarClubRechazo(client, o) {
  const clubes    = mercado.getAllClubes();
  const clubDest  = clubes[o.clubOferente];
  if (!clubDest?.presidenteId) return;
  try {
    const user = await client.users.fetch(clubDest.presidenteId);
    await user.send(embedError(`❌ Tu oferta por **${o.jugadorRoblox}** fue **rechazada**.`));
  } catch {}
}

async function publicarEnMercado(client, embed) {
  const canalId = process.env.CANAL_MERCADO_ID;
  if (!canalId) return;
  try {
    const canal = await client.channels.fetch(canalId);
    await canal.send({ embeds: [embed] });
  } catch {}
}

module.exports = {
  // admin
  cmdMercadoAbrir, cmdMercadoCerrar, cmdRegistrarClub, cmdAsignarPresidente,
  cmdRegistrarJugador, cmdActualizarValor, cmdAddPresupuesto, cmdBonoVictoria,
  cmdSancionar, cmdLevantarSancion, cmdRescindirForzar,
  // presidente
  cmdOfrecer, cmdPrestar, cmdPagarClausula,
  // jugador
  cmdMisOfertas, cmdResponderOfertaJugador, cmdRescindir, cmdMiContrato,
  // consultas
  cmdPlantilla, cmdAgentesLibres, cmdValorJugador, cmdPresupuesto, cmdMercadoEstado,
  // botones
  manejarBotonMercado,
};

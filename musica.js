// ═══════════════════════════════════════════════════════════════
// musica.js — Sistema de música (YouTube, Spotify, SoundCloud, etc.)
// Usa Kazagumo + Shoukaku (Lavalink) en vez de conexión UDP directa,
// porque Railway bloquea/rompe el UDP de voz de Discord cuando el bot
// se conecta directo (VOICE_CONNECT_FAILED). Lavalink corre como
// servicio aparte y es quien habla UDP con Discord.
// ═══════════════════════════════════════════════════════════════
const { Kazagumo } = require('kazagumo');
const { Connectors } = require('shoukaku');
const { EmbedBuilder } = require('discord.js');

// ─── Red de seguridad: un error async sin capturar (ej. de Lavalink) no debe
// tumbar el proceso completo del bot. Solo lo logueamos.
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ unhandledRejection (no tumba el bot):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ uncaughtException (no tumba el bot):', err);
});

const COLOR = { VERDE: 0x2ecc71, ROJO: 0xe74c3c, AZUL: 0x3498db, GRIS: 0x95a5a6 };

let kazagumo = null;
let discordClient = null;

function iniciarMusica(client) {
  discordClient = client;

  if (!process.env.LAVALINK_HOST || !process.env.LAVALINK_PORT || !process.env.LAVALINK_PASSWORD) {
    console.warn('⚠️ Faltan variables LAVALINK_HOST / LAVALINK_PORT / LAVALINK_PASSWORD en el .env — la música no va a funcionar hasta configurarlas.');
  }
  console.log('🔍 DEBUG Lavalink host:', process.env.LAVALINK_HOST, '| puerto:', process.env.LAVALINK_PORT, '| secure:', process.env.LAVALINK_SECURE, '| password largo:', (process.env.LAVALINK_PASSWORD || '').length);

  const nodes = [
    {
      name: 'main',
      url: `${process.env.LAVALINK_HOST}:${process.env.LAVALINK_PORT}`,
      auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
      secure: process.env.LAVALINK_SECURE === 'true',
    },
  ];

  kazagumo = new Kazagumo(
    {
      defaultSearchEngine: 'youtube',
      send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      },
    },
    new Connectors.DiscordJS(client),
    nodes,
    { moveOnDisconnect: false, resume: false, reconnectTries: 3, restTimeout: 15000 }
  );

  kazagumo.shoukaku.on('ready', (name) => console.log(`🎵 Nodo Lavalink "${name}" conectado.`));
  kazagumo.shoukaku.on('error', (name, error) => console.error(`❌ Error en nodo Lavalink "${name}":`, error?.message || error));
  kazagumo.shoukaku.on('close', (name, code, reason) => console.warn(`⚠️ Nodo Lavalink "${name}" cerrado (${code}): ${reason}`));
  kazagumo.shoukaku.on('disconnect', (name) => console.warn(`⚠️ Nodo Lavalink "${name}" desconectado.`));

  kazagumo
    .on('playerStart', (player, track) => {
      console.log('▶️ playerStart:', track.title, track.uri);
      const canal = discordClient.channels.cache.get(player.textId);
      canal?.send({ embeds: [embedReproduciendo(track)] });
    })
    .on('playerEmpty', (player) => {
      const canal = discordClient.channels.cache.get(player.textId);
      canal?.send({ embeds: [embedInfo('🏁 Cola terminada. Saliendo del canal de voz.')] });
      player.destroy();
    })
    .on('playerException', (player, data) => {
      console.error('❌ Error de Lavalink (playerException):', data);
      const canal = discordClient.channels.cache.get(player.textId);
      canal?.send({ embeds: [embedError(`❌ Error reproduciendo: ${data?.exception?.message?.slice(0, 200) || 'desconocido'}`)] });
    })
    .on('playerClosed', (player, data) => {
      console.warn('⚠️ Conexión de voz cerrada (playerClosed):', data);
    });

  console.log('🎵 Sistema de música (Kazagumo/Lavalink) inicializado.');

  setTimeout(() => {
    try {
      const nodesMap = kazagumo.shoukaku.nodes;
      console.log('🔍 DEBUG estado de nodos tras 8s:', nodesMap.size, 'nodo(s) registrados');
      for (const [name, node] of nodesMap) {
        console.log(`🔍 DEBUG nodo "${name}": state=${node.state}, stats=${JSON.stringify(node.stats)}`);
      }
    } catch (e) {
      console.error('🔍 DEBUG error leyendo nodos:', e.message);
    }
  }, 8000);
}

// ─── utilidades ───────────────────────────────────────────────
function formatDuration(ms) {
  if (!ms || ms <= 0) return 'En vivo';
  const totalSeg = Math.floor(ms / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ─── EMBEDS ────────────────────────────────────────────────────
function embedReproduciendo(track) {
  return new EmbedBuilder()
    .setColor(COLOR.VERDE)
    .setTitle('🎶 Reproduciendo ahora')
    .setDescription(`**[${track.title}](${track.uri})**`)
    .addFields(
      { name: 'Duración', value: formatDuration(track.length), inline: true },
      { name: 'Pedido por', value: `${track.requester}`, inline: true },
      { name: 'Fuente', value: track.sourceName || 'desconocida', inline: true },
    )
    .setThumbnail(track.thumbnail || null);
}
function embedAgregado(track) {
  return new EmbedBuilder()
    .setColor(COLOR.AZUL)
    .setDescription(`➕ Añadido a la cola: **[${track.title}](${track.uri})** (${formatDuration(track.length)})`);
}
function embedInfo(msg) {
  return new EmbedBuilder().setColor(COLOR.GRIS).setDescription(msg);
}
function embedError(msg) {
  return new EmbedBuilder().setColor(COLOR.ROJO).setDescription(msg);
}

// ─── SPOTIFY ──────────────────────────────────────────────────
async function resolverQuerySpotify(url) {
  if (/open\.spotify\.com\/(playlist|album)\//i.test(url)) {
    return { error: 'Por ahora solo soporto **canciones individuales** de Spotify. Prueba con el link de una canción específica, o busca el nombre directamente.' };
  }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    const html = await res.text();
    const match = html.match(/<title>(.*?)<\/title>/i);
    if (!match) return { error: null, query: url };
    const limpio = match[1]
      .replace(/\s*\|\s*Spotify\s*$/i, '')
      .replace(/\s*-\s*song\s+by\s+/i, ' ')
      .trim();
    return { error: null, query: limpio || url };
  } catch (err) {
    console.error('Error resolviendo link de Spotify:', err);
    return { error: null, query: url };
  }
}

// ─── HELPER ───────────────────────────────────────────────────
function requiereCanalDeVoz(interaction) {
  const canal = interaction.member?.voice?.channel;
  if (!canal) {
    interaction.reply({ embeds: [embedError('🔇 Tienes que estar en un canal de voz para usar este comando.')], ephemeral: true });
    return null;
  }
  return canal;
}

// ═══════════════════════════════════════════════════════════════
// COMANDOS
// ═══════════════════════════════════════════════════════════════

async function cmdPlay(interaction) {
  const canalVoz = requiereCanalDeVoz(interaction);
  if (!canalVoz) return;

  let query = interaction.options.getString('busqueda');
  console.log('🔎 cmdPlay query:', query);
  await interaction.deferReply();

  if (/open\.spotify\.com\//i.test(query)) {
    const resuelto = await resolverQuerySpotify(query);
    if (resuelto.error) {
      return interaction.editReply({ embeds: [embedError(resuelto.error)] });
    }
    query = resuelto.query;
  }

  try {
    console.log('🎵 Buscando en Lavalink:', query);

    let player = kazagumo.players.get(interaction.guildId);
    if (!player) {
      player = await kazagumo.createPlayer({
        guildId: interaction.guildId,
        textId: interaction.channel.id,
        voiceId: canalVoz.id,
        volume: 100,
      });
    }

    const result = await kazagumo.search(query, { requester: interaction.member.user.tag });
    if (!result || !result.tracks.length) {
      return interaction.editReply({ embeds: [embedError('❌ No pude encontrar o reproducir eso. Verifica el link o intenta con otro nombre.')] });
    }

    if (result.type === 'PLAYLIST') {
      for (const track of result.tracks) player.queue.add(track);
      await interaction.editReply({ embeds: [embedInfo(`📃 Añadida playlist **${result.playlistName || query}** (${result.tracks.length} canciones).`)] });
    } else {
      const track = result.tracks[0];
      player.queue.add(track);
      if (player.playing || player.queue.length > 1) {
        await interaction.editReply({ embeds: [embedAgregado(track)] });
      } else {
        await interaction.editReply({ embeds: [embedInfo(`🔎 Reproduciendo: **${track.title}**...`)] });
      }
    }

    if (!player.playing && !player.paused) {
      const actual = player.queue.current;
      console.log('🔍 DEBUG track a reproducir:', JSON.stringify({
        title: actual?.title,
        uri: actual?.uri,
        tieneEncoded: !!actual?.track,
        sourceName: actual?.sourceName,
        realUri: actual?.realUri,
      }));
      try {
        await player.play();
      } catch (playErr) {
        console.error('❌ Error al iniciar reproducción (player.play):', playErr);
        await interaction.followUp({ embeds: [embedError('❌ Lavalink rechazó la reproducción. Intenta de nuevo en unos segundos.')] }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('Error en /play:', err);
    await interaction.editReply({ embeds: [embedError('❌ No pude encontrar o reproducir eso. Verifica el link o intenta con otro nombre.')] });
  }
}

async function cmdSkip(interaction) {
  const player = kazagumo.players.get(interaction.guildId);
  if (!player || !player.queue.current) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  const siguiente = player.queue[0];
  player.skip();
  await interaction.reply({ embeds: [embedInfo(siguiente ? `⏭️ Saltado. Ahora suena: **${siguiente.title}**` : '⏭️ Saltado.')] });
}

async function cmdStop(interaction) {
  const player = kazagumo.players.get(interaction.guildId);
  if (!player) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  player.queue.clear();
  player.destroy();
  await interaction.reply({ embeds: [embedInfo('⏹️ Música detenida y cola vaciada.')] });
}

async function cmdPause(interaction) {
  const player = kazagumo.players.get(interaction.guildId);
  if (!player) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  player.pause(true);
  await interaction.reply({ embeds: [embedInfo('⏸️ Pausado.')] });
}

async function cmdResume(interaction) {
  const player = kazagumo.players.get(interaction.guildId);
  if (!player) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  player.pause(false);
  await interaction.reply({ embeds: [embedInfo('▶️ Reanudado.')] });
}

async function cmdQueue(interaction) {
  const player = kazagumo.players.get(interaction.guildId);
  if (!player || (!player.queue.current && !player.queue.length)) {
    return interaction.reply({ embeds: [embedError('📭 La cola está vacía.')], ephemeral: true });
  }
  const items = [player.queue.current, ...player.queue].filter(Boolean);
  const lista = items
    .slice(0, 15)
    .map((t, i) => `${i === 0 ? '▶️' : `${i}.`} **${t.title}** — ${formatDuration(t.length)}`)
    .join('\n');
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.AZUL).setTitle('🎼 Cola de reproducción').setDescription(lista)],
  });
}

async function cmdVolumen(interaction) {
  const player = kazagumo.players.get(interaction.guildId);
  if (!player) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  const vol = interaction.options.getInteger('nivel');
  player.setVolume(vol);
  await interaction.reply({ embeds: [embedInfo(`🔊 Volumen ajustado a ${vol}%.`)] });
}

async function cmdLeave(interaction) {
  const player = kazagumo.players.get(interaction.guildId);
  if (!player) return interaction.reply({ embeds: [embedError('📭 No estoy en ningún canal de voz.')], ephemeral: true });
  player.destroy();
  await interaction.reply({ embeds: [embedInfo('👋 Saliendo del canal de voz.')] });
}

module.exports = {
  iniciarMusica,
  cmdPlay,
  cmdSkip,
  cmdStop,
  cmdPause,
  cmdResume,
  cmdQueue,
  cmdVolumen,
  cmdLeave,
};

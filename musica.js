// ═══════════════════════════════════════════════════════════════
// musica.js — Sistema de música (YouTube, Spotify, SoundCloud, etc.)
// Usa DisTube: detecta automáticamente de dónde viene el link
// (o busca en YouTube si mandas solo texto/nombre de canción).
// ═══════════════════════════════════════════════════════════════
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { EmbedBuilder } = require('discord.js');

const COLOR = { VERDE: 0x2ecc71, ROJO: 0xe74c3c, AZUL: 0x3498db, GRIS: 0x95a5a6 };

let distube = null;

// ─── Inicializa DisTube, se llama una sola vez desde index.js ─
function iniciarMusica(client) {
  distube = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    plugins: [
      new SpotifyPlugin(),      // links open.spotify.com/track|album|playlist
      new SoundCloudPlugin(),   // links soundcloud.com
      new YtDlpPlugin(),        // YouTube (links o búsqueda por texto) + fallback general
    ],
  });

  distube
    .on('playSong', (queue, song) => {
      queue.textChannel?.send({ embeds: [embedReproduciendo(song)] });
    })
    .on('addSong', (queue, song) => {
      // Solo avisa que se agregó si NO es la primera (esa la anuncia playSong)
      if (queue.songs.length > 1) {
        queue.textChannel?.send({ embeds: [embedAgregado(song)] });
      }
    })
    .on('finish', (queue) => {
      queue.textChannel?.send({ embeds: [embedInfo('🏁 Cola terminada. Saliendo del canal de voz.')] });
    })
    .on('disconnect', (queue) => {
      queue.textChannel?.send({ embeds: [embedInfo('👋 Desconectado del canal de voz.')] });
    })
    .on('empty', (queue) => {
      queue.textChannel?.send({ embeds: [embedInfo('📭 Canal de voz vacío, saliendo.')] });
    })
    .on('error', (error, queue) => {
      console.error('Error de DisTube:', error);
      queue?.textChannel?.send({ embeds: [embedError('❌ Ocurrió un error al reproducir. Intenta con otro link/nombre.')] });
    });

  console.log('🎵 Sistema de música (DisTube) inicializado.');
}

// ─── EMBEDS ────────────────────────────────────────────────────
function embedReproduciendo(song) {
  return new EmbedBuilder()
    .setColor(COLOR.VERDE)
    .setTitle('🎶 Reproduciendo ahora')
    .setDescription(`**[${song.name}](${song.url})**`)
    .addFields(
      { name: 'Duración', value: song.formattedDuration || 'En vivo', inline: true },
      { name: 'Pedido por', value: `${song.user}`, inline: true },
      { name: 'Fuente', value: song.source || 'desconocida', inline: true },
    )
    .setThumbnail(song.thumbnail || null);
}
function embedAgregado(song) {
  return new EmbedBuilder()
    .setColor(COLOR.AZUL)
    .setDescription(`➕ Añadido a la cola: **[${song.name}](${song.url})** (${song.formattedDuration || 'en vivo'})`);
}
function embedInfo(msg) {
  return new EmbedBuilder().setColor(COLOR.GRIS).setDescription(msg);
}
function embedError(msg) {
  return new EmbedBuilder().setColor(COLOR.ROJO).setDescription(msg);
}

// ─── HELPER: valida que el usuario esté en un canal de voz ────
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

// /play <busqueda> — Acepta link de YouTube, Spotify, SoundCloud o texto libre
async function cmdPlay(interaction) {
  const canalVoz = requiereCanalDeVoz(interaction);
  if (!canalVoz) return;

  const query = interaction.options.getString('busqueda');
  await interaction.deferReply();

  try {
    await distube.play(canalVoz, query, {
      textChannel: interaction.channel,
      member: interaction.member,
    });
    await interaction.editReply({ embeds: [embedInfo(`🔎 Buscando: **${query}**...`)] });
  } catch (err) {
    console.error('Error en /play:', err);
    await interaction.editReply({ embeds: [embedError('❌ No pude encontrar o reproducir eso. Verifica el link o intenta con otro nombre.')] });
  }
}

// /skip
async function cmdSkip(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  try {
    const siguiente = queue.songs[1];
    await queue.skip();
    await interaction.reply({ embeds: [embedInfo(siguiente ? `⏭️ Saltado. Ahora suena: **${siguiente.name}**` : '⏭️ Saltado.')] });
  } catch (err) {
    await interaction.reply({ embeds: [embedError('❌ No hay más canciones en la cola para saltar.')], ephemeral: true });
  }
}

// /stop
async function cmdStop(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  await queue.stop();
  await interaction.reply({ embeds: [embedInfo('⏹️ Música detenida y cola vaciada.')] });
}

// /pause
async function cmdPause(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  queue.pause();
  await interaction.reply({ embeds: [embedInfo('⏸️ Pausado.')] });
}

// /resume
async function cmdResume(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  queue.resume();
  await interaction.reply({ embeds: [embedInfo('▶️ Reanudado.')] });
}

// /queue — ver la cola actual
async function cmdQueue(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue || !queue.songs.length) {
    return interaction.reply({ embeds: [embedError('📭 La cola está vacía.')], ephemeral: true });
  }
  const lista = queue.songs
    .slice(0, 15)
    .map((s, i) => `${i === 0 ? '▶️' : `${i}.`} **${s.name}** — ${s.formattedDuration || 'en vivo'}`)
    .join('\n');
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.AZUL).setTitle('🎼 Cola de reproducción').setDescription(lista)],
  });
}

// /volumen <1-100>
async function cmdVolumen(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  const vol = interaction.options.getInteger('nivel');
  queue.setVolume(vol);
  await interaction.reply({ embeds: [embedInfo(`🔊 Volumen ajustado a ${vol}%.`)] });
}

// /leave — saca al bot del canal de voz
async function cmdLeave(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply({ embeds: [embedError('📭 No estoy en ningún canal de voz.')], ephemeral: true });
  await queue.stop();
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

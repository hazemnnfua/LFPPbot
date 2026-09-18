// ═══════════════════════════════════════════════════════════════
// musica.js — Sistema de música (YouTube, Spotify, SoundCloud, etc.)
// ═══════════════════════════════════════════════════════════════
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

// ─── Apunta ffmpeg-static al PATH para que DisTube lo encuentre ───
try {
  const ffmpegPath = require('ffmpeg-static');
  const ffmpegDir = path.dirname(ffmpegPath);
  process.env.PATH = ffmpegDir + path.delimiter + (process.env.PATH || '');
  console.log('🎬 ffmpeg encontrado en:', ffmpegPath);
} catch (e) {
  console.warn('⚠️ ffmpeg-static no encontrado:', e.message);
}

const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
const COLOR = { VERDE: 0x2ecc71, ROJO: 0xe74c3c, AZUL: 0x3498db, GRIS: 0x95a5a6 };

let distube = null;

function iniciarMusica(client) {
  distube = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    plugins: [
      new SoundCloudPlugin(),
      new YtDlpPlugin({
        update: false,
        ytdlpOptions: {
          addHeader: [
            'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept-Language:es-PE,es;q=0.9',
          ],
          ...(fs.existsSync(COOKIES_PATH) ? { cookies: COOKIES_PATH } : {}),
        },
      }),
    ],
  });

  distube
    .on('playSong', (queue, song) => {
      console.log('▶️ playSong:', song.name, song.url);
      queue.textChannel?.send({ embeds: [embedReproduciendo(song)] });
    })
    .on('addSong', (queue, song) => {
      console.log('➕ addSong:', song.name);
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
      // Log completo del error para diagnóstico
      console.error('❌ Error de DisTube (completo):', error);
      console.error('❌ Mensaje:', error.message);
      console.error('❌ Código:', error.errorCode || error.code || 'sin código');
      if (error.cause) console.error('❌ Causa:', error.cause);
      queue?.textChannel?.send({ embeds: [embedError(`❌ Error: ${error.message?.slice(0, 200) || 'desconocido'}`)] });
    });

  const tieneCookies = fs.existsSync(COOKIES_PATH);
  console.log(`🎵 Sistema de música (DisTube) inicializado. Cookies: ${tieneCookies ? '✅ encontradas' : '⚠️ NO encontradas'}`);
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
    console.log('🎵 Llamando distube.play con query:', query);
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

async function cmdStop(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  await queue.stop();
  await interaction.reply({ embeds: [embedInfo('⏹️ Música detenida y cola vaciada.')] });
}

async function cmdPause(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  queue.pause();
  await interaction.reply({ embeds: [embedInfo('⏸️ Pausado.')] });
}

async function cmdResume(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  queue.resume();
  await interaction.reply({ embeds: [embedInfo('▶️ Reanudado.')] });
}

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

async function cmdVolumen(interaction) {
  const queue = distube.getQueue(interaction.guildId);
  if (!queue) return interaction.reply({ embeds: [embedError('📭 No hay nada sonando.')], ephemeral: true });
  const vol = interaction.options.getInteger('nivel');
  queue.setVolume(vol);
  await interaction.reply({ embeds: [embedInfo(`🔊 Volumen ajustado a ${vol}%.`)] });
}

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

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const crypto = require('crypto');
require('dotenv').config();

const express = require('express');

const PREGUNTAS = require('./preguntas');
const postulacionesDB = require('./postulaciones');
const verificacionDB = require('./verificacion');
const robloxOAuth = require('./oauth');

const ROL_ARBITRO_ID = '1526591280749084742';
const ROL_VERIFICADO_ID = process.env.ROL_VERIFICADO_ID; // configurar en .env
const CANAL_REGISTROS_VERIFICACION_ID = '1549624039327141898';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message], // necesario para recibir DMs de forma fiable
});

// ═══════════════════════════════════════
// !reglas-general → Sección 1
// ═══════════════════════════════════════
function embedsGeneral() {
  const e1 = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('📜 REGLAMENTO GENERAL — LFPP')
    .setDescription('Reglamento oficial de Discord de la liga. Reemplaza cualquier versión anterior.')
    .addFields(
      { name: '1.1 — Respeto ante todo', value: 'No se toleran insultos hacia otros miembros.' },
      { name: '1.2 — Insultos post-partido', value: 'Prohibido insultar o burlarse de árbitros u otros equipos al finalizar un partido.\nPrimera vez: sanción al club.\nReincidencia: **expulsión del club de la liga**.' },
      { name: '1.3 — Temas sensibles', value: 'Evitar temas de política y religión en cualquier canal.' },
      { name: '1.4 — Spam', value: 'Prohibido el spam (redes sociales, servidores alternativos, mensajes repetidos).' },
      { name: '1.5 — Menciones al staff', value: 'No abusar de menciones a `@LFPP | ADMINS` o `@LFPP | CEO`. Cualquier gestión se hace por ticket.' },
      { name: '1.6 — Uso de canales', value: 'Usar cada canal según su función establecida.' },
      { name: '1.7 — Fotos de perfil', value: 'Prohibidas fotos de perfil o banners con contenido NSFW/Gore.' },
      { name: '1.8 — Distribución NSFW/Gore', value: 'Prohibida la distribución de contenido NSFW/Gore dentro del servidor o por MD entre usuarios.' },
      { name: '1.9 — ¿Problemas?', value: 'Ante cualquier problema, contactar a `@LFPP | ADMINS` o `@LFPP | CEO` por privado o ticket.' },
      { name: '1.10 — Mal uso de tickets', value: 'Prohibido el mal uso de tickets (abrir con actitud troll o por temas irrelevantes).' }
    );

  const e2 = new EmbedBuilder()
    .setColor(0x27ae60)
    .setTitle('📜 REGLAMENTO GENERAL — LFPP (cont.)')
    .addFields(
      { name: '1.11 — Multicuentas y evasión de sanciones', value: 'Un usuario baneado o sancionado que regrese con otra cuenta recibirá ban permanente en ambas cuentas, y su club recibirá sanción deportiva (ver sección de sanciones).' },
      { name: '1.12 — Apelaciones', value: 'Toda sanción puede apelarse una única vez mediante ticket dentro de las 48 horas siguientes. La decisión de apelación es inapelable.' },
      { name: '1.13 — Boost del servidor', value: 'Boostear el servidor **no exime** de sanciones por romper las reglas.' },
      { name: '1.14 — Cambios al reglamento', value: 'Este reglamento está sujeto a cambios; cualquier modificación se anunciará en `#📣-anuncios` con mención a `@everyone`.' }
    );

  return [e1, e2];
}

// ═══════════════════════════════════════
// !reglas-partido → Secciones 2, 3, 4, 5, 6, 9, 10
// ═══════════════════════════════════════
function embedsPartido() {
  const e1 = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('⚽ REGLAMENTO DE PARTIDO — LFPP (1/6)')
    .setDescription('**2.1 Formato del partido**\n\nN1. El máximo de jugadores en cancha por equipo es **7**. El mínimo para poder disputar el partido es **5**. Si un equipo no reúne el mínimo de 5 jugadores a la hora pactada, se aplica protocolo de W.O.\n\nDuración del partido: dos tiempos (definir minutos según formato del torneo/liga) con descanso intermedio.\n\nEn caso de empate en fases eliminatorias: tiempo extra y, de persistir el empate, definición por penales (5 por equipo, luego muerte súbita).')
    .addFields(
      { name: 'N2 / N23 — Pase al portero', value: 'Si un jugador realiza un pase intencionado hacia atrás al portero y este lo controla con las manos → **penal**.\nSi el balón llega al portero por un rechace, despeje o desvío no intencionado (propio o rival) → **saque de meta**, sin sanción.' },
      { name: 'N3 — Entrada con equipo completo', value: 'Si un jugador entra a la cancha con el equipo ya completo (7 en cancha): amonestación (amarilla). Si con su entrada interfiere en una jugada clara de gol: **tarjeta roja directa** + gol si el árbitro lo determina (regla de ventaja).' },
      { name: 'N4 — Jugadores en banca', value: 'Todo jugador suplente debe permanecer en la banca designada. Incumplirlo: tarjeta amarilla.' },
      { name: 'N5 — Insultos al árbitro', value: 'El árbitro puede amonestar o expulsar según la gravedad, a su criterio, dejando constancia por escrito del motivo.' },
      { name: 'N6 — Gol lag', value: 'Si por problemas de lag el balón entra a portería en una jugada anómala, se marca gol anulado y saque de meta para el equipo afectado. El árbitro decide con base en su visión directa o clip de evidencia; en caso de duda, se recurre a VAR.' }
    );

  const e2 = new EmbedBuilder()
    .setColor(0x2e86c1)
    .setTitle('⚽ REGLAMENTO DE PARTIDO — LFPP (2/6)')
    .addFields(
      { name: 'N7 — Uniforme', value: 'Todos los jugadores deben portar el uniforme/skin oficial del club. Incumplirlo puede derivar en detención del partido o amonestación.' },
      { name: 'N8 — Morphs', value: 'Se permite 1 morph por equipo como máximo. 2 morphs: amonestación a los jugadores involucrados. 3 o más: amonestación + posible sanción al club.' },
      { name: 'N9 — Abandono', value: 'Abandono sin avisar: el partido continúa normalmente. Abandono avisado: el juego se detiene y se otorgan 30 segundos para reanudar antes de continuar.' },
      { name: 'N10 — Saque inicial', value: 'En el saque inicial el balón debe pasarse (no puede dispararse directo a portería). Si no se cumple, se repite el saque; si vuelve a ocurrir, tarjeta amarilla al jugador que ejecuta el saque.' },
      { name: 'N11 — Bugs/glitches', value: 'Si un jugador se "buguea" (queda atascado por error del juego), se detiene el partido y se otorga balón libre al equipo afectado en el punto donde ocurrió el bug.' },
      { name: 'N12 — Cambios de jugador', value: 'Los cambios de jugador deben anunciarse al instante en el chat/voz, indicando claramente quién sale y quién entra.' }
    );

  const e3 = new EmbedBuilder()
    .setColor(0x2874a6)
    .setTitle('⚽ REGLAMENTO DE PARTIDO — LFPP (3/6)')
    .addFields(
      { name: 'N13 — Sin rol asignado', value: 'Participar sin rol asignado por la liga implica autowin (derrota automática) para el equipo infractor.' },
      { name: 'N19 — Interrupción de jugadas', value: 'Patear el balón durante la ejecución de un tiro libre, penal o córner del equipo rival: tarjeta amarilla por interrupción de jugada.' },
      { name: 'N20 — Suplente en jugada de gol', value: 'Un suplente que entra a la cancha durante una jugada clara de gol: tarjeta roja directa + posible sanción de liga de hasta 3 partidos.' },
      { name: 'N21 — Invasión de cancha', value: 'Si un espectador/aficionado invade la cancha: el árbitro detiene el juego, puede aplicar smite o ban al invasor, y se otorgan 2 tiros de esquina (botes) a favor del equipo afectado.' },
      { name: 'N22 — Invasión en penal', value: 'Invasión del área durante ejecución de un penal por más de 10 segundos: tarjeta amarilla a los infractores.' },
      { name: 'Accesorios prohibidos', value: 'Prohibido el uso de accesorios que cubran o dificulten la visibilidad de las piernas. El jugador debe cambiarlos/quitarlos antes del partido oficial; de lo contrario, tarjeta amarilla y posible sanción al club si el partido se disputó con la infracción.' }
    );

  const e4 = new EmbedBuilder()
    .setColor(0x1f618d)
    .setTitle('🟨🟥 FALTAS Y TARJETAS — LFPP (4/6)')
    .setDescription('**3.1 Criterio de tackle (fusión N14 + N24)**\n\nN24. Si un jugador realiza un tackle y alcanza a tocar el balón primero, no se sanciona como falta, ni como penal si ocurre dentro del área.\n\nN14. Si el tackle no toca el balón y sí al rival, se considera falta y puede sancionarse con tarjeta amarilla según la intensidad y riesgo de la jugada.')
    .addFields(
      { name: 'N18 — Acumulación de tackles', value: 'Se cuentan los tackles por jugador durante todo el partido: al segundo tackle que resulte en falta, advertencia verbal del árbitro; al tercer tackle-falta, tarjeta amarilla obligatoria (o roja si la jugada fue temeraria/violenta).' },
      { name: 'N16 — Falta en el área', value: 'Falta cometida dentro del área propia: **penal**.' },
      { name: 'N15 — Último defensor', value: 'Si un atacante va solo hacia portería (sin más defensores entre él y el arco) y el último defensor comete falta para evitarlo: **tarjeta roja directa**.' },
      { name: 'N17 — Rebote en pared', value: 'Si el balón rebota en una pared del mapa y el portero lo toma con las manos, no se considera ni indirecto ni penal.' },
      { name: '🎯 DOGSO', value: 'Se sanciona cuando: el atacante avanza hacia la portería con control del balón, está cerca del área o de la portería, y no hay defensores entre él y la portería (excepto el infractor).\n\nSiempre tarjeta roja + falta, sin importar amarillas previas. Puede sancionarse aunque el sistema marque "no foul". Dentro del área: penal + roja. Fuera del área: libre + roja.' },
      { name: '3.3 — Escala de tarjetas', value: '2 amarillas en el mismo partido = expulsión, sin reemplazo, respetando el mínimo de 5.\n3 amarillas acumuladas en partidos distintos de la misma fase/jornada = 1 partido de sanción automática.\nRoja directa = expulsión inmediata + mínimo 1 partido de sanción.\nEl jugador expulsado no puede ser sustituido; el equipo sigue con uno menos si no baja del mínimo de 5.' }
    );

  const e5 = new EmbedBuilder()
    .setColor(0x154360)
    .setTitle('📐🔍 OFFSIDE, VAR Y ADMINS — LFPP (5/6)')
    .addFields(
      { name: '4. Fuera de juego (Offside)', value: 'Un jugador está en fuera de juego si se encuentra 2 cuadros (studs/tiles) o más adelantado respecto al último defensor rival (sin contar al portero) al momento del pase.\nNo hay offside en saque de meta, banda, córner, o en campo propio.\nSanción: tiro libre indirecto en el punto del offside.\nNo hay offside pasivo: si interfiere en la jugada (bloquea visión, disputa balón, etc.), se sanciona igual.' },
      { name: '5. Sistema VAR', value: '5.1 Cada equipo dispone de 2 solicitudes de VAR por partido. Acierto: no se descuenta. Error: se pierde una solicitud.\n5.2 Solo para: goles, penales, tarjetas rojas y errores de identidad de jugador.\n5.3 Se basa en clips grabados o repetición del árbitro. Sin evidencia clara, se mantiene la decisión original.\n5.4 El árbitro principal tiene la decisión final; no apelable en el momento, solo por ticket post-partido con evidencia adicional.' },
      { name: '6.1-6.4 — Jerarquía y árbitro', value: 'Árbitro principal > Árbitro asistente/VAR > Admin de liga > Moderador de Discord.\nEl árbitro debe estar presente antes del inicio; si no hay árbitro 15 min después de la hora pactada, los capitanes acuerdan uno neutral o reagendan con aprobación de un Admin.\nDebe grabar el partido completo.\nNingún árbitro puede dirigir un partido de su propio club o uno con intereses declarados.' },
      { name: '6.5-6.8 — Potestades de admins', value: 'Revisar decisiones arbitrales solo ante evidencia clara de error grave o mala fe.\nAplicar sanciones disciplinarias fuera de cancha.\nSuspender temporalmente a un árbitro con parcialidad reiterada.\nLos admins no pueden dirigir partidos de su propio club salvo excepción del CEO.\nToda sanción se registra en el canal correspondiente. Tickets: respuesta en 24-48h, si no, escalar al CEO.' }
    );

  const e6 = new EmbedBuilder()
    .setColor(0xc0392b)
    .setTitle('⚖️🧩 SANCIONES Y PROTOCOLOS ESPECIALES — LFPP (6/6)')
    .setDescription(
      '**Tabla de sanciones**\n' +
      '• Amarilla (acumulación de 3): 1 partido de suspensión\n' +
      '• Roja directa (falta de juego): 1-2 partidos\n' +
      '• Roja por DOGSO: 2 partidos\n' +
      '• Interferencia en jugada de gol (N20): hasta 3 partidos\n' +
      '• Insultos al árbitro (leve): amonestación\n' +
      '• Insultos al árbitro (grave): expulsión + 1-3 partidos\n' +
      '• Insultos/burlas post-partido: sanción al club; reincidencia = expulsión del club\n' +
      '• Más de 2 morphs: amonestación + posible sanción al club\n' +
      '• Sin rol asignado: autowin en contra\n' +
      '• Falsificación de contratos/ofertas: nulidad + sanción al club\n' +
      '• Multicuenta: ban permanente + sanción al club\n' +
      '• No presentarse (W.O.): derrota 3-0 administrativa\n' +
      '• Fraude comprobado: pérdida del partido + posible expulsión del club'
    )
    .addFields(
      { name: '10.1 — Lag individual', value: 'Ver N6. Duda sobre gol por lag → se aplica VAR.' },
      { name: '10.2 — Caída general del servidor', value: 'Si afecta a ambos equipos, el partido se reanuda desde el marcador y minuto exacto, en nuevo servidor, dentro de [definir, ej. 24h].' },
      { name: '10.3 — Walkover (W.O.)', value: 'Tolerancia: 10-15 min. Sin mínimo de 5 jugadores → W.O. a favor del rival (ej. 3-0). Reincidencia: resta de puntos o expulsión.' },
      { name: '10.4 — Grabación obligatoria', value: 'El árbitro o un jugador designado por equipo debe grabar el partido completo. Conservar mínimo 72 horas.' },
      { name: '10.5 — Suplantación (smurfing)', value: 'Jugar con cuenta ajena sin autorización: autowin en contra + posible expulsión del jugador.' }
    )
    .setFooter({ text: 'Números entre corchetes deben ser fijados oficialmente por la liga. Última actualización: [fecha].' });

  return [e1, e2, e3, e4, e5, e6];
}

// ═══════════════════════════════════════
// !reglas-mercado → Sección 7
// ═══════════════════════════════════════
function embedsMercado() {
  const e1 = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('💰 REGLAMENTO DE MERCADO — LFPP (1/2)')
    .setDescription('Versión unificada — sustituye ambos reglamentos anteriores de mercado, que eran contradictorios entre sí.')
    .addFields(
      { name: '7.1 — Fichajes', value: 'Todo fichaje requiere el consentimiento del jugador y de ambos clubes (comprador y vendedor).\nLos fichajes solo pueden realizarse con el mercado abierto (ventanas definidas por la liga).\nUn jugador no puede pertenecer a dos clubes simultáneamente.\nLímite de fichajes por club por ventana de mercado: [definir número, ej. 5].' },
      { name: '7.2 — Contratos', value: 'Duración: entre 8 y 13 partidos oficiales (o 1-2 temporadas, según el formato vigente — fijar una sola unidad de medida y anunciarla).\nLos contratos pueden renovarse antes de finalizar su duración.\nRenovación: el club debe ofrecer como mínimo el 70% del valor de mercado actual del jugador.\nSi el contrato vence sin renovación, el jugador queda como agente libre.' },
      { name: '7.3 — Cláusulas de rescisión', value: 'Todo jugador debe tener una cláusula de rescisión establecida al firmar contrato (puede ser simbólica, pero debe existir un valor).\nSi un club paga la cláusula completa, el fichaje se activa de inmediato sin negociar con el club vendedor.\nSin cláusula pactada, el traspaso deberá negociarse directamente con el club propietario.' }
    );

  const e2 = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle('💰 REGLAMENTO DE MERCADO — LFPP (2/2)')
    .addFields(
      { name: '7.4 — Traspasos y préstamos', value: 'Todo traspaso requiere aprobación del club vendedor, el club comprador y el jugador.\nLos préstamos tienen una duración máxima de 1 temporada, con posibilidad de cláusula de no repesca u opción de compra.\nProhibido falsificar ofertas, contratos o capturas. Sanción: nulidad del fichaje + sanción disciplinaria al club.' },
      { name: '7.5 — Disputas', value: 'La administración de mercado tiene la decisión final e inapelable en cualquier disputa, salvo evidencia de fraude comprobado, que se escala al CEO.' }
    );

  return [e1, e2];
}

// ═══════════════════════════════════════
// !reglas-clubes → Sección 8
// ═══════════════════════════════════════
function embedsClubes() {
  const e1 = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('🏟️ REGLAMENTO DE CLUBES — LFPP')
    .addFields(
      { name: '8.1 — Plantilla', value: 'Mínimo 7 jugadores registrados por club, máximo [definir, ej. 20].' },
      { name: '8.2 — Fundación de club', value: 'Requiere nombre no duplicado, logo propio (no copiado de clubes reales u otros clubes de la liga sin modificación sustancial), y un representante verificado ante la administración.' },
      { name: '8.3 — Jerarquía obligatoria', value: 'Cada club debe tener un Presidente/Dueño y al menos un Capitán, interlocutores oficiales ante la liga.' },
      { name: '8.4 — Nombres y logos', value: 'Prohibido contenido ofensivo, discriminatorio o NSFW en nombres, logos o escudos.' },
      { name: '8.5 — Inactividad', value: 'Un club sin actividad durante [definir, ej. 3 jornadas consecutivas] puede ser descendido, suspendido o disuelto, con aviso previo.' },
      { name: '8.6 — Cambio de nombre/escudo', value: 'Debe solicitarse por ticket y ser aprobado por un admin; no se permite a mitad de temporada sin justificación válida.' },
      { name: '8.7 — Responsabilidad del club', value: 'El club es responsable disciplinariamente de las acciones de sus jugadores dentro y fuera de cancha, pudiendo recibir sanciones deportivas (resta de puntos, multas internas, descenso) independientemente de la sanción individual.' }
    );
  return [e1];
}

// ═══════════════════════════════════════
// UTILIDAD: espera entre mensajes
// ═══════════════════════════════════════
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════
// POSTULACIÓN A ÁRBITRO
// Flujo: /postular-arbitro (en el server) → el bot entrevista por DM,
// pregunta por pregunta → arma un embed y lo postea en el canal de admins
// con botones para Aceptar / Rechazar / Citar a entrevista.
// ═══════════════════════════════════════

function limpiarTextoPregunta(p) {
  // quita el emoji numerado del principio para usarlo como nombre de campo en el embed
  return p.replace(/^[0-9️⃣]+\s*/u, '');
}

async function manejarComandoPostular(interaction) {
  const userId = interaction.user.id;

  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId);
    if (member.roles.cache.has(ROL_ARBITRO_ID)) {
      return interaction.reply({
        content: '✅ Ya tenés el rol de árbitro, así que no podés volver a postular.',
        ephemeral: true,
      });
    }
  } catch (err) {
    console.error('No pude verificar el rol de árbitro del usuario antes de postular:', err);
    // si falla la verificación seguimos igual, no queremos bloquear postulaciones legítimas por un error de red
  }

  const restriccion = postulacionesDB.obtenerRestriccion(userId);
  if (restriccion?.tipo === 'aceptada') {
    return interaction.reply({
      content: '✅ Ya fuiste aceptado como árbitro anteriormente, así que no podés volver a postular.',
      ephemeral: true,
    });
  }
  if (restriccion?.tipo === 'cooldown') {
    const timestamp = Math.floor(restriccion.disponibleEn.getTime() / 1000);
    return interaction.reply({
      content: `⏳ Tu postulación anterior fue rechazada. Podés volver a postular <t:${timestamp}:R> (<t:${timestamp}:f>).`,
      ephemeral: true,
    });
  }

  if (postulacionesDB.tienePendiente(userId)) {
    return interaction.reply({
      content: '⏳ Ya tienes una postulación **pendiente** de revisión. Espera la respuesta de un admin antes de volver a postular.',
      ephemeral: true,
    });
  }

  let dmChannel;
  try {
    dmChannel = await interaction.user.createDM();
  } catch (err) {
    return interaction.reply({
      content: '❌ No pude enviarte un DM. Activa los mensajes directos para este servidor (Configuración de privacidad del servidor) e inténtalo de nuevo.',
      ephemeral: true,
    });
  }

  // Respondemos la interacción YA (Discord da solo 3 segundos) y recién después
  // seguimos con el envío del DM y la entrevista, que puede tardar minutos.
  await interaction.reply({ content: '📬 Te envié las preguntas por DM. Revisa tu privado para completar la postulación.', ephemeral: true });

  try {
    await dmChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle('📋 Postulación a Árbitro — LFPP')
          .setDescription(
            'Vas a responder algunas preguntas sobre la liga y tu disponibilidad. Respóndelas con honestidad y detalle — un admin las va a revisar.\n\n' +
            `Tienes **5 minutos por pregunta**. Son ${PREGUNTAS.length} preguntas en total. Responde como mensaje normal, una respuesta por pregunta.`
          ),
      ],
    });
  } catch (err) {
    return interaction.followUp({
      content: '❌ No pude enviarte el DM (puede que los tengas cerrados para este servidor). Actívalos e inténtalo de nuevo.',
      ephemeral: true,
    });
  }

  const respuestas = [];
  for (let i = 0; i < PREGUNTAS.length; i++) {
    try {
      await dmChannel.send({ content: `**Pregunta ${i + 1}/${PREGUNTAS.length}**\n${PREGUNTAS[i]}` });

      const collected = await dmChannel.awaitMessages({
        filter: (m) => m.author.id === userId,
        max: 1,
        time: 5 * 60 * 1000,
      });

      if (collected.size === 0) {
        await dmChannel.send('⏱️ Se acabó el tiempo para responder. Tu postulación fue cancelada — puedes volver a intentarlo con `/postular-arbitro` cuando quieras.');
        return;
      }

      respuestas.push({ pregunta: PREGUNTAS[i], respuesta: collected.first().content.slice(0, 1000) });
    } catch (err) {
      console.error('Error durante la entrevista de árbitro:', err);
      return;
    }
  }

  const id = crypto.randomUUID();
  const postulacion = {
    id,
    userId,
    usuarioTag: interaction.user.tag,
    respuestas,
    estado: 'pendiente',
    fecha: new Date().toISOString(),
  };
  postulacionesDB.setPostulacion(id, postulacion);

  await dmChannel.send('✅ ¡Listo! Tu postulación fue enviada a los admins de la LFPP. Te avisaremos por aquí en cuanto la revisen.');

  try {
    const canalAdmin = await client.channels.fetch(process.env.ADMIN_CHANNEL_ID);

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🧑\u200d⚖️ Nueva postulación a árbitro')
      .setDescription(`**Candidato:** ${interaction.user.tag} (<@${userId}>)`)
      .addFields(respuestas.map((r, i) => ({
        name: `${i + 1}. ${limpiarTextoPregunta(r.pregunta)}`.slice(0, 256),
        value: r.respuesta || '—',
      })))
      .setFooter({ text: `ID: ${id}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`arb_aceptar_${id}`).setLabel('Aceptar').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`arb_rechazar_${id}`).setLabel('Rechazar').setEmoji('❌').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`arb_entrevista_${id}`).setLabel('Citar a entrevista').setEmoji('🗣️').setStyle(ButtonStyle.Secondary)
    );

    await canalAdmin.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('No pude postear la postulación en el canal de admins. ¿ADMIN_CHANNEL_ID está bien configurado?', err);
  }
}

async function manejarBotonPostulacion(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '🚫 Solo los admins pueden gestionar postulaciones.', ephemeral: true });
  }

  const match = interaction.customId.match(/^arb_(aceptar|rechazar|entrevista)_(.+)$/);
  if (!match) return;
  const [, accion, id] = match;

  const postulacion = postulacionesDB.getPostulacion(id);
  if (!postulacion) {
    return interaction.reply({ content: 'No encontré esta postulación (puede que el archivo se haya reiniciado).', ephemeral: true });
  }

  if (postulacion.estado === 'aceptada' || postulacion.estado === 'rechazada') {
    return interaction.reply({ content: `Esta postulación ya fue marcada como **${postulacion.estado}**.`, ephemeral: true });
  }

  const estados = { aceptar: 'aceptada', rechazar: 'rechazada', entrevista: 'en entrevista' };
  const nuevoEstado = estados[accion];

  postulacion.estado = nuevoEstado;
  postulacion.revisadoPor = interaction.user.tag;
  postulacion.fechaRevision = new Date().toISOString();
  postulacionesDB.setPostulacion(id, postulacion);

  const mensajesDM = {
    aceptar: '🎉 ¡Felicidades! Tu postulación a árbitro de la LFPP fue **aceptada**. Un admin se pondrá en contacto contigo para los siguientes pasos.',
    rechazar: 'Gracias por postularte. Por ahora tu postulación a árbitro de la LFPP fue **rechazada**. Puedes volver a intentarlo más adelante.',
    entrevista: '🗣️ Tu postulación a árbitro de la LFPP pasó a la etapa de **entrevista**. Un admin te va a contactar para coordinarla.',
  };

  if (accion === 'aceptar') {
    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const member = await guild.members.fetch(postulacion.userId);
      await member.roles.add(ROL_ARBITRO_ID);
    } catch (err) {
      console.error(`No pude asignar el rol de árbitro a ${postulacion.usuarioTag} (${postulacion.userId}):`, err);
    }
  }

  try {
    const user = await client.users.fetch(postulacion.userId);
    await user.send(mensajesDM[accion]);
  } catch (err) {
    // El candidato puede tener los DMs cerrados — no bloqueamos el flujo por eso.
  }

  const colores = { aceptada: 0x2ecc71, rechazada: 0xe74c3c, 'en entrevista': 0xf39c12 };
  const embedOriginal = interaction.message.embeds[0];
  const nuevoEmbed = EmbedBuilder.from(embedOriginal)
    .setColor(colores[nuevoEstado])
    .setFooter({ text: `${nuevoEstado.toUpperCase()} por ${interaction.user.tag}` });

  // Aceptar/Rechazar son finales → deshabilitamos los botones.
  // "Citar a entrevista" deja los botones activos por si luego hay que aceptar/rechazar.
  const esFinal = accion === 'aceptar' || accion === 'rechazar';
  const filaOriginal = interaction.message.components[0];
  const nuevaFila = new ActionRowBuilder().addComponents(
    filaOriginal.components.map((c) => ButtonBuilder.from(c).setDisabled(esFinal))
  );

  await interaction.update({ embeds: [nuevoEmbed], components: [nuevaFila] });
}

// ═══════════════════════════════════════
// VERIFICACIÓN DE ROBLOX (OAuth2 — "Iniciar sesión con Roblox")
// Flujo: /verificar → el bot manda un botón-link a la página oficial de
// login de Roblox → el usuario inicia sesión ahí (nunca en nuestro server)
// → Roblox redirige a nuestro endpoint /auth/roblox/callback con un code
// → lo canjeamos por los datos del usuario y quedan vinculados al instante.
// ═══════════════════════════════════════

async function manejarComandoVerificar(interaction) {
  const discordId = interaction.user.id;

  const existente = verificacionDB.getVerificacionPorDiscordId(discordId);
  if (existente) {
    return interaction.reply({
      content: `✅ Ya tienes vinculada la cuenta de Roblox **${existente.robloxUsername}**. Si necesitas cambiarla, pide a un admin que use \`/verificar-reset\`.`,
      ephemeral: true,
    });
  }

  if (!process.env.ROBLOX_CLIENT_ID || !process.env.ROBLOX_REDIRECT_URI) {
    return interaction.reply({
      content: '❌ La verificación con Roblox todavía no está configurada en el bot (falta ROBLOX_CLIENT_ID/ROBLOX_REDIRECT_URI en el .env).',
      ephemeral: true,
    });
  }

  const link = robloxOAuth.crearLinkVerificacion(discordId);

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🔗 Verificación de cuenta — LFPP')
    .setDescription(
      'Presiona el botón de abajo para iniciar sesión con tu cuenta de **Roblox** (te lleva a la página oficial de Roblox, nunca vemos tu contraseña).\n\n' +
      'Una vez que confirmes, tu Discord queda vinculado al instante — sin códigos ni cambiar tu perfil.\n\n' +
      'El link expira en 10 minutos.'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Iniciar sesión con Roblox').setStyle(ButtonStyle.Link).setURL(link)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function manejarComandoVerificarReset(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '🚫 Solo los admins pueden reiniciar una verificación.', ephemeral: true });
  }

  const usuario = interaction.options.getUser('usuario');
  const existente = verificacionDB.getVerificacionPorDiscordId(usuario.id);
  if (!existente) {
    return interaction.reply({ content: `❌ <@${usuario.id}> no tiene ninguna cuenta de Roblox vinculada.`, ephemeral: true });
  }

  verificacionDB.eliminarVerificacion(usuario.id);
  await interaction.reply({ content: `✅ Vínculo de <@${usuario.id}> con **${existente.robloxUsername}** eliminado. Ya puede usar \`/verificar\` de nuevo.`, ephemeral: true });
}

// Llamado desde el servidor Express cuando Roblox redirige de vuelta con el code.
// Devuelve { ok, robloxUsername, discordId } o { ok:false, motivo }.
async function procesarCallbackRoblox(code, state) {
  console.log('[verificacion] Callback recibido, resolviendo state...');
  const pendiente = robloxOAuth.resolverState(state);
  if (!pendiente) return { ok: false, motivo: 'state_invalido' };
  const { discordId } = pendiente;
  console.log('[verificacion] State válido para discordId:', discordId);

  const tokenData = await robloxOAuth.intercambiarCodigo(code);
  console.log('[verificacion] Token obtenido, pidiendo userinfo...');
  const userinfo = await robloxOAuth.obtenerUserinfo(tokenData.access_token);
  const robloxId = userinfo.sub;
  const robloxUsername = userinfo.preferred_username || userinfo.name;
  console.log('[verificacion] Userinfo OK:', robloxId, robloxUsername);

  const ocupado = verificacionDB.getVerificacionPorRobloxId(robloxId);
  if (ocupado && ocupado[0] !== discordId) {
    return { ok: false, motivo: 'roblox_ya_vinculado', discordIdOcupante: ocupado[0] };
  }

  verificacionDB.guardarVerificacion(discordId, {
    robloxId,
    robloxUsername,
    fechaVerificacion: new Date().toISOString(),
  });
  console.log('[verificacion] Guardado en verificaciones.json');

  // Nickname + rol en el server
  try {
    console.log('[verificacion] Buscando guild y member para nickname/rol...');
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(discordId);

    const nombreBase = member.displayName || member.user.username;
    const sufijo = `(${robloxUsername})`;
    // Discord limita los nicknames a 32 caracteres; recortamos el nombre base si hace falta
    const espacioDisponible = 32 - sufijo.length;
    const nombreRecortado = nombreBase.slice(0, Math.max(espacioDisponible, 0));
    const nuevoNickname = `${nombreRecortado}${sufijo}`.slice(0, 32);

    await member.setNickname(nuevoNickname).catch((e) => console.error('[verificacion] setNickname falló:', e.message));
    if (ROL_VERIFICADO_ID) await member.roles.add(ROL_VERIFICADO_ID).catch((e) => console.error('[verificacion] roles.add falló:', e.message));
    console.log('[verificacion] Nickname/rol aplicados');
  } catch (err) {
    console.error('No pude poner nickname/rol de verificado:', err);
  }

  try {
    console.log('[verificacion] Enviando DM de confirmación...');
    const user = await client.users.fetch(discordId);
    await user.send(`✅ ¡Listo! Tu Discord quedó vinculado a tu cuenta de Roblox **${robloxUsername}**.`);
  } catch (err) {
    // DMs cerrados, no bloqueante
    console.error('[verificacion] No se pudo mandar el DM (probablemente cerrados):', err.message);
  }

  try {
    if (process.env.ADMIN_CHANNEL_ID) {
      const canalAdmin = await client.channels.fetch(process.env.ADMIN_CHANNEL_ID);
      await canalAdmin.send(`🔗 <@${discordId}> se verificó como **${robloxUsername}** (ID: ${robloxId}).`);
    }
  } catch (err) {
    console.error('[verificacion] Error avisando en ADMIN_CHANNEL_ID:', err.message);
  }

  try {
    console.log('[verificacion] Publicando en canal de registros...');
    const canalRegistros = await client.channels.fetch(CANAL_REGISTROS_VERIFICACION_ID);
    const embedRegistro = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('✅ Nueva verificación')
      .addFields(
        { name: 'Discord', value: `<@${discordId}>`, inline: true },
        { name: 'Roblox', value: `${robloxUsername} (ID: ${robloxId})`, inline: true }
      )
      .setTimestamp();
    await canalRegistros.send({ embeds: [embedRegistro] });
    console.log('[verificacion] Listo, todo procesado.');
  } catch (err) {
    console.error('No pude publicar en el canal de registros de verificación:', err.message);
  }

  return { ok: true, robloxUsername, discordId };
}

// ═══════════════════════════════════════
// SERVIDOR WEB (recibe el redirect de Roblox tras el login OAuth)
// ═══════════════════════════════════════
function iniciarServidorOAuth() {
  const app = express();

  app.get('/auth/roblox/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).send('<h1>❌ Autorización cancelada</h1><p>Puedes cerrar esta pestaña y volver a intentar con /verificar.</p>');
    }
    if (!code || !state) {
      return res.status(400).send('<h1>❌ Falta información en la redirección.</h1>');
    }

    try {
      const resultado = await procesarCallbackRoblox(String(code), String(state));
      if (!resultado.ok) {
        const mensajes = {
          state_invalido: 'El link expiró o ya fue usado. Vuelve a Discord y usa /verificar de nuevo.',
          roblox_ya_vinculado: 'Esa cuenta de Roblox ya está vinculada a otro usuario de Discord.',
        };
        return res.status(400).send(`<h1>❌ No se pudo verificar</h1><p>${mensajes[resultado.motivo] || 'Error desconocido.'}</p>`);
      }
      return res.send(`<h1>✅ ¡Verificado!</h1><p>Tu Discord quedó vinculado a <b>${resultado.robloxUsername}</b>. Ya puedes cerrar esta pestaña y volver a Discord.</p>`);
    } catch (err) {
      console.error('Error procesando callback de Roblox OAuth:', err);
      return res.status(500).send('<h1>❌ Error interno</h1><p>Intenta de nuevo desde /verificar en Discord.</p>');
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Servidor OAuth escuchando en el puerto ${port}`));
}

async function manejarComandoQuienEs(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '🚫 Solo los admins pueden usar este comando.', ephemeral: true });
  }

  const usuario = interaction.options.getUser('usuario');
  const info = verificacionDB.getVerificacionPorDiscordId(usuario.id);

  if (!info) {
    return interaction.reply({ content: `❌ <@${usuario.id}> no tiene ninguna cuenta de Roblox vinculada.`, ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🔗 Vínculo de verificación')
    .addFields(
      { name: 'Discord', value: `<@${usuario.id}> (${usuario.tag})` },
      { name: 'Roblox', value: `${info.robloxUsername} (ID: ${info.robloxId})` },
      { name: 'Verificado el', value: new Date(info.fechaVerificacion).toLocaleString('es-PE') }
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ═══════════════════════════════════════
// COMANDOS (cada embed se envía en su propio mensaje)
// ═══════════════════════════════════════
client.once('clientReady', () => console.log(`Bot conectado como ${client.user.tag}`));

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'postular-arbitro') {
      await manejarComandoPostular(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'verificar') {
      await manejarComandoVerificar(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'verificar-reset') {
      await manejarComandoVerificarReset(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'quien-es') {
      await manejarComandoQuienEs(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith('arb_')) {
      await manejarBotonPostulacion(interaction);
    }
  } catch (err) {
    console.error('Error manejando interacción:', err);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return; // ignora DMs (ej. respuestas de la entrevista de árbitro)
  if (!message.member.permissions.has('Administrator')) return;

  const cmds = {
    '!reglas-general': embedsGeneral,
    '!reglas-partido': embedsPartido,
    '!reglas-mercado': embedsMercado,
    '!reglas-clubes': embedsClubes,
  };

  if (cmds[message.content]) {
    const embeds = cmds[message.content]();
    for (const embed of embeds) {
      await message.channel.send({ embeds: [embed] });
      await sleep(500); // evita rate limit de Discord
    }
  }
});

iniciarServidorOAuth();
client.login(process.env.TOKEN);
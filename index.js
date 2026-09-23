const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ActivityType,
  ChannelType,
} = require('discord.js');
const crypto = require('crypto');
require('dotenv').config();

const express = require('express');

const PREGUNTAS = require('./preguntas');
const postulacionesDB = require('./postulaciones');
const verificacionDB = require('./verificacion');
const robloxOAuth = require('./oauth');
const mercadoCmds = require('./mercado-comandos');
const musica = require('./musica');
const { iniciarModeracion, manejarComandoPrefijo: moderacionPrefijo } = require('./moderacion');
const utilidades = require('./utilidades');
const panel = require('./panel');

const ROL_ARBITRO_ID = '1526591280749084742';
const ROL_VERIFICADO_ID = process.env.ROL_VERIFICADO_ID; // configurar en .env
const CANAL_REGISTROS_VERIFICACION_ID = '1549624039327141898';

// ─── ID del dueño del bot — puede usar comandos con prefijo § en cualquier servidor ───
const OWNER_ID = '720788058684784691';

// ─── IDs con reacciones especiales para el comando §protocolo (solo humor, no destructivo) ───
const PROTOCOLO_USER_1 = '1094422375837212814'; // recibe Eh? -> saya -> andate alv + kick puntual
const PROTOCOLO_USER_2 = '1523052015838560498'; // dueño del server, recibe "los compartidos jaja", nunca se kickea

// ─── Estado del "protocolo" (modo pánico visual, no destructivo) por servidor ───
// Guarda el nickname original del bot para poder restaurarlo con §desactivar
const protocoloActivo = new Map(); // guildId -> { nicknameOriginal }

// ─── Cooldown por usuario para el efecto "exterminando" mientras el protocolo
//     está activo, así no se dispara en cada mensaje seguido ───
const protocoloUltimoTrigger = new Map(); // `${guildId}:${userId}` -> timestamp

// ─── Cooldown global: no se puede reactivar §protocolo dos veces seguidas
//     en menos de este tiempo, para que no pierda gracia por spam ───
const PROTOCOLO_COOLDOWN_MS = 2 * 60 * 1000;
const protocoloUltimaActivacion = new Map(); // guildId -> timestamp

// ─── Nombre del canal de voz "búnker" al que se mueve a quien activa el
//     protocolo si está conectado a voz (búsqueda por nombre, no ID fijo) ───
const PROTOCOLO_CANAL_BUNKER_NOMBRE = 'búnker';

// ─── Nombre del rol temporal que reciben quienes "caen" durante el protocolo ───
const PROTOCOLO_ROL_ALERTA_NOMBRE = '🚨 En Alerta';

// ─── ícono del servidor durante el protocolo (reemplazable por uno propio) ───
const PROTOCOLO_ICON_URL = null; // ej: 'https://tu-imagen.com/icono-alerta.png' — si es null, no se cambia

// ─── ID opcional de un "objetivo especial": si habla durante el protocolo,
//     recibe un mini-evento único en vez de la secuencia normal (dejar '' si no aplica) ───
const PROTOCOLO_OBJETIVO_ESPECIAL_ID = '';

// ─── Auto-desactivación si nadie usa §desactivar en este tiempo ───
const PROTOCOLO_AUTO_DESACTIVAR_MS = 15 * 60 * 1000;

// ─── Frases de cierre random para el informe final de §desactivar ───
const PROTOCOLO_LINEAS_CIERRE = [
  '* El PROTOCOLO se detiene.\n> Todos vuelven a sus asuntos... por ahora.',
  '* La alarma se apaga.\n> Pero algo quedó marcado.',
  '* Silencio. El sistema descansa.\n> Hasta la próxima vez.',
  '* El PROTOCOLO se repliega a las sombras.\n> Volverá.',
];

// ─── Nombres de canal falsos para el efecto "BORRANDO..." (no borra nada real) ───
const PROTOCOLO_CANALES_FALSOS = ['#general', '#anuncios', '#mercado', '#reglas', '#chat-general', '#bienvenida'];

// ─── Nivel de alerta escalonado por servidor (sube con cada activación del mismo
//     día, se resetea al día siguiente) ───
const protocoloNivelPorGuild = new Map(); // guildId -> { fecha, nivel }

function calcularNivelProtocolo(guildId) {
  const hoy = new Date().toISOString().slice(0, 10);
  const registro = protocoloNivelPorGuild.get(guildId);
  const nivel = registro && registro.fecha === hoy ? registro.nivel + 1 : 1;
  protocoloNivelPorGuild.set(guildId, { fecha: hoy, nivel });
  return Math.min(nivel, 5); // tope en 5 para que no se vuelva eterno
}

// ─── Probabilidad de que alguien "sobreviva" al efecto pasivo (vibra Undertale) ───
const PROTOCOLO_SOBREVIVIENTE_CHANCE = 0.15;
const PROTOCOLO_LINEAS_SOBREVIVIENTE = [
  '* Sientes que todavía te queda DETERMINACIÓN.\n> Fuiste PERDONADO.',
  '* Por algún motivo, el protocolo decide no continuar.\n> ES SUFICIENTE.',
  '* En el fondo, el sistema no quería hacerlo.\n> Elegiste MISERICORDIA.',
  '* Algo en tu interior brilla débilmente.\n> No fuiste ELIMINADO.',
];

// ─── GIF dramático para el embed de activación de §protocolo (reemplazable) ───
const PROTOCOLO_GIF_URL = 'https://media.tenor.com/2roX3-D1QEwAAAAC/alarm-siren.gif';

// ─── Frases de apertura dramáticas para la secuencia de activación de §protocolo ───
const PROTOCOLO_FRASES_DRAMATICAS = [
  'Se ha detectado una anomalía de nivel crítico.',
  'Los sistemas de contención están al límite.',
  'Esto no es un simulacro.',
  'Todas las unidades, prepárense.',
  'La situación ha escalado más allá de lo previsto.',
  'El punto de no retorno ha sido superado.',
  'Se activa el nivel máximo de alerta.',
  'Nadie sale, nadie entra.',
];

// ─── Respuestas random (tono súper formal/burocrático, humor de meme) para
//     cualquiera que use §protocolo sin ser owner ni tener reacción propia ───
const RESPUESTAS_PROTOCOLO = [
  'Por disposición del Artículo 7 del Reglamento Interno, su solicitud ha sido denegada.',
  'Acceso restringido. Favor dirigirse a Mesa de Partes para tramitar su reclamo.',
  'Su nivel de autorización es insuficiente para ejecutar este procedimiento.',
  'Solicitud recibida, evaluada y rechazada en un lapso de 0.03 segundos.',
  'El comité directivo no reconoce su jurisdicción sobre este protocolo.',
  'Trámite observado. Vuelva a presentarse con la documentación correspondiente.',
  'Su usuario ha sido registrado en el libro de reclamaciones por intento no autorizado.',
  'Conforme al inciso 3.2, queda usted formalmente sin permisos para continuar.',
  'Este canal no es competente para atender su requerimiento.',
  'Se le informa que su gestión ha sido archivada por falta de mérito.',
  'La presente solicitud excede sus atribuciones contractuales.',
  'Notificación oficial: usted no figura en la nómina de personal autorizado.',
  'Por unanimidad, la mesa directiva rechaza su moción.',
  'Este proceso requiere firma y sello, de los cuales usted carece.',
  'Su ticket ha sido escalado y posteriormente cerrado sin resolución.',
  'Queda usted notificado de que no cuenta con las credenciales requeridas.',
  'El sistema ha determinado, con alta confianza, que usted no es el indicado.',
  'Procedimiento denegado por resolución administrativa N.° 0001.',
  'Se solicita a usted abstenerse de repetir este intento.',
  'Su perfil no cumple los requisitos mínimos establecidos en las bases.',
  'La auditoría interna no valida su intervención en este protocolo.',
  'Trámite suspendido indefinidamente por causas ajenas a su voluntad.',
  'Usted ha sido clasificado como "personal no esencial" para este proceso.',
  'Se le comunica que su solicitud fue derivada al área de "Nunca".',
  'Este protocolo se encuentra bajo reserva absoluta. Retírese, por favor.',
  'Resolución final: no. Sin apelación posible.',
  'Su acceso ha sido evaluado por un comité de expertos y descartado.',
  'Conforme al debido proceso, se le informa que el debido proceso no aplica aquí.',
  'La presente gestión ha sido calificada como "fuera de competencia".',
  'Se procede a registrar su intento en el acta de incidentes del día.',
  'El área correspondiente informa que usted no tiene área correspondiente.',
  'Su solicitud ha sido leída, comprendida y respetuosamente ignorada.',
  'Queda usted a la espera de una respuesta que no llegará.',
  'Por motivos de protocolo, el protocolo le es negado.',
  'Se deja constancia de que este mensaje es oficial, formal e inapelable.',
  'El presente trámite ha sido clasificado como "alto riesgo, cero permiso".',
  'La comisión evaluadora concluye: rotundamente no.',
  'Se le recuerda que la formalidad no sustituye la autorización.',
  'Este canal certifica que usted, oficialmente, no puede.',
  'Solicitud rechazada por el comité de asuntos que no le incumben.',
  'Se notifica el cierre definitivo de su intento, sin derecho a reapertura.',
  'La entidad correspondiente no reconoce su firma digital.',
  'Trámite denegado por decisión soberana e inapelable del sistema.',
  'Se le informa que su nivel de acceso corresponde a "espectador".',
  'Por disposición superior, su participación queda formalmente descartada.',
  'El expediente ha sido cerrado antes de ser abierto.',
  'Se certifica que usted no cumple ni un solo requisito.',
  'Resolución administrativa: su intento queda sin efecto legal alguno.',
  'La mesa de partes informa que no existe mesa de partes.',
  'Trámite concluido: motivo, usted.',
];

// ─── Servidor al que quedan restringidos árbitros, verificación, admin,
//     presidente, jugador y consultas del mercado (deploy-commands.js
//     ya los registra solo ahí; esto es una red de seguridad extra) ───
const LFPP_GUILD_ID = '1524182983173603439';
const COMANDOS_RESTRINGIDOS = new Set([
  // árbitros
  'postular-arbitro',
  // verificación
  'verificar', 'verificar-reset', 'quien-es',
  // admin / presidente / jugador / consultas — mercado
  'mercado-abrir', 'mercado-cerrar', 'registrar-club', 'asignar-presidente',
  'registrar-jugador', 'actualizar-valor', 'add-presupuesto', 'bono-victoria',
  'sancionar-jugador', 'levantar-sancion', 'rescindir-forzar',
  'ofrecer', 'prestar', 'pagar-clausula',
  'mis-ofertas', 'aceptar-oferta', 'rechazar-oferta', 'rescindir', 'mi-contrato',
  'plantilla', 'agentes-libres', 'valor-jugador', 'presupuesto', 'mercado-estado',
]);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration, // eventos de ban/unban manual (logs de moderación)
    GatewayIntentBits.GuildMembers, // ← PRIVILEGIADO: actívalo en el Portal de Desarrolladores.
                                    //    Necesario para bienvenida, despedida y autorol.
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
// ═══════════════════════════════════════

function limpiarTextoPregunta(p) {
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
    // DMs cerrados
  }

  const colores = { aceptada: 0x2ecc71, rechazada: 0xe74c3c, 'en entrevista': 0xf39c12 };
  const embedOriginal = interaction.message.embeds[0];
  const nuevoEmbed = EmbedBuilder.from(embedOriginal)
    .setColor(colores[nuevoEstado])
    .setFooter({ text: `${nuevoEstado.toUpperCase()} por ${interaction.user.tag}` });

  const esFinal = accion === 'aceptar' || accion === 'rechazar';
  const filaOriginal = interaction.message.components[0];
  const nuevaFila = new ActionRowBuilder().addComponents(
    filaOriginal.components.map((c) => ButtonBuilder.from(c).setDisabled(esFinal))
  );

  await interaction.update({ embeds: [nuevoEmbed], components: [nuevaFila] });
}

// ═══════════════════════════════════════
// VERIFICACIÓN DE ROBLOX
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

  try {
    console.log('[verificacion] Buscando guild y member para nickname/rol...');
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(discordId);

    const nombreBase = member.displayName || member.user.username;
    const sufijo = `(${robloxUsername})`;
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
    console.error('[verificacion] No se pudo mandar el DM (probablemente cerrados):', err.message);
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
// SERVIDOR WEB (OAuth)
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
// COMANDOS DE OWNER CON PREFIJO §
// Solo funcionan si el mensaje lo envía el OWNER_ID
// Uso: §play <busqueda>, §skip, §stop, §pause, §resume, §queue, §leave
//      §volumen <1-100>
//      §mercado-abrir, §mercado-cerrar, §registrar-club <nombre>
//      §reglas-general, §reglas-partido, §reglas-mercado, §reglas-clubes
// ═══════════════════════════════════════
// ─── Comandos de música con prefijo §: cualquiera puede usarlos.
//     El resto (reglas, mercado) sigue siendo solo para el OWNER_ID. ───
const MUSICA_COMANDOS_PREFIJO = new Set(['play', 'skip', 'stop', 'pause', 'resume', 'queue', 'leave', 'volumen']);

// Comandos que quedan reservados exclusivamente al dueño del bot
const SOLO_OWNER_PREFIJO = new Set([
  'reglas-general', 'reglas-partido', 'reglas-mercado', 'reglas-clubes',
  'mercado-abrir', 'mercado-cerrar', 'mercado-estado',
]);

// ─── Restaura todo lo que §protocolo cambió y manda el informe final. Se usa
//     tanto desde §desactivar como desde el auto-apagado por tiempo. ───
async function desactivarProtocolo(guild, canalAviso) {
  const estado = protocoloActivo.get(guild.id);
  if (!estado) return false;

  if (estado.autoTimeout) clearTimeout(estado.autoTimeout);
  if (estado.tickerInterval) clearInterval(estado.tickerInterval);

  try {
    const member = await guild.members.fetchMe();
    await member.setNickname(estado.nicknameOriginal || null);
  } catch (err) {
    console.error('[protocolo] No pude restaurar el nickname del bot:', err.message);
  }

  if (estado.activadorId) {
    try {
      const activador = await guild.members.fetch(estado.activadorId);
      if (activador.moderatable) await activador.setNickname(estado.activadorNicknameOriginal || null);
    } catch (err) {
      console.error('[protocolo] No pude restaurar el nickname del activador:', err.message);
    }
  }

  if (estado.canalId) {
    try {
      const canal = await guild.channels.fetch(estado.canalId);
      if (canal) {
        await canal.setTopic(estado.topicOriginal);
        await canal.setRateLimitPerUser(estado.slowmodeOriginal || 0);
        if (estado.nombreCanalOriginal) await canal.setName(estado.nombreCanalOriginal);
      }
    } catch (err) {
      console.error('[protocolo] No pude restaurar topic/slowmode/nombre:', err.message);
    }
  }

  if (estado.iconoOriginal !== undefined) {
    try {
      await guild.setIcon(estado.iconoOriginal);
    } catch (err) {
      console.error('[protocolo] No pude restaurar el ícono del servidor:', err.message);
    }
  }

  // ─── Restaura nicknames de quienes recibieron el efecto pasivo ───
  if (estado.nicksAfectados) {
    for (const [userId, nickOriginal] of estado.nicksAfectados.entries()) {
      try {
        const m = await guild.members.fetch(userId);
        if (m.moderatable) await m.setNickname(nickOriginal || null);
      } catch (err) {
        // el usuario puede haberse ido, no pasa nada
      }
    }
  }

  // ─── Quita el rol "En Alerta" a todos los que lo tengan ───
  if (estado.rolAlertaId) {
    try {
      const rol = await guild.roles.fetch(estado.rolAlertaId);
      if (rol) {
        for (const m of rol.members.values()) {
          await m.roles.remove(rol).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[protocolo] No pude limpiar el rol de alerta:', err.message);
    }
  }

  // ─── Borra el canal búnker solo si el bot lo creó en esta sesión ───
  if (estado.bunkerCreadoId) {
    try {
      const canalBunker = await guild.channels.fetch(estado.bunkerCreadoId);
      if (canalBunker) await canalBunker.delete('Protocolo desactivado: limpiando búnker temporal');
    } catch (err) {
      console.error('[protocolo] No pude borrar el búnker temporal:', err.message);
    }
  }

  if (canalAviso && estado.mensajeAlertaId) {
    try {
      const mensajeAlerta = await canalAviso.messages.fetch(estado.mensajeAlertaId);
      await mensajeAlerta.unpin('§desactivar');
    } catch (err) {
      // ya no existe o no se pudo despinear, no pasa nada
    }
  }

  client.user.setPresence({ status: 'online', activities: [] });
  protocoloActivo.delete(guild.id);

  if (canalAviso) {
    const cierre = PROTOCOLO_LINEAS_CIERRE[Math.floor(Math.random() * PROTOCOLO_LINEAS_CIERRE.length)];
    const reporte = `📄 **INFORME FINAL — NIVEL ${estado.nivel || 1}**\n💀 Objetivos neutralizados: **${estado.exterminados || 0}**\n🌟 Sobrevivientes: **${estado.sobrevivientes || 0}**\n\n${cierre}`;
    await canalAviso.send('✅ Protocolo desactivado. Todo vuelve a la normalidad.').catch(() => {});
    await canalAviso.send(reporte).catch(() => {});
  }

  return true;
}

async function manejarComandoOwner(message) {
  const contenido = message.content.slice(1).trim(); // quita el §
  const [cmd, ...args] = contenido.split(' ');
  const nombre = (cmd || '').toLowerCase();
  const esMusica = MUSICA_COMANDOS_PREFIJO.has(nombre);

  // ─── §protocolo: solo vos (OWNER_ID) lo activa de verdad.
  //     Si lo escribe alguna otra persona, responde según quién sea
  //     (personalidad/humor) en vez de ejecutar nada. ───
  if (nombre === 'protocolo' && message.author.id !== OWNER_ID) {
    if (message.author.id === PROTOCOLO_USER_1) {
      await message.channel.send('Eh?');
      await sleep(2000);
      await message.channel.send('que haces aca saya');
      await sleep(1000);
      await message.channel.send('andate alv');
      try {
        const member = await message.guild.members.fetch(PROTOCOLO_USER_1);
        if (member.kickable) {
          await member.kick(`${message.author.tag}: uso no autorizado de §protocolo`);
        }
      } catch (err) {
        console.error('[protocolo] No pude kickear a PROTOCOLO_USER_1:', err.message);
      }
      return;
    }
    if (message.author.id === PROTOCOLO_USER_2) {
      await message.channel.send('los compartidos jaja');
      return;
    }

    // ─── Cualquier otro: si está en un canal de voz, el bot se une y reproduce
    //     un video de "advertencia" y, pasados 30s, aplica la misma sanción
    //     reversible (mute) que el resto — nunca un ban automático. Si no
    //     está en voz, sigue el flujo normal (respuesta random + mute). ───
    if (message.member?.voice?.channel) {
      const fakeInteraccionMusica = {
        guildId: message.guild.id,
        guild: message.guild,
        member: message.member,
        channel: message.channel,
        user: message.author,
        reply: () => {},
        editReply: () => {},
        followUp: () => {},
        deferReply: async () => {},
        options: { getString: () => 'https://youtu.be/c1WQIcEIiSc' },
      };
      await message.channel.send(`🎥 **PROTOCOLO — REPRODUCIENDO ADVERTENCIA PARA ${message.author}...**`);
      try {
        await musica.cmdPlay(fakeInteraccionMusica);
      } catch (err) {
        console.error('[protocolo] No pude reproducir el video de advertencia:', err.message);
      }
      (async () => {
        await sleep(30_000);
        try {
          await musica.cmdLeave(fakeInteraccionMusica);
        } catch (err) {
          // no pasa nada si ya no hay nada reproduciéndose
        }
        try {
          const miembro = await message.guild.members.fetch(message.author.id);
          if (miembro.bannable) {
            await miembro.ban({ reason: '§protocolo: uso no autorizado (advertencia ignorada)' });
            await message.channel.send(`🔨 **${message.author.tag}** fue baneado del servidor.`);
          } else {
            await message.channel.send(`⚠️ No pude banear a ${message.author} (el bot no tiene permisos o el usuario tiene un rol superior).`);
          }
        } catch (err) {
          console.error('[protocolo] No pude banear al usuario:', err.message);
        }
      })();
      return;
    }

    // ─── No está en voz: respuesta random (súper formal/burocrática) +
    //     mute de 10 segundos como "sanción" por acceso no autorizado ───
    const respuesta = RESPUESTAS_PROTOCOLO[Math.floor(Math.random() * RESPUESTAS_PROTOCOLO.length)];
    await message.channel.send(`🚫 **PROTOCOLO — ACCESO DENEGADO**\n${respuesta}`);
    try {
      if (message.member?.moderatable) {
        await message.member.timeout(10_000, '§protocolo: uso no autorizado');
      }
    } catch (err) {
      console.error('[protocolo] No pude mutear (timeout) al usuario:', err.message);
    }
    return;
  }

  // Reglas y mercado siguen restringidos al dueño del bot.
  // La moderación se filtra dentro de moderacion.js (dueño o admin del servidor).
  if (SOLO_OWNER_PREFIJO.has(nombre) && message.author.id !== OWNER_ID) return;
  if (!esMusica && !SOLO_OWNER_PREFIJO.has(nombre) && !message.guild) return;

  const arg = args.join(' ');

  // Simula un objeto interaction mínimo para reutilizar las funciones existentes
  const fakeInteraction = {
    guildId: message.guild.id,
    guild: message.guild,
    member: message.member,
    channel: message.channel,
    user: message.author,
    reply: (opts) => message.reply(typeof opts === 'string' ? opts : opts.content || { embeds: opts.embeds }),
    editReply: (opts) => message.reply(typeof opts === 'string' ? opts : opts.content || { embeds: opts.embeds }),
    followUp: (opts) => message.reply(typeof opts === 'string' ? opts : opts.content || { embeds: opts.embeds }),
    deferReply: async () => {},
    options: {
      getString: (name) => {
        if (name === 'busqueda') return arg || null;
        if (name === 'nombre') return arg || null;
        if (name === 'club') return arg || null;
        return arg || null;
      },
      getInteger: (name) => {
        if (name === 'nivel') return parseInt(arg) || null;
        if (name === 'monto') return parseInt(arg) || null;
        return parseInt(arg) || null;
      },
      getUser: () => null,
    },
  };

  switch (cmd.toLowerCase()) {
    // ─── MÚSICA ───────────────────────────────────────────────
    case 'play':
      if (!arg) return message.reply('❌ Uso: `§play <nombre o link>`');
      await musica.cmdPlay(fakeInteraction);
      break;
    case 'skip':
      await musica.cmdSkip(fakeInteraction);
      break;
    case 'stop':
      await musica.cmdStop(fakeInteraction);
      break;
    case 'pause':
      await musica.cmdPause(fakeInteraction);
      break;
    case 'resume':
      await musica.cmdResume(fakeInteraction);
      break;
    case 'queue':
      await musica.cmdQueue(fakeInteraction);
      break;
    case 'leave':
      await musica.cmdLeave(fakeInteraction);
      break;
    case 'volumen':
      if (!arg || isNaN(parseInt(arg))) return message.reply('❌ Uso: `§volumen <1-100>`');
      await musica.cmdVolumen(fakeInteraction);
      break;

    // ─── REGLAS ───────────────────────────────────────────────
    case 'reglas-general': {
      const embeds = embedsGeneral();
      for (const e of embeds) { await message.channel.send({ embeds: [e] }); await sleep(500); }
      break;
    }
    case 'reglas-partido': {
      const embeds = embedsPartido();
      for (const e of embeds) { await message.channel.send({ embeds: [e] }); await sleep(500); }
      break;
    }
    case 'reglas-mercado': {
      const embeds = embedsMercado();
      for (const e of embeds) { await message.channel.send({ embeds: [e] }); await sleep(500); }
      break;
    }
    case 'reglas-clubes': {
      const embeds = embedsClubes();
      for (const e of embeds) { await message.channel.send({ embeds: [e] }); await sleep(500); }
      break;
    }

    // ─── MERCADO ──────────────────────────────────────────────
    case 'mercado-abrir':
      await mercadoCmds.cmdMercadoAbrir(fakeInteraction, client);
      break;
    case 'mercado-cerrar':
      await mercadoCmds.cmdMercadoCerrar(fakeInteraction, client);
      break;
    case 'mercado-estado':
      await mercadoCmds.cmdMercadoEstado(fakeInteraction);
      break;

    // ─── PROTOCOLO (modo pánico visual, solo owner, no destructivo) ───
    case 'protocolo': {
      const guild = message.guild;
      let member;
      try {
        member = await guild.members.fetchMe();
      } catch (err) {
        console.error('[protocolo] No pude obtener mi propio member, cancelando activación:', err.message);
        await message.channel.send('❌ No pude activar el protocolo (error interno). Revisa la consola.');
        break;
      }

      if (protocoloActivo.has(guild.id)) {
        await message.channel.send('⚠️ El protocolo ya está activo en este servidor. Usá `§desactivar` para apagarlo.');
        break;
      }

      protocoloActivo.set(guild.id, { nicknameOriginal: member.nickname });

      try {
        await member.setNickname('🚨 PROTOCOLO ACTIVO 🚨');
      } catch (err) {
        console.error('[protocolo] No pude cambiar el nickname:', err.message);
      }

      client.user.setPresence({ status: 'dnd', activities: [{ name: '🚨 PROTOCOLO ACTIVADO', type: ActivityType.Watching }] });

      // ─── Apodo temporal de quien activa el protocolo (se restaura al desactivar) ───
      const estadoProtocolo = protocoloActivo.get(guild.id);
      estadoProtocolo.activadorId = message.author.id;
      estadoProtocolo.activadorNicknameOriginal = message.member.nickname;
      estadoProtocolo.exterminados = 0;
      estadoProtocolo.sobrevivientes = 0;
      const nivel = calcularNivelProtocolo(guild.id);
      estadoProtocolo.nivel = nivel;
      estadoProtocolo.nicksAfectados = new Map();
      estadoProtocolo.inicio = Date.now();

      // ─── Rol temporal "En Alerta" (se crea una sola vez, se reutiliza después) ───
      try {
        let rolAlerta = guild.roles.cache.find((r) => r.name === PROTOCOLO_ROL_ALERTA_NOMBRE);
        if (!rolAlerta) {
          rolAlerta = await guild.roles.create({
            name: PROTOCOLO_ROL_ALERTA_NOMBRE,
            color: 0xe74c3c,
            reason: 'Protocolo: rol para quienes caen durante el efecto pasivo',
          });
        }
        estadoProtocolo.rolAlertaId = rolAlerta.id;
      } catch (err) {
        console.error('[protocolo] No pude crear/obtener el rol de alerta:', err.message);
      }

      // ─── Ícono del servidor (solo si hay uno configurado) ───
      if (PROTOCOLO_ICON_URL) {
        estadoProtocolo.iconoOriginal = guild.iconURL();
        try {
          await guild.setIcon(PROTOCOLO_ICON_URL);
        } catch (err) {
          console.error('[protocolo] No pude cambiar el ícono del servidor:', err.message);
        }
      }
      try {
        if (message.member.moderatable) {
          await message.member.setNickname('⚠️ COMANDANTE ⚠️');
        }
      } catch (err) {
        console.error('[protocolo] No pude cambiar el nickname del activador:', err.message);
      }

      // ─── Topic + slowmode extremo del canal (se restauran al desactivar) ───
      estadoProtocolo.canalId = message.channel.id;
      estadoProtocolo.topicOriginal = message.channel.topic ?? null;
      estadoProtocolo.slowmodeOriginal = message.channel.rateLimitPerUser ?? 0;
      try {
        await message.channel.setTopic('🚨 PROTOCOLO ACTIVO — Acceso restringido 🚨');
        await message.channel.setRateLimitPerUser(30);
      } catch (err) {
        console.error('[protocolo] No pude cambiar topic/slowmode:', err.message);
      }

      // ─── Mover a quien activa al canal de voz "búnker"; si no existe, el bot
      //     lo crea (categoría del canal actual si es de texto con categoría) ───
      try {
        if (message.member.voice?.channel) {
          let canalBunker = guild.channels.cache.find(
            (c) => c.isVoiceBased?.() && c.name.toLowerCase().includes(PROTOCOLO_CANAL_BUNKER_NOMBRE)
          );
          if (!canalBunker) {
            canalBunker = await guild.channels.create({
              name: '🚨-búnker',
              type: ChannelType.GuildVoice,
              parent: message.channel.parentId || null,
              reason: 'Protocolo activado: creando refugio',
            });
            estadoProtocolo.bunkerCreadoId = canalBunker.id;
          }
          await message.member.voice.setChannel(canalBunker, 'Protocolo activado: refugio');
        }
      } catch (err) {
        console.error('[protocolo] No pude crear/mover al búnker:', err.message);
      }

      // ─── Renombra temporalmente el canal de texto (se restaura al desactivar) ───
      estadoProtocolo.nombreCanalOriginal = message.channel.name;
      try {
        await message.channel.setName(`🚨-${message.channel.name}`.slice(0, 100));
      } catch (err) {
        console.error('[protocolo] No pude renombrar el canal:', err.message);
      }

      // ─── DM "confidencial" a quien activa el protocolo ───
      try {
        await message.author.send(
          `🔒 **MENSAJE CONFIDENCIAL — NIVEL ${nivel}**\nHas activado el PROTOCOLO en **${guild.name}**.\nEsta información es alto secreto. Destrúyela después de leerla (es un chiste, no hace falta).`
        );
      } catch (err) {
        // DMs cerrados, no pasa nada
      }

      // ─── Auto-reacciones masivas a los últimos mensajes del canal (efecto
      //     "todo se pone en alerta") ───
      try {
        const ultimosMensajes = await message.channel.messages.fetch({ limit: 5 });
        for (const m of ultimosMensajes.values()) {
          await m.react('🚨').catch(() => {});
        }
      } catch (err) {
        console.error('[protocolo] No pude reaccionar a mensajes previos:', err.message);
      }

      // ─── Secuencia dramática previa (frase random + "log del sistema") ───
      const frase = PROTOCOLO_FRASES_DRAMATICAS[Math.floor(Math.random() * PROTOCOLO_FRASES_DRAMATICAS.length)];
      await message.channel.send(`⚠️ ${frase}`);
      await sleep(1200);

      const logMsg = await message.channel.send('```\n[INICIANDO PROTOCOLO...]\n```');
      const logLineasBase = [
        '[OK] Verificando credenciales...',
        '[OK] Escaneando canal...',
        '[WARN] Nivel de amenaza: ALTO',
        '[OK] Restringiendo accesos...',
        '[ERROR] Contención parcial',
        '[OK] Sellando perímetro...',
      ];
      const logLineasExtra = [
        '[WARN] Escalando nivel de respuesta...',
        `[INFO] NIVEL DE ALERTA: ${nivel}`,
        '[ERROR] Protocolos anteriores insuficientes',
      ];
      const logLineas = nivel > 1 ? [...logLineasBase, ...logLineasExtra.slice(0, nivel - 1)] : logLineasBase;
      let logAcumulado = '';
      for (const linea of logLineas) {
        logAcumulado += `${linea}\n`;
        await logMsg.edit(`\`\`\`\n${logAcumulado}\`\`\``).catch(() => {});
        await sleep(550);
      }

      // ─── Barra de progreso animada (edita el mismo mensaje) ───
      const progresoMsg = await message.channel.send('Activando protocolo... `[░░░░░░░░░░]` 0%');
      const pasosProgreso = [10, 25, 40, 55, 70, 85, 100];
      for (const pct of pasosProgreso) {
        const llenos = Math.round((pct / 100) * 10);
        const barraTexto = '▓'.repeat(llenos) + '░'.repeat(10 - llenos);
        await progresoMsg.edit(`Activando protocolo... \`[${barraTexto}]\` ${pct}%`).catch(() => {});
        await sleep(400);
      }

      await message.channel.send('**3**');
      await sleep(700);
      await message.channel.send('**2**');
      await sleep(700);
      await message.channel.send('**1**');
      await sleep(700);

      const esNivelMaximo = nivel >= 5;
      const embedAlerta = new EmbedBuilder()
        .setColor(esNivelMaximo ? 0x000000 : 0xe74c3c)
        .setTitle(esNivelMaximo ? '🖤 PROTOCOLO — NIVEL MÁXIMO ALCANZADO 🖤' : `🚨 PROTOCOLO DE SEGURIDAD ACTIVADO — NIVEL ${nivel} 🚨`)
        .setDescription(
          esNivelMaximo
            ? `Activado por ${message.author}.\n\n* No queda nada más que escalar.\n> Esto es lo más lejos que llega el PROTOCOLO.`
            : `Activado por ${message.author} — todo el mundo a sus puestos.`
        )
        .setTimestamp();
      const alerta = await message.channel.send({ embeds: [embedAlerta] });

      try {
        await alerta.react('🚨');
        await alerta.react('👀');
        await alerta.react('⚠️');
        await alerta.react('🔥');
      } catch (err) {
        // sin permiso de reacciones, no pasa nada
      }

      try {
        await alerta.pin('§protocolo activo');
        estadoProtocolo.mensajeAlertaId = alerta.id;
      } catch (err) {
        console.error('[protocolo] No pude pinear el mensaje de alerta:', err.message);
      }

      await message.channel.send('Usá `§desactivar` cuando quieras volver todo a la normalidad.');
      break;
    }

    case 'desactivar': {
      const ok = await desactivarProtocolo(message.guild, message.channel);
      if (!ok) await message.channel.send('El protocolo no está activo en este servidor.');
      break;
    }

    default: {
      // El dueño del bot puede usar TODOS los comandos con § en cualquier
      // servidor; los demás solo si tienen el permiso correspondiente.
      const opciones = { esOwnerBot: message.author.id === OWNER_ID };

      // ─── PANEL (§panel) ─── Tú (OWNER_ID) siempre puedes abrirlo; los
      // demás necesitan "Gestionar servidor" (lo valida panel.js).
      if (nombre === 'panel' || nombre === 'configurar') {
        await panel.enviarPanelPrefijo(message, OWNER_ID);
        break;
      }

      // ─── UTILIDADES (§avatar, §serverinfo, §rank, §lock, §sorteo…) ───
      if (await utilidades.manejarPrefijo(message, nombre, args, opciones)) break;

      // ─── MODERACIÓN (§ban §kick §timeout §warn §clear §modconfig…) ───
      await moderacionPrefijo(message, nombre, args, opciones);
      break;
    }
  }
}

// ═══════════════════════════════════════
// EVENTOS
// ═══════════════════════════════════════
// ─── Custom Rich Presence (rotativo) ───
function obtenerPresencias() {
  const servidores = client.guilds.cache.size;
  const usuarios = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
  return [
    { name: '⚽ Bot Developing', type: ActivityType.Playing },
    { name: `${usuarios} miembros`, type: ActivityType.Watching },
    { name: 'partidos de la liga 🏟️', type: ActivityType.Watching },
    { name: 'el mercado de fichajes 💰', type: ActivityType.Competing },
    { name: `/play • ${servidores} servidores 🎵`, type: ActivityType.Listening },
  ];
}

function iniciarPresencia() {
  let i = 0;
  const actualizar = () => {
    const lista = obtenerPresencias();
    client.user.setPresence({
      status: 'online', // online | idle | dnd | invisible
      activities: [lista[i % lista.length]],
    });
    i++;
  };
  actualizar();
  setInterval(actualizar, 30 * 1000); // rota cada 30 segundos
}

client.once('clientReady', () => {
  console.log(`Bot conectado como ${client.user.tag}`);
  iniciarPresencia();
});

client.on('interactionCreate', async (interaction) => {
  try {
    // ─── Bloquear comandos restringidos fuera del servidor LFPP ───
    if (
      interaction.isChatInputCommand() &&
      COMANDOS_RESTRINGIDOS.has(interaction.commandName) &&
      interaction.guildId !== LFPP_GUILD_ID
    ) {
      return interaction.reply({
        content: '❌ Este comando solo se puede usar en el servidor oficial de la LFPP.',
        ephemeral: true,
      });
    }

    // ─── PANEL DE CONFIGURACIÓN (/panel + sus botones, menús y modales) ───
    if (
      (interaction.isChatInputCommand() && interaction.commandName === 'panel') ||
      ((interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) &&
        interaction.customId?.startsWith('panel_'))
    ) {
      if (await panel.manejarPanel(interaction, OWNER_ID)) return;
    }

    // ─── UTILIDADES (info, herramientas, gestión, niveles, diversión) ───
    if (interaction.isChatInputCommand() && (await utilidades.manejarSlash(interaction))) return;

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

    // ─── MERCADO ─────────────────────────────────────────
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'mercado-abrir') {
      await mercadoCmds.cmdMercadoAbrir(interaction, client);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'mercado-cerrar') {
      await mercadoCmds.cmdMercadoCerrar(interaction, client);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'registrar-club') {
      await mercadoCmds.cmdRegistrarClub(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'asignar-presidente') {
      await mercadoCmds.cmdAsignarPresidente(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'registrar-jugador') {
      await mercadoCmds.cmdRegistrarJugador(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'actualizar-valor') {
      await mercadoCmds.cmdActualizarValor(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'add-presupuesto') {
      await mercadoCmds.cmdAddPresupuesto(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'bono-victoria') {
      await mercadoCmds.cmdBonoVictoria(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'sancionar-jugador') {
      await mercadoCmds.cmdSancionar(interaction, client);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'levantar-sancion') {
      await mercadoCmds.cmdLevantarSancion(interaction, client);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'rescindir-forzar') {
      await mercadoCmds.cmdRescindirForzar(interaction, client);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'ofrecer') {
      await mercadoCmds.cmdOfrecer(interaction, client);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'prestar') {
      await mercadoCmds.cmdPrestar(interaction, client);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'pagar-clausula') {
      await mercadoCmds.cmdPagarClausula(interaction, client);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'mis-ofertas') {
      await mercadoCmds.cmdMisOfertas(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'aceptar-oferta') {
      await mercadoCmds.cmdResponderOfertaJugador(interaction, client, true);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'rechazar-oferta') {
      await mercadoCmds.cmdResponderOfertaJugador(interaction, client, false);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'rescindir') {
      await mercadoCmds.cmdRescindir(interaction, client);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'mi-contrato') {
      await mercadoCmds.cmdMiContrato(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'plantilla') {
      await mercadoCmds.cmdPlantilla(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'agentes-libres') {
      await mercadoCmds.cmdAgentesLibres(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'valor-jugador') {
      await mercadoCmds.cmdValorJugador(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'presupuesto') {
      await mercadoCmds.cmdPresupuesto(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'mercado-estado') {
      await mercadoCmds.cmdMercadoEstado(interaction);
    } else if (interaction.isButton() && (
      interaction.customId.startsWith('rescindir_') ||
      interaction.customId.startsWith('clausula_') ||
      interaction.customId.startsWith('club_') ||
      interaction.customId.startsWith('jug_')
    )) {
      await mercadoCmds.manejarBotonMercado(interaction, client);

    // ─── MÚSICA ─────────────────────────────────────────
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'play') {
      await musica.cmdPlay(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'skip') {
      await musica.cmdSkip(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'stop') {
      await musica.cmdStop(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'pause') {
      await musica.cmdPause(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'resume') {
      await musica.cmdResume(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'queue') {
      await musica.cmdQueue(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'volumen') {
      await musica.cmdVolumen(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'leave') {
      await musica.cmdLeave(interaction);
    }
  } catch (err) {
    console.error('Error manejando interacción:', err);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // ─── Efecto pasivo mientras §protocolo está activo: cualquiera que hable
  //     (menos el owner) recibe la secuencia "exterminando" + mute breve.
  //     El "BORRANDO CANAL..." es puro show, no borra nada real. ───
  if (protocoloActivo.has(message.guild.id) && message.author.id !== OWNER_ID && !message.content.startsWith('§')) {
    const clave = `${message.guild.id}:${message.author.id}`;
    const ahora = Date.now();
    if (ahora - (protocoloUltimoTrigger.get(clave) || 0) > 15000) {
      protocoloUltimoTrigger.set(clave, ahora);
      const estadoProtocolo = protocoloActivo.get(message.guild.id);
      (async () => {
        try {
          if (Math.random() < PROTOCOLO_SOBREVIVIENTE_CHANCE) {
            const linea = PROTOCOLO_LINEAS_SOBREVIVIENTE[Math.floor(Math.random() * PROTOCOLO_LINEAS_SOBREVIVIENTE.length)];
            await message.channel.send(`🌟 **${message.author.username} sobrevivió.**\n${linea}`);
            if (estadoProtocolo) estadoProtocolo.sobrevivientes = (estadoProtocolo.sobrevivientes || 0) + 1;
            return;
          }
          await message.channel.send(`🎯 **EXTERMINANDO A ${message.author}...**`);
          await sleep(900);
          const canalFalso = PROTOCOLO_CANALES_FALSOS[Math.floor(Math.random() * PROTOCOLO_CANALES_FALSOS.length)];
          await message.channel.send(`🗑️ BORRANDO CANAL **${canalFalso}**...`);
          await sleep(900);
          await message.channel.send('💀 Objetivo neutralizado.');
          if (estadoProtocolo) estadoProtocolo.exterminados = (estadoProtocolo.exterminados || 0) + 1;
          const duracionMute = Math.min(8_000 + ((estadoProtocolo?.nivel || 1) - 1) * 2_000, 20_000);
          if (message.member?.moderatable) {
            await message.member.timeout(duracionMute, '§protocolo: efecto activo');
          }
        } catch (err) {
          console.error('[protocolo] Error en efecto pasivo:', err.message);
        }
      })();
    }
  }

  // ─── Comandos de owner con prefijo § ─────────────────────────────
  if (message.content.startsWith('§')) {
    try {
      await manejarComandoOwner(message);
    } catch (err) {
      console.error('[owner] Error no capturado en un comando §:', err);
      await message.channel.send('❌ Ocurrió un error inesperado ejecutando el comando. Revisa la consola.').catch(() => {});
    }
    return;
  }

  // ─── Comandos de reglas para admins con prefijo ! ──────────
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
      await sleep(500);
    }
  }
});

// ─── Red de seguridad: un error no capturado en cualquier parte del bot
//     (incluyendo dentro de §protocolo) ya no debe tumbar el proceso.
//     Esto es lo que probablemente causaba que §desactivar "a veces no
//     funcionara": el bot se reiniciaba y perdía el estado en memoria. ───
process.on('unhandledRejection', (err) => {
  console.error('[proceso] unhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[proceso] uncaughtException:', err);
});

iniciarServidorOAuth();
musica.iniciarMusica(client);
iniciarModeracion(client);
utilidades.iniciarUtilidades(client);
client.login(process.env.TOKEN);

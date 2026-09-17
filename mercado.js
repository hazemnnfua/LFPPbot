// ═══════════════════════════════════════════════════════════════
// mercado.js — Base de datos y lógica del Mercado de Fichajes LFPP
// Moneda: Soles LFPP | Presupuesto inicial: 500.000
// ═══════════════════════════════════════════════════════════════
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'mercado.json');

// ─── IO ──────────────────────────────────────────────────────
function load() {
  if (!fs.existsSync(FILE)) return defaultDB();
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return defaultDB(); }
}
function save(db) {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2), 'utf8');
}
function defaultDB() {
  return {
    config: {
      ventanaAbierta: false,
      fechaApertura: null,
      fechaCierre: null,
      moneda: 'Soles LFPP',
      presupuestoInicial: 500000,
      multiplicadorClausula: 2,
      bonoVictoria: 10000,
      bonoClasificacion: 50000,
    },
    clubes: {},
    jugadores: {},
    ofertas: {},
    movimientos: [],
    economia: {},
  };
}

// ─── HELPERS ─────────────────────────────────────────────────
function uuid() { return crypto.randomUUID(); }
function now()  { return new Date().toISOString(); }
function fmt(n) { return Number(n).toLocaleString('es-PE'); }

// ─── CONFIG / VENTANA ────────────────────────────────────────
function getConfig()    { return load().config; }
function isVentanaOpen(){ return load().config.ventanaAbierta; }

function abrirVentana(adminTag) {
  const db = load();
  db.config.ventanaAbierta = true;
  db.config.fechaApertura  = now();
  db.config.fechaCierre    = null;
  registrarMovimiento(db, { tipo: 'VENTANA_ABIERTA', adminTag, fecha: now() });
  save(db);
}
function cerrarVentana(adminTag) {
  const db = load();
  db.config.ventanaAbierta = false;
  db.config.fechaCierre    = now();
  // cancelar ofertas pendientes
  Object.values(db.ofertas).forEach(o => {
    if (o.estado === 'pendiente') o.estado = 'cancelada_cierre';
  });
  registrarMovimiento(db, { tipo: 'VENTANA_CERRADA', adminTag, fecha: now() });
  save(db);
}

// ─── CLUBES ──────────────────────────────────────────────────
function registrarClub(nombre, presidenteId, adminTag) {
  const db = load();
  if (db.clubes[nombre]) return { ok: false, msg: `El club **${nombre}** ya está registrado.` };
  db.clubes[nombre] = {
    nombre,
    presidenteId,
    presupuesto: db.config.presupuestoInicial,
    gastos: 0,
    ingresos: 0,
    jugadores: [],
    fundadoPor: adminTag,
    fechaRegistro: now(),
  };
  db.economia[nombre] = db.economia[nombre] || [];
  db.economia[nombre].push({ tipo: 'PRESUPUESTO_INICIAL', monto: db.config.presupuestoInicial, fecha: now(), desc: 'Presupuesto inicial de liga' });
  registrarMovimiento(db, { tipo: 'CLUB_REGISTRADO', club: nombre, adminTag, fecha: now() });
  save(db);
  return { ok: true };
}

function getClub(nombre) { return load().clubes[nombre] || null; }

function getAllClubes() { return load().clubes; }

function setPresidente(club, presidenteId, adminTag) {
  const db = load();
  if (!db.clubes[club]) return { ok: false, msg: `Club **${club}** no encontrado.` };
  db.clubes[club].presidenteId = presidenteId;
  registrarMovimiento(db, { tipo: 'PRESIDENTE_ASIGNADO', club, presidenteId, adminTag, fecha: now() });
  save(db);
  return { ok: true };
}

function ajustarPresupuesto(db, club, delta, desc, tipo) {
  if (!db.clubes[club]) return;
  db.clubes[club].presupuesto += delta;
  if (delta < 0) db.clubes[club].gastos   += Math.abs(delta);
  else           db.clubes[club].ingresos += delta;
  db.economia[club] = db.economia[club] || [];
  db.economia[club].push({ tipo, monto: delta, fecha: now(), desc });
}

function addPresupuesto(club, monto, motivo, adminTag) {
  const db = load();
  if (!db.clubes[club]) return { ok: false, msg: `Club **${club}** no encontrado.` };
  ajustarPresupuesto(db, club, monto, motivo, 'BONO_ADMIN');
  registrarMovimiento(db, { tipo: 'PRESUPUESTO_AJUSTADO', club, monto, motivo, adminTag, fecha: now() });
  save(db);
  return { ok: true, presupuesto: db.clubes[club].presupuesto };
}

// ─── JUGADORES ───────────────────────────────────────────────
function registrarJugador(robloxUser, discordId, club, valor, posicion, adminTag) {
  const db = load();
  if (db.jugadores[robloxUser]) return { ok: false, msg: `**${robloxUser}** ya está registrado.` };
  if (club !== 'AGENTE_LIBRE' && !db.clubes[club]) return { ok: false, msg: `Club **${club}** no encontrado. Regístralo primero.` };

  const clausula = valor * db.config.multiplicadorClausula;
  db.jugadores[robloxUser] = {
    robloxUser,
    discordId,
    club,
    valor,
    clausula,
    posicion: posicion || '—',
    contrato: club === 'AGENTE_LIBRE' ? null : { duracion: 10, jornadasRestantes: 10, fechaFirma: now() },
    historialClubes: club === 'AGENTE_LIBRE' ? [] : [{ club, desde: now(), monto: 0, tipo: 'REGISTRO_INICIAL' }],
    registradoPor: adminTag,
    fechaRegistro: now(),
    suspendido: false,
    jornadasSuspension: 0,
  };

  if (club !== 'AGENTE_LIBRE') {
    db.clubes[club].jugadores.push(robloxUser);
  }
  registrarMovimiento(db, { tipo: 'JUGADOR_REGISTRADO', robloxUser, club, valor, adminTag, fecha: now() });
  save(db);
  return { ok: true };
}

function getJugador(robloxUser) { return load().jugadores[robloxUser] || null; }

function getJugadorPorDiscord(discordId) {
  const db = load();
  return Object.values(db.jugadores).find(j => j.discordId === discordId) || null;
}

function getAllJugadores() { return load().jugadores; }

function getAgenteLibres() {
  const db = load();
  return Object.values(db.jugadores).filter(j => j.club === 'AGENTE_LIBRE');
}

function actualizarValor(robloxUser, nuevoValor, adminTag) {
  const db = load();
  const j = db.jugadores[robloxUser];
  if (!j) return { ok: false, msg: `Jugador **${robloxUser}** no encontrado.` };
  const anterior = j.valor;
  j.valor    = nuevoValor;
  j.clausula = nuevoValor * db.config.multiplicadorClausula;
  registrarMovimiento(db, { tipo: 'VALOR_ACTUALIZADO', robloxUser, anterior, nuevo: nuevoValor, adminTag, fecha: now() });
  save(db);
  return { ok: true };
}

// ─── OFERTAS ─────────────────────────────────────────────────
// tipo: 'FICHAJE' | 'PRESTAMO' | 'RENOVACION'
function crearOferta({ tipo, clubOferente, jugadorRoblox, monto, duracion }) {
  const db = load();
  if (!db.config.ventanaAbierta) return { ok: false, msg: '❌ El mercado está **cerrado**. Espera a que un admin abra la ventana de fichajes.' };

  const j = db.jugadores[jugadorRoblox];
  if (!j) return { ok: false, msg: `Jugador **${jugadorRoblox}** no encontrado en el sistema.` };

  const club = db.clubes[clubOferente];
  if (!club) return { ok: false, msg: `Tu club **${clubOferente}** no está registrado.` };

  if (club.presupuesto < monto) return {
    ok: false,
    msg: `❌ **${clubOferente}** no tiene presupuesto suficiente.\nDisponible: **${fmt(club.presupuesto)} Soles LFPP** | Oferta: **${fmt(monto)} Soles LFPP**`,
  };

  // No puede hacer oferta a su propio jugador
  if (j.club === clubOferente) return { ok: false, msg: '❌ No puedes hacer una oferta a tu propio jugador.' };

  // Oferta duplicada pendiente
  const yaExiste = Object.values(db.ofertas).find(o =>
    o.jugadorRoblox === jugadorRoblox && o.clubOferente === clubOferente && o.estado === 'pendiente'
  );
  if (yaExiste) return { ok: false, msg: '⚠️ Ya tienes una oferta pendiente por este jugador. Espera la respuesta.' };

  const id = uuid();
  db.ofertas[id] = {
    id, tipo,
    clubOferente,
    jugadorRoblox,
    clubActual: j.club,
    monto,
    duracion: duracion || null,
    estado: 'pendiente',                    // pendiente | aceptada_club | rechazada_club | aceptada | rechazada | cancelada_cierre
    etapa: j.club === 'AGENTE_LIBRE' ? 'jugador' : 'club_vendedor',
    fecha: now(),
    fechaRespuestaClub: null,
    fechaRespuestaJugador: null,
  };
  save(db);
  return { ok: true, ofertaId: id, oferta: db.ofertas[id], jugador: j };
}

function getOfertas() { return load().ofertas; }
function getOferta(id){ return load().ofertas[id] || null; }

function getOfertasPendientesJugador(robloxUser) {
  const db = load();
  return Object.values(db.ofertas).filter(o => o.jugadorRoblox === robloxUser && o.estado === 'pendiente');
}

function getOfertasPendientesClub(club) {
  const db = load();
  return Object.values(db.ofertas).filter(o => o.clubActual === club && (o.estado === 'pendiente' || o.estado === 'aceptada_club'));
}

// Club vendedor responde
function responderOfertaClub(ofertaId, aceptar, respuestorTag) {
  const db = load();
  const o  = db.ofertas[ofertaId];
  if (!o) return { ok: false, msg: 'Oferta no encontrada.' };
  if (o.estado !== 'pendiente') return { ok: false, msg: 'Esta oferta ya fue procesada.' };
  if (o.etapa  !== 'club_vendedor') return { ok: false, msg: 'Esta oferta no está en etapa de respuesta del club.' };

  o.fechaRespuestaClub = now();
  o.respuestorClubTag  = respuestorTag;

  if (!aceptar) {
    o.estado = 'rechazada_club';
    save(db);
    return { ok: true, resultado: 'rechazada', oferta: o, jugador: db.jugadores[o.jugadorRoblox] };
  }

  // Club aceptó → pasa a esperar al jugador
  o.estado = 'aceptada_club';
  o.etapa  = 'jugador';
  save(db);
  return { ok: true, resultado: 'pasa_jugador', oferta: o, jugador: db.jugadores[o.jugadorRoblox] };
}

// Jugador responde (o agente libre directo)
function responderOfertaJugador(ofertaId, aceptar, jugadorTag) {
  const db = load();
  const o  = db.ofertas[ofertaId];
  if (!o) return { ok: false, msg: 'Oferta no encontrada.' };
  if (o.estado !== 'pendiente' && o.estado !== 'aceptada_club') return { ok: false, msg: 'Esta oferta ya fue procesada.' };
  if (o.etapa  !== 'jugador') return { ok: false, msg: 'Esta oferta no está en etapa de respuesta del jugador.' };

  o.fechaRespuestaJugador = now();
  o.jugadorTag            = jugadorTag;

  if (!aceptar) {
    o.estado = 'rechazada';
    save(db);
    return { ok: true, resultado: 'rechazada', oferta: o };
  }

  // ¡ACEPTADO! → ejecutar traspaso
  o.estado = 'aceptada';
  return ejecutarTraspaso(db, o);
}

// ─── EJECUCIÓN DE TRASPASO ───────────────────────────────────
function ejecutarTraspaso(db, o) {
  const j        = db.jugadores[o.jugadorRoblox];
  const clubDest = db.clubes[o.clubOferente];
  const clubOrig = o.clubActual !== 'AGENTE_LIBRE' ? db.clubes[o.clubActual] : null;

  if (o.tipo === 'FICHAJE' || o.tipo === 'FICHAJE_CLAUSULA') {
    // Dinero
    ajustarPresupuesto(db, o.clubOferente, -o.monto, `Fichaje de ${o.jugadorRoblox}`, 'FICHAJE_OUT');
    if (clubOrig) ajustarPresupuesto(db, o.clubActual, o.monto, `Venta de ${o.jugadorRoblox}`, 'FICHAJE_IN');

    // Mover jugador
    if (clubOrig) clubOrig.jugadores = clubOrig.jugadores.filter(u => u !== o.jugadorRoblox);
    clubDest.jugadores.push(o.jugadorRoblox);

    j.historialClubes.push({ club: o.clubOferente, desde: now(), monto: o.monto, tipo: 'FICHAJE' });
    const anterior = j.club;
    j.club     = o.clubOferente;
    j.contrato = { duracion: 10, jornadasRestantes: 10, fechaFirma: now() };

    registrarMovimiento(db, {
      tipo: 'FICHAJE_CONFIRMADO',
      jugador: o.jugadorRoblox,
      clubOrigen: anterior,
      clubDestino: o.clubOferente,
      monto: o.monto,
      ofertaId: o.id,
      fecha: now(),
    });

  } else if (o.tipo === 'PRESTAMO') {
    // Préstamo: jugador se mueve temporalmente, club origen conserva propiedad
    if (clubOrig) clubOrig.jugadores = clubOrig.jugadores.filter(u => u !== o.jugadorRoblox);
    clubDest.jugadores.push(o.jugadorRoblox);

    const clubPropietario = j.club;
    j.prestamo = { clubPropietario, duracionJornadas: o.duracion || 5, fechaInicio: now() };
    j.historialClubes.push({ club: o.clubOferente, desde: now(), monto: o.monto, tipo: 'PRESTAMO' });
    j.club = o.clubOferente;

    if (o.monto > 0) {
      ajustarPresupuesto(db, o.clubOferente, -o.monto, `Préstamo de ${o.jugadorRoblox}`, 'PRESTAMO_OUT');
      ajustarPresupuesto(db, clubPropietario, o.monto, `Cuota préstamo ${o.jugadorRoblox}`, 'PRESTAMO_IN');
    }

    registrarMovimiento(db, {
      tipo: 'PRESTAMO_CONFIRMADO',
      jugador: o.jugadorRoblox,
      clubOrigen: clubPropietario,
      clubDestino: o.clubOferente,
      monto: o.monto,
      duracion: o.duracion,
      ofertaId: o.id,
      fecha: now(),
    });
  }

  save(db);
  return { ok: true, resultado: 'aceptada', oferta: o, jugador: db.jugadores[o.jugadorRoblox], db };
}

// ─── RESCISIÓN ───────────────────────────────────────────────
// voluntaria: jugador paga su cláusula al club y queda libre
function rescindirVoluntaria(robloxUser) {
  const db = load();
  if (!db.config.ventanaAbierta) return { ok: false, msg: '❌ El mercado está cerrado. No puedes rescindir fuera de ventana.' };
  const j = db.jugadores[robloxUser];
  if (!j) return { ok: false, msg: 'Jugador no encontrado.' };
  if (j.club === 'AGENTE_LIBRE') return { ok: false, msg: 'Ya eres agente libre.' };

  const clubOrig = db.clubes[j.club];
  if (clubOrig) {
    clubOrig.jugadores = clubOrig.jugadores.filter(u => u !== robloxUser);
    ajustarPresupuesto(db, j.club, j.clausula, `Cláusula de rescisión de ${robloxUser}`, 'CLAUSULA_IN');
  }

  const clubAnterior = j.club;
  j.historialClubes.push({ club: 'AGENTE_LIBRE', desde: now(), monto: -j.clausula, tipo: 'RESCISION_VOLUNTARIA' });
  j.club     = 'AGENTE_LIBRE';
  j.contrato = null;
  j.prestamo = null;

  registrarMovimiento(db, { tipo: 'RESCISION_VOLUNTARIA', jugador: robloxUser, clubOrigen: clubAnterior, clausula: j.clausula, fecha: now() });
  save(db);
  return { ok: true, clausula: j.clausula, clubAnterior };
}

// forzosa: admin rescinde sin costo
function rescindirForzosa(robloxUser, adminTag) {
  const db = load();
  const j  = db.jugadores[robloxUser];
  if (!j) return { ok: false, msg: 'Jugador no encontrado.' };
  if (j.club === 'AGENTE_LIBRE') return { ok: false, msg: 'Ya es agente libre.' };

  const clubOrig = db.clubes[j.club];
  if (clubOrig) clubOrig.jugadores = clubOrig.jugadores.filter(u => u !== robloxUser);

  const clubAnterior = j.club;
  j.historialClubes.push({ club: 'AGENTE_LIBRE', desde: now(), monto: 0, tipo: 'RESCISION_FORZOSA' });
  j.club     = 'AGENTE_LIBRE';
  j.contrato = null;
  j.prestamo = null;

  registrarMovimiento(db, { tipo: 'RESCISION_FORZOSA', jugador: robloxUser, clubOrigen: clubAnterior, adminTag, fecha: now() });
  save(db);
  return { ok: true, clubAnterior };
}

// ─── PAGO DE CLÁUSULA (fichaje directo sin negociar) ─────────
function pagarClausula(clubOferente, robloxUser) {
  const db = load();
  if (!db.config.ventanaAbierta) return { ok: false, msg: '❌ El mercado está cerrado.' };

  const j    = db.jugadores[robloxUser];
  if (!j) return { ok: false, msg: 'Jugador no encontrado.' };
  if (j.club === 'AGENTE_LIBRE') return { ok: false, msg: 'El jugador es agente libre. Usa /ofrecer directamente.' };
  if (j.club === clubOferente)   return { ok: false, msg: 'Ya es tu jugador.' };

  const club = db.clubes[clubOferente];
  if (!club) return { ok: false, msg: 'Tu club no está registrado.' };
  if (club.presupuesto < j.clausula) return {
    ok: false,
    msg: `❌ Presupuesto insuficiente.\nCláusula: **${fmt(j.clausula)} Soles LFPP** | Disponible: **${fmt(club.presupuesto)} Soles LFPP**`,
  };

  // Crear oferta interna y ejecutar de inmediato
  const ofId = uuid();
  db.ofertas[ofId] = {
    id: ofId, tipo: 'FICHAJE_CLAUSULA',
    clubOferente, jugadorRoblox: robloxUser,
    clubActual: j.club, monto: j.clausula,
    estado: 'aceptada', etapa: 'completada', fecha: now(),
  };

  const res = ejecutarTraspaso(db, db.ofertas[ofId]);
  return { ...res, clausula: j.clausula };
}

// ─── SANCIONES ───────────────────────────────────────────────
function sancionar(robloxUser, jornadas, motivo, adminTag) {
  const db = load();
  const j  = db.jugadores[robloxUser];
  if (!j) return { ok: false, msg: 'Jugador no encontrado.' };
  j.suspendido       = true;
  j.jornadasSuspension = jornadas;
  j.motivoSancion    = motivo;
  registrarMovimiento(db, { tipo: 'SANCION', jugador: robloxUser, jornadas, motivo, adminTag, fecha: now() });
  save(db);
  return { ok: true };
}

function levantarSancion(robloxUser, adminTag) {
  const db = load();
  const j  = db.jugadores[robloxUser];
  if (!j) return { ok: false, msg: 'Jugador no encontrado.' };
  j.suspendido        = false;
  j.jornadasSuspension = 0;
  j.motivoSancion     = null;
  registrarMovimiento(db, { tipo: 'SANCION_LEVANTADA', jugador: robloxUser, adminTag, fecha: now() });
  save(db);
  return { ok: true };
}

// ─── BONO DE VICTORIA ────────────────────────────────────────
function aplicarBonoVictoria(club, adminTag) {
  const db   = load();
  const bono = db.config.bonoVictoria;
  if (!db.clubes[club]) return { ok: false, msg: `Club **${club}** no encontrado.` };
  ajustarPresupuesto(db, club, bono, 'Bono por victoria', 'BONO_VICTORIA');
  registrarMovimiento(db, { tipo: 'BONO_VICTORIA', club, monto: bono, adminTag, fecha: now() });
  save(db);
  return { ok: true, bono, presupuesto: db.clubes[club].presupuesto };
}

// ─── HISTORIAL ECONÓMICO ─────────────────────────────────────
function getEconomiaClub(club) {
  const db = load();
  return db.economia[club] || [];
}

// ─── MOVIMIENTOS ─────────────────────────────────────────────
function registrarMovimiento(db, mov) {
  db.movimientos = db.movimientos || [];
  db.movimientos.unshift(mov); // los más recientes primero
  if (db.movimientos.length > 500) db.movimientos = db.movimientos.slice(0, 500);
}

function getMovimientos(limite = 20) {
  const db = load();
  return (db.movimientos || []).slice(0, limite);
}

function getMovimientosFichajes() {
  const db = load();
  return (db.movimientos || []).filter(m =>
    ['FICHAJE_CONFIRMADO','PRESTAMO_CONFIRMADO','RESCISION_VOLUNTARIA','RESCISION_FORZOSA','FICHAJE_CLAUSULA'].includes(m.tipo)
  );
}

// ─── EXPORTAR PARA LA WEB (JSON legible para Google Sheets o endpoint) ───
function exportarParaWeb() {
  const db = load();
  const movFichajes = getMovimientosFichajes();

  const fichajes = movFichajes.map(m => ({
    Jugador:  m.jugador || '',
    SaleDe:   m.clubOrigen || 'AGENTE_LIBRE',
    LlegaA:   m.clubDestino || '',
    Fecha:    m.fecha ? m.fecha.slice(0,10) : '',
    Monto:    m.monto || 0,
    Estado:   m.tipo === 'PRESTAMO_CONFIRMADO' ? 'préstamo' : m.tipo === 'RESCISION_VOLUNTARIA' || m.tipo === 'RESCISION_FORZOSA' ? 'rescisión' : 'confirmado',
  }));

  const valores = Object.values(db.jugadores).map(j => ({
    Jugador:   j.robloxUser,
    Equipo:    j.club,
    Posicion:  j.posicion,
    Valor:     j.valor,
    Clausula:  j.clausula,
    Contrato:  j.contrato ? j.contrato.jornadasRestantes + ' jornadas' : '—',
    Suspendido: j.suspendido ? `Sí (${j.jornadasSuspension}j)` : 'No',
  }));

  const presupuestos = Object.values(db.clubes).map(c => ({
    Club:        c.nombre,
    Presupuesto: c.presupuesto,
    Gastos:      c.gastos,
    Ingresos:    c.ingresos,
  }));

  return { fichajes, valores, presupuestos };
}

module.exports = {
  // config
  getConfig, isVentanaOpen, abrirVentana, cerrarVentana,
  // clubes
  registrarClub, getClub, getAllClubes, setPresidente, addPresupuesto, aplicarBonoVictoria,
  // jugadores
  registrarJugador, getJugador, getJugadorPorDiscord, getAllJugadores, getAgenteLibres, actualizarValor,
  // ofertas
  crearOferta, getOfertas, getOferta, getOfertasPendientesJugador, getOfertasPendientesClub,
  responderOfertaClub, responderOfertaJugador,
  // traspasos especiales
  pagarClausula, rescindirVoluntaria, rescindirForzosa,
  // sanciones
  sancionar, levantarSancion,
  // economia
  getEconomiaClub, getMovimientos, getMovimientosFichajes, exportarParaWeb,
  // utils
  fmt,
};

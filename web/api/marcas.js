/* ==================================================================
   API de consulta de marcas — Estudio Raíz
   ------------------------------------------------------------------
   Envoltorio sobre el buscador público del INPI (Argentina).

   IMPORTANTE 1 — El INPI no publica una API oficial documentada. Esto
   consume el mismo endpoint JSON que usa el buscador web público de
   portaltramites.inpi.gob.ar, que responde sin login ni token. Puede
   cambiar sin aviso: si el formato de respuesta deja de coincidir, el
   handler devuelve 502 con un mensaje explícito en lugar de romper en
   silencio.

   IMPORTANTE 2 — La búsqueda del INPI es LITERAL, no fonética. La
   búsqueda fonética oficial es arancelada y no está en este endpoint.
   Para compensar, acá generamos variantes ortográficas del término y
   puntuamos las coincidencias con una clave fonética del español. El
   resultado sigue siendo ORIENTATIVO: no reemplaza un informe de
   antecedentes.

   Rutas
     GET /api/marcas?q=raiz
     GET /api/marcas?q=raiz&clase=35,41&estado=C&foneticas=1
     GET /api/marcas?acta=1239900
     GET /api/marcas?titular=coca%20cola
     GET /api/marcas?q=raiz&formato=csv

   Variables de entorno (todas opcionales)
     MARCAS_API_KEY          si está definida, exige header x-api-key
                             en llamadas que no vengan del propio sitio
     MARCAS_ALLOWED_ORIGINS  orígenes CORS permitidos, separados por coma
   =================================================================== */

'use strict';

/* ---------------------------------------------------------------- */
/* Configuración                                                     */
/* ---------------------------------------------------------------- */

var INPI = {
  BASE: 'https://portaltramites.inpi.gob.ar',
  AVANZADA: '/MarcasConsultas/GrillaMarcasAvanzada',
  PUNTUAL: '/MarcasConsultas/GrillaMarcasPuntual'
};

var CONFIG = {
  // Una búsqueda amplia por titular puede tardarle al INPI cerca de 6
  // segundos: con menos margen que esto devuelve 502 por timeout una
  // consulta que en realidad iba a contestar bien.
  TIMEOUT_MS: 8500,        // por request al INPI
  BUDGET_MS: 9000,         // presupuesto total del handler
  CONCURRENCIA: 6,         // requests simultáneos al INPI
  // Techo de consultas al INPI por búsqueda. Es un servicio público y
  // gratuito: conviene no abusar, y además cada request suele tardar
  // entre 1 y 4 segundos, así que el techo también protege el tiempo
  // de respuesta.
  MAX_CONSULTAS: 12,       // variantes x clases x pasadas
  MAX_VARIANTES: 8,
  MAX_CLASES: 4,
  POR_VARIANTE: 50,        // filas que pedimos al INPI por consulta
  POR_VARIANTE_MAX: 100,
  LIMIT_DEFAULT: 25,
  LIMIT_MAX: 200,
  CACHE_TTL_MS: 60 * 60 * 1000,
  CACHE_MAX: 300,
  RATE_MAX: 40,            // requests por ventana y por IP
  RATE_WINDOW_MS: 60 * 1000
};

// DateTime.MinValue serializado por WCF: el INPI lo usa como "sin dato".
var FECHA_NULA = -62135586000000;

var ESTADOS = {
  A:  { label: 'Abandonada', vigente: false },
  CA: { label: 'Caduca',     vigente: false },
  C:  { label: 'Concedida',  vigente: true  },
  N:  { label: 'Denegada',   vigente: false },
  D:  { label: 'Desistida',  vigente: false },
  E:  { label: 'En trámite', vigente: true  },
  NU: { label: 'Nula',       vigente: false }
};

// El endpoint "puntual" devuelve la etiqueta en vez del código.
var ESTADOS_POR_LABEL = {};

/* ---------------------------------------------------------------- */
/* Normalización y fonética del español                              */
/* ---------------------------------------------------------------- */

// Sufijos societarios: no aportan distintividad, los sacamos para poder
// comparar "RAIZ S.A." con "RAIZ". Se aplican DESPUÉS de normalizar, o
// sea sobre texto sin puntos: "S.A." ya llegó acá como "s a", por eso
// cada letra admite espacios intermedios. Las alternativas van de más
// larga a más corta para que "sas" no se coma sólo el "sa".
var SUFIJOS = new RegExp(
  '\\b(' + [
    's\\s*a\\s*s', 's\\s*r\\s*l', 's\\s*c\\s*a', 's\\s*a',
    'sociedad anonima', 'ltda', 'inc', 'llc', 'corp'
  ].join('|') + ')\\b', 'g'
);

function normalizar(str) {
  return String(str == null ? '' : str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // tildes y diéresis
    .replace(/\u00f1/g, 'n')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sinSufijos(str) {
  return normalizar(str).replace(SUFIJOS, ' ').replace(/\s+/g, ' ').trim();
}

/* Palabras de bajo carácter distintivo.
   ------------------------------------------------------------------
   Buscar la frase entera engaña: "ESTUDIO RAIZ" no figura en la base
   del INPI, pero "RAIZ" sí, vigente y en varias clases. Como quien
   examina va a comparar por el elemento distintivo y no por el rótulo
   genérico que lo acompaña, la API busca las dos cosas.

   Es una heurística, no una regla legal: la lista está pensada para
   editarse a mano cuando aparezca un caso que no contempla. */
var PALABRAS_DEBILES = {};
[
  // Artículos, preposiciones y conjunciones
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'y', 'e', 'o', 'u', 'por', 'para', 'con', 'en',
  // Formas de organización
  'estudio', 'estudios', 'grupo', 'grupos', 'consultora', 'consultoras',
  'consultores', 'consultoria', 'asociados', 'asociadas', 'asesores',
  'asesoria', 'compania', 'empresa', 'firma', 'taller', 'talleres',
  'centro', 'centros', 'instituto', 'agencia', 'agencias',
  'laboratorio', 'laboratorios', 'clinica', 'clinicas',
  'consultorio', 'consultorios', 'casa', 'fabrica',
  'industria', 'industrias', 'distribuidora', 'comercial',
  // Rótulos genéricos frecuentes
  'servicio', 'servicios', 'soluciones', 'sistemas', 'grupo',
  'marca', 'marcas', 'proyecto', 'proyectos'
].forEach(function (p) { PALABRAS_DEBILES[p] = true; });

/* Devuelve el núcleo distintivo del término, o '' si no hay uno
   distinto del término completo (una sola palabra, o todas débiles).

   Toma el tramo CONTIGUO de palabras fuertes más largo, no la unión de
   todas: pegar palabras que en el original no estaban juntas produce
   una frase que no existe, y el INPI busca literal. "LA RAIZ DE LA
   VIDA" da "raiz", no "raiz vida". */
function nucleoDistintivo(str) {
  var palabras = sinSufijos(str).split(' ').filter(Boolean);
  if (palabras.length < 2) return '';

  var tramos = [];
  var actual = [];

  palabras.forEach(function (p) {
    if (PALABRAS_DEBILES[p]) {
      if (actual.length) { tramos.push(actual); actual = []; }
    } else {
      actual.push(p);
    }
  });
  if (actual.length) tramos.push(actual);

  // Sin palabras débiles no hay núcleo que separar.
  if (!tramos.length || tramos.length === 1 && tramos[0].length === palabras.length) {
    return '';
  }

  var mejor = '';
  tramos.forEach(function (t) {
    var frase = t.join(' ');
    if (frase.length > mejor.length) mejor = frase;
  });

  return mejor;
}

/* Clave fonética del español rioplatense.
   Colapsa las confusiones ortográficas que suenan igual, de modo que
   "RAÍZ", "RAIS", "RRAIZ" y "RAÍS" caigan todas en la misma clave.
   No es Soundex: conserva las vocales, porque en el análisis marcario
   la vocal cambia la impresión de conjunto. */
function claveFonetica(str) {
  var s = normalizar(str).replace(/\s+/g, '');
  if (!s) return '';

  s = s.replace(/ch/g, '\u0001');      // dígrafo propio, lo protegemos
  s = s.replace(/ll/g, 'y');
  s = s.replace(/qu([ei])/g, 'k$1');
  s = s.replace(/q/g, 'k');
  s = s.replace(/gu([ei])/g, 'g$1');   // u muda
  s = s.replace(/g([ei])/g, 'j$1');    // gente ~ jente
  s = s.replace(/c([eiy])/g, 's$1');   // cine ~ sine (seseo)
  s = s.replace(/c/g, 'k');            // casa ~ kasa
  s = s.replace(/z/g, 's');
  s = s.replace(/h/g, '');             // muda
  s = s.replace(/[vw]/g, 'b');
  s = s.replace(/^x/, 's').replace(/x/g, 'ks');
  s = s.replace(/y$/, 'i').replace(/y(?![aeiou])/g, 'i');
  s = s.replace(/(.)\1+/g, '$1');      // dobles: rr->r, nn->n, ss->s
  s = s.replace(/\u0001/g, 'ch');

  return s;
}

/* Variantes ortográficas para consultar al INPI.
   El INPI sólo hace match literal, así que la clave fonética no sirve
   como término de búsqueda: hay que preguntarle por escrituras
   concretas. Expandimos en anchura y cortamos en `max` para no
   dispararle decenas de consultas por cada búsqueda.

   Las reglas están acotadas al contexto donde la confusión existe de
   verdad: "z" suena como "c" sólo antes de e/i, y la "y" se escribe
   "ll" sólo cuando es consonante. Sin esas restricciones salían
   variantes impronunciables como RAIZ -> RAIC -> RALLZ, que gastan una
   consulta al INPI y no encuentran nada. */
var REGLAS = [
  [/z/g, 's'], [/s/g, 'z'],
  [/z([ei])/g, 'c$1'], [/c([eiy])/g, 's$1'], [/s([ei])/g, 'c$1'],
  [/b/g, 'v'], [/v/g, 'b'],
  [/c([aou])/g, 'k$1'], [/k/g, 'c'],
  [/qu([ei])/g, 'k$1'], [/k([ei])/g, 'qu$1'],
  [/gu([ei])/g, 'g$1'], [/g([ei])/g, 'j$1'], [/j([ei])/g, 'g$1'],
  [/ll/g, 'y'], [/y(?=[aeiou])/g, 'll'],
  [/i(?=[^aeiou]*$)/g, 'y'], [/y(?![aeiou])/g, 'i'],
  [/^h/, ''], [/h/g, '']
];

function generarVariantes(termino, max) {
  var base = sinSufijos(termino);
  if (!base) return [];

  var vistos = Object.create(null);
  var orden = [];

  function agregar(v) {
    v = v.replace(/\s+/g, ' ').trim();
    if (!v || vistos[v]) return;
    vistos[v] = true;
    orden.push(v);
  }

  agregar(base);

  // Dos pasadas: la primera da sustituciones simples, la segunda las
  // combina de a dos (GUISO -> GISO -> JISO).
  for (var pasada = 0; pasada < 2 && orden.length < max; pasada++) {
    var actuales = orden.slice();
    for (var i = 0; i < actuales.length && orden.length < max; i++) {
      for (var r = 0; r < REGLAS.length && orden.length < max; r++) {
        var cambiada = actuales[i].replace(REGLAS[r][0], REGLAS[r][1]);
        if (cambiada !== actuales[i]) agregar(cambiada);
      }
    }
  }

  return orden.slice(0, max);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  var fila = new Array(b.length + 1);
  for (var j = 0; j <= b.length; j++) fila[j] = j;

  for (var i = 1; i <= a.length; i++) {
    var previa = fila[0];
    fila[0] = i;
    for (var k = 1; k <= b.length; k++) {
      var temp = fila[k];
      fila[k] = Math.min(
        fila[k] + 1,
        fila[k - 1] + 1,
        previa + (a.charCodeAt(i - 1) === b.charCodeAt(k - 1) ? 0 : 1)
      );
      previa = temp;
    }
  }
  return fila[b.length];
}

function similitud(a, b) {
  if (!a || !b) return 0;
  var largo = Math.max(a.length, b.length);
  return Math.round((1 - levenshtein(a, b) / largo) * 100);
}

/* ---------------------------------------------------------------- */
/* Cliente INPI                                                      */
/* ---------------------------------------------------------------- */

function fechaWcf(valor) {
  if (typeof valor !== 'string') return null;
  var m = valor.match(/-?\d+/);
  if (!m) return null;
  var ms = parseInt(m[0], 10);
  if (!isFinite(ms) || ms === FECHA_NULA) return null;
  var d = new Date(ms);
  if (isNaN(d.getTime()) || d.getFullYear() < 1900) return null;
  return d.toISOString().slice(0, 10);
}

function resolverEstado(valor) {
  if (!valor) return { codigo: null, label: 'Sin dato', vigente: false };
  var crudo = String(valor).trim();
  var arriba = crudo.toUpperCase();

  if (ESTADOS[arriba]) {
    return { codigo: arriba, label: ESTADOS[arriba].label, vigente: ESTADOS[arriba].vigente };
  }
  var cod = ESTADOS_POR_LABEL[normalizar(crudo)];
  if (cod) {
    return { codigo: cod, label: ESTADOS[cod].label, vigente: ESTADOS[cod].vigente };
  }
  return { codigo: null, label: crudo, vigente: false };
}

async function pedirInpi(ruta, campos) {
  var cuerpo = new URLSearchParams();
  Object.keys(campos).forEach(function (k) {
    cuerpo.append(k, campos[k] == null ? '' : String(campos[k]));
  });

  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, CONFIG.TIMEOUT_MS);
  var err;

  try {
    var resp = await fetch(INPI.BASE + ruta, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'User-Agent': 'EstudioRaiz-MarcasBot/1.0 (+https://estudioraiz.com.ar)'
      },
      body: cuerpo.toString()
    });

    if (!resp.ok) {
      err = new Error('El INPI respondió ' + resp.status);
      err.codigo = 'INPI_HTTP';
      throw err;
    }

    var texto = await resp.text();
    var json;
    try {
      json = JSON.parse(texto);
    } catch (e) {
      err = new Error('El INPI devolvió algo que no es JSON (¿cambió el endpoint?)');
      err.codigo = 'INPI_FORMATO';
      throw err;
    }

    if (!json || !Array.isArray(json.rows)) {
      err = new Error('La respuesta del INPI no tiene el campo "rows" esperado');
      err.codigo = 'INPI_FORMATO';
      throw err;
    }

    return json;
  } catch (e) {
    if (e.name === 'AbortError') {
      err = new Error('El INPI no respondió en ' + CONFIG.TIMEOUT_MS + ' ms');
      err.codigo = 'INPI_TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function mapearFila(fila) {
  var estado = resolverEstado(fila.Estado);
  var vencimiento = fechaWcf(fila.Fecha_Vencimiento);
  var vencida = vencimiento ? new Date(vencimiento) < new Date() : false;

  return {
    acta: fila.Acta,
    denominacion: String(fila.Denominacion || '').trim(),
    titular: String(fila.Titulares || '').trim() || null,
    clase: fila.Clase,
    tipoMarca: fila.Tipo_Marca || null,
    numeroResolucion: fila.Numero_Resolucion || null,
    estado: {
      codigo: estado.codigo,
      label: estado.label,
      // Una concedida cuyo vencimiento ya pasó no está vigente aunque
      // el INPI no haya corrido todavía el estado a "Caduca".
      vigente: estado.vigente && !(estado.codigo === 'C' && vencida)
    },
    fechaIngreso: fechaWcf(fila.Fecha_Ingreso),
    fechaVencimiento: vencimiento,
    vencida: vencida
  };
}

/* Ejecuta las consultas de a tandas, respetando el presupuesto de
   tiempo del handler. Si se acaba, devuelve lo que llegó y avisa. */
async function correrEnTandas(tareas, limite, deadline) {
  var salida = [];
  var truncado = false;

  for (var i = 0; i < tareas.length; i += limite) {
    if (Date.now() > deadline) { truncado = true; break; }
    var tanda = tareas.slice(i, i + limite);
    var resultados = await Promise.allSettled(tanda.map(function (t) { return t(); }));
    for (var j = 0; j < resultados.length; j++) salida.push(resultados[j]);
  }

  return { resultados: salida, truncado: truncado };
}

/* ---------------------------------------------------------------- */
/* Puntuación de coincidencias                                       */
/* ---------------------------------------------------------------- */

function escaparRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clasificar(consultaNorm, consultaFon, item) {
  var denomNorm = sinSufijos(item.denominacion);
  var denomFon = claveFonetica(item.denominacion);

  var sim = similitud(consultaFon, denomFon);
  var contenida = denomFon.indexOf(consultaFon) !== -1 ||
                  consultaFon.indexOf(denomFon) !== -1;

  // ¿La marca consultada aparece como palabra entera de la otra?
  // "RAIZ" dentro de "LA RAIZ DE LA VIDA" sí; dentro de "RAIZAL" no.
  var esPalabra = consultaNorm
    ? new RegExp('(^|\\s)' + escaparRegExp(consultaNorm) + '($|\\s)').test(denomNorm)
    : false;

  var difLargo = Math.abs(consultaFon.length - denomFon.length);
  var tipo;

  if (denomNorm === consultaNorm) {
    tipo = 'identica';
    sim = 100;
  } else if (denomFon === consultaFon) {
    tipo = 'identica-fonetica';
    sim = 100;
  } else if (sim >= 80) {
    tipo = 'similar';
  } else if (contenida) {
    tipo = 'contiene';
    // Cuanto más diluida está la marca consultada dentro de la otra,
    // menos peso tiene: "RAIZ" pesa más en "RAIZAL" que en
    // "LA RAIZ DE LA VIDA".
    sim = Math.max(sim, Math.round(
      (Math.min(consultaFon.length, denomFon.length) /
       Math.max(consultaFon.length, denomFon.length)) * 100
    ));
  } else {
    tipo = 'parcial';
  }

  var identica = tipo === 'identica' || tipo === 'identica-fonetica';
  var vigente = item.estado.vigente;
  var riesgo;

  if (identica && vigente) riesgo = 'alto';
  else if (sim >= 88 && vigente) riesgo = 'alto';
  else if (identica) riesgo = 'medio';
  else if (sim >= 70 && vigente) riesgo = 'medio';
  // Una marca vigente que absorbe entera a la consultada (como palabra
  // suelta, o sumándole apenas un par de letras) es un antecedente que
  // hay que mirar sí o sí, aunque la distancia de edición la castigue.
  else if (tipo === 'contiene' && vigente && (esPalabra || difLargo <= 3)) riesgo = 'medio';
  else riesgo = 'bajo';

  return {
    tipo: tipo,
    similitud: sim,
    riesgo: riesgo,
    palabraEntera: esPalabra
  };
}

var PESO_RIESGO = { alto: 3, medio: 2, bajo: 1 };

/* Puntúa contra varias referencias —el término completo y su núcleo
   distintivo— y se queda con la peor noticia.

   No se descuenta nada por haber coincidido sólo con el núcleo: si
   RAIZ está registrada, ESTUDIO RAIZ arrastra el conflicto igual,
   porque "estudio" no aporta distintividad. */
function clasificarContra(referencias, item) {
  var mejor = null;

  referencias.forEach(function (ref) {
    var c = clasificar(ref.norm, ref.fon, item);
    c.contra = ref.etiqueta;

    if (!mejor ||
        PESO_RIESGO[c.riesgo] > PESO_RIESGO[mejor.riesgo] ||
        (PESO_RIESGO[c.riesgo] === PESO_RIESGO[mejor.riesgo] &&
         c.similitud > mejor.similitud)) {
      mejor = c;
    }
  });

  return mejor;
}

/* ---------------------------------------------------------------- */
/* Caché y rate limit (por instancia; best effort en serverless)      */
/* ---------------------------------------------------------------- */

var cache = new Map();

function cacheLeer(clave) {
  var hit = cache.get(clave);
  if (!hit) return null;
  if (Date.now() > hit.expira) { cache.delete(clave); return null; }
  // Refresca la posición para que el descarte sea LRU y no FIFO.
  cache.delete(clave);
  cache.set(clave, hit);
  return hit.valor;
}

function cacheEscribir(clave, valor) {
  if (cache.size >= CONFIG.CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(clave, { valor: valor, expira: Date.now() + CONFIG.CACHE_TTL_MS });
}

var cuotas = new Map();

function superaCuota(ip) {
  var ahora = Date.now();
  var reg = cuotas.get(ip);

  if (!reg || ahora > reg.reset) {
    cuotas.set(ip, { n: 1, reset: ahora + CONFIG.RATE_WINDOW_MS });
    if (cuotas.size > 5000) {
      cuotas.forEach(function (v, k) { if (ahora > v.reset) cuotas.delete(k); });
    }
    return false;
  }

  reg.n++;
  return reg.n > CONFIG.RATE_MAX;
}

/* ---------------------------------------------------------------- */
/* Utilidades de request                                             */
/* ---------------------------------------------------------------- */

function aFechaInpi(valor) {
  if (!valor) return '';
  var v = String(valor).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;             // ya viene dd/mm/aaaa
  var iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
  return '';
}

function entero(valor, def, min, max) {
  var n = parseInt(valor, 10);
  if (!isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function parsearClases(valor) {
  if (valor == null || valor === '' || valor === '-1' || valor === 'todas') return [-1];
  var clases = String(valor)
    .split(',')
    .map(function (c) { return parseInt(c.trim(), 10); })
    .filter(function (c) { return isFinite(c) && c >= 1 && c <= 45; });
  if (!clases.length) return [-1];
  return Array.from(new Set(clases)).slice(0, CONFIG.MAX_CLASES);
}

function ipDe(req) {
  var fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.headers['x-real-ip'] ||
         (req.socket && req.socket.remoteAddress) || 'desconocida';
}

function aplicarCors(req, res) {
  var permitidos = String(process.env.MARCAS_ALLOWED_ORIGINS || '')
    .split(',').map(function (o) { return o.trim(); }).filter(Boolean);
  var origen = req.headers.origin;

  res.setHeader('Vary', 'Origin');
  if (origen && permitidos.indexOf(origen) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  }
}

function autorizado(req) {
  var clave = process.env.MARCAS_API_KEY;
  if (!clave) return true;
  if (req.headers['sec-fetch-site'] === 'same-origin') return true;
  return req.headers['x-api-key'] === clave;
}

function error(res, status, codigo, mensaje, extra) {
  res.status(status).json(Object.assign({
    error: { codigo: codigo, mensaje: mensaje }
  }, extra || {}));
}

function fuente() {
  return {
    origen: 'INPI — Instituto Nacional de la Propiedad Industrial (Argentina)',
    endpoint: INPI.BASE + '/marcasconsultas/busqueda',
    consultadoEn: new Date().toISOString(),
    advertencia: 'Búsqueda literal sobre la base pública del INPI, con variantes ' +
      'ortográficas agregadas por Estudio Raíz. NO equivale a la búsqueda fonética ' +
      'oficial ni a un informe de antecedentes: el resultado es orientativo.'
  };
}

function aCsv(payload) {
  var cols = ['acta', 'denominacion', 'titular', 'clase', 'tipoMarca', 'estado',
              'vigente', 'fechaIngreso', 'fechaVencimiento', 'numeroResolucion',
              'coincidencia', 'similitud', 'riesgo'];

  function celda(v) {
    if (v == null) return '';
    var s = String(v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  var filas = payload.resultados.map(function (r) {
    return [
      r.acta, r.denominacion, r.titular, r.clase, r.tipoMarca, r.estado.label,
      r.estado.vigente ? 'si' : 'no', r.fechaIngreso, r.fechaVencimiento,
      r.numeroResolucion,
      r.coincidencia ? r.coincidencia.tipo : '',
      r.coincidencia ? r.coincidencia.similitud : '',
      r.coincidencia ? r.coincidencia.riesgo : ''
    ].map(celda).join(';');
  });

  // BOM + punto y coma: así Excel en es-AR abre el archivo derecho.
  return '\ufeff' + cols.join(';') + '\n' + filas.join('\n') + '\n';
}

function enviarCsv(res, payload) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    'attachment; filename="marcas-inpi-' + new Date().toISOString().slice(0, 10) + '.csv"');
  return res.status(200).send(aCsv(payload));
}

/* ---------------------------------------------------------------- */
/* Handler                                                           */
/* ---------------------------------------------------------------- */

module.exports = async function handler(req, res) {
  aplicarCors(req, res);

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return error(res, 405, 'METODO_NO_PERMITIDO', 'Esta API sólo acepta GET.');
  }
  if (!autorizado(req)) {
    return error(res, 401, 'NO_AUTORIZADO', 'Falta el header x-api-key.');
  }
  if (superaCuota(ipDe(req))) {
    res.setHeader('Retry-After', '60');
    return error(res, 429, 'CUOTA_EXCEDIDA',
      'Demasiadas consultas seguidas. Probá de nuevo en un minuto.');
  }

  var q = req.query || {};
  var deadline = Date.now() + CONFIG.BUDGET_MS;

  try {
    /* --- Búsqueda puntual por acta o resolución --- */
    if (q.acta || q.resolucion) {
      var claveP = 'puntual:' + (q.acta || '') + ':' + (q.resolucion || '');
      var cacheadoP = cacheLeer(claveP);

      if (!cacheadoP) {
        var jsonP = await pedirInpi(INPI.PUNTUAL, {
          Acta: q.acta || '',
          Resolucion: q.resolucion || ''
        });
        cacheadoP = {
          consulta: {
            acta: q.acta || null,
            resolucion: q.resolucion || null,
            modo: 'puntual'
          },
          total: typeof jsonP.total === 'number' ? jsonP.total : jsonP.rows.length,
          resultados: jsonP.rows.map(mapearFila),
          fuente: fuente()
        };
        cacheEscribir(claveP, cacheadoP);
        res.setHeader('X-Cache', 'MISS');
      } else {
        res.setHeader('X-Cache', 'HIT');
      }

      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      if (q.formato === 'csv') return enviarCsv(res, cacheadoP);
      return res.status(200).json(cacheadoP);
    }

    /* --- Búsqueda por denominación y/o titular --- */
    var termino = String(q.q || q.denominacion || '').trim();
    var titular = String(q.titular || '').trim();

    if (!termino && !titular) {
      return error(res, 400, 'FALTA_TERMINO',
        'Indicá q (denominación), titular, o acta.', {
          ejemplo: '/api/marcas?q=raiz&clase=35&foneticas=1'
        });
    }
    if (termino && termino.length < 3) {
      return error(res, 400, 'TERMINO_CORTO',
        'La denominación necesita al menos 3 caracteres.');
    }

    var modo = q.modo === 'empieza' ? 0 : 1;
    var modoTitular = q.modoTitular === 'empieza' ? 0 : 1;
    var clases = parsearClases(q.clase);

    var estado = String(q.estado || '').trim().toUpperCase();
    if (estado === 'TODAS') estado = '';
    if (estado && !ESTADOS[estado]) {
      return error(res, 400, 'ESTADO_INVALIDO',
        'Estado desconocido: ' + estado, { valores: Object.keys(ESTADOS) });
    }

    var soloVigentes = q.vigentes === '1' || q.vigentes === 'true';
    var limit = entero(q.limit, CONFIG.LIMIT_DEFAULT, 1, CONFIG.LIMIT_MAX);
    var offset = entero(q.offset, 0, 0, 100000);
    var porVariante = entero(q.porVariante, CONFIG.POR_VARIANTE, 1, CONFIG.POR_VARIANTE_MAX);
    var quiereFoneticas = !!termino && q.foneticas !== '0' && q.foneticas !== 'false';

    var terminoNorm = sinSufijos(termino);
    var terminoFon = claveFonetica(termino);

    /* El INPI ordena las filas por número de acta —o sea, de la más
       vieja a la más nueva— y no expone ningún parámetro de orden por
       relevancia. Con "contiene" sobre un término corto eso es un
       problema real: RAIZ da más de 400 resultados, y como sólo podemos
       traernos las primeras N, lo que llega son marcas de los años 80 ya
       caducas, mientras la RAIZ concedida y vigente de 2021 queda afuera.

       Por eso hacemos dos pasadas por variante:

         A. "empieza con" + vigentes  → el conjunto chico que importa:
            antecedentes que hoy pueden bloquear un registro.
         B. "contiene" + lo que pidió → el panorama amplio, histórico
            quien consulta          incluido.

       Duplica las consultas, así que el cupo de variantes se calcula
       sobre el presupuesto dividido por la cantidad de pasadas. */
    var pasadas = (quiereFoneticas && modo === 1)
      ? [{ modo: 0, vigentes: true }, { modo: 1, vigentes: soloVigentes }]
      : [{ modo: modo, vigentes: soloVigentes }];

    /* Segundo frente: el núcleo distintivo.
       Buscar sólo la frase completa da falsos negativos graves —
       "ESTUDIO RAIZ" no figura en la base, "RAIZ" sí y vigente— así que
       cuando el término trae palabras débiles, el núcleo se busca
       aparte y se reparte el presupuesto entre los dos. */
    var nucleo = quiereFoneticas ? nucleoDistintivo(termino) : '';
    var frentes = nucleo && nucleo !== terminoNorm
      ? [{ etiqueta: 'completo', termino: terminoNorm },
         { etiqueta: 'nucleo', termino: nucleo }]
      : [{ etiqueta: 'completo', termino: terminoNorm }];

    var cupoVariantes = Math.max(1, Math.min(
      CONFIG.MAX_VARIANTES,
      Math.floor(CONFIG.MAX_CONSULTAS /
        (clases.length * pasadas.length * frentes.length))
    ));

    // Referencias contra las que se puntúa cada resultado.
    var referencias = frentes.map(function (f) {
      return {
        etiqueta: f.etiqueta,
        norm: f.termino,
        fon: claveFonetica(f.termino)
      };
    });

    // Lista plana de {texto, frente} para armar las consultas.
    var variantes;
    if (!termino) {
      variantes = [{ texto: '', frente: 'completo' }];
    } else if (quiereFoneticas) {
      variantes = [];
      frentes.forEach(function (f) {
        generarVariantes(f.termino, cupoVariantes).forEach(function (v) {
          variantes.push({ texto: v, frente: f.etiqueta });
        });
      });
    } else {
      variantes = [{ texto: terminoNorm, frente: 'completo' }];
    }

    var comunes = {
      Tipo_Resolucion: estado,
      Titular: titular,
      TipoBusquedaTitular: modoTitular,
      Fecha_IngresoDesde: aFechaInpi(q.desdeIngreso),
      Fecha_IngresoHasta: aFechaInpi(q.hastaIngreso),
      Fecha_ResolucionDesde: aFechaInpi(q.desdeResolucion),
      Fecha_ResolucionHasta: aFechaInpi(q.hastaResolucion)
    };

    // Caso simple (una sola consulta): paginamos contra el INPI y
    // devolvemos su total real, sin mezclar nada.
    var pasaDirecto = variantes.length === 1 && clases.length === 1 &&
                      pasadas.length === 1;

    var claveCache = JSON.stringify([
      variantes, clases, pasadas, comunes, limit, offset, porVariante, pasaDirecto
    ]);
    var cacheado = cacheLeer(claveCache);
    if (cacheado) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      if (q.formato === 'csv') return enviarCsv(res, cacheado);
      return res.status(200).json(cacheado);
    }

    // La pasada va en el bucle externo a propósito: si el presupuesto de
    // tiempo se corta a mitad de camino, preferimos haber completado el
    // barrido de vigentes —chico y decisivo— antes que el histórico.
    var tareas = [];
    pasadas.forEach(function (pasada) {
      variantes.forEach(function (variante) {
        clases.forEach(function (clase) {
          tareas.push(function () {
            return pedirInpi(INPI.AVANZADA, Object.assign({}, comunes, {
              Clase: clase,
              Denominacion: variante.texto,
              TipoBusquedaDenominacion: pasada.modo,
              vigentes: pasada.vigentes ? 'true' : 'false',
              limit: pasaDirecto ? limit : porVariante,
              offset: pasaDirecto ? offset : 0
            })).then(function (json) {
              return {
                variante: variante, clase: clase,
                pasada: pasada, json: json
              };
            });
          });
        });
      });
    });

    var corrida = await correrEnTandas(tareas, CONFIG.CONCURRENCIA, deadline);

    var fallos = corrida.resultados.filter(function (r) { return r.status === 'rejected'; });
    var exitos = corrida.resultados.filter(function (r) { return r.status === 'fulfilled'; });

    if (!exitos.length) {
      var motivo = fallos.length ? fallos[0].reason : new Error('Sin respuesta del INPI');
      return error(res, 502, motivo.codigo || 'INPI_ERROR',
        'No se pudo consultar la base del INPI: ' + motivo.message);
    }

    // Merge por acta: una misma marca puede llegar por varias variantes.
    var porActa = new Map();
    var totalesPorVariante = {};
    var totalInpi = 0;

    exitos.forEach(function (r) {
      var v = r.value;
      var etiqueta = (v.variante.texto || '(sin denominación)') +
        (pasadas.length > 1
          ? ' · ' + (v.pasada.modo === 0 ? 'empieza+vigentes' : 'contiene') : '') +
        (clases.length > 1 ? ' · cl.' + (v.clase === -1 ? 'todas' : v.clase) : '');

      totalesPorVariante[etiqueta] = v.json.total || 0;
      // La pasada de vigentes es un subconjunto de la amplia, y el
      // núcleo se solapa con el término completo: sumar todo inflaría el
      // total. Contamos sólo la combinación que pidió quien consulta.
      if (v.pasada.modo === modo && v.pasada.vigentes === soloVigentes &&
          v.variante.frente === 'completo') {
        totalInpi += v.json.total || 0;
      }

      v.json.rows.forEach(function (fila) {
        var item = porActa.get(fila.Acta);
        if (!item) {
          item = mapearFila(fila);
          item.variantes = [];
          item.frentes = [];
          porActa.set(fila.Acta, item);
        }
        if (v.variante.texto && item.variantes.indexOf(v.variante.texto) === -1) {
          item.variantes.push(v.variante.texto);
        }
        if (item.frentes.indexOf(v.variante.frente) === -1) {
          item.frentes.push(v.variante.frente);
        }
      });
    });

    var items = Array.from(porActa.values());

    // Puntuamos sólo si hubo término denominativo: una búsqueda por
    // titular no tiene contra qué comparar.
    if (termino) {
      items.forEach(function (item) {
        item.coincidencia = clasificarContra(referencias, item);
      });
      items.sort(function (a, b) {
        var dr = PESO_RIESGO[b.coincidencia.riesgo] - PESO_RIESGO[a.coincidencia.riesgo];
        if (dr) return dr;
        var ds = b.coincidencia.similitud - a.coincidencia.similitud;
        if (ds) return ds;
        var dv = (b.estado.vigente ? 1 : 0) - (a.estado.vigente ? 1 : 0);
        if (dv) return dv;
        return a.clase - b.clase;
      });
    } else {
      items.sort(function (a, b) { return b.acta - a.acta; });
    }

    var pagina = pasaDirecto ? items : items.slice(offset, offset + limit);

    var resumen = {
      riesgo: 'bajo', identicas: 0, similares: 0, vigentes: 0,
      porClase: {}, porFrente: { completo: 0, nucleo: 0 }
    };

    items.forEach(function (item) {
      if (item.estado.vigente) resumen.vigentes++;
      resumen.porClase[item.clase] = (resumen.porClase[item.clase] || 0) + 1;
      if (!item.coincidencia) return;

      if (item.coincidencia.tipo === 'identica' ||
          item.coincidencia.tipo === 'identica-fonetica') resumen.identicas++;
      else if (item.coincidencia.tipo === 'similar') resumen.similares++;

      if (item.coincidencia.contra) {
        resumen.porFrente[item.coincidencia.contra]++;
      }

      if (PESO_RIESGO[item.coincidencia.riesgo] > PESO_RIESGO[resumen.riesgo]) {
        resumen.riesgo = item.coincidencia.riesgo;
      }
    });

    var payload = {
      consulta: {
        termino: termino || null,
        normalizado: terminoNorm || null,
        claveFonetica: terminoFon || null,
        // Núcleo distintivo, si el término traía palabras débiles.
        nucleo: nucleo || null,
        // Siempre las devolvemos, aunque no haya expansión fonética: es
        // el término tal como se le pidió al INPI, ya normalizado.
        variantes: variantes.map(function (v) { return v.texto; }),
        variantesPorFrente: frentes.reduce(function (acc, f) {
          acc[f.etiqueta] = variantes
            .filter(function (v) { return v.frente === f.etiqueta; })
            .map(function (v) { return v.texto; });
          return acc;
        }, {}),
        titular: titular || null,
        modo: modo === 0 ? 'empieza' : 'contiene',
        clases: clases,
        estado: estado || null,
        soloVigentes: soloVigentes,
        foneticas: quiereFoneticas,
        pasadas: pasadas.map(function (p) {
          return (p.modo === 0 ? 'empieza' : 'contiene') + (p.vigentes ? '+vigentes' : '');
        }),
        consultasAlInpi: tareas.length,
        limit: limit,
        offset: offset
      },
      total: pasaDirecto
        ? (typeof exitos[0].value.json.total === 'number'
            ? exitos[0].value.json.total : items.length)
        : items.length,
      // Sólo se puede paginar de verdad cuando hubo una única consulta:
      // en cuanto se mezclan variantes o clases, el offset del INPI deja
      // de tener sentido sobre el conjunto ya fusionado.
      paginable: pasaDirecto,
      totalInpi: totalInpi,
      totalesPorVariante: totalesPorVariante,
      resultados: pagina,
      resumen: termino ? resumen : null,
      parcial: corrida.truncado || fallos.length > 0,
      avisos: [].concat(
        nucleo
          ? ['El término trae palabras de bajo carácter distintivo, así que ' +
             'además de la frase completa se buscó su núcleo: "' + nucleo + '". ' +
             'Los antecedentes marcados "vs. núcleo" no contienen la denominación ' +
             'entera, pero comparten el elemento que la distingue.'] : [],
        corrida.truncado
          ? ['Se agotó el tiempo disponible: quedaron variantes sin consultar.'] : [],
        fallos.length
          ? [fallos.length + ' de ' + tareas.length + ' consultas al INPI fallaron.'] : [],
        !pasaDirecto
          ? ['"total" cuenta las coincidencias efectivamente recuperadas (hasta ' +
             porVariante + ' por consulta), no el universo completo del INPI. ' +
             '"totalInpi" es la suma de los totales que informó el INPI por cada ' +
             'variante, con solapamientos: sirve como orden de magnitud, no como conteo.']
          : []
      ),
      fuente: fuente()
    };

    cacheEscribir(claveCache, payload);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    if (q.formato === 'csv') return enviarCsv(res, payload);
    return res.status(200).json(payload);

  } catch (e) {
    var codigo = e.codigo || 'ERROR_INTERNO';
    return error(res, codigo === 'ERROR_INTERNO' ? 500 : 502, codigo, e.message);
  }
};

// Índice inverso de estados: el endpoint puntual devuelve la etiqueta.
Object.keys(ESTADOS).forEach(function (cod) {
  ESTADOS_POR_LABEL[normalizar(ESTADOS[cod].label)] = cod;
});

// Exportado para poder probar la fonética sin levantar el servidor.
module.exports.internals = {
  CONFIG: CONFIG,
  normalizar: normalizar,
  sinSufijos: sinSufijos,
  nucleoDistintivo: nucleoDistintivo,
  claveFonetica: claveFonetica,
  clasificarContra: clasificarContra,
  generarVariantes: generarVariantes,
  similitud: similitud,
  clasificar: clasificar,
  fechaWcf: fechaWcf,
  mapearFila: mapearFila,
  aFechaInpi: aFechaInpi,
  parsearClases: parsearClases,
  aCsv: aCsv
};

/* ==================================================================
   ESTUDIO RAÍZ — Consola interna de consulta de marcas
   ------------------------------------------------------------------
   Cliente de /api/marcas. Sin dependencias ni build step, igual que
   el resto del sitio.

   Índice
   01. Utilidades
   02. Clases de Niza
   03. Estado y armado de la consulta
   04. Render de resultados
   05. Eventos
   =================================================================== */

(function () {
  'use strict';

  /* ================================================================
     01. UTILIDADES
     ================================================================ */
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };

  var form       = $('#form');
  var btnBuscar  = $('#btnBuscar');
  var btnLimpiar = $('#btnLimpiar');
  var btnCsv     = $('#btnCsv');
  var hint       = $('#hint');
  var salida     = $('#salida');
  var resumenBox = $('#resumen');
  var avisosBox  = $('#avisos');
  var metaBox    = $('#meta');
  var tbody      = $('#tbody');
  var vacio      = $('#vacio');
  var paginado   = $('#paginado');
  var btnPrev    = $('#btnPrev');
  var btnNext    = $('#btnNext');
  var paginaInfo = $('#paginaInfo');
  var filtros    = $('#filtros');
  var frmDetalle = $('#frmDetalle');

  var LIMITE = 50;   // filas por página en la tabla

  function txt(valor) {
    return valor == null || valor === '' ? '—' : String(valor);
  }

  // dd/mm/aaaa: el formato con el que trabaja el estudio.
  function fecha(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  }

  function crear(tag, clase, contenido) {
    var el = document.createElement(tag);
    if (clase) el.className = clase;
    if (contenido != null) el.textContent = contenido;
    return el;
  }

  function mostrarHint(mensaje, esError) {
    hint.textContent = mensaje || '';
    hint.classList.toggle('is-error', !!esError);
  }

  function cargando(activo) {
    btnBuscar.classList.toggle('is-loading', activo);
    $('.btn-label', btnBuscar).textContent = activo ? 'Consultando al INPI…' : 'Buscar';
  }

  function mostrarVacio(titulo, detalle, esError) {
    salida.hidden = true;
    vacio.hidden = false;
    vacio.classList.toggle('estado-vacio--error', !!esError);
    vacio.innerHTML = '';
    vacio.appendChild(crear('strong', null, titulo));
    if (detalle) vacio.appendChild(document.createTextNode(detalle));
  }


  /* ================================================================
     02. CLASES DE NIZA
     ----------------------------------------------------------------
     Títulos resumidos, sólo como ayuda para elegir en el formulario.
     El listado oficial de productos y servicios es más extenso y es
     el que manda a la hora de presentar.
     ================================================================ */
  var NIZA = [
    'Productos químicos',
    'Pinturas, barnices y colorantes',
    'Cosmética, perfumería y limpieza',
    'Aceites y grasas industriales; combustibles',
    'Productos farmacéuticos y sanitarios',
    'Metales comunes y sus aleaciones',
    'Máquinas y máquinas herramienta',
    'Herramientas manuales',
    'Aparatos científicos, informática y software',
    'Aparatos e instrumentos médicos',
    'Alumbrado, calefacción y refrigeración',
    'Vehículos y medios de locomoción',
    'Armas de fuego; explosivos',
    'Metales preciosos, joyería y relojería',
    'Instrumentos musicales',
    'Papelería, publicaciones y artículos de oficina',
    'Caucho, plásticos semielaborados; aislantes',
    'Cuero, marroquinería y paraguas',
    'Materiales de construcción no metálicos',
    'Muebles y artículos de mobiliario',
    'Utensilios y recipientes para el hogar',
    'Cuerdas, redes, toldos y sacos',
    'Hilos e hilados para uso textil',
    'Tejidos y ropa de hogar',
    'Prendas de vestir, calzado y sombrerería',
    'Encajes, bordados, botones y adornos',
    'Alfombras y revestimientos de suelos',
    'Juegos, juguetes y artículos de deporte',
    'Carnes, lácteos y alimentos procesados',
    'Café, harinas, pan, azúcar y condimentos',
    'Productos agrícolas; animales vivos',
    'Cervezas, aguas y bebidas sin alcohol',
    'Bebidas alcohólicas (excepto cervezas)',
    'Tabaco y artículos para fumadores',
    'Publicidad, gestión de negocios y venta minorista',
    'Servicios financieros, de seguros e inmobiliarios',
    'Construcción, reparación e instalación',
    'Telecomunicaciones',
    'Transporte, almacenamiento y viajes',
    'Tratamiento de materiales',
    'Educación, formación y entretenimiento',
    'Servicios científicos, tecnológicos y de software',
    'Restauración y hospedaje',
    'Servicios médicos, veterinarios, belleza y agricultura',
    'Servicios jurídicos, de seguridad y personales'
  ];

  (function armarDatalist() {
    var lista = $('#clasesNiza');
    var frag = document.createDocumentFragment();
    NIZA.forEach(function (titulo, i) {
      var op = document.createElement('option');
      op.value = String(i + 1);
      op.label = (i + 1) + ' — ' + titulo;
      op.textContent = titulo;
      frag.appendChild(op);
    });
    lista.appendChild(frag);
  })();


  /* ================================================================
     03. ESTADO Y ARMADO DE LA CONSULTA
     ================================================================ */
  var estado = {
    datos: null,        // último payload de la API
    offset: 0,
    filtroRiesgo: 'todos',
    ultimaQuery: null   // querystring, para reusar en el CSV
  };

  function armarQuery(offset) {
    var d = new FormData(form);
    var p = new URLSearchParams();

    var acta = String(d.get('acta') || '').trim();
    if (acta) {
      p.set('acta', acta);
      return p;
    }

    var q = String(d.get('q') || '').trim();
    var titular = String(d.get('titular') || '').trim();
    if (q) p.set('q', q);
    if (titular) p.set('titular', titular);

    if (d.get('modo') === 'empieza') p.set('modo', 'empieza');
    if (d.get('modoTitular') === 'empieza') p.set('modoTitular', 'empieza');

    var clase = String(d.get('clase') || '').trim();
    if (clase) p.set('clase', clase);

    var est = String(d.get('estado') || '');
    if (est) p.set('estado', est);

    ['desdeIngreso', 'hastaIngreso'].forEach(function (campo) {
      var v = String(d.get(campo) || '');
      if (v) p.set(campo, v);
    });

    if (!d.get('foneticas')) p.set('foneticas', '0');
    if (d.get('vigentes')) p.set('vigentes', '1');

    p.set('limit', String(LIMITE));
    p.set('offset', String(offset || 0));

    return p;
  }

  async function buscar(offset) {
    var p = armarQuery(offset);

    if (!p.get('q') && !p.get('titular') && !p.get('acta')) {
      mostrarHint('Completá una denominación, un titular o un número de acta.', true);
      return;
    }
    if (p.get('q') && p.get('q').length < 3) {
      mostrarHint('La denominación necesita al menos 3 caracteres.', true);
      return;
    }

    mostrarHint('');
    cargando(true);
    btnCsv.disabled = true;

    var t0 = performance.now();

    try {
      var resp = await fetch('/api/marcas?' + p.toString(), {
        headers: { 'Accept': 'application/json' }
      });
      var datos = await resp.json();

      if (!resp.ok) {
        mostrarVacio(
          'No se pudo completar la consulta',
          (datos.error && datos.error.mensaje) || ('Error ' + resp.status),
          true
        );
        mostrarHint((datos.error && datos.error.codigo) || 'ERROR', true);
        return;
      }

      estado.datos = datos;
      estado.offset = offset || 0;
      estado.ultimaQuery = p.toString();

      render(datos, Math.round(performance.now() - t0));

    } catch (e) {
      mostrarVacio('No se pudo contactar la API', e.message, true);
      mostrarHint('Fallo de red', true);
    } finally {
      cargando(false);
    }
  }


  /* ================================================================
     04. RENDER DE RESULTADOS
     ================================================================ */
  function render(datos, ms) {
    var filas = datos.resultados || [];

    if (!filas.length) {
      mostrarVacio(
        'Sin coincidencias',
        'El INPI no devolvió resultados para estos parámetros. ' +
        'Probá con "contiene" en vez de "empieza con", o sacando el filtro de clase.'
      );
      btnCsv.disabled = true;
      return;
    }

    vacio.hidden = true;
    salida.hidden = false;

    renderResumen(datos, ms);
    renderAvisos(datos);
    renderTabla(filas);
    renderPaginado(datos, filas.length);
    aplicarFiltro();

    btnCsv.disabled = false;
  }

  function renderResumen(datos, ms) {
    resumenBox.innerHTML = '';

    var r = datos.resumen;
    var c = datos.consulta || {};

    function tarjeta(rotulo, valor, detalle, modificador) {
      var dl = crear('dl', 'tarjeta' + (modificador ? ' tarjeta--' + modificador : ''));
      dl.appendChild(crear('dt', null, rotulo));
      var dd = crear('dd', null, valor);
      if (detalle) dd.appendChild(crear('small', null, detalle));
      dl.appendChild(dd);
      resumenBox.appendChild(dl);
    }

    if (r) {
      var etiquetaRiesgo = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }[r.riesgo] || '—';
      var explica = {
        alto:  'Hay antecedentes vigentes idénticos o casi idénticos.',
        medio: 'Hay antecedentes que conviene analizar antes de avanzar.',
        bajo:  'Nada que se parezca de forma directa entre lo recuperado.'
      }[r.riesgo];

      tarjeta('Riesgo observado', etiquetaRiesgo, explica, r.riesgo);
      tarjeta('Idénticas o casi', String(r.identicas),
        r.similares + ' similares además');
      tarjeta('Vigentes', String(r.vigentes),
        'de ' + datos.total + ' antecedentes recuperados');

      // Si el término tenía palabras débiles, cuánto pesa el núcleo es
      // la pregunta importante: ahí está el conflicto real.
      if (c.nucleo) {
        tarjeta('Núcleo distintivo', c.nucleo,
          (r.porFrente ? r.porFrente.nucleo : 0) + ' antecedentes llegaron por él');
      }
    } else {
      tarjeta('Antecedentes', String(datos.total), 'recuperados del INPI');
    }

    // En la consulta puntual por acta no hay variantes que reportar:
    // esta tarjeta sólo aporta cuando hubo búsqueda denominativa.
    if (c.variantes && c.variantes.length) {
      var detalle = [];
      if (c.variantes.length > 1) detalle.push(c.variantes.join(' · '));
      if (c.consultasAlInpi) {
        detalle.push(c.consultasAlInpi + ' consultas al INPI · ' + ms + ' ms');
      }
      tarjeta(
        c.foneticas ? 'Variantes consultadas' : 'Término consultado',
        c.foneticas ? String(c.variantes.length) : c.variantes[0],
        detalle.join(' — ')
      );
    }
  }

  function renderAvisos(datos) {
    var avisos = (datos.avisos || []).slice();
    if (datos.parcial) {
      avisos.unshift('Resultado parcial: no se completaron todas las consultas al INPI.');
    }

    if (!avisos.length) { avisosBox.hidden = true; return; }

    avisosBox.hidden = false;
    avisosBox.innerHTML = '';
    var ul = crear('ul');
    avisos.forEach(function (a) { ul.appendChild(crear('li', null, a)); });
    avisosBox.appendChild(ul);
  }

  function renderTabla(filas) {
    tbody.innerHTML = '';
    var frag = document.createDocumentFragment();

    filas.forEach(function (f) {
      var co = f.coincidencia || {};
      var tr = document.createElement('tr');
      tr.dataset.riesgo = co.riesgo || 'bajo';

      // Riesgo
      var tdR = crear('td');
      if (co.riesgo) {
        tdR.appendChild(crear('span', 'pill pill--' + co.riesgo,
          { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }[co.riesgo]));
      } else {
        tdR.textContent = '—';
      }
      tr.appendChild(tdR);

      // Acta — abre el expediente en el portal del INPI
      var tdA = crear('td', 'td-num');
      var btn = crear('button', 'acta-link', String(f.acta));
      btn.type = 'button';
      btn.dataset.acta = String(f.acta);
      btn.title = 'Abrir el expediente en el portal del INPI';
      tdA.appendChild(btn);
      tr.appendChild(tdA);

      tr.appendChild(crear('td', 'td-denom', f.denominacion));
      tr.appendChild(crear('td', 'td-titular', txt(f.titular)));
      tr.appendChild(crear('td', 'td-num', String(f.clase)));
      tr.appendChild(crear('td', null, txt(f.tipoMarca)));

      // Estado + vigencia
      var tdE = crear('td');
      tdE.appendChild(crear('span', 'estado-txt', f.estado.label));
      tdE.appendChild(document.createElement('br'));
      tdE.appendChild(crear(
        'span',
        'estado-txt ' + (f.estado.vigente ? 'estado-txt--vig' : 'estado-txt--no'),
        f.estado.vigente ? 'vigente' : (f.vencida ? 'vencida' : 'no vigente')
      ));
      tr.appendChild(tdE);

      tr.appendChild(crear('td', 'td-num', fecha(f.fechaIngreso)));
      tr.appendChild(crear('td', 'td-num', fecha(f.fechaVencimiento)));

      // Coincidencia
      var tdC = crear('td', 'coincidencia');
      if (co.tipo) {
        var etiquetas = {
          'identica': 'idéntica',
          'identica-fonetica': 'idéntica fonética',
          'similar': 'similar',
          'contiene': 'contiene',
          'parcial': 'parcial'
        };
        tdC.appendChild(crear('b', null, etiquetas[co.tipo] || co.tipo));
        tdC.appendChild(document.createTextNode(' · ' + co.similitud + '%'));

        // Cuando la coincidencia es contra el núcleo y no contra la
        // denominación entera, decirlo importa: cambia cómo se lee.
        if (co.contra === 'nucleo') {
          tdC.appendChild(document.createTextNode(' '));
          tdC.appendChild(crear('span', 'marca-nucleo', 'vs. núcleo'));
        }

        if (f.variantes && f.variantes.length) {
          tdC.appendChild(document.createElement('br'));
          tdC.appendChild(document.createTextNode('vía ' + f.variantes.join(', ')));
        }
      } else {
        tdC.textContent = '—';
      }
      tr.appendChild(tdC);

      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
  }

  function renderPaginado(datos, cantidad) {
    // La paginación real sólo tiene sentido cuando la API paginó contra
    // el INPI. Si mezcló variantes o clases, el conjunto ya viene
    // fusionado y recortado: ahí mostramos sólo el conteo.
    if (!datos.paginable) {
      paginado.hidden = true;
      metaBox.textContent = cantidad + ' de ' + datos.total +
        ' antecedentes recuperados' +
        (datos.totalInpi ? ' · el INPI informa ~' + datos.totalInpi + ' coincidencias' : '');
      return;
    }

    paginado.hidden = false;
    var desde = estado.offset + 1;
    var hasta = estado.offset + cantidad;
    paginaInfo.textContent = desde + '–' + hasta + ' de ' + datos.total;
    metaBox.textContent = datos.total + ' antecedentes en el INPI';

    btnPrev.disabled = estado.offset <= 0;
    btnNext.disabled = hasta >= datos.total;
  }

  function aplicarFiltro() {
    var visibles = 0;
    Array.prototype.forEach.call(tbody.rows, function (tr) {
      var ok = estado.filtroRiesgo === 'todos' ||
               tr.dataset.riesgo === estado.filtroRiesgo;
      tr.hidden = !ok;
      if (ok) visibles++;
    });

    if (estado.filtroRiesgo !== 'todos') {
      metaBox.textContent = visibles + ' de ' + tbody.rows.length +
        ' filas con riesgo ' + estado.filtroRiesgo;
    } else if (estado.datos) {
      renderPaginado(estado.datos, tbody.rows.length);
    }
  }


  /* ================================================================
     05. EVENTOS
     ================================================================ */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    estado.filtroRiesgo = 'todos';
    Array.prototype.forEach.call(filtros.children, function (b) {
      b.classList.toggle('is-on', b.dataset.riesgo === 'todos');
    });
    buscar(0);
  });

  btnLimpiar.addEventListener('click', function () {
    form.reset();
    estado.datos = null;
    estado.offset = 0;
    salida.hidden = true;
    vacio.hidden = true;
    btnCsv.disabled = true;
    mostrarHint('');
    $('#q').focus();
  });

  btnCsv.addEventListener('click', function () {
    if (!estado.ultimaQuery) return;
    // Pedimos el CSV con un tope alto: el archivo es para trabajarlo
    // después en la planilla, no para mirarlo en pantalla.
    var p = new URLSearchParams(estado.ultimaQuery);
    p.set('limit', '200');
    p.set('formato', 'csv');
    window.location.href = '/api/marcas?' + p.toString();
  });

  btnPrev.addEventListener('click', function () {
    buscar(Math.max(0, estado.offset - LIMITE));
  });

  btnNext.addEventListener('click', function () {
    buscar(estado.offset + LIMITE);
  });

  filtros.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    estado.filtroRiesgo = b.dataset.riesgo;
    Array.prototype.forEach.call(filtros.children, function (o) {
      o.classList.toggle('is-on', o === b);
    });
    aplicarFiltro();
  });

  tbody.addEventListener('click', function (e) {
    var b = e.target.closest('.acta-link');
    if (!b) return;
    frmDetalle.elements.acta.value = b.dataset.acta;
    frmDetalle.submit();
  });

  document.documentElement.classList.remove('no-js');
  $('#q').focus();
})();

/* ==================================================================
   ESTUDIO RAÍZ — Landing page
   JavaScript sin dependencias.
   ------------------------------------------------------------------
   Contenido
   00. Configuración (editá acá para conectar el formulario)
   01. Utilidades
   02. Navegación
   03. Reveal on scroll
   04. Contadores de métricas
   05. Búsqueda de marca (simulada)
   06. Formulario de leads
   07. CTA flotante y varios
   =================================================================== */
(function () {
  'use strict';

  /* ================================================================
     00. CONFIGURACIÓN
     ----------------------------------------------------------------
     FORM_ENDPOINT: dejalo vacío ('') para que el formulario funcione
     en modo demo (simula el envío y muestra el mensaje de éxito).

     Cuando tengas el backend, pegá acá la URL. Funciona con:
       · Zapier      → "Catch Hook" (https://hooks.zapier.com/hooks/catch/...)
       · Make        → Custom Webhook
       · Formspree   → https://formspree.io/f/xxxxxxx
       · API propia  → cualquier endpoint que acepte POST + JSON

     El payload enviado es:
       {
         nombre, email, telefono, empresa, mensaje,
         marcaConsultada,   // lo que el usuario buscó arriba (si buscó)
         origen,            // "landing-estudio-raiz"
         enviadoEl,         // ISO 8601
         pagina             // URL completa
       }
     ================================================================= */
  var CONFIG = {
    FORM_ENDPOINT: '',
    // Si tu endpoint espera form-data en vez de JSON, poné 'form'.
    FORM_FORMAT: 'json',
    // Duración de la animación de búsqueda (ms).
    SEARCH_DELAY: 1500
  };


  /* ================================================================
     01. UTILIDADES
     ================================================================= */
  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.classList.remove('no-js');


  /* ================================================================
     02. NAVEGACIÓN
     ================================================================= */
  var header    = $('#header');
  var nav       = $('#nav');
  var navToggle = $('#navToggle');

  if (navToggle && nav) {
    var closeNav = function () {
      nav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Abrir menú');
    };

    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    });

    // Cerrar al navegar
    $$('a', nav).forEach(function (a) {
      a.addEventListener('click', closeNav);
    });

    // Cerrar con Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        closeNav();
        navToggle.focus();
      }
    });

    // Cerrar al pasar a desktop
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) closeNav();
    });
  }

  // Sombra del header al hacer scroll
  if (header) {
    var onScrollHeader = function () {
      header.classList.toggle('is-stuck', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScrollHeader, { passive: true });
    onScrollHeader();
  }


  /* ================================================================
     03. REVEAL ON SCROLL
     ================================================================= */
  var revealItems = $$('.reveal');

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    revealItems.forEach(function (el) { revealObserver.observe(el); });
  }


  /* ================================================================
     04. CONTADORES DE MÉTRICAS
     ================================================================= */
  var counters = $$('.metric-value[data-count]');

  var runCounter = function (el) {
    var target = parseInt(el.dataset.count, 10) || 0;
    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';
    var duration = 1400;
    var start = null;

    var step = function (ts) {
      if (start === null) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      // easeOutCubic
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  };

  if (counters.length) {
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      // Los valores finales ya están en el HTML: no hacemos nada.
    } else {
      var counterObserver = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          runCounter(entry.target);
          obs.unobserve(entry.target);
        });
      }, { threshold: 0.6 });

      counters.forEach(function (el) {
        el.textContent = (el.dataset.prefix || '') + '0' + (el.dataset.suffix || '');
        counterObserver.observe(el);
      });
    }
  }


  /* ================================================================
     05. BÚSQUEDA DE MARCA (SIMULADA)
     ----------------------------------------------------------------
     IMPORTANTE: esto NO consulta la base del INPI. Es una simulación
     educativa y determinística: el mismo nombre devuelve siempre el
     mismo resultado, para que la demo sea coherente.

     Cuando exista un servicio real, reemplazá `simulateLookup()` por
     una llamada fetch() al backend manteniendo la misma forma de
     respuesta: { status: 'ok' | 'warn', name: string }
     ================================================================= */
  var searchForm  = $('#searchForm');
  var brandInput  = $('#brandName');
  var searchBtn   = $('#searchBtn');
  var searchHint  = $('#searchHint');
  var resultWrap  = $('#searchResult');
  var resultCard  = $('#resultCard');
  var resultBadge = $('#resultBadge');
  var resultName  = $('#resultName');
  var resultText  = $('#resultText');
  var resultSteps = $('#resultSteps');
  var hiddenMarca = $('#marcaConsultada');
  var empresaInput = $('#empresa');

  var DEFAULT_HINT = searchHint ? searchHint.textContent : '';

  // Términos que siempre devuelven advertencia: marcas notorias y
  // palabras genéricas de bajo carácter distintivo.
  var ALWAYS_CONFLICT = [
    'coca cola', 'cocacola', 'pepsi', 'nike', 'adidas', 'google', 'apple',
    'facebook', 'instagram', 'whatsapp', 'youtube', 'amazon', 'netflix',
    'mercado libre', 'mercadolibre', 'disney', 'ferrari', 'samsung', 'sony',
    'raiz', 'estudio raiz', 'clinica', 'consultorio', 'estudio juridico',
    'farmacia', 'odontologia', 'abogados', 'marketing', 'digital', 'salud'
  ];

  var normalize = function (str) {
    return str
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // saca tildes
      .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|sas|srl|sa)\b/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Hash FNV-1a: determinístico y bien distribuido.
  var hash = function (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  var simulateLookup = function (raw) {
    var name = normalize(raw);

    var conflict = ALWAYS_CONFLICT.some(function (term) {
      return name === term || name.indexOf(term) !== -1;
    });

    // Un nombre muy corto o de una sola palabra genérica es más
    // propenso a colisionar: lo reflejamos subiendo la probabilidad.
    if (!conflict) {
      var words = name.split(' ').length;
      var threshold = words === 1 ? 48 : 30;
      conflict = (hash(name) % 100) < threshold;
    }

    return { status: conflict ? 'warn' : 'ok', name: raw.trim() };
  };

  var RESULT_COPY = {
    ok: {
      badge: '✓ Sin coincidencias directas',
      text: 'No encontramos coincidencias evidentes con este nombre en nuestra verificación preliminar. ' +
            'Es una buena señal para avanzar: el paso siguiente es confirmar la clase de Niza que corresponde a tu ' +
            'actividad y presentar la solicitud cuanto antes, porque la prioridad se toma por fecha de presentación.',
      steps: [
        'Definir la clase de productos o servicios',
        'Búsqueda de antecedentes detallada',
        'Presentación de la solicitud ante el INPI',
        'Seguimiento del expediente hasta la concesión'
      ]
    },
    warn: {
      badge: '⚠ Puede haber conflictos',
      text: 'Detectamos posibles coincidencias denominativas o fonéticas para este nombre. ' +
            'No significa que sea imposible registrarlo: muchas veces el conflicto está en otra clase, o se resuelve ' +
            'ajustando el nombre o sumando un elemento distintivo. Lo importante es analizarlo antes de invertir en cartelería, ' +
            'packaging o redes.',
      steps: [
        'Análisis de coincidencias por clase',
        'Evaluación de riesgo fonético y gráfico',
        'Alternativas de naming, si hace falta',
        'Estrategia de presentación u oposición'
      ]
    }
  };

  var renderResult = function (data) {
    var copy = RESULT_COPY[data.status];

    resultCard.classList.toggle('is-warn', data.status === 'warn');
    resultBadge.textContent = copy.badge;
    resultName.textContent = '“' + data.name + '”';
    resultText.textContent = copy.text;

    resultSteps.innerHTML = '';
    copy.steps.forEach(function (step) {
      var div = document.createElement('div');
      div.textContent = step;
      resultSteps.appendChild(div);
    });

    resultWrap.hidden = false;

    // Reinicia la animación de entrada en búsquedas sucesivas
    resultCard.style.animation = 'none';
    void resultCard.offsetWidth;
    resultCard.style.animation = '';

    // Pasa la marca consultada al formulario de contacto
    if (hiddenMarca) hiddenMarca.value = data.name;
    if (empresaInput && !empresaInput.value) empresaInput.value = data.name;
  };

  if (searchForm) {
    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var value = brandInput.value.trim();

      // Validación
      if (value.length < 3) {
        brandInput.classList.add('is-invalid');
        searchHint.classList.add('is-error');
        searchHint.textContent = 'Ingresá al menos 3 caracteres para poder hacer la búsqueda.';
        brandInput.focus();
        return;
      }

      brandInput.classList.remove('is-invalid');
      searchHint.classList.remove('is-error');
      searchHint.textContent = DEFAULT_HINT;

      searchBtn.classList.add('is-loading');
      $('.btn-label', searchBtn).textContent = 'Buscando…';

      window.setTimeout(function () {
        searchBtn.classList.remove('is-loading');
        $('.btn-label', searchBtn).textContent = 'Buscar disponibilidad';
        renderResult(simulateLookup(value));
      }, prefersReducedMotion ? 200 : CONFIG.SEARCH_DELAY);
    });

    // Limpiar el error al escribir
    brandInput.addEventListener('input', function () {
      if (!brandInput.classList.contains('is-invalid')) return;
      brandInput.classList.remove('is-invalid');
      searchHint.classList.remove('is-error');
      searchHint.textContent = DEFAULT_HINT;
    });
  }


  /* ================================================================
     06. FORMULARIO DE LEADS
     ================================================================= */
  var leadForm    = $('#leadForm');
  var leadSubmit  = $('#leadSubmit');
  var formStatus  = $('#formStatus');
  var formSuccess = $('#formSuccess');
  var formReset   = $('#formReset');

  var VALIDATORS = {
    nombre: {
      test: function (v) { return v.trim().length >= 2; },
      msg: 'Contanos cómo te llamás.'
    },
    email: {
      test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); },
      msg: 'Revisá el email: parece que falta algo.'
    },
    telefono: {
      test: function (v) { return v.replace(/[^\d]/g, '').length >= 8; },
      msg: 'Ingresá un teléfono válido con característica.'
    },
    empresa: {
      test: function (v) { return v.trim().length >= 2; },
      msg: 'Decinos el nombre de tu empresa o marca.'
    }
  };

  var setFieldError = function (input, message) {
    var field = input.closest('.field');
    var errorEl = $('[data-error-for="' + input.name + '"]', field);
    if (message) {
      field.classList.add('has-error');
      input.setAttribute('aria-invalid', 'true');
      if (errorEl) errorEl.textContent = message;
    } else {
      field.classList.remove('has-error');
      input.removeAttribute('aria-invalid');
      if (errorEl) errorEl.textContent = '';
    }
  };

  var validateField = function (input) {
    var rule = VALIDATORS[input.name];
    if (!rule) return true;
    var valid = rule.test(input.value);
    setFieldError(input, valid ? '' : rule.msg);
    return valid;
  };

  var validateForm = function () {
    var firstInvalid = null;
    var valid = true;

    Object.keys(VALIDATORS).forEach(function (name) {
      var input = leadForm.elements[name];
      if (!input) return;
      if (!validateField(input)) {
        valid = false;
        if (!firstInvalid) firstInvalid = input;
      }
    });

    if (firstInvalid) firstInvalid.focus();
    return valid;
  };

  var buildPayload = function () {
    return {
      nombre:          leadForm.elements.nombre.value.trim(),
      email:           leadForm.elements.email.value.trim(),
      telefono:        leadForm.elements.telefono.value.trim(),
      empresa:         leadForm.elements.empresa.value.trim(),
      mensaje:         leadForm.elements.mensaje.value.trim(),
      marcaConsultada: leadForm.elements.marcaConsultada.value.trim(),
      origen:          leadForm.elements.origen.value,
      enviadoEl:       new Date().toISOString(),
      pagina:          window.location.href
    };
  };

  var sendLead = function (payload) {
    // Modo demo: sin endpoint configurado.
    if (!CONFIG.FORM_ENDPOINT) {
      console.info('[Estudio Raíz] Lead capturado (modo demo, sin endpoint):', payload);
      return new Promise(function (resolve) { window.setTimeout(resolve, 900); });
    }

    var options = { method: 'POST' };

    if (CONFIG.FORM_FORMAT === 'form') {
      var fd = new FormData();
      Object.keys(payload).forEach(function (k) { fd.append(k, payload[k]); });
      options.body = fd;
    } else {
      options.headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      options.body = JSON.stringify(payload);
    }

    return fetch(CONFIG.FORM_ENDPOINT, options).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    });
  };

  var showStatus = function (message) {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.classList.toggle('is-visible', Boolean(message));
  };

  if (leadForm) {
    // Validación al salir del campo, una vez que el usuario ya escribió
    $$('input, textarea', leadForm).forEach(function (input) {
      if (!VALIDATORS[input.name]) return;
      input.addEventListener('blur', function () {
        if (input.value.trim() !== '') validateField(input);
      });
      input.addEventListener('input', function () {
        if (input.closest('.field').classList.contains('has-error')) validateField(input);
      });
    });

    leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      showStatus('');

      // Honeypot: si está completo, es un bot. Fingimos éxito y descartamos.
      if (leadForm.elements.website && leadForm.elements.website.value !== '') {
        leadForm.hidden = true;
        formSuccess.hidden = false;
        return;
      }

      if (!validateForm()) {
        showStatus('Revisá los campos marcados para poder enviar la consulta.');
        return;
      }

      leadSubmit.classList.add('is-loading');
      $('.btn-label', leadSubmit).textContent = 'Enviando…';

      sendLead(buildPayload())
        .then(function () {
          leadForm.hidden = true;
          formSuccess.hidden = false;
          formSuccess.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
        })
        .catch(function (err) {
          console.error('[Estudio Raíz] Error al enviar el formulario:', err);
          showStatus('No pudimos enviar tu consulta. Probá de nuevo o escribinos a hola@estudioraiz.com.ar');
        })
        .finally(function () {
          leadSubmit.classList.remove('is-loading');
          $('.btn-label', leadSubmit).textContent = 'Agendar reunión diagnóstico gratuita';
        });
    });
  }

  if (formReset) {
    formReset.addEventListener('click', function () {
      leadForm.reset();
      $$('.field.has-error', leadForm).forEach(function (f) { f.classList.remove('has-error'); });
      showStatus('');
      formSuccess.hidden = true;
      leadForm.hidden = false;
      leadForm.elements.nombre.focus();
    });
  }


  /* ================================================================
     07. CTA FLOTANTE Y VARIOS
     ================================================================= */
  var ctaFloat = $('#ctaFloat');
  var hero     = $('#inicio');
  var contacto = $('#contacto');

  if (ctaFloat && hero && 'IntersectionObserver' in window) {
    // Se muestra después del hero y se esconde al llegar al formulario.
    var pastHero = false;
    var atForm   = false;

    var updateCta = function () {
      ctaFloat.classList.toggle('is-visible', pastHero && !atForm);
    };

    new IntersectionObserver(function (entries) {
      pastHero = !entries[0].isIntersecting;
      updateCta();
    }, { threshold: 0 }).observe(hero);

    if (contacto) {
      new IntersectionObserver(function (entries) {
        atForm = entries[0].isIntersecting;
        updateCta();
      }, { threshold: 0 }).observe(contacto);
    }
  }

  // Año dinámico en el footer
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Foco en el formulario al llegar desde un CTA
  $$('a[href="#contacto"]').forEach(function (link) {
    link.addEventListener('click', function () {
      window.setTimeout(function () {
        var target = leadForm && !leadForm.hidden ? leadForm.elements.nombre : null;
        if (target) target.focus({ preventScroll: true });
      }, prefersReducedMotion ? 0 : 700);
    });
  });

})();

# Estudio Raíz — Landing page

Landing page corporativa, minimalista y responsive para Estudio Raíz.
HTML + CSS + JavaScript sin dependencias ni build step: se publica tal cual.

> **Importante:** todo lo publicable vive dentro de `web/`. Los documentos de la
> carpeta padre (plan de negocios, manual operativo, imágenes de WhatsApp) quedan
> fuera a propósito, para que no se suban al hosting por accidente.

---

## Estructura

```
web/
├── index.html                          Página completa (7 secciones)
├── README.md                           Este archivo
└── assets/
    ├── css/styles.css                  Hoja de estilos única
    ├── js/main.js                      Buscador simulado, formulario, animaciones
    └── img/
        ├── logo.png                    ORIGINAL del cliente, 474×474, fondo crema
        ├── logo-transparent.png        El mismo, con el fondo recortado  ← el que usa el sitio
        ├── favicon-32.png              Favicon 32×32
        ├── apple-touch-icon.png        Ícono iOS 180×180
        └── og-image.png                Open Graph 1200×630
```

### Archivos obsoletos, para borrar

Estos son reconstrucciones vectoriales previas que **ya no se usan** y no coinciden
con el logo definitivo. Conviene eliminarlos para que nadie los tome por error:

```
assets/img/favicon.svg
assets/img/estudio-raiz-logo-main.svg
assets/img/estudio-raiz-logo-variants.svg
assets/react/EstudioRaizLogo.jsx
```

---

## Secciones

1. **Hero** — isotipo, tagline y doble CTA
2. **Propuesta de valor** — qué es Estudio Raíz + 3 áreas + 4 diferenciales
3. **Búsqueda de marca** — verificación orientativa simulada
4. **Formulario de contacto** — captura de leads
5. **Casos de éxito** — 3 casos con métrica animada
6. **FAQ** — 4 preguntas sobre registro de marca
7. **Footer** — contacto, servicios y redes

---

## Conectar el formulario

Por defecto el formulario corre en **modo demo**: valida, simula el envío y muestra
el mensaje de éxito, dejando el lead en la consola del navegador.

Para conectarlo, abrí `assets/js/main.js` y completá `CONFIG.FORM_ENDPOINT`:

```js
var CONFIG = {
  FORM_ENDPOINT: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
  FORM_FORMAT: 'json',   // usá 'form' si el servicio espera multipart/form-data
  SEARCH_DELAY: 1500
};
```

Funciona con Zapier (Catch Hook), Make (Custom Webhook), Formspree, Netlify Forms
o cualquier API propia que acepte `POST`.

### Payload que se envía

```json
{
  "nombre": "María Gómez",
  "email": "maria@consultorio.com",
  "telefono": "+54 9 381 000 0000",
  "empresa": "Consultorio Aurora",
  "mensaje": "Tengo el logo pero la marca no está registrada.",
  "marcaConsultada": "Consultorio Aurora",
  "origen": "landing-estudio-raiz",
  "enviadoEl": "2026-08-07T14:32:10.000Z",
  "pagina": "https://estudioraiz.com.ar/"
}
```

`marcaConsultada` se completa solo si la persona usó antes el buscador de marca,
así el equipo comercial llega a la reunión sabiendo qué nombre le interesa.

El formulario incluye un **honeypot** (campo `website`, invisible para personas).
Si viene completo se descarta el envío sin avisar al bot.

---

## Búsqueda de marca: cómo funciona

**No consulta la base del INPI.** Es una simulación educativa y *determinística*:
el mismo nombre devuelve siempre el mismo resultado, para que la demo sea coherente
si alguien repite la búsqueda.

- Marcas notorias y términos genéricos (`clinica`, `abogados`, `marketing`…)
  devuelven siempre "puede haber conflictos".
- El resto se resuelve con un hash FNV‑1a del nombre normalizado: los nombres de
  una sola palabra tienen más probabilidad de conflicto que los compuestos.
- El resultado nunca inventa números de expediente ni registros concretos, y el
  aviso de que la búsqueda es orientativa está siempre visible.

Para conectar una búsqueda real, reemplazá `simulateLookup()` en `main.js` por un
`fetch()` que devuelva `{ status: 'ok' | 'warn', name: string }`.

---

## Identidad visual

### Paleta (manual de marca)

| Token | Color | Uso |
|---|---|---|
| `--navy` | `#0D2B3E` | Estructura del logo, títulos, texto, fondos densos |
| `--green` | `#5A6B3F` | Hojas del logo, acentos, métricas |
| `--cream` | `#F2EFE7` | Fondos suaves |
| `--navy-soft` | `#1B3A52` | Azul claro de apoyo |
| `--green-light` | `#7FA886` | Verde salvia: hojas y detalles sobre fondo oscuro |
| `--white` / `--gray` | `#FFFFFF` / `#F5F5F5` | Neutros |

Todos los colores son variables CSS declaradas al inicio de `assets/css/styles.css`.
Para recolorear el sitio entero alcanza con editar ese bloque.

### Tipografía

- **Playfair Display** (serif) para títulos
- **Inter** (sans-serif) para cuerpo

Se cargan desde Google Fonts con `display=swap` y tienen fallbacks del sistema.
Si preferís no depender de un CDN externo, descargá los `.woff2` a
`assets/fonts/` y reemplazá el `<link>` del `<head>` por `@font-face`.

---

## El logo

La fuente es **`logo.png`**, el archivo provisto por el cliente (474×474 px, fondo
crema `#FAF7F2` opaco). No se modificó el dibujo.

De ahí salen todos los derivados, por reescalado o recorte de fondo:

| Archivo | Origen | Uso |
|---|---|---|
| `logo-transparent.png` | `logo.png` con el fondo crema recortado | nav, hero, footer |
| `favicon-32.png` | `logo.png` reescalado | `<link rel="icon">` |
| `apple-touch-icon.png` | `logo.png` reescalado a 180 | iOS |
| `og-image.png` | `logo.png` centrado sobre crema | Open Graph / Twitter |

El recorte de fondo no es un redibujo: se calcula el alfa por distancia al color
de fondo y se desmezclan los bordes antialiaseados, así que los píxeles del árbol
quedan idénticos al original.

### Limitaciones conocidas de usar un PNG

Son consecuencia del formato, no del archivo, y las tres se resuelven con el
vectorial original si aparece:

1. **No se recolorea solo.** El logo es azul oscuro sobre transparente, así que
   sobre el footer navy el tronco quedaría prácticamente invisible. Por eso en el
   footer se apoya sobre un tile crema (`.mark--tile` en `styles.css`). Si el
   diseñador provee una **versión clara para fondo oscuro**, se reemplaza esa
   imagen y se borra la regla del tile.
2. **Favicon con poco detalle.** A 32 px las líneas finas del árbol se empastan:
   se lee como un árbol, pero se pierde el trazo. Un favicon propio, más simple y
   con trazos engrosados, se vería mejor.
3. **Techo de resolución.** 474 px alcanza para todos los usos actuales (el hero
   muestra 158 px CSS, o sea 316 px en pantallas 2×), pero no para papelería
   impresa ni cartelería. Para eso hace falta el vectorial.

### Lo ideal: conseguir el vectorial

Para el trámite de INPI, papelería y cualquier pieza impresa conviene pedirle a
quien diseñó el logo el archivo original en `.svg`, `.ai` o `.eps`. Con eso se
resuelven los tres puntos de arriba de una sola vez.

---

## Datos a reemplazar antes de publicar

Estos valores son **provisorios** y están repetidos en varios lugares:

| Dato | Valor actual | Dónde |
|---|---|---|
| Email | `hola@estudioraiz.com.ar` | footer, JSON-LD, mensaje de error del form |
| WhatsApp / teléfono | `+54 9 381 000 0000` (`wa.me/5493810000000`) | footer ×2, JSON-LD |
| Instagram | `instagram.com/estudioraiz` | footer, JSON-LD |
| LinkedIn | `linkedin.com/company/estudioraiz` | footer, JSON-LD |
| Dominio | `https://estudioraiz.com.ar/` | canonical, Open Graph, JSON-LD |
| Ubicación | "Tucumán, Argentina" | footer, JSON-LD |
| Horario | "Lunes a viernes, 15 a 19 hs" | footer |

`assets/img/og-image.png` (1200×630) ya está generado a partir del logo. Si más
adelante querés una placa más rica (con el tagline y algún elemento gráfico),
reemplazalo respetando esas medidas.

---

## Publicar

Es un sitio estático: no necesita build ni Node.

**Netlify / Vercel** — conectá el repo y poné `web` como *root directory*
(o *publish directory* en Netlify). Sin comando de build.

**Servidor propio** — subí el contenido de `web/` por FTP a la raíz del dominio.

**Probar en local** — con Python: `python -m http.server 4173 --directory web`,
o con Node: `npx serve web`. Abrir `index.html` con doble clic también funciona.

---

## Accesibilidad y SEO

- HTML semántico, jerarquía de encabezados correcta y `skip link`
- Todos los campos con `<label>`; errores anunciados con `aria-live`
- Foco visible en todos los elementos interactivos
- Menú móvil con `aria-expanded` y cierre con `Escape`
- Se respeta `prefers-reduced-motion`: sin animaciones ni scroll suave
- Meta tags, Open Graph, Twitter Card y JSON-LD (`ProfessionalService`)
- Sin JavaScript la página se ve completa: las animaciones son progresivas

---

## Aviso sobre el contenido

Los tres casos de éxito son **ficticios**, creados como ejemplos representativos.
La página lo aclara al pie de esa sección. Conviene reemplazarlos por casos reales
en cuanto existan: son el activo comercial más valioso de la landing.

Los plazos y condiciones del FAQ (12-18 meses de trámite, vigencia de 10 años
renovable, registro por clases) son correctos para el INPI argentino, pero el pie
de página aclara que la información es orientativa y no constituye asesoramiento
legal.

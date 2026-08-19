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
├── robots.txt                          Bloquea /api/ y /herramientas/
├── vercel.json                         Headers, cleanUrls y maxDuration de la API
├── README.md                           Este archivo
├── api/
│   └── marcas.js                       API de consulta al INPI (serverless)
├── herramientas/
│   └── marcas.html                     Consola interna de búsqueda de antecedentes
└── assets/
    ├── css/styles.css                  Hoja de estilos única
    ├── css/herramientas.css            Estilos de la consola interna
    ├── js/main.js                      Buscador simulado, formulario, animaciones
    ├── js/herramientas-marcas.js       Cliente de /api/marcas
    └── img/
        ├── logo.png                    ORIGINAL del cliente, 474×474, fondo crema
        ├── logo-transparent.png        El mismo, con el fondo recortado  ← el que usa el sitio
        ├── favicon-32.png              Favicon 32×32
        ├── apple-touch-icon.png        Ícono iOS 180×180
        ├── og-image.png                Open Graph 1200×630
        ├── daniel-franco-dib.jpg       Retrato 640×640 para "Quiénes somos"
        └── eliana-carrizo-dreer.jpg    Retrato 640×640 para "Quiénes somos"
```

Los retratos salen de los originales de `Quienes somos/`, recortados a cuadrado
**centrando en la cara**: las fotos originales tienen proporciones extremas
(1280×511 y 590×1278), así que un recorte al centro geométrico habría cortado
cabezas. Se muestran a 148 px como máximo, o sea 296 px en pantallas 2×.

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
2. **Propuesta de valor** — 3 áreas de servicio y 4 diferenciales
3. **Quiénes somos** — los dos socios + proceso de trabajo en 4 pasos
4. **Búsqueda de marca** — verificación orientativa simulada
5. **Formulario de contacto** — captura de leads
6. **El costo de no registrar** — cascada de 7 consecuencias encadenadas
7. **FAQ** — 8 preguntas sobre registro de marca
8. **Footer** — contacto, servicios y redes

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

> **Ojo:** ya existe `/api/marcas`, que consulta el INPI de verdad (ver más abajo).
> El buscador de la landing sigue simulado **a propósito**: mostrarle a un visitante
> una lista cruda de antecedentes reales invita a que saque conclusiones solo, que
> es justo lo contrario de lo que se busca. Si algún día se conecta, conviene que
> muestre el semáforo de riesgo y no la tabla.

---

## API de marcas — `/api/marcas`

Función serverless que consulta la base pública del INPI en tiempo real.

### De dónde salen los datos

El INPI **no publica una API oficial documentada**. Lo que hay es el buscador web
de `portaltramites.inpi.gob.ar`, que por debajo llama a un endpoint JSON sin login
ni token:

```
POST https://portaltramites.inpi.gob.ar/MarcasConsultas/GrillaMarcasAvanzada
POST https://portaltramites.inpi.gob.ar/MarcasConsultas/GrillaMarcasPuntual
```

`api/marcas.js` lo consume, normaliza la respuesta y le agrega el análisis fonético.

**Esto implica asumir un riesgo:** al no estar documentado, el endpoint puede
cambiar o empezar a bloquear sin aviso. El código lo contempla — si la respuesta
deja de tener la forma esperada devuelve `502` con código `INPI_FORMATO` en lugar
de romper en silencio — pero la dependencia existe y conviene tenerla presente.

### Parámetros

| Parámetro | Valores | Por defecto |
|---|---|---|
| `q` | denominación a buscar, mínimo 3 caracteres | — |
| `modo` | `contiene` · `empieza` | `contiene` |
| `clase` | `1`–`45`, hasta 4 separadas por coma; vacío = todas | todas |
| `titular` | apellido, razón social o CUIT | — |
| `modoTitular` | `contiene` · `empieza` | `contiene` |
| `estado` | `C` `E` `A` `CA` `N` `D` `NU` | todos |
| `vigentes` | `1` para excluir caducas y abandonadas | `0` |
| `foneticas` | `0` para desactivar las variantes | `1` |
| `desdeIngreso` / `hastaIngreso` | `aaaa-mm-dd` o `dd/mm/aaaa` | — |
| `desdeResolucion` / `hastaResolucion` | ídem | — |
| `limit` / `offset` | paginación (máx. 200) | `25` / `0` |
| `porVariante` | filas a traer por consulta al INPI (máx. 100) | `50` |
| `acta` / `resolucion` | consulta puntual; ignora todo lo demás | — |
| `formato` | `csv` para descargar la planilla | JSON |

```bash
curl "https://estudioraiz.com.ar/api/marcas?q=raiz&clase=35,41&vigentes=1"
```

### Cómo compensa que la búsqueda del INPI sea literal

La búsqueda oficial encuentra **cadenas de texto, no sonidos**; la búsqueda
fonética del INPI es arancelada y no pasa por este endpoint. La API compensa en
dos planos:

1. **Variantes de consulta.** Genera escrituras alternativas del término y las
   consulta todas: `RAIZ` → `raiz`, `rais`, `rayz`, `rays`. Las reglas están
   acotadas al contexto donde la confusión existe en castellano (la `z` suena
   como `c` sólo antes de `e`/`i`, la `y` se escribe `ll` sólo cuando es
   consonante), así no se gastan consultas en variantes impronunciables.
2. **Clave fonética para puntuar.** Cada resultado se compara contra el término
   por una clave que colapsa las confusiones del castellano rioplatense —seseo,
   `b`/`v`, `h` muda, dígrafos, dobles—. `RAÍZ`, `RAIS` y `RRAIZ` caen todas en
   `rais`. Sobre esa clave se calcula la distancia de edición.

### El núcleo distintivo

Buscar sólo la frase completa da falsos negativos graves. `ESTUDIO RAIZ` **no
figura en la base del INPI**, en ninguna clase ni estado — pero `RAIZ` sí, vigente
en las clases 21, 35, 36 y 41. Una herramienta que contesta "riesgo bajo" a eso no
sirve para lo que se la va a usar.

Por eso, cuando el término trae palabras de bajo carácter distintivo (`estudio`,
`grupo`, `consultora`, artículos, preposiciones…), la API busca **dos frentes en
paralelo**: la denominación completa y su núcleo. Cada resultado se puntúa contra
ambos y se queda con la peor noticia, marcando en `coincidencia.contra` cuál fue.

No se descuenta nada por haber coincidido sólo con el núcleo: si `RAIZ` está
registrada, `ESTUDIO RAIZ` arrastra el conflicto igual, porque "estudio" no aporta
distintividad.

El núcleo es el **tramo contiguo** de palabras fuertes más largo, no la unión de
todas — pegar palabras que en el original no estaban juntas produce una frase que
no existe, y el INPI busca literal. `LA RAIZ DE LA VIDA` da `raiz`, no `raiz vida`.

La lista `PALABRAS_DEBILES` en `api/marcas.js` es una **heurística, no una regla
legal**: está pensada para editarse a mano cuando aparezca un caso que no
contempla.

### Puntuación

De ahí sale `coincidencia.tipo` (`identica`, `identica-fonetica`, `similar`,
`contiene`, `parcial`), un `similitud` de 0 a 100, y un `riesgo`:

- **alto** — antecedente **vigente** idéntico o casi idéntico.
- **medio** — idéntico pero ya caduco, o vigente parecido, o vigente que absorbe
  entera a la marca consultada.
- **bajo** — el resto.

### El problema del orden, y las dos pasadas

El INPI devuelve las filas **ordenadas por número de acta** —de la más vieja a la
más nueva— y no expone ningún parámetro de orden por relevancia. Con `contiene`
sobre un término corto eso rompe la búsqueda en la práctica: `RAIZ` da más de 400
resultados, y como sólo se pueden traer las primeras N, lo que llega son marcas de
los años 80 ya caducas, mientras la `RAIZ` concedida y vigente de 2020 queda afuera.

Por eso cada variante se consulta **dos veces**:

| Pasada | Consulta | Para qué |
|---|---|---|
| A | `empieza con` + `vigentes` | El conjunto chico que decide: lo que hoy puede bloquear un registro |
| B | `contiene` + lo que se pidió | El panorama amplio, histórico incluido |

Los resultados se fusionan por número de acta. La pasada A va primero a propósito:
si se agota el presupuesto de tiempo, se prefiere haberla completado.

### Límites que hay que conocer

- **`total` no es el universo.** Cuenta lo efectivamente recuperado (hasta
  `porVariante` por consulta). `totalInpi` es la suma de los totales que informó
  el INPI por variante, **con solapamientos**: sirve como orden de magnitud, no
  como conteo. La respuesta lo aclara en `avisos`.
- **Paginación real sólo con una consulta única.** El campo `paginable` dice
  cuándo el `offset` es confiable; en cuanto se mezclan variantes o clases, deja
  de serlo.
- **Techo de 12 consultas al INPI por búsqueda**, con caché de 1 hora y límite de
  40 requests por minuto y por IP. Es un servicio público y gratuito: no conviene
  abusar.
- **La caché y el rate limit son por instancia.** En serverless eso es *best
  effort*, no una garantía.

### Variables de entorno (opcionales)

| Variable | Qué hace |
|---|---|
| `MARCAS_API_KEY` | Si está definida, exige el header `x-api-key` en toda llamada que no venga del propio sitio |
| `MARCAS_ALLOWED_ORIGINS` | Orígenes con CORS habilitado, separados por coma |

Sin `MARCAS_API_KEY` el endpoint queda **abierto a cualquiera** que descubra la
URL. Para un sitio con este tráfico probablemente alcance con el rate limit, pero
si se quiere cerrar, definirla en Vercel es todo lo que hace falta.

---

## Herramienta interna — `/herramientas/marcas`

Consola de búsqueda de antecedentes para el equipo, montada sobre la API.
Deliberadamente **fuera de la landing**: no está enlazada desde ninguna parte del
sitio, lleva `noindex` y está bloqueada en `robots.txt` y por header
`X-Robots-Tag`.

Qué hace:

- Búsqueda por denominación, titular, clase, estado, fechas o número de acta.
- Semáforo de riesgo con el conteo de idénticas, similares y vigentes.
- Tabla filtrable por nivel de riesgo, con el estado real de vigencia calculado
  (una concedida cuyo vencimiento ya pasó figura como **vencida**, aunque el INPI
  todavía no le haya corrido el estado a "Caduca").
- Exportación a CSV con separador `;` y BOM, para que Excel en es-AR lo abra
  derecho.
- Clic en el número de acta → abre el expediente en el portal del INPI. Ese
  detalle sólo se abre por `POST`, no tiene URL directa, así que la página lo
  replica con un formulario oculto.

> **`noindex` no es control de acceso.** Cualquiera que conozca la URL entra. Si
> hace falta cerrarla de verdad, lo correcto es activar *Deployment Protection* en
> Vercel para esa ruta, o poner la herramienta detrás de un login.

---

## Correr el proyecto localmente

La landing sola se abre con doble clic. Pero la API necesita algo que ejecute la
función, así que en la raíz del repo (fuera de `web/`, o sea que **no se publica**)
hay un servidor mínimo que emula lo justo de Vercel:

```bash
node dev-server.js
```

```
landing      http://localhost:3000/
herramienta  http://localhost:3000/herramientas/marcas
api          http://localhost:3000/api/marcas?q=raiz
```

Recarga los módulos en cada request, así que los cambios en `api/marcas.js` se
toman sin reiniciar.

---

## Gráficos

Van **incrustados en el HTML**, no como archivos `.svg` sueltos. Es a propósito:
así heredan las variables CSS y se recolorean solos al editar el bloque de
tokens. Un `.svg` cargado con `<img>` no puede hacer eso — habría que repetir
los colores a mano en cada archivo.

| Gráfico | Dónde | Qué es |
|---|---|---|
| Íconos de servicio | Propuesta de valor | Escudo, paleta y curva ascendente. `viewBox` de 60 unidades, `stroke-width: 3.1` |
| Proceso de 4 pasos | Quiénes somos | Círculos numerados navy/green con conector; horizontal en desktop, vertical en mobile |

El proceso es HTML + CSS y no un SVG único, justamente porque tiene que
reacomodarse de fila a columna según el ancho.

### Gráficos que se probaron y se quitaron

Existieron dos más en Propuesta de valor y se eliminaron por decisión del
cliente: una **rosca** de tres arcos iguales (las tres áreas como servicio
integrado, sin porcentajes) y un **antes / después** de dos columnas con flecha.
Se borraron por completo: HTML, CSS y reglas responsive. Si alguna vez se
quieren recuperar, están en el historial de git, no en el código.

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

La landing es estática y no necesita build. La API sí necesita un runtime de
funciones, así que el hosting dejó de ser indistinto.

**Vercel** *(es lo que hay configurado)* — conectá el repo y poné `web` como
*root directory*. Sin comando de build: Vercel detecta `api/marcas.js` sola y la
publica como función Node. `vercel.json` ya define `maxDuration: 30`, porque una
búsqueda con variantes puede llegar a los 12 segundos.

**Netlify** — funciona, pero hay que mover `api/marcas.js` a
`netlify/functions/` y adaptar la firma del handler, que no es la misma.

**Hosting estático a secas (FTP, GitHub Pages)** — sirve la landing, pero
`/api/marcas` y la herramienta interna **no van a funcionar**: no hay quién
ejecute la función.

**Probar en local** — `node dev-server.js` desde la raíz del repo (ver arriba).
Para mirar sólo la landing sin la API, `npx serve web` o abrir `index.html` con
doble clic siguen sirviendo.

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

**No hay fotos de stock en la página.** En la carpeta `Fotos a modo ejemplo/`
del repo padre hay tres imágenes (`que-es-un-abogado-penalista.jpg`,
`imagen-principal-que-es-un-registro.jpg`, `ec-13.webp`) que **no se usan y no
deberían usarse**: los nombres de archivo son slugs de SEO de artículos de
blogs jurídicos, así que casi con seguridad son de terceros. Publicar imágenes
sin licencia en la web de una consultora que vende protección de propiedad
intelectual es un riesgo que no vale la pena correr. Además comunican litigio
penal, no registro de marcas. En su lugar hay gráficos SVG propios.

Las únicas fotos del sitio son los retratos de los dos socios, que son de ellos.

**No hay datos inventados en la página.** Los tres casos de éxito ficticios
(Dra. Martina García, López y Asociados, Lucía M.) que existían en la primera
versión fueron eliminados junto con sus métricas: no eran clientes reales y
convivían mal con una sección que le pide credibilidad al lector.

En su lugar está la sección **"El costo de no registrar"** (`#riesgo`), que
enumera la secuencia de consecuencias de perder la titularidad del nombre:
intimación, reclamo judicial, rebranding, reposición de todo lo impreso, mudanza
digital, carga administrativa y pérdida del capital reputacional. Es deliberado
que **no cite importes**: cualquier cifra envejece, varía por rubro y es
discutible, y una cifra floja en la web de un estudio legal cuesta más de lo que
suma.

Cuando existan casos reales con métricas verificables, conviene sumar una sección
de casos: es el activo comercial más valioso que le puede faltar a esta landing.
Los estilos viejos (`.case`, `.case-metric`) y el contador animado de JS se
borraron, así que habría que rehacerlos.

El FAQ está escrito para generar necesidad, pero todo lo que afirma es correcto
para el régimen argentino: que el derecho exclusivo nace del registro y no del
uso, que la prioridad se cuenta desde la fecha de presentación, los 12-18 meses
de trámite, la vigencia de 10 años renovable y el registro por clases. El pie de
página aclara igual que la información es orientativa y no constituye
asesoramiento legal.

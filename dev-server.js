/* ==================================================================
   Servidor de desarrollo — Estudio Raíz
   ------------------------------------------------------------------
   El sitio no tiene build step, así que para la landing alcanza con
   abrir el HTML. Pero desde que existe /api/marcas hace falta algo que
   ejecute las funciones serverless: esto emula lo mínimo de Vercel
   (ruteo de /api/*, req.query, res.status/json/send y cleanUrls) sin
   depender del CLI.

   Vive en la raíz del repo a propósito: el proyecto de Vercel apunta a
   web/, así que este archivo NO se publica.

       node dev-server.js          → http://localhost:3000
       node dev-server.js 4000     → otro puerto

   =================================================================== */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const RAIZ = path.join(__dirname, 'web');
const PUERTO = Number(process.argv[2]) || 3000;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

/* Envuelve la respuesta de Node con la interfaz que esperan las
   funciones de Vercel. */
function adaptarRes(res) {
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (cuerpo) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(cuerpo));
    return res;
  };
  res.send = (cuerpo) => { res.end(cuerpo); return res; };
  return res;
}

function servirEstatico(rutaRel, res) {
  // Resolvemos y verificamos que no se salga de web/: sin esto, un
  // pedido con ../ leería cualquier archivo de la máquina.
  const destino = path.resolve(RAIZ, '.' + rutaRel);
  if (!destino.startsWith(RAIZ)) {
    res.statusCode = 403;
    return res.end('Prohibido');
  }

  const candidatos = [destino];
  if (!path.extname(destino)) {
    candidatos.push(destino + '.html');                 // cleanUrls
    candidatos.push(path.join(destino, 'index.html'));
  }

  for (const archivo of candidatos) {
    if (fs.existsSync(archivo) && fs.statSync(archivo).isFile()) {
      res.setHeader('Content-Type', TIPOS[path.extname(archivo)] || 'application/octet-stream');
      return fs.createReadStream(archivo).pipe(res);
    }
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('404 — no encontrado: ' + rutaRel);
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const inicio = Date.now();

  res.on('finish', () => {
    console.log(`${res.statusCode}  ${req.method} ${url.pathname}${url.search}  ${Date.now() - inicio}ms`);
  });

  if (url.pathname.startsWith('/api/')) {
    const nombre = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
    const archivo = path.join(RAIZ, 'api', nombre + '.js');

    if (!fs.existsSync(archivo)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: { codigo: 'NO_EXISTE', mensaje: 'No hay función ' + nombre } }));
    }

    // Sin caché de módulos: así se toman los cambios sin reiniciar.
    delete require.cache[require.resolve(archivo)];
    const handler = require(archivo);

    req.query = Object.fromEntries(url.searchParams);
    adaptarRes(res);

    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: { codigo: 'ERROR_DEV', mensaje: e.message } }));
      }
    }
    return;
  }

  servirEstatico(url.pathname === '/' ? '/index.html' : url.pathname, res);
});

servidor.listen(PUERTO, () => {
  console.log('Estudio Raíz — dev server');
  console.log('  landing      http://localhost:' + PUERTO + '/');
  console.log('  herramienta  http://localhost:' + PUERTO + '/herramientas/marcas');
  console.log('  api          http://localhost:' + PUERTO + '/api/marcas?q=raiz');
});

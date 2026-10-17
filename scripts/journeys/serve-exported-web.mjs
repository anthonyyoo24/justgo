import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

export function exportedWebServer(directory) {
  const root = resolve(directory);
  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(request.url, 'http://127.0.0.1').pathname,
      );
    } catch {
      response.writeHead(400).end();
      return;
    }
    const filename = resolve(root, `.${pathname}`);
    if (!filename.startsWith(root + sep) && filename !== root) {
      response.writeHead(400).end();
      return;
    }
    if (
      /^\/v1(?:\/|$)/.test(pathname) ||
      pathname.split('/').some((part) => part.startsWith('.'))
    ) {
      response.writeHead(404).end();
      return;
    }
    let target = filename;
    try {
      if (!(await stat(target)).isFile()) throw new Error('not a file');
    } catch {
      if (extname(pathname)) {
        response.writeHead(404).end();
        return;
      }
      target = resolve(root, 'index.html');
    }
    try {
      const data = await readFile(target);
      response.writeHead(200, {
        'content-type': types[extname(target)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch {
      response.writeHead(404).end();
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const directory = fileURLToPath(
    new URL('../../apps/mobile/dist', import.meta.url),
  );
  await stat(resolve(directory, 'index.html'));
  const port = Number(process.env.JUSTGO_EXPORTED_WEB_PORT ?? 8093);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid exported web port');
  const server = exportedWebServer(directory);
  server.listen(port, '127.0.0.1');
  process.once('SIGTERM', () => server.close());
  process.once('SIGINT', () => server.close());
}

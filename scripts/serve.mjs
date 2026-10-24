import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../web/', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(`${root}${path.sep}`) || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) { response.writeHead(404); response.end(); return; }
    const info = await stat(target);
    if (!info.isFile()) throw new Error('Not a file');
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('页面不存在'); }
});
server.listen(port, '127.0.0.1', () => console.log(`McBlind 已启动：http://127.0.0.1:${port}\n只在本机监听。按 Ctrl+C 停止。`));
server.on('error', error => { console.error(`启动失败：${error.code === 'EADDRINUSE' ? '端口已被占用，请设置 PORT=其他端口' : error.message}`); process.exitCode = 1; });

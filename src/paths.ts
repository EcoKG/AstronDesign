// cwd 안 경로 검사와 127.0.0.1 임시 정적 서버.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ToolError } from './output.ts';

/** 경로를 cwd 기준 절대 경로로 바꾸고, cwd 밖이거나 없으면 E_PATH 를 던진다. */
export function insideCwd(p: string, cwd = process.cwd()): string {
	const abs = resolve(cwd, p);
	const rel = relative(cwd, abs);
	if (rel.startsWith('..') || isAbsolute(rel)) throw new ToolError('E_PATH', `cwd 밖 경로: ${p}`);
	if (!existsSync(abs)) throw new ToolError('E_PATH', `없는 경로: ${p}`);
	return abs;
}

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
	'.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8'
};

/** root 를 127.0.0.1 임의 포트로 제공하고 file 의 URL 을 돌려준다. root 밖 요청은 403. */
export async function serveStatic(root: string, file: string): Promise<{ url: string; close: () => Promise<void> }> {
	const server = createServer((req, res) => {
		try {
			let f = resolve(join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
			if (f !== root && !f.startsWith(root + sep)) {
				res.writeHead(403);
				res.end();
				return;
			}
			if (statSync(f).isDirectory()) f = join(f, 'index.html');
			res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] ?? 'application/octet-stream', 'content-length': statSync(f).size, 'cache-control': 'no-store' });
			createReadStream(f).pipe(res);
		} catch {
			res.writeHead(404);
			res.end('not found');
		}
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const addr = server.address();
	const port = typeof addr === 'object' && addr ? addr.port : 0;
	const path = relative(root, file).split(sep).map(encodeURIComponent).join('/');
	return {
		url: `http://127.0.0.1:${port}/${path}`,
		close: () => new Promise<void>((r) => {
			server.closeAllConnections();
			server.close(() => r());
		})
	};
}

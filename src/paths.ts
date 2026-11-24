// 세션 허용 루트 검사와 127.0.0.1 임시 정적 서버.
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ToolError } from './output.ts';

/** 경로가 루트 자체 또는 그 하위인지 검사한다. */
function within(root: string, file: string): boolean {
	const rel = relative(root, file);
	return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}

/** 세션의 절대경로 JSON 배열을 읽고 잘못된 정책은 cwd로 제한한다. */
function allowedRoots(cwd: string): string[] {
	try {
		const roots: unknown = JSON.parse(process.env.ASTRONDESIGN_ALLOWED_ROOTS ?? 'null');
		if (!Array.isArray(roots) || !roots.length || !roots.every((r) => typeof r === 'string' && isAbsolute(r))) return [resolve(cwd)];
		return [...new Set([resolve(cwd), ...roots.map((r: string) => resolve(r))])];
	} catch { return [resolve(cwd)]; }
}

/** 대상의 문자열 경계와 실제 경계를 모두 만족하는 가장 깊은 허용 루트를 고른다. */
export function targetRoot(file: string, cwd = process.cwd()): string {
	const abs = resolve(cwd, file);
	const roots = allowedRoots(cwd).filter((root) => within(root, abs)).sort((a, b) => b.split(sep).length - a.split(sep).length);
	const root = roots[0];
	try {
		if (root && within(realpathSync(root), realpathSync(abs))) return root;
	} catch {}
	throw new ToolError('E_PATH', '허용 루트 밖이거나 없는 경로: ' + file);
}

/** 상대 입력을 세션 cwd로 해석하고 허용 루트의 실제 경계를 검증한다. */
export function insideCwd(p: string, cwd = process.cwd()): string {
	const abs = resolve(cwd, p);
	targetRoot(abs, cwd);
	return abs;
}

/** lint 입력 디렉터리의 모든 하위 경로를 엔진 실행 전에 같은 실제 루트로 제한한다. */
export function lintTargets(paths: string[], cwd = process.cwd()): string[] {
	const targets = paths.map((p) => insideCwd(p, cwd));
	for (const target of targets) {
		try {
			const root = realpathSync(targetRoot(target, cwd));
			const ancestors = new Set<string>();
			const visit = (file: string): void => {
				const canonical = realpathSync(file);
				if (!within(root, canonical)) throw new ToolError('E_PATH', 'lint 하위 경로의 링크 이탈: ' + file);
				if (!statSync(canonical).isDirectory()) return;
				if (ancestors.has(canonical)) throw new ToolError('E_PATH', 'lint 하위 경로의 링크 순환: ' + file);
				ancestors.add(canonical);
				for (const name of readdirSync(canonical)) visit(join(canonical, name));
				ancestors.delete(canonical);
			};
			visit(target);
		} catch (e) {
			if (e instanceof ToolError) throw e;
			throw new ToolError('E_PATH', 'lint 하위 경로를 검사할 수 없음: ' + target);
		}
	}
	return targets;
}

export const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
	'.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8'
};

/** root 를 127.0.0.1 임의 포트로 제공하고 file 의 URL 을 돌려준다. root 밖 요청은 403. */
export async function serveStatic(root: string, file: string): Promise<{ url: string; close: () => Promise<void> }> {
	root = resolve(root);
	const canonicalRoot = realpathSync(root);
	const server = createServer((req, res) => {
		try {
			const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
			if (path.split(/[\\/]/).includes('..')) throw new ToolError('E_PATH', '경로 이탈');
			let f = resolve(root, '.' + path);
			if (!within(root, f)) throw new ToolError('E_PATH', '경로 이탈');
			f = realpathSync(f);
			if (!within(canonicalRoot, f)) throw new ToolError('E_PATH', '링크 이탈');
			if (statSync(f).isDirectory()) f = realpathSync(join(f, 'index.html'));
			if (!within(canonicalRoot, f)) throw new ToolError('E_PATH', 'index 링크 이탈');
			const body = readFileSync(f);
			res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
			res.end(body);
		} catch (e) {
			res.writeHead(e instanceof ToolError && e.code === 'E_PATH' ? 403 : 404);
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

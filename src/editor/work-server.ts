// 작업 리스너(포트 A): 편집기 화면·대상(cwd 정적 또는 루프백 프록시+CSP)·자동 저장 API. 승인 경로는 두지 않는다.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { request, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect } from 'node:net';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { isExternal } from '../browser.ts';
import { INTENTS } from '../intents.ts';
import { ToolError } from '../output.ts';
import { MIME } from '../paths.ts';
import { HttpError, listen, readJson, send, sendJson, type Listener } from './listen.ts';
import type { Session } from './session.ts';
import { appendEvents, loadChanges, loadComments, pendingOps, saveComments } from './store.ts';

const UI_DIR = fileURLToPath(new URL('./ui/', import.meta.url));
const SHARED_DIR = fileURLToPath(new URL('../shared/', import.meta.url));
const UI_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
const DROP = new Set(['content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'content-length', 'transfer-encoding', 'connection']);

/** 대상 응답 CSP: 같은 출처·인라인·data·blob 만 허용하고 외부 요청과 다른 출처 폼 전송을 막는다. 위반은 작업 API 로 보고한다. */
export const targetCsp = (tokA: string) => `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; form-action 'self'; frame-ancestors 'self'; report-uri /__astron/api/${tokA}/csp`;

/** 루프백 http(s) 주소만 통과시킨다. */
export function assertLoopback(url: string): URL {
	const u = new URL(url);
	if (!/^https?:$/.test(u.protocol) || isExternal(url)) throw new ToolError('E_NETWORK_DISABLED', `프록시 upstream 은 루프백만 허용: ${url}`);
	return u;
}

/** 파일을 type 에 맞춰 보낸다. */
function sendFile(res: ServerResponse, file: string, headers: Record<string, string>): void {
	res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': String(statSync(file).size), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...headers });
	createReadStream(file).pipe(res);
}

/** 편집기 화면 파일(ui 폴더 바로 아래, shared/*.js). */
function serveUi(res: ServerResponse, rest: string): void {
	const name = rest || 'index.html';
	const m = /^(shared\/)?([\w-]+\.(?:html|css|js))$/.exec(name);
	const file = m ? join(m[1] ? SHARED_DIR : UI_DIR, m[2]) : '';
	if (!file || !existsSync(file)) throw new HttpError(404, 'not found');
	sendFile(res, file, { 'content-security-policy': UI_CSP });
}

/** 편집기 상태(대상·보드·유효 연산·댓글·쓰기 가능 여부·차단 수·마지막 적용). */
function state(s: Session) {
	return {
		key: s.key, target: s.target, targetPath: s.targetPath, widths: s.widths, boards: s.widths.map((w) => ({ id: `w${w}`, width: w })), surface: s.surface,
		ops: pendingOps(loadChanges(s.dir).events), comments: loadComments(s.dir), intents: INTENTS,
		writeEnabled: s.writeEnabled, approveOrigin: s.approveOrigin, blocked: s.blocked, applied: s.lastApplied, warnings: s.warnings
	};
}

/** 세션별로 이미 센 CSP 차단 주소. */
const blockedSeen = new WeakMap<Session, Set<string>>();

/** 세션별로 기억하는 CSP 차단 주소 수 상한. */
export const BLOCKED_SEEN_MAX = 256;
/** 차단 주소를 기억할 때 남기는 최대 글자 수. 앞 BLOCKED_URI_MAX 자가 같은 두 주소는 한 건으로 센다. */
export const BLOCKED_URI_MAX = 2048;

/**
 * 차단 주소를 기억하고 처음 본 주소면 true. 문자열이 아니면 기억하지 않고 늘 true.
 * 다시 본 주소는 최신으로 옮기고, 상한을 넘으면 가장 오래된 주소부터 버린다(밀려난 주소가 다시 오면 새 건으로 센다).
 */
export function noteBlocked(seen: Set<string>, uri: unknown): boolean {
	if (typeof uri !== 'string') return true;
	const key = uri.slice(0, BLOCKED_URI_MAX);
	const fresh = !seen.delete(key);
	seen.add(key);
	if (seen.size > BLOCKED_SEEN_MAX) seen.delete(seen.values().next().value!);
	return fresh;
}

/** 자동 저장 API. POST 는 Origin 이 작업 출처일 때만 받는다(CSP 위반 보고 제외). 위반 보고는 아트보드가 여럿이라 같은 차단 주소를 한 번만 센다. */
async function api(s: Session, req: IncomingMessage, res: ServerResponse, name: string): Promise<void> {
	if (req.method === 'POST' && name === 'csp') {
		const body = await readJson(req).catch(() => null);
		const uri = body?.['csp-report']?.['blocked-uri'];
		const seen = blockedSeen.get(s) ?? new Set<string>();
		blockedSeen.set(s, seen);
		if (noteBlocked(seen, uri)) s.blocked++;
		return send(res, 204, '');
	}
	if (req.method === 'GET' && name === 'state') return sendJson(res, 200, state(s));
	if (req.method !== 'POST' || !['changes', 'comments'].includes(name)) throw new HttpError(404, 'not found');
	if (req.headers.origin !== s.workOrigin) throw new HttpError(403, 'Origin 불일치');
	const body = await readJson(req);
	if (name === 'changes') return sendJson(res, 200, { ok: true, ops: pendingOps(appendEvents(s.dir, body.events)) });
	sendJson(res, 200, { ok: true, comments: saveComments(s.dir, body.items) });
}

/** cwd 정적 제공. 경로 탈출은 403, 점 파일·점 폴더·없는 파일은 404. */
function serveStaticTarget(s: Session, res: ServerResponse, path: string): void {
	let decoded: string;
	try {
		decoded = decodeURIComponent(path);
	} catch {
		throw new HttpError(400, '경로 형식 오류');
	}
	const abs = resolve(s.cwd, '.' + decoded.replace(/\\/g, '/'));
	const rel = relative(s.cwd, abs);
	if (rel.startsWith('..') || isAbsolute(rel)) throw new HttpError(403, 'cwd 밖 경로');
	if (rel.split(sep).some((p) => p.startsWith('.'))) throw new HttpError(404, 'not found');
	let file = abs;
	if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
	if (!existsSync(file) || !statSync(file).isFile()) throw new HttpError(404, 'not found');
	sendFile(res, file, { 'content-security-policy': targetCsp(s.tokA) });
}

/** 루프백 upstream 으로 넘기고 응답의 CSP·X-Frame-Options 를 편집기 CSP 로 바꾼다. */
function proxy(s: Session, req: IncomingMessage, res: ServerResponse): void {
	const up = assertLoopback(s.upstream!);
	const out = request({ host: up.hostname, port: up.port, method: req.method, path: req.url, headers: { ...req.headers, host: up.host } }, (r) => {
		const headers: Record<string, string | string[]> = {};
		for (const [k, v] of Object.entries(r.headers)) if (v !== undefined && !DROP.has(k)) headers[k] = v;
		res.writeHead(r.statusCode ?? 502, { ...headers, 'content-security-policy': targetCsp(s.tokA) });
		r.pipe(res);
	});
	out.on('error', (e) => sendJson(res, 502, { error: 'HTTP_502', message: `upstream: ${e.message}` }));
	req.pipe(out);
}

/** WebSocket upgrade(개발 서버 HMR)를 루프백 upstream 으로 잇는다. */
function proxyUpgrade(s: Session, req: IncomingMessage, socket: Duplex, head: Buffer): void {
	if (!s.upstream || req.url?.startsWith('/__astron/')) return void socket.destroy();
	const up = assertLoopback(s.upstream);
	const conn = connect(Number(up.port || 80), up.hostname, () => {
		const lines = [`${req.method} ${req.url} HTTP/1.1`, ...Object.entries({ ...req.headers, host: up.host }).map(([k, v]) => `${k}: ${v}`), '', ''];
		conn.write(lines.join('\r\n'));
		if (head.length) conn.write(head);
		conn.pipe(socket);
		socket.pipe(conn);
	});
	conn.on('error', () => socket.destroy());
	socket.on('error', () => conn.destroy());
}

/** 작업 리스너를 연다. `/__astron/<tokA>/` 는 화면, `/__astron/api/<tokA>/*` 는 API, 나머지는 대상이다. */
export function startWorkServer(s: Session): Promise<Listener> {
	return listen(async (req, res, path) => {
		const ui = /^\/__astron\/([^/]+)\/(.*)$/.exec(path);
		const apiPath = /^\/__astron\/api\/([^/]*)\/?(.*)$/.exec(path);
		if (apiPath) {
			if (apiPath[1] !== s.tokA) throw new HttpError(403, '작업 토큰 없음');
			return api(s, req, res, apiPath[2]);
		}
		if (ui) {
			if (ui[1] !== s.tokA) throw new HttpError(403, '작업 토큰 없음');
			if (req.method !== 'GET') throw new HttpError(404, 'not found');
			return serveUi(res, ui[2]);
		}
		if (path.startsWith('/__astron')) throw new HttpError(404, 'not found');
		if (s.upstream) return proxy(s, req, res);
		if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(404, 'not found');
		serveStaticTarget(s, res, path);
	}, (req, socket, head) => proxyUpgrade(s, req, socket, head));
}

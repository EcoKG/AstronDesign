// 편집기 리스너 공통: 127.0.0.1 임의 포트, Host 검사, 본문 1MB 상한, 보안 헤더, JSON 응답, 오류 코드 → HTTP 상태.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { ToolError } from '../output.ts';

export const BODY_MAX = 1024 * 1024;

export type Listener = { port: number; origin: string; server: Server; close: () => Promise<void> };
export type Handler = (req: IncomingMessage, res: ServerResponse, path: string, search: string) => Promise<void> | void;

/** 상태 코드를 가진 요청 오류. */
export class HttpError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

const STATUS: Record<string, number> = { E_INPUT: 400, E_PATH: 400, E_WRITE_DISABLED: 403, E_CONFLICT: 409, E_SESSION: 404, E_NETWORK_DISABLED: 403 };
const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };

/** 응답을 보낸다(보안 기본 헤더 포함). */
export function send(res: ServerResponse, status: number, body: string | Buffer, headers: Record<string, string> = {}): void {
	if (res.headersSent) return void res.end();
	res.writeHead(status, { ...BASE_HEADERS, 'content-length': String(Buffer.byteLength(body)), ...headers });
	res.end(body);
}

/** JSON 응답을 보낸다. */
export function sendJson(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}): void {
	send(res, status, JSON.stringify(data), { 'content-type': 'application/json; charset=utf-8', ...headers });
}

/** 요청 본문을 읽는다. 1MB 를 넘으면 끝까지 버린 뒤 413 을 던진다. */
export function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		req.on('data', (d: Buffer) => {
			size += d.length;
			if (size <= BODY_MAX) chunks.push(d);
		});
		req.on('end', () => (size > BODY_MAX ? reject(new HttpError(413, `본문 ${BODY_MAX}바이트 초과`)) : resolve(Buffer.concat(chunks).toString('utf8'))));
		req.on('error', reject);
	});
}

/** JSON 본문을 읽는다. 형식이 틀리면 400. */
export async function readJson(req: IncomingMessage): Promise<any> {
	const text = await readBody(req);
	try {
		return text ? JSON.parse(text) : {};
	} catch {
		throw new HttpError(400, 'JSON 본문이 아닙니다');
	}
}

/** 127.0.0.1 임의 포트에 리스너를 연다. Host 가 `127.0.0.1:<port>` 가 아니면 403, 던진 오류는 JSON 오류 응답으로 바꾼다. */
export async function listen(handle: Handler, upgrade?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): Promise<Listener> {
	let port = 0;
	const hostOk = (req: IncomingMessage) => req.headers.host === `127.0.0.1:${port}`;
	const server = createServer(async (req, res) => {
		try {
			if (!hostOk(req)) throw new HttpError(403, 'Host 불일치');
			const raw = req.url ?? '/';
			const q = raw.indexOf('?');
			await handle(req, res, q < 0 ? raw : raw.slice(0, q), q < 0 ? '' : raw.slice(q));
		} catch (e) {
			const status = e instanceof HttpError ? e.status : e instanceof ToolError ? STATUS[e.code] ?? 500 : 500;
			const code = e instanceof ToolError ? e.code : `HTTP_${status}`;
			sendJson(res, status, { error: code, message: e instanceof Error ? e.message : String(e) });
		}
	});
	server.on('upgrade', (req, socket, head) => {
		if (!upgrade || !hostOk(req)) return void socket.destroy();
		upgrade(req, socket, head);
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const addr = server.address();
	port = typeof addr === 'object' && addr ? addr.port : 0;
	return {
		port,
		origin: `http://127.0.0.1:${port}`,
		server,
		close: () => new Promise<void>((r) => {
			server.closeAllConnections();
			server.close(() => r());
		})
	};
}

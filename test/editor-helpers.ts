// 편집기 시험 공용: 원시 HTTP 요청, 작업·승인 출처 헤더, 연산 생성.
import { request, type IncomingHttpHeaders } from 'node:http';
import type { Session } from '../src/editor/session.ts';
import type { Op } from '../src/shared/ops.js';

export type Res = { status: number; headers: IncomingHttpHeaders; body: string };

/** Host·경로를 그대로 보내는 HTTP 요청(fetch 와 달리 Host·Origin·Sec-Fetch-* 를 마음대로 넣는다). */
export function http(url: string, o: { method?: string; headers?: Record<string, string>; body?: string | Buffer; path?: string } = {}): Promise<Res> {
	const u = new URL(url);
	return new Promise((resolve, reject) => {
		const req = request({ host: u.hostname, port: u.port, method: o.method ?? 'GET', path: o.path ?? u.pathname + u.search, headers: o.headers }, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (d: Buffer) => chunks.push(d));
			res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
		});
		req.on('error', reject);
		if (o.body !== undefined) req.write(o.body);
		req.end();
	});
}

/** 승인 토큰(승인 주소의 해시). */
export const approveToken = (s: Session) => new URL(s.approveUrl!).hash.slice(1);

/** 승인 화면 출처에서 보낸 것과 같은 헤더. */
export const approveHeaders = (s: Session): Record<string, string> => ({ 'x-astron-approve': approveToken(s), origin: s.approveOrigin!, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' });

/** 작업 화면 출처에서 보낸 것과 같은 헤더. */
export const workHeaders = (s: Session): Record<string, string> => ({ origin: s.workOrigin, 'content-type': 'application/json' });

/** 작업 API 주소. */
export const workApi = (s: Session, name: string) => `${s.workOrigin}/__astron/api/${s.tokA}/${name}`;

/** style 연산 하나. */
export const styleOp = (o: Partial<Op>): Op => ({ id: `op-${Math.random().toString(16).slice(2, 8)}`, kind: 'style', path: [1, 0, 2], tag: 'p', selector: 'p.low', prop: 'color', before: 'rgb(179, 179, 179)', after: '#595959', attr: 'color: #b3b3b3', ...o }) as Op;

// 승인 리스너(포트 B, 작업 화면과 다른 출처): 승인 화면과 plan·approve API. 토큰·Origin·Sec-Fetch-Site 를 모두 확인한다.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approveApply, planApply } from './apply.ts';
import { HttpError, listen, readJson, send, sendJson, type Listener } from './listen.ts';
import type { Session } from './session.ts';

const UI_DIR = fileURLToPath(new URL('./ui/', import.meta.url));
const FILES: Record<string, [string, string]> = {
	'/': [join(UI_DIR, 'approve', 'index.html'), 'text/html; charset=utf-8'],
	'/approve.js': [join(UI_DIR, 'approve', 'approve.js'), 'text/javascript; charset=utf-8'],
	'/editor.css': [join(UI_DIR, 'editor.css'), 'text/css; charset=utf-8']
};
const SECURITY = {
	'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
	'x-frame-options': 'DENY'
};

/** 거부한 승인 요청을 denied.jsonl 에 남긴다(토큰은 남기지 않음). */
function deny(s: Session, req: IncomingMessage, reason: string): never {
	appendFileSync(join(s.dir, 'denied.jsonl'), JSON.stringify({ at: new Date().toISOString(), path: req.url, origin: req.headers.origin ?? null, site: req.headers['sec-fetch-site'] ?? null, reason }) + '\n');
	throw new HttpError(403, `승인 거부: ${reason}`);
}

/** 승인 API 요청 검사: 토큰 해시 일치, Origin = 승인 출처, Sec-Fetch-Site = same-origin. */
function guard(s: Session, req: IncomingMessage): void {
	const tok = req.headers['x-astron-approve'];
	const got = createHash('sha256').update(typeof tok === 'string' ? tok : '').digest();
	if (!s.tokBHash || typeof tok !== 'string' || !tok || !timingSafeEqual(got, Buffer.from(s.tokBHash, 'hex'))) deny(s, req, '토큰');
	if (req.headers.origin !== s.approveOrigin) deny(s, req, 'Origin');
	if (req.headers['sec-fetch-site'] !== 'same-origin') deny(s, req, 'Sec-Fetch-Site');
}

/** 승인 리스너를 연다. 화면은 토큰 없이 받고, API 는 guard 를 통과해야 한다. */
export function startApproveServer(s: Session): Promise<Listener> {
	return listen(async (req, res, path) => {
		if (req.method === 'GET' && FILES[path] && existsSync(FILES[path][0])) {
			return send(res, 200, readFileSync(FILES[path][0]), { 'content-type': FILES[path][1], ...SECURITY });
		}
		if (req.method !== 'POST' || (path !== '/api/plan' && path !== '/api/approve')) throw new HttpError(404, 'not found');
		guard(s, req);
		const body = await readJson(req);
		if (path === '/api/plan') {
			const p = planApply(s);
			return sendJson(res, 200, {
				target: s.target, files: p.files.map((f) => f.rel), diff: p.diff, nonce: p.nonce,
				skipped: p.skipped.map(({ op, reason }) => ({ selector: op.selector, kind: op.kind, prop: op.prop ?? null, after: op.after, reason }))
			}, SECURITY);
		}
		const r = approveApply(s, String(body.nonce ?? ''), { userAgent: String(req.headers['user-agent'] ?? '') });
		const line = await s.render().then((t) => t.split('\n')[0], (e: unknown) => `ERROR E_ENGINE: 다시 렌더 실패: ${e instanceof Error ? e.message : String(e)}`);
		s.lastApplied = { stamp: r.stamp, line };
		sendJson(res, 200, { ok: true, ...r, render: line }, SECURITY);
	});
}

import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { cleanup, makeProj } from '../helpers.ts';
import { approveHeaders, approveToken, http, workApi, workHeaders } from '../editor-helpers.ts';
import { closeEditors, openSession, type Session } from '../../src/editor/session.ts';
import { assertLoopback } from '../../src/editor/work-server.ts';
import { outRoot, ToolError } from '../../src/output.ts';

afterEach(async () => {
	await closeEditors();
	delete process.env.ASTRONDESIGN_WRITE;
	delete process.env.ASTRONDESIGN_NETWORK;
});
after(cleanup);

const isCode = (c: string) => (e: unknown) => e instanceof ToolError && e.code === c;

/** 편집기 세션 하나(write 면 쓰기 키 둘을 켬). */
async function session(write = false, target = 'editor/index.html'): Promise<{ s: Session; proj: string }> {
	if (write) process.env.ASTRONDESIGN_WRITE = 'allow';
	const proj = makeProj('editor');
	const s = await openSession({ target, surface: 'operate', allowWrite: write, cwd: proj });
	s.render = async () => 'OK design_render: stub';
	return { s, proj };
}

const hostOf = (origin: string) => new URL(origin).host;

test('SV1 Host 가 127.0.0.1:<port> 가 아니면 거부', async () => {
	const { s } = await session(true);
	for (const host of ['evil.example', `localhost:${new URL(s.workOrigin).port}`, '127.0.0.1:1']) {
		assert.equal((await http(`${s.workUrl}`, { headers: { host } })).status, 403, host);
		assert.equal((await http(`${s.approveOrigin}/`, { headers: { host } })).status, 403, host);
	}
	assert.equal((await http(s.workUrl, { headers: { host: hostOf(s.workOrigin) } })).status, 200);
});

test('SV2 토큰 없는 API → 403', async () => {
	const { s } = await session();
	assert.equal((await http(workApi(s, 'state'))).status, 200);
	for (const p of ['/__astron/api/state', '/__astron/api/0000/state', `/__astron/api/${s.tokA.slice(0, -1)}x/state`]) {
		assert.equal((await http(`${s.workOrigin}${p}`)).status, 403, p);
	}
	assert.equal((await http(`${s.workOrigin}/__astron/${'0'.repeat(32)}/`)).status, 403);
});

test('SV3 Origin 다른 POST → 403', async () => {
	const { s } = await session();
	const body = JSON.stringify({ events: [] });
	assert.equal((await http(workApi(s, 'changes'), { method: 'POST', headers: { ...workHeaders(s), origin: 'http://evil.example' }, body })).status, 403);
	assert.equal((await http(workApi(s, 'changes'), { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status, 403);
	assert.equal((await http(workApi(s, 'comments'), { method: 'POST', headers: { ...workHeaders(s), origin: 'http://127.0.0.1:1' }, body: '{"items":[]}' })).status, 403);
	assert.equal((await http(workApi(s, 'changes'), { method: 'POST', headers: workHeaders(s), body })).status, 200);
});

test('SV4 본문 1MB 초과 → 413', async () => {
	const { s } = await session(true);
	const big = '{"events":[],"pad":"' + 'x'.repeat(1024 * 1024) + '"}';
	assert.equal((await http(workApi(s, 'changes'), { method: 'POST', headers: workHeaders(s), body: big })).status, 413);
	assert.equal((await http(`${s.approveOrigin}/api/plan`, { method: 'POST', headers: approveHeaders(s), body: big })).status, 413);
});

test('SV5 점 파일·점 폴더 요청 → 404', async () => {
	const { s, proj } = await session();
	writeFileSync(join(proj, '.env'), 'SECRET=1');
	mkdirSync(join(proj, '.git'), { recursive: true });
	writeFileSync(join(proj, '.git', 'config'), '[core]');
	writeFileSync(join(proj, 'editor', '.hidden.html'), '<p>x</p>');
	for (const p of ['/.env', '/.git/config', '/editor/.hidden.html', '/%2eenv', '/.astron-logs/astrondesign/.gitignore']) {
		const r = await http(`${s.workOrigin}${p}`);
		assert.equal(r.status, 404, p);
		assert.doesNotMatch(r.body, /SECRET|core/);
	}
	assert.equal((await http(`${s.workOrigin}/editor/index.html`)).status, 200);
});

test('SV6 cwd 밖(../) 요청 → 403', async () => {
	const { s } = await session();
	for (const path of ['/../package.json', '/%2e%2e/package.json', '/editor/..%2f..%2fpackage.json', '/..%5cpackage.json']) {
		assert.equal((await http(s.workOrigin, { path })).status, 403, path);
	}
});

test("SV7 UI 응답 CSP frame-ancestors 'none'·대상 응답 CSP default-src 'self'", async () => {
	const { s } = await session();
	const ui = await http(s.workUrl);
	assert.match(String(ui.headers['content-security-policy']), /frame-ancestors 'none'/);
	assert.match(String(ui.headers['content-security-policy']), /default-src 'self'/);
	const tgt = await http(`${s.workOrigin}/editor/index.html`);
	const csp = String(tgt.headers['content-security-policy']);
	assert.match(csp, /default-src 'self'/);
	assert.match(csp, /connect-src 'self' ws:\/\/127\.0\.0\.1:\* ws:\/\/localhost:\*/);
	assert.doesNotMatch(csp, /http:\/\/127\.0\.0\.1/);
	assert.match(csp, /form-action 'self'/);
	assert.match(csp, /report-uri \/__astron\/api\/[0-9a-f]+\/csp/);
});

test('SV8 외부 URL 대상 → E_NETWORK_DISABLED', async () => {
	process.env.ASTRONDESIGN_NETWORK = 'allow';
	const proj = makeProj();
	for (const target of ['https://example.com/', 'http://10.0.0.1:8080/', 'ws://example.com/']) {
		await assert.rejects(openSession({ target, surface: 'operate', cwd: proj }), (e: unknown) => e instanceof ToolError && /E_NETWORK_DISABLED|E_INPUT/.test(e.code), target);
	}
	await assert.rejects(openSession({ target: 'https://example.com/', surface: 'operate', cwd: proj }), isCode('E_NETWORK_DISABLED'));
});

test('SV9 루프백 프록시: HTML 에 CSP 붙임, 비루프백 upstream 거부', async () => {
	const up = createServer((req, res) => {
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src *", 'x-frame-options': 'DENY' });
		res.end(`<!doctype html><title>up</title><p>${req.url}</p>`);
	});
	await new Promise<void>((r) => up.listen(0, '127.0.0.1', r));
	try {
		const port = (up.address() as { port: number }).port;
		const proj = makeProj();
		const s = await openSession({ target: `http://127.0.0.1:${port}/app/`, surface: 'operate', cwd: proj });
		assert.equal(s.targetPath, '/app/');
		const r = await http(`${s.workOrigin}/app/?q=1`);
		assert.equal(r.status, 200);
		assert.match(r.body, /<p>\/app\/\?q=1<\/p>/);
		assert.match(String(r.headers['content-security-policy']), /default-src 'self'/);
		assert.doesNotMatch(String(r.headers['content-security-policy']), /default-src \*/);
		assert.equal(r.headers['x-frame-options'], undefined);
	} finally {
		up.close();
	}
	assert.throws(() => assertLoopback('http://10.0.0.1:80'), isCode('E_NETWORK_DISABLED'));
	assert.throws(() => assertLoopback('http://example.com'), isCode('E_NETWORK_DISABLED'));
	assert.doesNotThrow(() => assertLoopback('http://localhost:5173'));
});

test("SV10 승인 리스너는 쓰기 키 둘 다 있을 때만 열림, 응답에 frame-ancestors 'none'·X-Frame-Options DENY", async () => {
	const off = await session(false);
	assert.equal(off.s.approveUrl, null);
	assert.equal(off.s.approveOrigin, null);
	await closeEditors();
	process.env.ASTRONDESIGN_WRITE = 'allow';
	const half = await openSession({ target: 'editor/index.html', surface: 'operate', allowWrite: false, cwd: makeProj('editor') });
	assert.equal(half.approveUrl, null);
	await closeEditors();
	const { s } = await session(true);
	assert.match(s.approveUrl!, /^http:\/\/127\.0\.0\.1:\d+\/#[0-9a-f]{64}$/);
	assert.notEqual(new URL(s.approveOrigin!).port, new URL(s.workOrigin).port);
	const r = await http(`${s.approveOrigin}/`);
	assert.equal(r.status, 200);
	assert.match(String(r.headers['content-security-policy']), /frame-ancestors 'none'/);
	assert.equal(r.headers['x-frame-options'], 'DENY');
});

test('SV11 승인 API 는 X-Astron-Approve 토큰·Origin=승인 출처·Sec-Fetch-Site same-origin 이 아니면 403', async () => {
	const { s } = await session(true);
	const url = `${s.approveOrigin}/api/plan`;
	const good = approveHeaders(s);
	const bad: Record<string, string>[] = [
		{ ...good, 'x-astron-approve': '' },
		{ ...good, 'x-astron-approve': approveToken(s).replace(/^./, (c) => (c === '0' ? '1' : '0')) },
		{ ...good, origin: s.workOrigin },
		{ ...good, origin: 'null' },
		{ ...good, 'sec-fetch-site': 'same-site' },
		{ ...good, 'sec-fetch-site': 'cross-site' }
	];
	for (const headers of bad) assert.equal((await http(url, { method: 'POST', headers, body: '{}' })).status, 403, JSON.stringify(headers));
	const noSite = { ...good };
	delete noSite['sec-fetch-site'];
	assert.equal((await http(url, { method: 'POST', headers: noSite, body: '{}' })).status, 403);
	assert.equal((await http(url, { method: 'POST', headers: good, body: '{}' })).status, 200);
});

test('SV12 승인 토큰은 OUT 파일·서버 로그에 평문으로 남지 않음(해시만)', async () => {
	const logged: string[] = [];
	const orig = process.stderr.write.bind(process.stderr);
	process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
		logged.push(String(chunk));
		return (orig as (...a: unknown[]) => boolean)(chunk, ...rest);
	}) as typeof process.stderr.write;
	try {
		const { s, proj } = await session(true);
		const tok = approveToken(s);
		await http(`${s.approveOrigin}/api/plan`, { method: 'POST', headers: approveHeaders(s), body: '{}' });
		await http(`${s.approveOrigin}/api/plan`, { method: 'POST', headers: { ...approveHeaders(s), origin: 'http://evil.example' }, body: '{}' });
		const files: string[] = [];
		const walk = (d: string) => {
			for (const n of readdirSync(d)) {
				const p = join(d, n);
				if (statSync(p).isDirectory()) walk(p);
				else files.push(p);
			}
		};
		walk(outRoot(proj));
		assert.ok(files.length > 0);
		for (const f of files) assert.ok(!readFileSync(f, 'utf8').includes(tok), f);
		const hash = createHash('sha256').update(tok).digest('hex');
		assert.ok(readFileSync(join(s.dir, 'session.json'), 'utf8').includes(hash));
		assert.ok(!logged.join('').includes(tok));
	} finally {
		process.stderr.write = orig;
	}
});

test('SV13 작업 리스너에 plan·approve 경로 없음(404)', async () => {
	const { s } = await session(true);
	for (const p of ['plan', 'approve']) {
		assert.equal((await http(workApi(s, p), { method: 'POST', headers: workHeaders(s), body: '{}' })).status, 404, p);
		assert.equal((await http(`${s.workOrigin}/api/${p}`, { method: 'POST', headers: workHeaders(s), body: '{}' })).status, 404, p);
	}
});

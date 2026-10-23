import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { join } from 'node:path';
import { insideCwd, serveStatic } from '../../src/paths.ts';
import { ToolError } from '../../src/output.ts';
import { cleanup, makeProj } from '../helpers.ts';

after(cleanup);

function proj(): string {
	const d = makeProj();
	mkdirSync(join(d, 'site'), { recursive: true });
	writeFileSync(join(d, 'site', 'index.html'), '<h1>hi</h1>');
	writeFileSync(join(d, 'secret.txt'), 'secret');
	return d;
}

const status = (url: string, path: string) => new Promise<number>((resolve, reject) => {
	const u = new URL(url);
	get({ host: u.hostname, port: u.port, path }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }).on('error', reject);
});

test('PA1 cwd 밖 경로 거부', () => {
	const cwd = proj();
	assert.equal(insideCwd('site/index.html', cwd), join(cwd, 'site', 'index.html'));
	for (const bad of ['..\\outside.html', 'C:\\Windows\\win.ini', 'site/none.html']) {
		assert.throws(() => insideCwd(bad, cwd), (e: unknown) => e instanceof ToolError && e.code === 'E_PATH', bad);
	}
});

test('PA2 정적 서버 경로 이탈 403', async () => {
	const cwd = proj();
	const srv = await serveStatic(join(cwd, 'site'), join(cwd, 'site', 'index.html'));
	try {
		assert.match(srv.url, /^http:\/\/127\.0\.0\.1:\d+\/index\.html$/);
		assert.equal(await status(srv.url, '/index.html'), 200);
		assert.equal(await status(srv.url, '/..%2fsecret.txt'), 403);
		assert.equal(await status(srv.url, '/..%5csecret.txt'), 403);
		assert.equal(await status(srv.url, '/none.html'), 404);
	} finally {
		await srv.close();
	}
});

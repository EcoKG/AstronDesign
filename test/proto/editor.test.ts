import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, makeProj, startServer, textOf } from '../helpers.ts';

after(cleanup);

const workUrl = (t: string) => /^편집기: (\S+)$/m.exec(t)?.[1];

test('EP1 design_edit 작업 주소는 127.0.0.1·토큰 포함·재호출 시 같음, 쓰기 키 없으면 승인 주소 없음', async () => {
	const c = await startServer(makeProj('editor'));
	const first = textOf(await c.call('design_edit', { target: 'editor/index.html', surface: 'operate' }));
	assert.match(first, /^OK design_edit: editor\/index\.html/);
	const url = workUrl(first);
	assert.match(url ?? '', /^http:\/\/127\.0\.0\.1:\d+\/__astron\/[0-9a-f]{32}\/$/);
	assert.match(first, /^세션: .+editor[\\/][0-9a-f]{12}$/m);
	assert.doesNotMatch(first, /승인 주소/);
	assert.match(first, /원본 쓰기: 꺼짐/);
	const again = textOf(await c.call('design_edit', { target: 'editor/index.html', surface: 'operate', allow_write: true }));
	assert.equal(workUrl(again), url);
	assert.doesNotMatch(again, /승인 주소/);
	const res = await fetch(url!);
	assert.equal(res.status, 200);
	const writable = await startServer(makeProj('editor'), { ASTRONDESIGN_WRITE: 'allow' });
	const w = textOf(await writable.call('design_edit', { target: 'editor/index.html', surface: 'operate', allow_write: true }));
	assert.match(w, /^승인 주소: http:\/\/127\.0\.0\.1:\d+\/#[0-9a-f]{64}$/m);
	const ext = await c.call('design_edit', { target: 'https://example.com/', surface: 'operate' });
	assert.equal(ext.isError, true);
	assert.match(textOf(ext), /^ERROR E_NETWORK_DISABLED/);
});

test('EP2 design_handoff 세션 없음 → E_SESSION', async () => {
	const c = await startServer(makeProj('editor'));
	const r = await c.call('design_handoff', { target: 'editor/react.html' });
	assert.equal(r.isError, true);
	assert.match(textOf(r), /^ERROR E_SESSION:/);
});

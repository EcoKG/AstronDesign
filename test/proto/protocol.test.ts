import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, makeProj, startServer, textOf } from '../helpers.ts';

after(cleanup);

test('P1 initialize 2025-11-25', async () => {
	const c = await startServer(makeProj());
	assert.equal(c.init?.result?.protocolVersion, '2025-11-25');
	assert.equal(c.init?.result?.serverInfo?.name, 'astrondesign');
	assert.ok(c.init?.result?.capabilities?.tools);
});

test('P2 도구 6개·이름 정규식·37자·설명 300자·tools/list 6,000자 이하·outputSchema 없음', async () => {
	const c = await startServer(makeProj());
	const r = await c.request('tools/list');
	const tools = r.result.tools as { name: string; description: string; outputSchema?: unknown }[];
	assert.deepEqual(tools.map((t) => t.name).sort(), ['design_direction', 'design_guide', 'design_inspect', 'design_lint', 'design_render', 'design_search']);
	for (const t of tools) {
		assert.match(t.name, /^design_[a-z_]+$/);
		assert.ok(t.name.length <= 37, t.name);
		assert.ok(('mcp__astron__astrondesign__' + t.name).length <= 64);
		assert.ok(t.description.length > 0 && t.description.length <= 300, `${t.name} 설명 ${t.description.length}`);
		assert.equal(t.outputSchema, undefined, t.name);
	}
	const size = JSON.stringify(r.result).length;
	assert.ok(size <= 6000, `tools/list ${size}자`);
});

test('P3 prompts/list -32601', async () => {
	const c = await startServer(makeProj());
	assert.equal((await c.request('prompts/list')).error?.code, -32601);
	assert.equal((await c.request('resources/list')).error?.code, -32601);
});

test('P4 없는 도구 -32602', async () => {
	const c = await startServer(makeProj());
	const r = await c.request('tools/call', { name: 'design_nope', arguments: {} });
	assert.equal(r.error?.code, -32602);
});

test("P5 잘못된 인자 → isError:true 이고 text 가 'Input validation error' 로 시작(SDK 문구, 4.1 E_INPUT 예외)", async () => {
	const c = await startServer(makeProj());
	const r = await c.call('design_guide', { topic: 'BAD TOPIC!' });
	assert.equal(r.isError, true);
	assert.match(textOf(r), /^Input validation error/);
	const s = await c.call('design_search', { query: 'x' });
	assert.equal(s.isError, true);
	assert.match(textOf(s), /^Input validation error/);
});

test('P6 기동~tools/list 2,000ms 이내', async () => {
	const t0 = Date.now();
	const c = await startServer(makeProj());
	const r = await c.request('tools/list');
	const ms = Date.now() - t0;
	assert.equal(r.result.tools.length, 6);
	assert.ok(ms <= 2000, `${ms}ms`);
});

test('P7 stdout 은 JSON 줄만', async () => {
	const c = await startServer(makeProj());
	await c.request('tools/list');
	await c.call('design_guide', {});
	await c.call('design_guide', { topic: 'nope/zz' });
	assert.ok(c.lines.length >= 4);
	for (const l of c.lines) assert.doesNotThrow(() => JSON.parse(l), l.slice(0, 80));
});

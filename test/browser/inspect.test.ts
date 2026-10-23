import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanup, makeProj, startServer, textOf, type Client } from '../helpers.ts';

after(cleanup);

type Item = { selector: string; html: string; styles: Record<string, string>; matches: number };

async function withServer(cwd: string, fn: (c: Client) => Promise<void>): Promise<void> {
	const c = await startServer(cwd);
	try {
		await fn(c);
	} finally {
		await c.close();
	}
}

const inspect = (c: Client, args: Record<string, unknown>) => c.call('design_inspect', { target: 'persuade/index.html', ...args }, 120000);
const pathOf = (text: string, key: string) => {
	const m = new RegExp(`^${key}: (.+)$`, 'm').exec(text);
	assert.ok(m, text.slice(0, 300));
	return m[1].trim();
};
const items = (text: string) => (JSON.parse(readFileSync(pathOf(text, 'report'), 'utf8')) as { items: Item[] }).items;

const STYLES = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'backgroundColor', 'border', 'borderRadius', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'zIndex'];
const FIELDS = ['Intent', 'Selector', 'Location', 'Source', 'React', 'Bounds', 'Classes', 'Text', 'Nearby', 'Computed styles', 'DOM path', 'HTML', 'Feedback'];

test('I1 계산 스타일 16개·HTML ≤4,096', async () => {
	await withServer(makeProj('persuade'), async (c) => {
		const r = await inspect(c, { selector: 'h1' });
		const t = textOf(r);
		assert.match(t, /^OK design_inspect: 1개 요소/);
		const [it] = items(t);
		assert.deepEqual(Object.keys(it.styles), STYLES);
		assert.ok(it.html.length <= 4096);
		assert.match(it.html, /^<h1/);
		assert.ok(r.content.some((x) => x.type === 'image'), '잘린 이미지');
	});
});

test('I2 data-token 속성 [redacted]·href 쿼리 제거', async () => {
	await withServer(makeProj('persuade'), async (c) => {
		const [it] = items(textOf(await inspect(c, { selector: 'a.cta' })));
		assert.match(it.html, /data-token="\[redacted\]"/);
		assert.match(it.html, /href="\/x"/);
		assert.doesNotMatch(it.html, /abc|\?token|#h"/);
	});
});

test('I3 0개 일치 E_SELECTOR', async () => {
	await withServer(makeProj('persuade'), async (c) => {
		const r = await inspect(c, { selector: '.no-such-element' });
		assert.equal(r.isError, true);
		assert.match(textOf(r), /^ERROR E_SELECTOR:/);
	});
});

test("I4 notes 21개 → isError 이고 'Input validation error' 접두(zod max 20, SDK 문구). 20개 → feedback.md 필드 순서", async () => {
	await withServer(makeProj('persuade'), async (c) => {
		const note = { selector: 'h1', note: 'Headline reads as generic', intent: 'fix' };
		const bad = await inspect(c, { notes: Array.from({ length: 21 }, () => note) });
		assert.equal(bad.isError, true);
		assert.match(textOf(bad), /^Input validation error/);
		const t = textOf(await inspect(c, { notes: Array.from({ length: 20 }, () => note) }));
		assert.match(t, /^OK design_inspect: 20개 요소/);
		const md = readFileSync(pathOf(t, 'feedback'), 'utf8');
		assert.match(md, /^## Design Feedback\n- URL: /);
		const first = md.slice(md.indexOf('### 1.'), md.indexOf('### 2.'));
		const pos = FIELDS.map((f) => first.indexOf(`- ${f}:`));
		assert.ok(pos.every((p) => p >= 0), JSON.stringify(pos));
		assert.deepEqual([...pos].sort((a, b) => a - b), pos);
		assert.equal((md.match(/^### \d+\./gm) ?? []).length, 20);
	});
});

test('I5 point 입력', async () => {
	await withServer(makeProj('persuade'), async (c) => {
		const t = textOf(await inspect(c, { point: { x: 40, y: 20 } }));
		assert.match(t, /^OK design_inspect: 1개 요소/);
		const [it] = items(t);
		assert.ok(it.selector.length > 0 && it.selector.length <= 700);
		assert.match(t, /## Design Feedback/);
	});
});

test("I6 selector·point·notes 가 모두 없음 → 'ERROR E_INPUT:' 첫 줄(처리기 판정)", async () => {
	await withServer(makeProj('persuade'), async (c) => {
		const r = await inspect(c, {});
		assert.equal(r.isError, true);
		assert.match(textOf(r), /^ERROR E_INPUT:/);
	});
});

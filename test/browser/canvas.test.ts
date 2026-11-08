import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { ROOT, cleanup, makeProj, startServer } from '../helpers.ts';
import { ACTIVE, activeW, centerOf, closeContexts, edit, frameOf, inside, near, open, ready, rect, screenRect, setProp, state, view } from '../editor-page.ts';
import { closeBrowser } from '../../src/browser.ts';
import { selectorAt } from '../../src/shared/dom-bundle.js';

const E2E = join(ROOT, '.astron-logs', 'astrondesign', 'editor-e2e');
mkdirSync(E2E, { recursive: true });

after(async () => {
	await closeContexts();
	await closeBrowser();
	await cleanup();
});

const board = (page: Page, w: number) => rect(page, `.artboard[data-w="${w}"]`);
const boards = (page: Page) => page.$$eval('.artboard', (els) => els.map((e) => Number((e as HTMLElement).dataset.w)));
const canvasCenter = async (page: Page) => {
	const c = await rect(page, '#canvas');
	return { x: c.x + c.width / 2, y: c.y + c.height * 0.4 };
};

test('CV1 스페이스+드래그와 휠로 캔버스 이동: 보드가 끈 만큼 이동, 배율 불변', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url);
	const p = await canvasCenter(page);
	const v0 = await view(page);
	const b0 = await board(page, 1440);
	await page.mouse.move(p.x, p.y);
	await page.mouse.wheel(0, 120);
	await page.waitForFunction((y) => (window as any).__astron.view().y !== y, v0.y);
	const v1 = await view(page);
	near(v1.y, v0.y - 120, '휠 세로 이동');
	near(v1.x, v0.x, '휠 가로 불변');
	assert.equal(v1.zoom, v0.zoom);
	near((await board(page, 1440)).y, b0.y - 120, '보드도 같이 이동');
	await page.keyboard.down('Shift');
	await page.mouse.wheel(0, 100);
	await page.keyboard.up('Shift');
	await page.waitForFunction((x) => (window as any).__astron.view().x !== x, v1.x);
	const v2 = await view(page);
	near(v2.x, v1.x - 100, 'Shift+휠 가로 이동');
	near(v2.y, v1.y, 'Shift+휠 세로 불변');
	const h1 = await centerOf(page, 'h1');
	await page.keyboard.down('Space');
	await page.mouse.move(h1.x, h1.y);
	await page.mouse.down();
	await page.mouse.move(h1.x + 60, h1.y + 40, { steps: 4 });
	await page.mouse.up();
	await page.keyboard.up('Space');
	const v3 = await view(page);
	near(v3.x, v2.x + 60, '스페이스 끌기 x');
	near(v3.y, v2.y + 40, '스페이스 끌기 y');
	assert.equal(v3.zoom, v0.zoom);
	assert.equal(await page.isVisible('#sel-box'), false, '스페이스 끌기는 요소를 고르지 않음');
	await page.mouse.move(p.x, p.y);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.move(p.x - 30, p.y - 20, { steps: 3 });
	await page.mouse.up({ button: 'middle' });
	const v4 = await view(page);
	near(v4.x, v3.x - 30, '가운데 버튼 끌기 x');
	near(v4.y, v3.y - 20, '가운데 버튼 끌기 y');
	assert.match((await page.textContent('#zoom-label'))!, new RegExp(`^${Math.round(v0.zoom * 100)}%$`));
});

test('CV2 Ctrl+휠 확대축소는 커서 아래 world 좌표 고정(±1px), 배율 0.1~3 한도', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url);
	const cr = await rect(page, '#canvas');
	const p = { x: cr.x + cr.width * 0.3, y: cr.y + cr.height * 0.35 };
	const v0 = await view(page);
	const world = { x: (p.x - cr.x - v0.x) / v0.zoom, y: (p.y - cr.y - v0.y) / v0.zoom };
	await page.mouse.move(p.x, p.y);
	await page.keyboard.down('Control');
	await page.mouse.wheel(0, -200);
	await page.keyboard.up('Control');
	await page.waitForFunction((z) => (window as any).__astron.view().zoom !== z, v0.zoom);
	const v1 = await view(page);
	assert.ok(v1.zoom > v0.zoom, `확대 ${v0.zoom} → ${v1.zoom}`);
	near(cr.x + v1.x + world.x * v1.zoom, p.x, '커서 x 고정');
	near(cr.y + v1.y + world.y * v1.zoom, p.y, '커서 y 고정');
	assert.equal(await page.textContent('#zoom-label'), `${Math.round(v1.zoom * 100)}%`);
	await page.keyboard.down('Control');
	for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -1000);
	await page.keyboard.up('Control');
	await page.waitForFunction(() => (window as any).__astron.view().zoom === 3);
	assert.equal(await page.textContent('#zoom-label'), '300%');
	await page.keyboard.down('Control');
	for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 1000);
	await page.keyboard.up('Control');
	await page.waitForFunction(() => (window as any).__astron.view().zoom === 0.1);
	assert.equal(await page.textContent('#zoom-label'), '10%');
	const v2 = await view(page);
	near(cr.x + v2.x + world.x * v2.zoom, p.x, '한도에서도 커서 x 고정');
});

test('CV3 화면 맞춤(Ctrl+0·Shift+1)은 모든 보드가 캔버스 안, Shift+2 는 활성 보드가 캔버스 안', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url);
	const allIn = async () => {
		const cr = await rect(page, '#canvas');
		for (const w of [1440, 768, 390]) assert.ok(inside(await board(page, w), cr), `보드 ${w} 캔버스 안`);
	};
	await allIn();
	const fit = await view(page);
	await page.click('#zoom-in');
	await page.click('#zoom-in');
	const zoomed = await view(page);
	await page.mouse.move(400, 400);
	await page.mouse.wheel(300, 200);
	await page.waitForFunction((x) => (window as any).__astron.view().x !== x, zoomed.x);
	await page.keyboard.press('Control+0');
	await allIn();
	assert.deepEqual(await view(page), fit, 'Ctrl+0 은 처음 맞춤과 같음');
	await page.click('#zoom-in');
	await page.keyboard.press('Shift+Digit1');
	await allIn();
	assert.deepEqual(await view(page), fit);
	await page.click('#zoom-fit');
	assert.deepEqual(await view(page), fit, '맞춤 버튼');
	await page.keyboard.press('Shift+Digit2');
	const one = await view(page);
	assert.ok(one.zoom > fit.zoom, `활성 보드 맞춤 배율이 더 큼 ${one.zoom} > ${fit.zoom}`);
	assert.ok(inside(await board(page, 1440), await rect(page, '#canvas')), '활성 보드 캔버스 안');
	await page.screenshot({ path: join(E2E, 'cv3-fit-active.png') });
});

test('CV4 아트보드 1440·768·390 나란히, 이름표 클릭 → aria-current·#boards aria-pressed·레이어 트리 전환', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/responsive.html')).url);
	assert.deepEqual(await boards(page), [1440, 768, 390]);
	const rs = [await board(page, 1440), await board(page, 768), await board(page, 390)];
	near(rs[1].y, rs[0].y, '위쪽 맞춤 768');
	near(rs[2].y, rs[0].y, '위쪽 맞춤 390');
	assert.ok(rs[0].x + rs[0].width < rs[1].x && rs[1].x + rs[1].width < rs[2].x, '겹침 없이 가로로');
	assert.equal(await page.getAttribute('.artboard[data-w="1440"]', 'aria-current'), 'true');
	assert.match((await page.textContent('#labels [data-w="768"]'))!, /768/);
	assert.equal(await page.getAttribute('#labels [data-w="768"]', 'aria-label'), '태블릿 · 768 × 1024 보드 활성화');
	assert.match((await page.textContent('#layers'))!, /aside\.promo/);
	await page.screenshot({ path: join(E2E, 'cv4-artboards.png') });
	await page.click('#labels [data-w="390"]');
	assert.equal(await page.getAttribute('.artboard[data-w="390"]', 'aria-current'), 'true');
	assert.equal(await page.getAttribute('.artboard[data-w="1440"]', 'aria-current'), 'false');
	assert.equal(await page.getAttribute('#boards [data-w="390"]', 'aria-pressed'), 'true');
	assert.equal(await page.getAttribute('#boards [data-w="1440"]', 'aria-pressed'), 'false');
	assert.doesNotMatch((await page.textContent('#layers'))!, /aside\.promo/, '390 보드 문서로 레이어 재구성');
	await page.click('#boards [data-w="768"]');
	assert.equal(await activeW(page), 768);
	assert.match((await page.textContent('#layers'))!, /aside\.promo/);
	const cr = await rect(page, '#canvas');
	const b = await board(page, 768);
	near(b.x + b.width / 2, cr.x + cr.width / 2, '#boards 클릭 보드 가운데로', 2);
});

test('CV5 다른 보드 요소 클릭 → 그 보드 활성·선택 상자·레이어 행·속성 선택자 일치, 다른 보드 .sel-ghost 2개', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url);
	const p = await centerOf(page, 'h1', 768);
	await page.mouse.click(p.x, p.y);
	assert.equal(await activeW(page), 768);
	const r = await screenRect(page, 'h1', 768);
	const box = await rect(page, '#sel-box');
	near(box.x, r.x, 'x');
	near(box.y, r.y, 'y');
	near(box.width, r.width, 'w');
	near(box.height, r.height, 'h');
	assert.equal(await page.getAttribute('#layers [data-path="1.0.0"]', 'aria-selected'), 'true');
	const expected = await (await frameOf(page, 768)).evaluate(selectorAt, p.local);
	assert.equal(await page.textContent('#p-selector'), expected);
	assert.equal(await page.locator('.sel-ghost:visible').count(), 2);
	const ghost = await page.$$eval('.sel-ghost', (els) => els.map((e) => (e as HTMLElement).dataset.w).sort());
	assert.deepEqual(ghost, ['1440', '390']);
	const g = await rect(page, '.sel-ghost[data-w="1440"]');
	const r1440 = await screenRect(page, 'h1', 1440);
	near(g.x, r1440.x, '유령 상자 x');
	near(g.width, r1440.width, '유령 상자 w');
	await page.screenshot({ path: join(E2E, 'cv5-cross-board-select.png') });
	const empty = await rect(page, '#canvas');
	await page.mouse.click(empty.x + 12, empty.y + empty.height - 12);
	assert.equal(await page.isVisible('#sel-box'), false, '빈 캔버스 클릭은 선택 해제');
	assert.equal(await page.locator('.sel-ghost:visible').count(), 0);
});

test('CV6 속성 편집 1회 → 연산 1건 저장·모든 보드 같은 계산 스타일, 되돌리기 시 모두 복귀', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url, '?sel=p.low');
	const colors = async () => Promise.all([1440, 768, 390].map(async (w) => (await frameOf(page, w)).$eval('p.low', (e) => getComputedStyle(e).color)));
	assert.deepEqual(await colors(), Array(3).fill('rgb(179, 179, 179)'));
	await setProp(page, '#p-color', '#595959');
	assert.equal((await state(page)).ops.length, 1);
	assert.deepEqual(await colors(), Array(3).fill('rgb(89, 89, 89)'));
	await page.click('#undo');
	await page.waitForSelector('#save-state[data-state="saved"]');
	assert.deepEqual(await colors(), Array(3).fill('rgb(179, 179, 179)'));
	assert.deepEqual((await state(page)).ops, []);
	await page.click('#redo');
	assert.deepEqual(await colors(), Array(3).fill('rgb(89, 89, 89)'));
});

test('CV7 손 도구·스페이스 중 클릭은 선택 안 함, 입력칸 포커스에서 Space·V·C·H 무시', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url);
	await page.keyboard.press('h');
	assert.equal(await page.getAttribute('#tool-hand', 'aria-pressed'), 'true');
	const h1 = await centerOf(page, 'h1');
	const v0 = await view(page);
	await page.mouse.click(h1.x, h1.y);
	assert.equal(await page.isVisible('#sel-box'), false, '손 도구 클릭은 선택 안 함');
	await page.mouse.move(h1.x, h1.y);
	await page.mouse.down();
	await page.mouse.move(h1.x + 50, h1.y, { steps: 3 });
	await page.mouse.up();
	near((await view(page)).x, v0.x + 50, '손 도구 끌기 이동');
	await page.keyboard.press('v');
	assert.equal(await page.getAttribute('#tool-hand', 'aria-pressed'), 'false');
	assert.equal(await page.getAttribute('#mode-edit', 'aria-pressed'), 'true');
	const h = await centerOf(page, 'h1');
	await page.keyboard.down('Space');
	await page.mouse.click(h.x, h.y);
	await page.keyboard.up('Space');
	assert.equal(await page.isVisible('#sel-box'), false, '스페이스 중 클릭은 선택 안 함');
	await page.mouse.click(h.x, h.y);
	assert.ok(await page.isVisible('#sel-box'), '보통 클릭은 선택');
	const v1 = await view(page);
	await page.focus('#p-font-size');
	await page.keyboard.press('End');
	for (const k of ['c', 'h', 'v', ' ']) await page.keyboard.press(k === ' ' ? 'Space' : k);
	assert.match(await page.inputValue('#p-font-size'), /chv $/);
	assert.equal(await page.getAttribute('#mode-edit', 'aria-pressed'), 'true');
	assert.equal(await page.getAttribute('#tool-hand', 'aria-pressed'), 'false');
	assert.deepEqual(await view(page), v1);
	await page.focus('#zoom-fit');
	await page.keyboard.press('c');
	assert.equal(await page.getAttribute('#mode-comment', 'aria-pressed'), 'false', '버튼 포커스에서 C 무시');
	await page.click('#canvas', { position: { x: 10, y: 10 } });
	await page.keyboard.press('c');
	assert.equal(await page.getAttribute('#mode-comment', 'aria-pressed'), 'true', '캔버스 포커스에서 C');
});

test('CV8 점 격자 간격·위치가 이동·배율을 따라가고 화면 간격 12~48px', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url);
	const grid = () => page.$eval('#canvas', (e) => {
		const s = getComputedStyle(e);
		return { step: parseFloat(s.getPropertyValue('--grid-step')), x: parseFloat(s.getPropertyValue('--grid-x')), y: parseFloat(s.getPropertyValue('--grid-y')) };
	});
	const check = async (msg: string) => {
		const g = await grid();
		const v = await view(page);
		assert.ok(g.step >= 12 && g.step <= 48, `${msg}: 간격 ${g.step}`);
		const mod = (a: number) => ((a % g.step) + g.step) % g.step;
		near(g.x, mod(v.x), `${msg}: x`, 0.5);
		near(g.y, mod(v.y), `${msg}: y`, 0.5);
		near(g.step / (16 * v.zoom), 2 ** Math.round(Math.log2(g.step / (16 * v.zoom))), `${msg}: 간격은 16·2^k world px`, 0.01);
	};
	await check('처음');
	const p = await canvasCenter(page);
	await page.mouse.move(p.x, p.y);
	const before = await view(page);
	await page.mouse.wheel(37, 53);
	await page.waitForFunction((x) => (window as any).__astron.view().x !== x, before.x);
	await check('이동 뒤');
	for (let i = 0; i < 6; i++) {
		await page.click('#zoom-in');
		await check(`확대 ${i + 1}`);
	}
	await page.keyboard.down('Control');
	for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 1000);
	await page.keyboard.up('Control');
	await check('최소 배율');
});

test('CV9 뷰포트 1440·768·390: 768 이하 레이어 서랍 닫힘·토글 열림, 390 도구막대 뷰포트 안·가로 넘침 0', async () => {
	const c = await startServer(makeProj('editor'));
	const ed = await edit(c, 'editor/index.html');
	const wide = await open(ed.url);
	assert.ok(await wide.page.isVisible('#layers-panel'));
	assert.ok(await wide.page.isVisible('#side'));
	assert.equal(await wide.page.isVisible('#toggle-layers'), false, '넓은 화면은 서랍 토글 없음');
	for (const [w, h] of [[768, 1024], [390, 844]]) {
		const { page } = await open(ed.url, '', { width: w, height: h });
		assert.equal(await page.isVisible('#layers-panel'), false, `${w}: 레이어 서랍 기본 닫힘`);
		assert.equal(await page.getAttribute('#toggle-layers', 'aria-expanded'), 'false');
		await page.click('#toggle-layers');
		assert.ok(await page.isVisible('#layers-panel'), `${w}: 토글로 열림`);
		assert.equal(await page.getAttribute('#toggle-layers', 'aria-expanded'), 'true');
		await page.screenshot({ path: join(E2E, `cv9-${w}-layers.png`) });
		await page.click('#toggle-layers');
		assert.equal(await page.isVisible('#layers-panel'), false);
		const tb = await rect(page, '#toolbar');
		assert.ok(tb.x >= 0 && tb.x + tb.width <= w && tb.y + tb.height <= h, `${w}: 도구막대 뷰포트 안 ${JSON.stringify(tb)}`);
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${w}: 가로 넘침 없음`);
		for (const b of await page.$$('#toolbar button:visible')) {
			const r = (await b.boundingBox())!;
			assert.ok(r.width >= (w < 600 ? 44 : 32) && r.height >= (w < 600 ? 44 : 32), `${w}: 버튼 크기 ${r.width}×${r.height}`);
		}
		if (w === 390) {
			assert.equal(await page.isVisible('#side'), false, '390: 속성 시트 기본 닫힘');
			await page.click('#toggle-side');
			assert.ok(await page.isVisible('#side'));
			const side = await rect(page, '#side');
			assert.ok(side.height <= h * 0.55 + 1, `속성 시트 높이 ${side.height}`);
		}
		await page.screenshot({ path: join(E2E, `cv9-${w}.png`) });
	}
});

test('CV10 아트보드 3개 로드 중 외부 요청 0건', async () => {
	const c = await startServer(makeProj('editor'));
	const { page, external, blocked, errors } = await open((await edit(c, 'editor/index.html')).url);
	await page.waitForTimeout(800);
	for (const w of [1440, 768, 390]) {
		assert.equal(await (await frameOf(page, w)).evaluate(() => document.title), '편집기 시험 페이지', `보드 ${w} 로드`);
		assert.equal(await page.$eval(`.artboard[data-w="${w}"] iframe`, (f) => (f as HTMLElement).offsetWidth), w);
	}
	assert.deepEqual(external, []);
	assert.deepEqual(blocked, []);
	assert.deepEqual(errors, []);
	assert.match((await page.textContent('#blocked'))!, /차단 0건/);
});

test('CV11 보드 1개·4개(320·2560) 겹침 없음·맞춤 동작, 잘못된 ?w= 는 첫 보드', async () => {
	const c = await startServer(makeProj('editor'));
	const one = await edit(c, 'editor/index.html', { widths: [390] });
	const { page } = await open(one.url);
	assert.deepEqual(await boards(page), [390]);
	const cr = await rect(page, '#canvas');
	assert.ok(inside(await board(page, 390), cr), '보드 1개 맞춤');
	await page.keyboard.press('Shift+Digit2');
	assert.ok(inside(await board(page, 390), await rect(page, '#canvas')));
	const four = await edit(c, 'editor/index.html', { widths: [320, 768, 1440, 2560] });
	await page.goto(four.url);
	await ready(page);
	assert.deepEqual(await boards(page), [320, 768, 1440, 2560]);
	const rs = await Promise.all([320, 768, 1440, 2560].map((w) => board(page, w)));
	for (let i = 1; i < rs.length; i++) assert.ok(rs[i - 1].x + rs[i - 1].width < rs[i].x, `보드 ${i} 겹침 없음`);
	await page.click('#zoom-in');
	await page.keyboard.press('Control+0');
	const c4 = await rect(page, '#canvas');
	for (const [i, r] of rs.entries()) assert.ok(inside(await board(page, [320, 768, 1440, 2560][i]), c4), `보드 ${r.width} 맞춤 안`);
	await page.screenshot({ path: join(E2E, 'cv11-four-boards.png') });
	for (const bad of ['abc', '100', '9999', '']) {
		await page.goto(`${four.url}?w=${bad}`);
		await ready(page);
		assert.equal(await activeW(page), 320, `?w=${bad}`);
		assert.deepEqual(await boards(page), [320, 768, 1440, 2560], `?w=${bad} 는 보드를 더하지 않음`);
	}
	await page.goto(`${four.url}?w=500`);
	await ready(page);
	assert.equal(await activeW(page), 500, '목록 밖 유효 폭은 보드로 더해 활성');
});

test('CV12 폭별 DOM 이 다른 대상에서 맞지 않는 보드 연산은 건너뛰고 페이지 오류 0', async () => {
	const c = await startServer(makeProj('editor'));
	const { page, errors } = await open((await edit(c, 'editor/responsive.html')).url, '?sel=p.lead');
	const leads = async () => Promise.all([1440, 768, 390].map(async (w) => (await frameOf(page, w)).$eval('p.lead', (e) => getComputedStyle(e).color)));
	assert.equal(await (await frameOf(page, 390)).$$eval('.promo', (e) => e.length), 0, '390 보드는 안내 요소 없음');
	await setProp(page, '#p-color', '#0b57d0');
	assert.deepEqual(await leads(), ['rgb(11, 87, 208)', 'rgb(11, 87, 208)', 'rgb(26, 26, 26)'], '390 보드는 경로가 달라 건너뜀');
	await page.goto(page.url().replace('?sel=p.lead', '?sel=.promo'));
	await ready(page);
	await setProp(page, '#p-color', '#a3200f');
	assert.deepEqual(await leads(), ['rgb(11, 87, 208)', 'rgb(11, 87, 208)', 'rgb(26, 26, 26)'], '390 보드의 같은 경로는 태그가 달라 건너뜀');
	assert.equal(await (await frameOf(page, 768)).$eval('.promo', (e) => getComputedStyle(e).color), 'rgb(163, 32, 15)');
	await page.click('#labels [data-w="390"]');
	assert.equal(await page.isVisible('#sel-box'), false, '390 보드에 맞는 요소가 없으면 선택 해제');
	await page.click('#undo');
	await page.click('#undo');
	await page.waitForSelector('#save-state[data-state="saved"]');
	assert.deepEqual(await leads(), Array(3).fill('rgb(26, 26, 26)'));
	assert.equal((await state(page)).ops.length, 0);
	assert.deepEqual(errors, []);
});

test('CV13 승인 적용 뒤 모든 보드 새로 고침, 활성 보드·배율·이동 위치 유지', async () => {
	const proj = makeProj('editor');
	const c = await startServer(proj, { ASTRONDESIGN_WRITE: 'allow' });
	const ed = await edit(c, 'editor/index.html', { allow_write: true });
	const { page, ctx } = await open(ed.url);
	await page.click('#labels [data-w="768"]');
	await page.click('#zoom-in');
	const p = await canvasCenter(page);
	await page.mouse.move(p.x, p.y);
	const moved = await view(page);
	await page.mouse.wheel(40, 30);
	await page.waitForFunction((x) => (window as any).__astron.view().x !== x, moved.x);
	const sel = await centerOf(page, 'p.low');
	await page.mouse.click(sel.x, sel.y);
	await setProp(page, '#p-color', '#595959');
	const before = await view(page);
	const human = await ctx.newPage();
	await human.goto(ed.approve!);
	await human.waitForSelector('#diff[data-loaded="1"]');
	await human.close();
	const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#apply')]);
	await popup.waitForSelector('#diff[data-loaded="1"]');
	await popup.click('#approve');
	await popup.waitForSelector('#result[data-done="1"]', { timeout: 180000 });
	await page.waitForFunction(() => document.querySelector('#applied')?.textContent?.includes('OK design_render'), null, { timeout: 30000 });
	await ready(page);
	assert.deepEqual(await view(page), before, '보기 상태 유지');
	assert.equal(await activeW(page), 768);
	for (const w of [1440, 768, 390]) assert.equal(await (await frameOf(page, w)).$eval('p.low', (e) => getComputedStyle(e).color), 'rgb(89, 89, 89)', `보드 ${w} 새로 고침`);
	assert.deepEqual((await state(page)).ops, []);
	await popup.close();
});

test('CV14 창 크기 변경 뒤 선택 상자 = 요소 위치(±1px)', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url, '?sel=h1');
	for (const size of [{ width: 1200, height: 800 }, { width: 1000, height: 700 }, { width: 1440, height: 900 }]) {
		await page.setViewportSize(size);
		await page.waitForTimeout(150);
		const r = await screenRect(page, 'h1');
		const box = await rect(page, '#sel-box');
		near(box.x, r.x, `${size.width}: x`);
		near(box.y, r.y, `${size.width}: y`);
		near(box.width, r.width, `${size.width}: w`);
		const label = await rect(page, `#labels [data-w="1440"]`);
		const b = await rect(page, ACTIVE);
		near(label.x, b.x, `${size.width}: 이름표 x`);
		assert.ok(label.y + label.height <= b.y + 1, `${size.width}: 이름표는 보드 위`);
	}
});

test('CV15 뷰포트 390·768 첫 화면: 화면 폭에 가까운 보드 활성·맞춤 배율 0.5 이상·보드 캔버스 안, 1440 은 모든 보드 맞춤 유지', async () => {
	const c = await startServer(makeProj('editor'));
	const ed = await edit(c, 'editor/index.html');
	for (const [w, h] of [[390, 844], [768, 1024]]) {
		const { page } = await open(ed.url, '', { width: w, height: h });
		assert.equal(await activeW(page), w, `${w}: 화면 폭과 같은 보드 활성`);
		const first = await view(page);
		assert.ok(first.zoom >= 0.5, `${w}: 첫 배율 ${first.zoom} ≥ 0.5`);
		assert.ok(inside(await board(page, w), await rect(page, '#canvas')), `${w}: 보드 캔버스 안`);
		assert.equal(await page.textContent('#zoom-label'), `${Math.round(first.zoom * 100)}%`, `${w}: 배율 표시`);
		await page.screenshot({ path: join(E2E, `cv15-${w}.png`) });
		await page.keyboard.press('Control+Equal');
		await page.keyboard.press('Shift+Digit2');
		assert.deepEqual(await view(page), first, `${w}: 첫 화면 = 활성 보드 맞춤(Shift+2)`);
	}
	const { page } = await open(ed.url);
	assert.equal(await activeW(page), 1440, '1440: 첫 보드 활성');
	const first = await view(page);
	assert.ok(first.zoom >= 0.25, `1440: 모든 보드 맞춤 배율 ${first.zoom} ≥ 0.25`);
	await page.click('#zoom-in');
	await page.keyboard.press('Control+0');
	assert.deepEqual(await view(page), first, '1440: 첫 화면 = 모든 보드 맞춤(Ctrl+0)');
});

test('CV16 모든 보드 맞춤(뷰포트 390·1440)에서 보드 이름표마다 기기 이름 보임·글자 잘림 없음·이름표끼리 겹침 0', async () => {
	const c = await startServer(makeProj('editor'));
	const ed = await edit(c, 'editor/index.html');
	const names: Record<number, string> = { 1440: '데스크톱', 768: '태블릿', 390: '모바일' };
	for (const [w, h] of [[390, 844], [1440, 900]]) {
		const { page } = await open(ed.url, '', { width: w, height: h });
		await page.keyboard.press('Control+0');
		const tags = await page.$$eval('#labels .board-label', (els) => els.map((e) => ({ w: Number((e as HTMLElement).dataset.w), t: e.textContent ?? '', sw: e.scrollWidth, cw: e.clientWidth, r: e.getBoundingClientRect().toJSON() as DOMRect })));
		assert.equal(tags.length, 3);
		const cr = await rect(page, '#canvas');
		for (const g of tags) {
			assert.ok(g.t.startsWith(names[g.w]), `${w}: 보드 ${g.w} 이름표 "${g.t}" 에 기기 이름`);
			assert.ok(g.sw <= g.cw + 1, `${w}: 보드 ${g.w} 이름표 잘림 ${g.sw} > ${g.cw}`);
			assert.ok(g.r.x + g.r.width <= cr.x + cr.width + 1, `${w}: 보드 ${g.w} 이름표 캔버스 안`);
		}
		for (let i = 1; i < tags.length; i++) assert.ok(tags[i - 1].r.x + tags[i - 1].r.width <= tags[i].r.x, `${w}: 이름표 ${tags[i - 1].w}·${tags[i].w} 겹침`);
		await page.screenshot({ path: join(E2E, `cv16-labels-${w}.png`) });
	}
});

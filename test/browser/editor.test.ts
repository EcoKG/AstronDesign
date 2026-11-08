import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { BrowserContext, Frame, Page } from 'playwright-core';
import { ROOT, cleanup, makeProj, startServer, textOf, type Client } from '../helpers.ts';
import { closeBrowser, getBrowser, isExternal, newContext, type Blocked } from '../../src/browser.ts';
import { selectorAt } from '../../src/shared/dom-bundle.js';

const E2E = join(ROOT, '.astron-logs', 'astrondesign', 'editor-e2e');
mkdirSync(E2E, { recursive: true });
const contexts: BrowserContext[] = [];

after(async () => {
	for (const c of contexts.splice(0)) await c.close().catch(() => {});
	await closeBrowser();
	await cleanup();
});

type Editor = { url: string; approve?: string; dir: string; text: string };
type Opened = { page: Page; ctx: BrowserContext; external: string[]; csp: string[]; blocked: Blocked };

/** design_edit 를 불러 작업 주소·승인 주소·세션 폴더를 얻는다. */
async function edit(c: Client, target: string, extra: Record<string, unknown> = {}): Promise<Editor> {
	const text = textOf(await c.call('design_edit', { target, surface: 'operate', ...extra }));
	assert.match(text, /^OK design_edit/, text);
	return { url: /^편집기: (\S+)$/m.exec(text)![1], approve: /^승인 주소: (\S+)$/m.exec(text)?.[1], dir: /^세션: (.+)$/m.exec(text)![1].trim(), text };
}

/** 외부 요청을 세는 context 에서 편집기를 열고 준비 표지를 기다린다. CSP 가 브라우저 안에서 막은 시도(실패 사유 csp)는 external 이 아니라 csp 로 센다. */
async function open(url: string, query = ''): Promise<Opened> {
	const { browser } = await getBrowser();
	const blocked: Blocked = [];
	const ctx = await newContext(browser, 1440, 900, false, blocked);
	contexts.push(ctx);
	const external: string[] = [];
	const csp: string[] = [];
	ctx.on('request', (r) => { if (isExternal(r.url())) external.push(r.url()); });
	ctx.on('requestfailed', (r) => {
		if (!isExternal(r.url()) || r.failure()?.errorText !== 'csp') return;
		external.splice(external.indexOf(r.url()), 1);
		csp.push(r.url());
	});
	const page = await ctx.newPage();
	await page.goto(url + query);
	await ready(page);
	return { page, ctx, external, csp, blocked };
}

const ready = (page: Page) => page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
const frame = (page: Page): Frame => page.frame({ name: 'target' })!;
const rect = (page: Page, sel: string) => page.$eval(sel, (e) => e.getBoundingClientRect().toJSON() as DOMRect);
const zoomOf = (page: Page) => page.$eval('#frame', (f) => f.getBoundingClientRect().width / (f as HTMLElement).offsetWidth);
const state = (page: Page) => page.evaluate(() => fetch((window as any).__astron.api + '/state').then((r) => r.json()));
const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) <= 1, `${msg}: ${a} vs ${b}`);
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** 대상 iframe 안 요소의 중심을 부모 화면 좌표로 바꾼다. */
async function centerOf(page: Page, sel: string): Promise<{ x: number; y: number; local: { x: number; y: number } }> {
	const fr = await rect(page, '#frame');
	const z = await zoomOf(page);
	const r = await frame(page).$eval(sel, (e) => e.getBoundingClientRect().toJSON() as DOMRect);
	const local = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
	return { x: fr.x + local.x * z, y: fr.y + local.y * z, local };
}

/** 프로젝트 파일 해시(산출 폴더 제외). */
function hashTree(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	const walk = (d: string) => {
		for (const n of readdirSync(d)) {
			const p = join(d, n);
			const rel = relative(dir, p).split('\\').join('/');
			if (rel.startsWith('.astron-logs')) continue;
			if (statSync(p).isDirectory()) walk(p);
			else out[rel] = sha(p);
		}
	};
	walk(dir);
	return out;
}

/** 댓글 모드에서 요소를 눌러 댓글 하나를 단다. */
async function addComment(page: Page, sel: string, note: string): Promise<{ x: number; y: number; local: { x: number; y: number } }> {
	const p = await centerOf(page, sel);
	await page.mouse.click(p.x, p.y);
	await page.fill('#c-note', note);
	await page.click('#c-save');
	await page.waitForFunction((n) => [...document.querySelectorAll('#comment-list > li')].some((li) => li.textContent?.includes(n)), note);
	return p;
}

/** 속성 패널 입력을 바꾸고 자동 저장을 기다린다. */
async function setProp(page: Page, id: string, value: string): Promise<void> {
	await page.fill(id, value);
	await page.dispatchEvent(id, 'change');
	await page.waitForSelector('#save-state[data-state="saved"]');
}

test('ED1 3폭 × 선택 상태 스크린샷 6장, 폭 전환 시 iframe 폭 1440·768·390', async () => {
	const c = await startServer(makeProj('editor'));
	const ed = await edit(c, 'editor/index.html');
	const { page, external } = await open(ed.url);
	const shots: string[] = [];
	for (const w of [1440, 768, 390]) {
		await page.goto(`${ed.url}?w=${w}`);
		await ready(page);
		assert.equal(await page.$eval('#frame', (f) => (f as HTMLElement).offsetWidth), w);
		shots.push(join(E2E, `ed1-${w}.png`));
		await page.screenshot({ path: shots.at(-1) });
		await page.goto(`${ed.url}?w=${w}&sel=h1`);
		await ready(page);
		assert.ok(await page.isVisible('#sel-box'));
		shots.push(join(E2E, `ed1-${w}-sel.png`));
		await page.screenshot({ path: shots.at(-1) });
	}
	await page.click('#boards [data-w="768"]');
	assert.equal(await page.$eval('#frame', (f) => (f as HTMLElement).offsetWidth), 768);
	assert.equal(await page.getAttribute('#boards [data-w="768"]', 'aria-pressed'), 'true');
	for (const s of shots) assert.ok(statSync(s).size > 5000, s);
	assert.deepEqual(external, []);
});

test('ED2 레이어 행 클릭 → 캔버스 선택 상자 = 요소 위치(±1px), 캔버스 클릭 → 해당 행 강조·조상 펼침', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url);
	await page.click('#layers [data-path="1"] > .row > .toggle');
	await page.click('#layers [data-path="1"] > .row > .toggle');
	await page.click('#layers [data-path="1.0"] > .row > .toggle');
	await page.click('#layers [data-path="1.0.2"] > .row > .label');
	assert.equal(await page.getAttribute('#layers [data-path="1.0.2"]', 'aria-selected'), 'true');
	const fr = await rect(page, '#frame');
	const z = await zoomOf(page);
	const r = await frame(page).$eval('p.low', (e) => e.getBoundingClientRect().toJSON() as DOMRect);
	const box = await rect(page, '#sel-box');
	near(box.x, fr.x + r.x * z, 'x');
	near(box.y, fr.y + r.y * z, 'y');
	near(box.width, r.width * z, 'w');
	near(box.height, r.height * z, 'h');
	await page.click('#layers [data-path="1.0"] > .row > .toggle');
	assert.equal(await page.getAttribute('#layers [data-path="1.0"]', 'aria-expanded'), 'false');
	const h1 = await centerOf(page, 'h1');
	await page.mouse.click(h1.x, h1.y);
	assert.equal(await page.getAttribute('#layers [data-path="1.0.0"]', 'aria-selected'), 'true');
	assert.equal(await page.getAttribute('#layers [data-path="1.0"]', 'aria-expanded'), 'true');
	assert.equal(await page.getAttribute('#layers [data-path="1.0.2"]', 'aria-selected'), 'false');
	assert.ok(await page.isVisible('#layers [data-path="1.0.0"]'));
});

test('ED3 확대·축소·화면 맞춤(Ctrl+= / Ctrl+- / Ctrl+0) 배율 표시와 iframe 배율 일치', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url);
	const label = async () => Number((await page.textContent('#zoom-label'))!.replace('%', ''));
	const check = async () => near(await label(), Math.round((await zoomOf(page)) * 100), 'zoom');
	const fit = await label();
	await check();
	await page.keyboard.press('Control+Equal');
	assert.ok((await label()) > fit);
	await check();
	await page.keyboard.press('Control+Minus');
	await page.keyboard.press('Control+Minus');
	assert.ok((await label()) < fit);
	await check();
	await page.keyboard.press('Control+0');
	assert.equal(await label(), fit);
	await page.click('#zoom-in');
	await check();
	const canvas = await rect(page, '#canvas');
	await page.keyboard.press('Control+0');
	const fr = await rect(page, '#frame');
	assert.ok(fr.width <= canvas.width + 1, '맞춤 배율은 캔버스 안');
});

test("ED4 편집기·대상 로드 중 외부 요청 0건, 외부 이미지 fixture 는 상단 바 '차단 1'", async () => {
	const c = await startServer(makeProj('editor'));
	const plain = await open((await edit(c, 'editor/index.html')).url);
	await plain.page.waitForTimeout(1000);
	assert.deepEqual(plain.external, []);
	assert.deepEqual(plain.blocked, []);
	assert.match((await plain.page.textContent('#blocked'))!, /차단 0건/);
	const ext = await open((await edit(c, 'editor/external.html')).url);
	await ext.page.waitForFunction(() => document.querySelector('#blocked')?.textContent?.includes('차단 1건'), null, { timeout: 15000 });
	await ext.page.waitForTimeout(300);
	assert.deepEqual(ext.external, [], '네트워크로 나간 외부 요청');
	assert.deepEqual(ext.blocked, [], 'context route 까지 온 외부 요청');
	assert.deepEqual(ext.csp, ['https://example.com/astron-blocked.png']);
	await ext.page.screenshot({ path: join(E2E, 'ed4-external-blocked.png') });
});

test('ED5 끌기·크기 핸들 → translate·width·height 연산 기록, 정렬 버튼', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url, '?sel=p.low');
	const z = await zoomOf(page);
	const box = await rect(page, '#sel-box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 5 });
	await page.mouse.up();
	await page.waitForSelector('#save-state[data-state="saved"]');
	const moved = (await state(page)).ops.find((o: any) => o.prop === 'translate');
	assert.ok(moved, '끌기 연산');
	const [tx, ty] = moved.after.split(' ').map((v: string) => parseFloat(v));
	near(tx, 40 / z, 'tx');
	near(ty, 20 / z, 'ty');
	const handle = await rect(page, '#sel-box .handle');
	await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
	await page.mouse.down();
	await page.mouse.move(handle.x + handle.width / 2 - 60, handle.y + handle.height / 2 + 30, { steps: 5 });
	await page.mouse.up();
	await page.waitForSelector('#save-state[data-state="saved"]');
	await page.click('[data-align="center"]');
	await page.waitForSelector('#save-state[data-state="saved"]');
	const ops = (await state(page)).ops as { prop: string; after: string; selector: string }[];
	assert.deepEqual(ops.map((o) => o.prop), ['translate', 'width', 'height', 'text-align']);
	assert.ok(ops.every((o) => o.selector === 'p.low' || o.selector.endsWith('p:nth-of-type(2)')), JSON.stringify(ops));
	assert.equal(ops[3].after, 'center');
	assert.equal(await frame(page).$eval('p.low', (e) => getComputedStyle(e).textAlign), 'center');
	await page.screenshot({ path: join(E2E, 'ed5-drag-resize.png') });
});

test('ED6 편집 → 자동 저장 → 새로 열기 후 같은 계산 스타일', async () => {
	const c = await startServer(makeProj('editor'));
	const ed = await edit(c, 'editor/index.html');
	const { page } = await open(ed.url, '?sel=p.low');
	await setProp(page, '#p-color', '#595959');
	await setProp(page, '#p-font-size', '22px');
	const changes = readFileSync(join(ed.dir, 'changes.json'), 'utf8');
	assert.match(changes, /#595959/);
	await page.goto(ed.url);
	await ready(page);
	const cs = await frame(page).$eval('p.low', (e) => [getComputedStyle(e).color, getComputedStyle(e).fontSize]);
	assert.deepEqual(cs, ['rgb(89, 89, 89)', '22px']);
});

test('ED7 되돌리기·다시 하기 왕복 후 body outerHTML 동일', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url, '?sel=p.low');
	const body = () => frame(page).evaluate(() => document.body.outerHTML);
	const start = await body();
	await setProp(page, '#p-color', '#595959');
	await setProp(page, '#p-font-size', '22px');
	await setProp(page, '#p-text', '바뀐 문장');
	const edited = await body();
	assert.notEqual(edited, start);
	for (let i = 0; i < 3; i++) await page.click('#undo');
	assert.equal(await body(), start);
	for (let i = 0; i < 3; i++) await page.click('#redo');
	assert.equal(await body(), edited);
	await page.keyboard.press('Control+z');
	await page.keyboard.press('Control+z');
	await page.keyboard.press('Control+z');
	assert.equal(await body(), start);
	await page.waitForSelector('#save-state[data-state="saved"]');
	assert.deepEqual((await state(page)).ops, []);
});

test('ED8 색 선택 대비 표시가 design_render contrast 판정과 같음(2.1:1 나쁨, 7:1 좋음)', async () => {
	const proj = makeProj('editor');
	writeFileSync(join(proj, 'editor', 'contrast-ok.html'), readFileSync(join(proj, 'editor', 'index.html'), 'utf8').replace('#b3b3b3', '#595959'));
	const c = await startServer(proj);
	const { page } = await open((await edit(c, 'editor/index.html')).url, '?sel=p.low');
	const badge = () => page.textContent('#contrast');
	assert.match((await badge())!, /2\.1:1/);
	assert.match((await badge())!, /나쁨/);
	const low = textOf(await c.call('design_render', { target: 'editor/index.html', surface: 'operate', widths: [1440], inline_image: false }, 180000));
	const lowRep = JSON.parse(readFileSync(/^report: (.+)$/m.exec(low)![1].trim(), 'utf8'));
	const finding = lowRep.findings.find((f: any) => f.id === 'contrast');
	assert.ok(finding && finding.level === 'FAIL', low.slice(0, 300));
	assert.match(finding.message, /2\.1:1/);
	await setProp(page, '#p-color', '#595959');
	assert.match((await badge())!, /7(\.0)?:1/);
	assert.match((await badge())!, /좋음/);
	const ok = textOf(await c.call('design_render', { target: 'editor/contrast-ok.html', surface: 'operate', widths: [1440], inline_image: false }, 180000));
	const okRep = JSON.parse(readFileSync(/^report: (.+)$/m.exec(ok)![1].trim(), 'utf8'));
	assert.equal(okRep.findings.find((f: any) => f.id === 'contrast'), undefined);
	await page.screenshot({ path: join(E2E, 'ed8-contrast.png') });
});

test('ED9 댓글 모드에서만 마커 보임, 열린 댓글 수, 답글, 모든 댓글 목록', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/index.html')).url, '?mode=comment');
	assert.equal(await page.getAttribute('#mode-comment', 'aria-pressed'), 'true');
	await addComment(page, 'h1', '제목을 더 짧게');
	await addComment(page, 'p.lead', '숫자를 굵게');
	assert.equal(await page.locator('.marker:visible').count(), 2);
	assert.match((await page.textContent('#open-count'))!, /열린 댓글 2/);
	await page.fill('#comment-list > li:first-child .reply-input', '좋습니다');
	await page.click('#comment-list > li:first-child .reply-send');
	await page.waitForFunction(() => document.querySelector('#comment-list > li:first-child .replies')?.textContent?.includes('좋습니다'));
	await page.screenshot({ path: join(E2E, 'ed9-comment-mode.png') });
	await page.click('#comment-list > li:first-child .resolve');
	await page.waitForFunction(() => document.querySelector('#open-count')?.textContent?.includes('열린 댓글 1'));
	assert.equal(await page.locator('#comment-list > li').count(), 2, '모든 댓글 목록은 해결된 댓글도 보임');
	await page.click('#mode-edit');
	assert.equal(await page.locator('.marker:visible').count(), 0);
	const comments = (await state(page)).comments;
	assert.equal(comments[0].replies[0].text, '좋습니다');
	assert.equal(comments[0].status, 'resolved');
});

test('ED10 클릭 위치 → 선택자 = selectorAt 결과 = feedback.md Selector', async () => {
	const c = await startServer(makeProj('editor'));
	const ed = await edit(c, 'editor/index.html');
	const { page } = await open(ed.url, '?mode=comment');
	const p = await addComment(page, 'section.card li:nth-of-type(2)', '대기 건수 강조');
	const expected = await frame(page).evaluate(selectorAt, p.local);
	const saved = (await state(page)).comments[0];
	assert.equal(saved.selector, expected);
	assert.equal(saved.selector, 'body > main > section > ul > li:nth-of-type(2)');
	const h = textOf(await c.call('design_handoff', { target: 'editor/index.html' }));
	const fb = readFileSync(/^feedback: (.+)$/m.exec(h)![1].trim(), 'utf8');
	assert.ok(fb.includes('- Selector: `' + expected + '`'), fb.slice(0, 600));
});

test('ED11 React 개발 빌드 fixture 댓글에 Source 파일:줄', async () => {
	const c = await startServer(makeProj('editor'));
	const { page } = await open((await edit(c, 'editor/react.html')).url, '?mode=comment');
	await addComment(page, 'button.cta', '버튼 대비 확인');
	const h = textOf(await c.call('design_handoff', { target: 'editor/react.html' }));
	const fb = readFileSync(/^feedback: (.+)$/m.exec(h)![1].trim(), 'utf8');
	assert.match(fb, /^- Source: src\/components\/OrderButton\.jsx:14$/m);
	assert.match(fb, /^- React: OrderButton$/m);
});

test('ED12 승인 화면(별도 출처)에서 승인 → 원본 diff 가 그 속성만, 자동 재렌더 첫 줄 OK', async () => {
	const proj = makeProj('editor');
	const file = join(proj, 'editor', 'index.html');
	const original = readFileSync(file, 'utf8');
	const c = await startServer(proj, { ASTRONDESIGN_WRITE: 'allow' });
	const ed = await edit(c, 'editor/index.html', { allow_write: true });
	assert.ok(ed.approve);
	const { page, ctx } = await open(ed.url, '?sel=p.low');
	await setProp(page, '#p-color', '#595959');
	const human = await ctx.newPage();
	await human.goto(ed.approve!);
	await human.waitForSelector('#diff[data-loaded="1"]');
	assert.equal(new URL(human.url()).hash, '', '토큰 해시는 지워짐');
	const diff = (await human.textContent('#diff'))!;
	assert.deepEqual(diff.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => /^[-+](?![-+])/.test(l)), ['-\t<p class="low" style="color: #b3b3b3">처리 대기 3건은 내일 오전에 확인합니다.</p>', '+\t<p class="low" style="color: #595959">처리 대기 3건은 내일 오전에 확인합니다.</p>']);
	await human.screenshot({ path: join(E2E, 'ed12-approve.png') });
	await human.close();
	const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#apply')]);
	assert.equal(new URL(popup.url()).origin, new URL(ed.approve!).origin);
	await popup.waitForSelector('#diff[data-loaded="1"]');
	await popup.click('#approve');
	await popup.waitForSelector('#result[data-done="1"]', { timeout: 180000 });
	assert.match((await popup.textContent('#result'))!, /^OK design_render/m);
	assert.equal(readFileSync(file, 'utf8'), original.replace('style="color: #b3b3b3"', 'style="color: #595959"'));
	await page.waitForFunction(() => document.querySelector('#applied')?.textContent?.includes('OK design_render'), null, { timeout: 30000 });
	await ready(page);
	assert.equal(await frame(page).$eval('p.low', (e) => getComputedStyle(e).color), 'rgb(89, 89, 89)');
	assert.deepEqual((await state(page)).ops, []);
	await popup.screenshot({ path: join(E2E, 'ed12-approved.png') });
});

test('ED13 쓰기 키 없음: 원본에 적용 버튼 없음, 넘기기 후 프로젝트 파일 해시 불변', async () => {
	const proj = makeProj('editor');
	const before = hashTree(proj);
	const c = await startServer(proj);
	const { page } = await open((await edit(c, 'editor/index.html', { allow_write: true })).url, '?sel=p.low');
	assert.equal(await page.locator('#apply').count(), 0);
	await setProp(page, '#p-color', '#595959');
	await page.click('#mode-comment');
	await addComment(page, 'h1', '제목 확인');
	const h = textOf(await c.call('design_handoff', { target: 'editor/index.html' }));
	assert.match(h, /^OK design_handoff/);
	assert.deepEqual(hashTree(proj), before);
});

test('ED14 design_export html·png: 폭별 PNG 열림, standalone.html 을 차단 상태로 design_render 해 외부 요청 0·broken-image 없음', async () => {
	const proj = makeProj('editor');
	const c = await startServer(proj);
	const t = textOf(await c.call('design_export', { target: 'editor/index.html', formats: ['html', 'png'] }, 180000));
	assert.match(t, /^OK design_export/, t);
	const pngs = /^png: (.+)$/m.exec(t)![1].split(', ').map((s) => s.trim());
	assert.equal(pngs.length, 3, '세션 없으면 기본 3폭');
	for (const [i, w] of [1440, 768, 390].entries()) {
		const b = readFileSync(pngs[i]);
		assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
		assert.equal(b.readUInt32BE(16), w);
	}
	const html = /^html: (.+)$/m.exec(t)![1].trim();
	const src = readFileSync(html, 'utf8');
	assert.doesNotMatch(src, /<script/i);
	assert.match(src, /src="data:image\/svg\+xml/);
	const r = textOf(await c.call('design_render', { target: relative(proj, html).split('\\').join('/'), surface: 'operate', widths: [1440], inline_image: false }, 180000));
	const rep = JSON.parse(readFileSync(/^report: (.+)$/m.exec(r)![1].trim(), 'utf8'));
	assert.deepEqual(rep.blocked, []);
	assert.equal(rep.findings.find((f: any) => f.id === 'broken-image'), undefined);
	assert.ok(existsSync(pngs[0]));
});

test('AP9 대상 출처(작업 포트) 스크립트가 parent 주소를 읽어 승인 API 호출 → 거부(토큰 없음·Origin 다름), 원본 해시 불변, applied.json 없음', async () => {
	const proj = makeProj('editor');
	const file = join(proj, 'editor', 'hostile.html');
	const before = sha(file);
	const c = await startServer(proj, { ASTRONDESIGN_WRITE: 'allow' });
	const ed = await edit(c, 'editor/hostile.html', { allow_write: true });
	const { page, external } = await open(ed.url);
	await page.waitForFunction(() => {
		const f = document.querySelector<HTMLIFrameElement>('#frame');
		return f?.contentDocument?.title.startsWith('hostile:');
	}, null, { timeout: 15000 });
	const title = await frame(page).evaluate(() => document.title);
	assert.match(title, /tok=32/, '대상 스크립트는 작업 토큰을 읽을 수 있음(같은 출처)');
	assert.match(title, /\/api\/approve=(blocked|403)/);
	assert.doesNotMatch(title, /\/api\/(plan|approve)=200/);
	assert.equal(sha(file), before);
	assert.equal(existsSync(join(ed.dir, 'applied.json')), false);
	assert.deepEqual(external, []);
});

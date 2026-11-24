// 편집기 브라우저 시험 공용: design_edit 호출, 외부 요청을 세는 페이지 열기, 활성 아트보드 iframe·좌표 변환.
import assert from 'node:assert/strict';
import type { BrowserContext, Frame, Page } from 'playwright-core';
import { textOf, type Client } from './helpers.ts';
import { getBrowser, isExternal, newContext, type Blocked } from '../src/browser.ts';

export type Editor = { url: string; approve?: string; dir: string; text: string };
export type Opened = { page: Page; ctx: BrowserContext; external: string[]; csp: string[]; blocked: Blocked; errors: string[] };
export type View = { x: number; y: number; zoom: number; active: number };
type Box = { x: number; y: number; width: number; height: number };

const contexts: BrowserContext[] = [];

/** 이 파일로 연 브라우저 context 를 모두 닫는다. */
export async function closeContexts(): Promise<void> {
	for (const c of contexts.splice(0)) await c.close().catch(() => {});
}

/** design_edit 를 불러 작업 주소·승인 주소·세션 폴더를 얻는다. */
export async function edit(c: Client, target: string, extra: Record<string, unknown> = {}): Promise<Editor> {
	const text = textOf(await c.call('design_edit', { target, surface: 'operate', ...extra }));
	assert.match(text, /^OK design_edit/, text);
	return { url: /^편집기: (\S+)$/m.exec(text)![1], approve: /^승인 주소: (\S+)$/m.exec(text)?.[1], dir: /^세션: (.+)$/m.exec(text)![1].trim(), text };
}

/** 편집기 준비 표지(모든 아트보드 로드·연산 적용 끝)를 기다린다. */
export const ready = (page: Page) => page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });

/** 외부 요청을 세는 context 에서 편집기를 연다. CSP 가 브라우저 안에서 막은 시도(실패 사유 csp)는 external 이 아니라 csp 로 센다. */
export async function open(url: string, query = '', size: { width: number; height: number } = { width: 1440, height: 900 }): Promise<Opened> {
	const { browser } = await getBrowser();
	const blocked: Blocked = [];
	const ctx = await newContext(browser, size.width, size.height, false, blocked);
	contexts.push(ctx);
	const external: string[] = [];
	const csp: string[] = [];
	const errors: string[] = [];
	ctx.on('request', (r) => { if (isExternal(r.url())) external.push(r.url()); });
	ctx.on('requestfailed', (r) => {
		if (!isExternal(r.url()) || r.failure()?.errorText !== 'csp') return;
		external.splice(external.indexOf(r.url()), 1);
		csp.push(r.url());
	});
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(url + query);
	await ready(page);
	return { page, ctx, external, csp, blocked, errors };
}

/** 활성 아트보드 iframe 선택자. */
export const ACTIVE = '.artboard[aria-current="true"] iframe';
/** 활성 아트보드 폭. */
export const activeW = (page: Page) => page.$eval('.artboard[aria-current="true"]', (e) => Number((e as HTMLElement).dataset.w));
/** 폭 w(생략하면 활성) 아트보드의 대상 frame. */
export async function frameOf(page: Page, w?: number): Promise<Frame> {
	const f = page.frame({ name: `target-${w ?? (await activeW(page))}` });
	assert.ok(f, `아트보드 ${w ?? '활성'} frame 없음`);
	return f;
}
export const rect = (page: Page, sel: string): Promise<Box> => page.$eval(sel, (e) => e.getBoundingClientRect().toJSON() as DOMRect);
/** 아트보드 iframe 의 화면 배율. */
export const zoomOf = (page: Page, w?: number) => page.$eval(w ? `.artboard[data-w="${w}"] iframe` : ACTIVE, (f) => f.getBoundingClientRect().width / (f as HTMLElement).offsetWidth);
export const state = (page: Page) => page.evaluate(() => fetch((window as any).__astron.api + '/state').then((r) => r.json()));
export const view = (page: Page): Promise<View> => page.evaluate(() => (window as any).__astron.view());
export const near = (a: number, b: number, msg: string, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
/** 사각형 a 가 b 안에 있는지(±1px). */
export const inside = (a: Box, b: Box) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;

/** 폭 w(생략하면 활성) 아트보드 안 요소의 중심을 부모 화면 좌표로 바꾼다. */
export async function centerOf(page: Page, sel: string, w?: number): Promise<{ x: number; y: number; local: { x: number; y: number } }> {
	const fsel = w ? `.artboard[data-w="${w}"] iframe` : ACTIVE;
	const fr = await rect(page, fsel);
	const z = await zoomOf(page, w);
	const r = await (await frameOf(page, w)).$eval(sel, (e) => e.getBoundingClientRect().toJSON() as DOMRect);
	const local = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
	return { x: fr.x + local.x * z, y: fr.y + local.y * z, local };
}

/** 폭 w 아트보드 안 요소의 화면 사각형. */
export async function screenRect(page: Page, sel: string, w?: number): Promise<Box> {
	const fr = await rect(page, w ? `.artboard[data-w="${w}"] iframe` : ACTIVE);
	const z = await zoomOf(page, w);
	const r = await (await frameOf(page, w)).$eval(sel, (e) => e.getBoundingClientRect().toJSON() as DOMRect);
	return { x: fr.x + r.x * z, y: fr.y + r.y * z, width: r.width * z, height: r.height * z };
}

/** 속성 패널 입력을 바꾸고 자동 저장을 기다린다. */
export async function setProp(page: Page, id: string, value: string): Promise<void> {
	await page.fill(id, value);
	await page.dispatchEvent(id, 'change');
	await page.waitForSelector('#save-state[data-state="saved"]');
}

/** 댓글 모드에서 요소를 눌러 댓글 하나를 단다. */
export async function addComment(page: Page, sel: string, note: string): Promise<{ x: number; y: number; local: { x: number; y: number } }> {
	const p = await centerOf(page, sel);
	await page.mouse.click(p.x, p.y);
	await page.fill('#c-note', note);
	await page.click('#c-save');
	await page.waitForFunction((n) => [...document.querySelectorAll('#comment-list > li')].some((li) => li.textContent?.includes(n)), note);
	return p;
}

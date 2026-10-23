// taste-skill scripts/inspect.mjs@f624f37 의 측정 흐름을 옮긴 파생 코드(MIT, Copyright (c) 2026 Leonxlnx).
import type { Page } from 'playwright-core';
import { probe, frame } from '../vendor/taste-skill/scripts/lib/probe.mjs';
import { judge } from '../vendor/taste-skill/scripts/lib/rules.mjs';

type GateFinding = { level: 'FAIL' | 'WARN'; id: string; width: number; message: string; fix?: string; urls?: string[] };
type FrameCheck = { covered: { text: string; share: number }[]; clipped?: { text: string }[]; pinnedOver?: { text: string; share: number }[]; filled: number; big?: string[] } | null;
export type GateResult = { findings: GateFinding[]; screens: number; motion: unknown; filled: (number | null)[] };

const MOTION_MIN = 8, MOTION_GOOD = 16;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 페이지 스크립트보다 먼저 실행되어 실제로 움직인 요소 수를 세는 기록기(inspect.mjs 원문, 들여쓰기만 탭). */
export const MOTION_RECORDER = `(() => {
	const seen = new WeakSet(); const c = { elements: 0, css: 0, transitions: 0, scripted: 0 };
	const note = (t, k) => { if (!(t instanceof Element) || seen.has(t)) return; seen.add(t); c.elements++; c[k]++; };
	addEventListener('animationstart', (e) => note(e.target, 'css'), true);
	addEventListener('transitionrun', (e) => note(e.target, 'transitions'), true);
	const watch = () => new MutationObserver((list) => { for (const m of list) { const s = m.target.getAttribute && m.target.getAttribute('style') || ''; if (/transform|translate|opacity|scale|rotate|clip-path/.test(s)) note(m.target, 'scripted'); } })
		.observe(document.documentElement, { attributes: true, attributeFilter: ['style'], subtree: true });
	if (document.documentElement) watch(); else addEventListener('DOMContentLoaded', watch);
	window.__motionSample = () => { for (const a of document.getAnimations ? document.getAnimations() : []) { const t = a.effect && a.effect.target; if (t) note(t, a.constructor && a.constructor.name === 'CSSTransition' ? 'transitions' : 'css'); } };
	window.__motion = () => { window.__motionSample(); const v = [...document.querySelectorAll('video')]; return { ...c, videos: v.length, playingVideos: v.filter((x) => x.autoplay || !x.paused).length }; };
})();`;

const evalSafe = <T>(page: Page, fn: string | (() => unknown)): Promise<T | null> => page.evaluate(fn as () => T).catch(() => null);

/** 열린 페이지에서 fold 를 찍고 화면 단위로 내려가며 측정해 taste 발견을 모두 낸다(allow 로 거르지 않음). */
export async function tasteGate(page: Page, w: number, h: number, foldPath: string): Promise<GateResult> {
	await sleep(1400);
	await page.screenshot({ path: foldPath, type: 'jpeg', quality: 50 });
	const metrics = (await page.evaluate(probe)) as any;
	const frameChecks: FrameCheck[] = [await evalSafe<FrameCheck>(page, frame)];
	const screens = Math.min(11, Math.max(0, Math.ceil(metrics.page.height / h) - 1));
	await page.mouse.move(Math.round(w / 2), Math.round(h / 2));
	for (let i = 1; i <= screens; i++) {
		await evalSafe(page, `window.scrollTo({ top: ${i * h}, behavior: 'instant' })`);
		await page.mouse.wheel(0, 2).catch(() => {});
		await sleep(650);
		frameChecks.push(await evalSafe<FrameCheck>(page, frame));
		await evalSafe(page, 'window.__motionSample && window.__motionSample()');
	}
	const motion = await evalSafe<{ elements: number; playingVideos: number }>(page, 'window.__motion ? window.__motion() : null');
	await evalSafe(page, `window.scrollTo({ top: 0, behavior: 'instant' })`);
	await sleep(350);
	const after = ((await evalSafe(page, probe)) ?? metrics) as any;
	const m = after.headings.length >= metrics.headings.length ? after : metrics;

	const findings = judge(m, { width: w, allow: [] }) as GateFinding[];
	const broken = findings.find((f) => f.id === 'broken-image');
	if (broken) broken.urls = [...m.page.brokenImages];
	const valid = frameChecks.filter((f): f is NonNullable<FrameCheck> => !!f);
	const coveredText = [...new Map(valid.flatMap((f, i) => f.covered.map((c) => [c.text, { ...c, screen: i + 1 }] as const))).values()];
	if (coveredText.length) findings.push({ level: 'FAIL', id: 'covered-text', width: w, message: 'Large text lies under another element at some scroll position: ' + coveredText.slice(0, 4).map((c) => `"${c.text}" (screen ${c.screen}, ${Math.round(c.share * 100)}% hidden)`).join('; ') });
	const clippedText = [...new Map(valid.flatMap((f, i) => (f.clipped ?? []).map((c) => [c.text, { ...c, screen: i + 1 }] as const))).values()];
	if (clippedText.length) findings.push({ level: 'FAIL', id: 'clipped-text', width: w, message: 'Large text is cut off along its top by the box that holds it: ' + clippedText.slice(0, 3).map((c) => `"${c.text}" (screen ${c.screen})`).join('; ') });
	const overPictures = [...new Map(valid.flatMap((f, i) => (f.pinnedOver ?? []).map((c) => [c.text, { ...c, screen: i + 1 }] as const))).values()];
	if (overPictures.length) findings.push({ level: 'WARN', id: 'pinned-over-picture', width: w, message: 'Pinned large text slides across pictures while the page scrolls: ' + overPictures.slice(0, 3).map((c) => `"${c.text}" (screen ${c.screen}, ${Math.round(c.share * 100)}% over a picture)`).join('; ') });
	const empty = frameChecks.map((f, i) => ({ f, i })).filter(({ f }) => f && f.filled < 0.2);
	const runs = new Map<string, { start: number; last: number; best: number }>();
	frameChecks.forEach((f, i) => {
		for (const t of f?.big ?? []) {
			const r = runs.get(t) ?? { start: i, last: i - 1, best: 0 };
			if (r.last === i - 1) r.last = i;
			else {
				r.start = i;
				r.last = i;
			}
			r.best = Math.max(r.best, r.last - r.start + 1);
			runs.set(t, r);
		}
	});
	const longPins = [...runs.entries()].filter(([, r]) => r.best >= 3);
	if (w >= 1100 && longPins.length) findings.push({ level: 'WARN', id: 'long-pin', width: w, message: `The same large text stays on screen for ${Math.max(...longPins.map(([, r]) => r.best))} screens in a row: ` + longPins.slice(0, 2).map(([t]) => `"${t}"`).join('; ') });
	if (w >= 1100 && motion) {
		const moving = motion.elements + motion.playingVideos * 4;
		if (moving < MOTION_MIN) findings.push({ level: 'FAIL', id: 'still-page', width: w, message: `Only ${motion.elements} element(s) moved while the page loaded and scrolled${motion.playingVideos ? ` (plus ${motion.playingVideos} playing video)` : ''}.` });
		else if (moving < MOTION_GOOD) findings.push({ level: 'WARN', id: 'still-page', width: w, message: `Little motion: ${motion.elements} element(s) moved while the page loaded and scrolled.` });
	}
	if (w >= 1100 && empty.length >= 2) findings.push({ level: 'FAIL', id: 'empty-screens', width: w, message: `${empty.length} of ${frameChecks.length} desktop screens are almost empty ground (under 20% of the screen holds text, a picture or a colour field): screens ${empty.map(({ i }) => i + 1).join(', ')}.` });
	return { findings, screens: frameChecks.length, motion, filled: frameChecks.map((f) => f?.filled ?? null) };
}

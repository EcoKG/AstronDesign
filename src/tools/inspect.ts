// design_inspect: 요소 묶음 수집과 Design Feedback 작성(Orca Design Mode 동작 참고, 새 구현).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import { getBrowser, newContext, resolveTarget, scheduleIdle, type Blocked } from '../browser.ts';
import { INLINE_B64_MAX, INLINE_IMAGE_DEFAULT, ToolError, callDir, defineTool, ok } from '../output.ts';

const LIMITS = { text: 200, html: 4096, ancestors: 10, nearby: 6, selector: 700 };
const SHOT_MAX = 2 * 1024 * 1024;

type Bundle = { selector: string; location: string; source: string; react: string; bounds: string; classes: string; text: string; nearby: string[]; styles: Record<string, string>; domPath: string; html: string };

/** 페이지 안에서 요소 하나의 묶음(정리한 HTML·계산 스타일 16개·위치 등)을 만든다. */
function collectBundle(el: Element, L: typeof LIMITS): Omit<Bundle, 'selector'> {
	const SECRET = /(access_|refresh_|id_)?token|passw(or)?d|secret|api[_-]?key|authorization|session|cookie/i;
	const ALLOWED = new Set(['id', 'class', 'role', 'href', 'src', 'alt', 'title', 'type', 'name', 'for', 'placeholder', 'tabindex', 'data-testid']);
	const HASHED = /^(css|sc|jsx|emotion)-[a-z0-9]{4,}$/i;
	const STYLE_KEYS = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'backgroundColor', 'border', 'borderRadius', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'zIndex'] as const;
	const squash = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
	const stripUrl = (v: string) => v.replace(/[?#].*$/, '');
	const classes = (v: string) => v.split(/\s+/).filter((c) => c && !HASHED.test(c)).join(' ');
	const clean = (node: Element) => {
		const copy = node.cloneNode(true) as Element;
		for (const s of Array.from(copy.querySelectorAll('script'))) s.remove();
		for (const e of [copy, ...Array.from(copy.querySelectorAll('*'))]) {
			for (const at of Array.from(e.attributes)) {
				const n = at.name;
				let v = at.value;
				if (SECRET.test(n)) { e.setAttribute(n, '[redacted]'); continue; }
				if (!ALLOWED.has(n) && !n.startsWith('aria-')) { e.removeAttribute(n); continue; }
				if (n === 'href' || n === 'src') v = stripUrl(v);
				if (n === 'class') v = classes(v);
				e.setAttribute(n, SECRET.test(v) ? '[redacted]' : v);
			}
		}
		return copy.outerHTML.slice(0, L.html);
	};
	const label = (e: Element) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && classes(e.className) ? '.' + classes(e.className).split(' ').join('.') : '');
	const path: string[] = [];
	for (let e: Element | null = el; e && path.length < L.ancestors; e = e.parentElement) path.unshift(label(e));
	const nearby: string[] = [];
	for (const e of [el.previousElementSibling, el.nextElementSibling, el.parentElement, ...Array.from(el.children)]) {
		if (!e || nearby.length >= L.nearby) continue;
		nearby.push(`${label(e)} "${squash((e as HTMLElement).innerText, 80)}"`);
	}
	const cs = getComputedStyle(el);
	const styles: Record<string, string> = {};
	for (const k of STYLE_KEYS) styles[k] = cs[k];
	const r = el.getBoundingClientRect();
	const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
	let source = 'null (dev 소스 정보 없음)';
	const react: string[] = [];
	for (let f = fiberKey ? (el as any)[fiberKey] : null; f && react.length < 3; f = f.return) {
		if (f._debugSource && source.startsWith('null')) source = `${f._debugSource.fileName}:${f._debugSource.lineNumber}`;
		const name = typeof f.type === 'function' ? f.type.displayName || f.type.name : null;
		if (name) react.push(name);
	}
	const text = squash((el as HTMLElement).innerText, L.text);
	return {
		location: `(${Math.round(r.left + scrollX)}, ${Math.round(r.top + scrollY)}) in page`,
		source,
		react: react.join(' < ') || 'none',
		bounds: `x=${Math.round(r.left)} y=${Math.round(r.top)} w=${Math.round(r.width)} h=${Math.round(r.height)}`,
		classes: typeof el.className === 'string' ? classes(el.className) : '',
		text,
		nearby: nearby.map((n) => n.slice(0, 120)).slice(0, L.nearby),
		styles,
		domPath: path.join(' > '),
		html: clean(el)
	};
}

/** 좌표의 요소에 고유 선택자를 만든다(id 가 있으면 id, 없으면 nth-of-type 경로). */
function selectorAt(p: { x: number; y: number }): string | null {
	const el = document.elementFromPoint(p.x, p.y);
	if (!el) return null;
	const parts: string[] = [];
	for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
		if (e.id) { parts.unshift('#' + CSS.escape(e.id)); break; }
		const same = e.parentElement ? Array.from(e.parentElement.children).filter((c) => c.tagName === e!.tagName) : [];
		parts.unshift(e.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(e) + 1})` : ''));
	}
	return parts.join(' > ');
}

/** Design Feedback 마크다운(Orca 필드 순서). */
function feedbackMd(url: string, viewport: string, items: (Bundle & { intent: string; note: string; matches: number })[]): string {
	const out = ['## Design Feedback', `- URL: ${url}`, `- Viewport: ${viewport}`, ''];
	items.forEach((it, i) => {
		out.push(`### ${i + 1}. ${it.selector}`,
			`- Intent: ${it.intent}`,
			`- Selector: \`${it.selector}\`${it.matches > 1 ? ` (${it.matches}개 일치, 첫 요소)` : ''}`,
			`- Location: ${it.location}`,
			`- Source: ${it.source}`,
			`- React: ${it.react}`,
			`- Bounds: ${it.bounds}`,
			`- Classes: ${it.classes || '(없음)'}`,
			`- Text: "${it.text}"`,
			`- Nearby: ${it.nearby.join(' | ') || '(없음)'}`,
			`- Computed styles: ${Object.entries(it.styles).map(([k, v]) => `${k}: ${v}`).join('; ')}`,
			`- DOM path: ${it.domPath}`,
			'- HTML:', '```html', it.html, '```',
			`- Feedback: ${it.note || '(없음)'}`, '');
	});
	return out.join('\n');
}

export const inspectTool = defineTool({
	name: 'design_inspect',
	description: 'Inspect page elements by selector or point (HTML, 16 computed styles, bounds, crop) and write a Design Feedback note.',
	inputSchema: z.object({
		target: z.string().max(2000),
		selector: z.string().max(700).optional(),
		point: z.object({ x: z.number().min(0), y: z.number().min(0) }).optional(),
		notes: z.array(z.object({ selector: z.string().max(700), note: z.string().max(2000), intent: z.enum(['fix', 'change', 'question', 'keep']).optional() })).max(20).optional(),
		width: z.number().int().min(320).max(2560).optional(),
		height: z.number().int().min(200).max(4000).optional(),
		allow_network: z.boolean().optional(),
		inline_image: z.boolean().optional()
	}),
	handler: async (a) => {
		if (!a.selector && !a.point && !a.notes?.length) throw new ToolError('E_INPUT', 'selector·point·notes 중 하나가 필요합니다');
		const tgt = await resolveTarget(a.target, a.allow_network);
		try {
			const dir = callDir('design_inspect');
			const w = a.width ?? 1440, h = a.height ?? 900;
			const blocked: Blocked = [];
			const { browser } = await getBrowser();
			const ctx = await newContext(browser, w, h, tgt.allowNetwork, blocked);
			try {
				const page = await ctx.newPage();
				try {
					await page.goto(tgt.url, { waitUntil: 'load', timeout: 30000 });
				} catch (e) {
					const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
					throw new ToolError(/timeout/i.test(msg) ? 'E_TIMEOUT' : 'E_ENGINE', `goto: ${msg}`);
				}
				await page.evaluate('document.fonts.ready.then(() => true)').catch(() => {});
				await new Promise((r) => setTimeout(r, 600));
				let wanted: { selector: string; note: string; intent: string }[];
				if (a.notes?.length) wanted = a.notes.map((n) => ({ selector: n.selector, note: n.note, intent: n.intent ?? 'fix' }));
				else if (a.selector) wanted = [{ selector: a.selector, note: '', intent: 'question' }];
				else {
					const sel = await page.evaluate(selectorAt, a.point!);
					if (!sel) throw new ToolError('E_SELECTOR', `좌표 (${a.point!.x}, ${a.point!.y}) 에 요소가 없습니다`);
					wanted = [{ selector: sel.slice(0, LIMITS.selector), note: '', intent: 'question' }];
				}
				const items: (Bundle & { intent: string; note: string; matches: number; crop: string | null })[] = [];
				let firstCrop: Buffer | null = null;
				for (const [i, want] of wanted.entries()) {
					const loc = page.locator(want.selector);
					const matches = await loc.count().catch(() => 0);
					if (!matches) throw new ToolError('E_SELECTOR', `일치하는 요소 0개: ${want.selector}`);
					const bundle = await loc.first().evaluate(collectBundle, LIMITS);
					let crop: string | null = null;
					const shot = await loc.first().screenshot({ type: 'jpeg', quality: 70, timeout: 10000 }).catch(() => null);
					if (shot && shot.length <= SHOT_MAX) {
						crop = join(dir, `element-${i + 1}.jpg`);
						writeFileSync(crop, shot);
						firstCrop ??= shot;
					}
					items.push({ selector: want.selector, ...bundle, intent: want.intent, note: want.note, matches, crop });
				}
				const md = feedbackMd(a.target, `${w}x${h}`, items);
				const feedback = join(dir, 'feedback.md');
				writeFileSync(feedback, md);
				const report = join(dir, 'report.json');
				writeFileSync(report, JSON.stringify({ tool: 'design_inspect', args: a, url: tgt.url, blocked, items }, null, '\t'));
				const head = [`OK design_inspect: ${items.length}개 요소`];
				if (blocked.length) head.push(`외부 자원 ${blocked.length}건 차단: 실제 화면과 다를 수 있음`);
				head.push(...items.filter((it) => it.matches > 1).map((it) => `${it.selector}: ${it.matches}개 일치, 첫 요소 사용`));
				head.push(`feedback: ${feedback}`, `report: ${report}`);
				const b64 = firstCrop && (a.inline_image ?? INLINE_IMAGE_DEFAULT) ? firstCrop.toString('base64') : undefined;
				return ok(`${head.join('\n')}\n\n${md}`, b64 && b64.length <= INLINE_B64_MAX ? b64 : undefined);
			} finally {
				await ctx.close();
			}
		} finally {
			await tgt.close();
			scheduleIdle();
		}
	}
});

// design_render: 실제 헤드리스 브라우저로 여러 폭 렌더·측정·접근성 스냅샷.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import * as z from 'zod';
import { getBrowser, newContext, resolveTarget, scheduleIdle, type Blocked } from '../browser.ts';
import { INLINE_B64_MAX, INLINE_IMAGE_DEFAULT, ToolError, callDir, defineTool, ok } from '../output.ts';
import { SURFACES, resolveFindings, type RawFinding, type Surface } from '../precedence.ts';
import { MOTION_RECORDER, tasteGate } from '../taste-gate.ts';
import { allowContext, findingLine, headLine, runImpeccable } from './lint.ts';

const HEIGHT: Record<number, number> = { 1440: 900, 1280: 800, 1024: 768, 768: 1024, 390: 844, 375: 812 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 페이지 안에서 모든 styleSheets·adoptedStyleSheets 규칙을 longhand 로 모으고 못 읽은 시트를 센다. 중첩 규칙은 부모 선택자로 풀어 평면 규칙으로 쓴다. */
function collectCss(): { css: string; unreadable: string[] } {
	const unreadable = new Set<string>();
	const EMPTY = /:\s*(;|\})/;
	const decls = (st: CSSStyleDeclaration, sel: string): string => {
		const parts: string[] = [];
		let empty = false;
		for (let i = 0; i < st.length; i++) {
			const p = st[i];
			let v = st.getPropertyValue(p);
			if (v === '') {
				empty = true;
				continue;
			}
			if (p === 'background-image' && v === 'initial') v = 'none';
			parts.push(p + ':' + v + (st.getPropertyPriority(p) ? ' !important' : ''));
		}
		if (!empty) return parts.join(';');
		if (!EMPTY.test(`{${st.cssText}}`)) return st.cssText;
		unreadable.add('var-shorthand ' + sel);
		return parts.join(';');
	};
	const nestSel = (sel: string, parent: string): string => {
		if (!parent) return sel;
		const p = parent.includes(',') ? `:is(${parent})` : parent;
		return sel.split(',').map((s) => (s.includes('&') ? s.replaceAll('&', p) : `${p} ${s.trim()}`)).join(',');
	};
	const walk = (rules: CSSRuleList, parent: string): string => {
		let out = '';
		for (const rule of Array.from(rules)) {
			if (rule instanceof CSSStyleRule) {
				const sel = nestSel(rule.selectorText, parent);
				out += `${sel}{${decls(rule.style, sel)}}`;
				if (rule.cssRules?.length) out += walk(rule.cssRules, sel);
			} else if (rule instanceof CSSImportRule) out += rule.styleSheet ? sheetCss(rule.styleSheet, rule.href) : (unreadable.add(rule.href), '');
			else if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) out += `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${walk((rule as CSSGroupingRule).cssRules, parent)}}`;
			else if (parent && 'style' in rule) out += `${parent}{${decls((rule as CSSStyleRule).style, parent)}}`;
			else out += rule.cssText;
		}
		return out;
	};
	const sheetCss = (sheet: CSSStyleSheet, name: string): string => {
		if (sheet.disabled) return '';
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			unreadable.add(name);
			return '';
		}
		const css = walk(rules, '');
		const media = sheet.media?.mediaText;
		return media ? `@media ${media}{${css}}` : css;
	};
	const parts: string[] = [];
	Array.from(document.styleSheets).forEach((s, i) => parts.push(sheetCss(s, s.href || `inline#${i}`)));
	for (const s of document.adoptedStyleSheets) parts.push(sheetCss(s, 'adopted'));
	for (const l of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~=stylesheet]'))) if (!l.sheet) unreadable.add(l.href);
	return { css: parts.join('\n'), unreadable: [...unreadable] };
}

/** 모은 규칙 하나만 남긴 dom.html 을 만든다. 측정이 모두 끝난 뒤 그 페이지를 바꿔 직렬화한다. */
async function inlineDom(page: Page): Promise<{ html: string; unreadable: string[] }> {
	const { css, unreadable } = await page.evaluate(collectCss);
	await page.evaluate((text) => {
		for (const el of Array.from(document.querySelectorAll('link[rel~=stylesheet], style'))) el.remove();
		const style = document.createElement('style');
		style.setAttribute('data-astrondesign-inlined', '');
		style.textContent = text;
		document.head.appendChild(style);
	}, css);
	return { html: await page.content(), unreadable };
}

export const renderTool = defineTool({
	name: 'design_render',
	description: 'Render a page in a real headless browser at several widths: screenshots, measured design rules, accessibility snapshot. External network blocked by default.',
	inputSchema: z.object({
		target: z.string().max(2000),
		surface: z.enum(SURFACES),
		widths: z.array(z.number().int().min(320).max(2560)).min(1).max(4).optional(),
		checks: z.array(z.enum(['taste', 'impeccable', 'a11y'])).optional(),
		allow: z.array(z.string().max(40)).max(40).optional(),
		design_md: z.string().max(400).optional(),
		allow_network: z.boolean().optional(),
		inline_image: z.boolean().optional(),
		wait_ms: z.number().int().min(0).max(10000).optional()
	}),
	handler: async (a) => {
		const cwd = process.cwd();
		const tgt = await resolveTarget(a.target, a.allow_network, cwd);
		try {
			const dir = callDir('design_render');
			const surface = a.surface as Surface;
			const widths = a.widths ?? [1440, 768, 390];
			const checks = new Set(a.checks ?? (surface === 'persuade' ? ['taste', 'impeccable', 'a11y'] : ['impeccable', 'a11y']));
			const gateOn = surface === 'persuade' && checks.has('taste');
			const widest = Math.max(...widths);
			const { browser, via } = await getBrowser();
			const blocked: Blocked = [];
			const raw: RawFinding[] = [];
			const viewports: Record<string, unknown>[] = [];
			const images: { width: number; fold: string; aria?: string }[] = [];
			let dom: { path: string; unreadable: string[] } | null = null;
			for (const w of widths) {
				const h = HEIGHT[w] ?? Math.round(w * 0.625);
				const start = blocked.length;
				const ctx = await newContext(browser, w, h, tgt.allowNetwork, blocked);
				try {
					const page = await ctx.newPage();
					const consoleErrors: string[] = [];
					page.on('pageerror', (e) => consoleErrors.push(e.message.slice(0, 300)));
					page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
					if (gateOn) await page.addInitScript(MOTION_RECORDER);
					try {
						await page.goto(tgt.url, { waitUntil: 'load', timeout: 30000 });
					} catch (e) {
						const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
						throw new ToolError(/timeout/i.test(msg) ? 'E_TIMEOUT' : 'E_ENGINE', `goto ${w}px: ${msg}`);
					}
					await page.evaluate('document.fonts.ready.then(() => true)').catch(() => {});
					await sleep(a.wait_ms ?? 600);
					const fold = join(dir, `fold-${w}.jpg`);
					let screens = 1;
					if (gateOn) {
						const g = await tasteGate(page, w, h, fold);
						screens = g.screens;
						for (const f of g.findings) raw.push({ source: 'taste-gate', id: f.id, level: f.level, location: tgt.url, width: w, message: f.message, urls: f.urls });
					} else await page.screenshot({ path: fold, type: 'jpeg', quality: 50 });
					const img: { width: number; fold: string; aria?: string } = { width: w, fold };
					if (checks.has('a11y')) {
						img.aria = join(dir, `aria-${w}.yml`);
						writeFileSync(img.aria, await page.locator('body').ariaSnapshot());
					}
					if (w === widest && checks.has('impeccable') && !dom) {
						const d = await inlineDom(page);
						dom = { path: join(dir, 'dom.html'), unreadable: d.unreadable };
						writeFileSync(dom.path, d.html);
					}
					images.push(img);
					viewports.push({ width: w, height: h, load: 'load', screens, blocked: blocked.length - start, consoleErrors: consoleErrors.slice(0, 5) });
				} finally {
					await ctx.close();
				}
			}
			if (dom) {
				const imp = await runImpeccable([dom.path], cwd);
				for (const f of imp.raw) raw.push({ ...f, location: tgt.url });
				if (dom.unreadable.length) raw.push({ source: 'harness', id: 'harness:css-incomplete', level: 'WARN', location: tgt.url, message: `CSS 미반영 ${dom.unreadable.length}: ${dom.unreadable.slice(0, 3).join(', ')}` });
			}
			const uniq = [...new Map(blocked.map((b) => [`${b.type} ${b.url}`, b])).values()];
			const ctxAllow = await allowContext(cwd, dir, a.design_md);
			const resolved = resolveFindings(raw, {
				surface, userAllow: a.allow, tokenAllow: ctxAllow.tokenAllow, tokenFonts: ctxAllow.tokenFonts, sheetAllow: ctxAllow.sheetAllow,
				blocked: uniq.map((b) => b.url), blockedMedia: uniq.filter((b) => b.type === 'image' || b.type === 'media').length
			});
			const report = join(dir, 'report.json');
			writeFileSync(report, JSON.stringify({ tool: 'design_render', args: a, url: tgt.url, browser: via, viewports, images, blocked: uniq, dom: dom?.path, unreadable: dom?.unreadable ?? [], notes: ctxAllow.notes, ...resolved }, null, '\t'));
			const head = [headLine('design_render', resolved)];
			if (uniq.length) head.push(`외부 자원 ${uniq.length}건 차단: 실제 화면과 다를 수 있음`);
			if (dom?.unreadable.length) head.push(`CSS 미반영 ${dom.unreadable.length}: ${dom.unreadable.slice(0, 3).join(', ')}`);
			if (surface !== 'persuade') head.push('taste-gate: not-run(surface)');
			head.push(...ctxAllow.notes);
			for (const v of viewports) head.push(`@${v.width}: load=${v.load} screens=${v.screens} blocked=${v.blocked}`);
			head.push(`browser: ${via}`, `report: ${report}`, `fold: ${images.map((i) => i.fold).join(', ')}`);
			let image: string | undefined;
			if (a.inline_image ?? INLINE_IMAGE_DEFAULT) {
				const b64 = readFileSync(images[0].fold).toString('base64');
				if (b64.length <= INLINE_B64_MAX) image = b64;
				else head.push(`inline 이미지 생략(${b64.length}자 > ${INLINE_B64_MAX}): 위 fold 경로를 여십시오`);
			}
			return ok([...head, ...resolved.findings.slice(0, 20).map((f) => findingLine(f, cwd))].join('\n'), image);
		} finally {
			await tgt.close();
			scheduleIdle();
		}
	}
});

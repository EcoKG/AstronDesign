// design_inspect: 요소 묶음 수집과 Design Feedback 작성(Orca Design Mode 동작 참고, 새 구현).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import { getBrowser, newContext, resolveTarget, scheduleIdle, type Blocked } from '../browser.ts';
import { INLINE_B64_MAX, INLINE_IMAGE_DEFAULT, ToolError, callDir, defineTool, ok } from '../output.ts';
import { INTENT_IDS } from '../intents.ts';
import { LIMITS, collectBundle, feedbackMd, selectorAt } from '../shared/dom-bundle.js';

const SHOT_MAX = 2 * 1024 * 1024;

type Bundle = ReturnType<typeof collectBundle> & { selector: string };

export const inspectTool = defineTool({
	name: 'design_inspect',
	description: 'Inspect page elements by selector or point (HTML, 16 computed styles, bounds, crop) and write a Design Feedback note.',
	inputSchema: z.object({
		target: z.string().max(2000),
		selector: z.string().max(700).optional(),
		point: z.object({ x: z.number().min(0), y: z.number().min(0) }).optional(),
		notes: z.array(z.object({ selector: z.string().max(700), note: z.string().max(2000), intent: z.enum(INTENT_IDS).optional() })).max(20).optional(),
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

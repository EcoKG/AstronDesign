// design_export: 대상(편집기 미적용 편집 포함)을 등록된 파일 형식(HTML·PNG)으로 편집기 보드 폭마다 내보낸다. 외부 네트워크는 막는다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'playwright-core';
import * as z from 'zod';
import { getBrowser, newContext, resolveTarget, scheduleIdle, type Blocked } from '../browser.ts';
import { DEFAULT_WIDTHS, editorDir } from '../editor/session.ts';
import { loadChanges, pendingOps } from '../editor/store.ts';
import { exporterIds, getExporter } from '../export/registry.ts';
import { ToolError, callDir, defineTool, ok } from '../output.ts';
import { OP_KINDS, type Op } from '../shared/ops.js';

const HEIGHT: Record<number, number> = { 1440: 900, 768: 1024, 390: 844 };

/** 편집 연산을 페이지에 적용하는 식(문자열 평가라 페이지 CSP 의 eval 제한을 받지 않음). */
function applyScript(ops: Op[]): string {
	const kinds = Object.entries(OP_KINDS).map(([k, v]) => `${JSON.stringify(k)}: function ${v.apply.toString()}`).join(',\n');
	return `(() => { const kinds = {${kinds}}; for (const op of ${JSON.stringify(ops)}) { let e = document.documentElement; for (const i of op.path) e = e && e.children[i]; if (e && e.tagName.toLowerCase() === op.tag) kinds[op.kind](e, op); } })()`;
}

/** 대상의 편집기 세션이 있으면 그 미적용 연산과 보드 폭. 없으면 연산 없음·기본 3폭. */
function fromSession(target: string): { ops: Op[]; widths: number[] } {
	try {
		const dir = editorDir(target);
		if (!existsSync(dir)) return { ops: [], widths: DEFAULT_WIDTHS };
		const meta = existsSync(join(dir, 'session.json')) ? JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')) : {};
		return { ops: pendingOps(loadChanges(dir).events), widths: Array.isArray(meta.widths) && meta.widths.length ? meta.widths : DEFAULT_WIDTHS };
	} catch {
		return { ops: [], widths: DEFAULT_WIDTHS };
	}
}

export const exportTool = defineTool({
	name: 'design_export',
	description: 'Export page with editor edits as standalone HTML and per-width PNG.',
	inputSchema: z.object({
		target: z.string().max(2000),
		formats: z.array(z.enum(exporterIds() as [string, ...string[]]))
	}),
	handler: async (a) => {
		if (!a.formats.length) throw new ToolError('E_INPUT', `formats 가 비었습니다: ${exporterIds().join('·')} 중에서 고르십시오`);
		const tgt = await resolveTarget(a.target, undefined);
		const contexts: BrowserContext[] = [];
		try {
			const dir = callDir('design_export');
			const { ops, widths } = fromSession(a.target);
			const blocked: Blocked = [];
			const { browser } = await getBrowser();
			const open = async (w: number): Promise<Page> => {
				const ctx = await newContext(browser, w, HEIGHT[w] ?? Math.round(w * 0.625), false, blocked);
				contexts.push(ctx);
				const page = await ctx.newPage();
				try {
					await page.goto(tgt.url, { waitUntil: 'load', timeout: 30000 });
				} catch (e) {
					throw new ToolError('E_TIMEOUT', `goto ${w}px: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
				}
				await page.evaluate('document.fonts.ready.then(() => true)').catch(() => {});
				if (ops.length) await page.evaluate(applyScript(ops));
				return page;
			};
			const files: Record<string, string[]> = {};
			for (const f of [...new Set(a.formats)]) files[f] = await getExporter(f)!.run({ dir, widths, open });
			const report = join(dir, 'report.json');
			writeFileSync(report, JSON.stringify({ tool: 'design_export', args: a, url: tgt.url, ops: ops.length, blocked, files }, null, '\t'));
			const head = [`OK design_export: ${Object.keys(files).join(',')} (편집 ${ops.length}건 반영)`];
			if (blocked.length) head.push(`외부 자원 ${blocked.length}건 차단: 내보낸 파일에서 빠짐`);
			for (const [f, paths] of Object.entries(files)) head.push(`${f}: ${paths.join(', ')}`);
			head.push(`report: ${report}`);
			return ok(head.join('\n'));
		} finally {
			for (const c of contexts) await c.close().catch(() => {});
			await tgt.close();
			scheduleIdle();
		}
	}
});

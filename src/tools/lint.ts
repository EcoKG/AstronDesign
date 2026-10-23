// design_lint: impeccable detect 와 taste lint 정적 검사 결과를 우선순위 규칙으로 합침.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as z from 'zod';
import { IMPECCABLE_BIN, TASTE_SCRIPTS, assertRan, engineError, runSub, subEnv } from '../config.ts';
import { ToolError, callDir, defineTool, ok, outRoot } from '../output.ts';
import { insideCwd } from '../paths.ts';
import { SURFACES, resolveFindings, type Finding, type RawFinding, type Resolved, type Surface } from '../precedence.ts';
import { deriveAllow, probeTokenColours, readTokens } from '../tokens.ts';

type ImpeccableItem = { antipattern: string; name: string; category: string; file: string; line: number; snippet: string };
export type Sheet = { path: string; allow: string[] } | null;
export type AllowContext = { tokenAllow: string[]; tokenFonts: string[]; sheetAllow: string[]; notes: string[]; tokens: string | null; sheet: Sheet };

/** impeccable detect --json 을 실행하고 발견과 링크 CSS 미반영 경고를 돌려준다. */
export async function runImpeccable(targets: string[], cwd: string): Promise<{ raw: RawFinding[]; code: number }> {
	const r = await runSub(IMPECCABLE_BIN, ['detect', '--json', ...targets], { cwd, env: subEnv(outRoot(cwd)) });
	assertRan(r, 'impeccable detect');
	if (r.code === 1) throw new ToolError('E_ENGINE', `impeccable detect 가 대상 일부를 스캔하지 못했습니다: ${r.stderr.trim().slice(0, 500)}`);
	if (r.code !== 0 && r.code !== 2) throw engineError(r, 'impeccable detect');
	let items: ImpeccableItem[];
	try {
		items = r.stdout.trim() ? (JSON.parse(r.stdout) as ImpeccableItem[]) : [];
	} catch {
		throw engineError(r, 'impeccable detect(JSON 아님)');
	}
	const raw: RawFinding[] = items.map((f) => ({ source: 'impeccable', id: f.antipattern, category: f.category, location: f.file, line: f.line, message: `${f.name}: ${f.snippet}`, match: f.snippet }));
	for (const m of r.stderr.matchAll(/could not read linked stylesheet (\S+)(?: \(resolved to ([^)]+)\))?/g)) {
		raw.push({ source: 'harness', id: 'harness:css-incomplete', level: 'WARN', location: m[2] ?? m[1], message: `링크 CSS 미반영: ${m[1]} (색·사용자 속성 규칙이 빠짐)` });
	}
	return { raw, code: r.code };
}

/** 방향 시트 allow 를 OUT/direction → <cwd>/.taste-skill 순서로 처음 찾은 파일 하나에서 읽는다. */
export function readSheet(cwd: string, notes: string[]): Sheet {
	for (const p of [join(outRoot(cwd), 'direction', 'direction.json'), join(cwd, '.taste-skill', 'direction.json')]) {
		if (!existsSync(p)) continue;
		try {
			const allow = (JSON.parse(readFileSync(p, 'utf8')) as { allow?: unknown }).allow;
			if (Array.isArray(allow) && allow.every((x) => typeof x === 'string')) {
				notes.push(`sheet: ${p} allow=[${allow.join(',')}]`);
				return { path: p, allow };
			}
		} catch {}
		notes.push(`sheet: unreadable ${p}`);
		return null;
	}
	return null;
}

/** DESIGN.md 토큰(경로 A·B)과 방향 시트에서 allow 원천을 모은다. */
export async function allowContext(cwd: string, dir: string, designMd?: string): Promise<AllowContext> {
	const notes: string[] = [];
	const tokens = readTokens(designMd ? insideCwd(designMd, cwd) : join(cwd, 'DESIGN.md'));
	const probe = await probeTokenColours(dir, tokens.colours, cwd);
	if (probe.failed) notes.push('token-probe: failed');
	const sheet = readSheet(cwd, notes);
	return { tokenAllow: deriveAllow(tokens, probe.ids), tokenFonts: tokens.fonts, sheetAllow: sheet?.allow ?? [], notes, tokens: tokens.path, sheet };
}

/** 발견 한 줄: `[LEVEL] id (sources) 위치:줄 — message [overridden_by]`. */
export function findingLine(f: Finding, cwd: string): string {
	const loc = /^(https?:|\()/.test(f.location) ? f.location : relative(cwd.toLowerCase(), f.location).split('\\').join('/');
	const where = f.lines.length ? `${loc}:${f.lines.join(',')}` : f.widths.length ? `${loc} @${f.widths.join(',')}` : loc;
	const tail = f.overridden_by ? ` [${f.overridden_by}]` : f.conflict ? ' [conflict: 사람 결정 필요]' : '';
	return `[${f.level}] ${f.id} (${f.sources.join(', ')}) ${where} — ${f.message.replace(/\s+/g, ' ').slice(0, 220)}${tail}`;
}

/** 결과 머리줄. FAIL 이 있으면 FAIL, 아니면 OK. */
export function headLine(tool: string, r: Resolved): string {
	const c = r.counts;
	return `${c.FAIL ? 'FAIL' : 'OK'} ${tool}: FAIL ${c.FAIL} · WARN ${c.WARN} · INFO ${c.INFO} (allowed ${c.allowed}, surface-skipped ${r.surfaceSkipped})`;
}

export const lintTool = defineTool({
	name: 'design_lint',
	description: 'Static UI design lint of source files with impeccable and taste rules, resolved by AstronDesign precedence. Writes nothing to the project.',
	inputSchema: z.object({
		paths: z.array(z.string().max(400)).min(1).max(20),
		surface: z.enum(SURFACES),
		allow: z.array(z.string().max(40)).max(40).optional(),
		design_md: z.string().max(400).optional(),
		engines: z.array(z.enum(['impeccable', 'taste'])).min(1).optional()
	}),
	handler: async (a) => {
		const cwd = process.cwd();
		const targets = a.paths.map((p) => insideCwd(p, cwd));
		const dir = callDir('design_lint');
		const engines = a.engines ?? ['impeccable', 'taste'];
		const raw: RawFinding[] = [];
		const exit: Record<string, number> = {};
		const notes: string[] = [];
		if (engines.includes('impeccable')) {
			const imp = await runImpeccable(targets, cwd);
			raw.push(...imp.raw);
			exit.impeccable = imp.code;
		}
		if (engines.includes('taste')) {
			const r = await runSub(process.execPath, [join(TASTE_SCRIPTS, 'lint.mjs'), ...targets, '--json'], { cwd, env: subEnv(outRoot(cwd)) });
			assertRan(r, 'taste lint');
			exit.taste = r.code ?? -1;
			if (r.code === 0 || r.code === 1) {
				const out = JSON.parse(r.stdout) as { findings: { level: 'FAIL' | 'WARN'; id: string; file: string; line: number; match: string; message: string }[] };
				for (const f of out.findings) raw.push({ source: 'taste-lint', id: f.id, level: f.level, location: f.file.startsWith('(') ? f.file : resolve(cwd, f.file), line: f.line, message: `${f.message} (${f.match})`, match: f.match });
			} else if (r.code === 2 && r.stderr.startsWith('No source files')) notes.push('taste lint: 소스 없음');
			else if (r.code === 2) throw new ToolError('E_PATH', r.stderr.trim().slice(0, 300));
			else throw engineError(r, 'taste lint');
		}
		const ctx = await allowContext(cwd, dir, a.design_md);
		const resolved = resolveFindings(raw, { surface: a.surface as Surface, userAllow: a.allow, tokenAllow: ctx.tokenAllow, tokenFonts: ctx.tokenFonts, sheetAllow: ctx.sheetAllow });
		const report = join(dir, 'report.json');
		writeFileSync(report, JSON.stringify({ tool: 'design_lint', args: a, engines_run: engines, exit, tokens: ctx.tokens, tokenAllow: ctx.tokenAllow, sheet: ctx.sheet, notes: [...notes, ...ctx.notes], ...resolved }, null, '\t'));
		const lines = resolved.findings.slice(0, 25).map((f) => findingLine(f, cwd));
		return ok([headLine('design_lint', resolved), ...ctx.notes, ...notes, `report: ${report}`, ...lines].join('\n'));
	}
});

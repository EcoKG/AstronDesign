// 프로젝트 DESIGN.md 토큰 추출과 토큰 → allow(정규 id) 도출.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { colourFamily } from '../vendor/taste-skill/scripts/lib/rules.mjs';
import { TASTE_SCRIPTS, runSub, subEnv } from './config.ts';

export type Tokens = { fonts: string[]; colours: string[]; keys: string[]; path: string | null };
export type ProbeResult = { ids: string[]; byColour: Record<string, string[]>; failed: boolean };

const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'system-ui', '-apple-system', 'ui-monospace', 'ui-sans-serif']);

/** 글꼴 이름을 비교용으로 정규화한다(소문자, 따옴표 제거, `+`·`_` → 공백). */
export function normFont(name: string): string {
	return name.toLowerCase().replace(/["']/g, '').replace(/[+_]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** DESIGN.md 의 첫 `---` 블록에서 글꼴·색·키를 뽑는다. 파일이 없으면 빈 토큰. */
export function readTokens(path: string): Tokens {
	if (!existsSync(path)) return { fonts: [], colours: [], keys: [], path: null };
	const block = /(?:^|\n)---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(path, 'utf8'))?.[1] ?? '';
	const fonts = new Set<string>();
	for (const m of block.matchAll(/fontFamily:\s*(.+)/g)) {
		for (const part of m[1].split(',')) {
			const f = normFont(part);
			if (f && !GENERIC.has(f)) fonts.add(f);
		}
	}
	const colours = new Set([...block.matchAll(/["']#([0-9a-fA-F]{6})["']/g)].map((m) => '#' + m[1].toLowerCase()));
	const keys = new Set([...block.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*:/gm)].map((m) => m[1]));
	return { fonts: [...fonts], colours: [...colours], keys: [...keys], path };
}

/** rules.mjs 의 hexToHsl 과 같은 식(그 함수는 export 되지 않음). */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
	const n = parseInt(hex.slice(1), 16);
	const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
	const l = (mx + mn) / 2;
	let h = 0, s = 0;
	if (mx !== mn) {
		const d = mx - mn;
		s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
		h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
		h *= 60;
	}
	return { h: Math.round(h), s, l };
}

/** 토큰 표 1~6·8행으로 허용 규칙(정규 id)을 도출한다. 7행(글꼴)은 fontAllowed 가 맡는다. */
export function deriveAllow(t: Pick<Tokens, 'fonts' | 'colours' | 'keys'>, probeIds: string[]): string[] {
	const allow = new Set<string>();
	const fam = new Set(t.colours.map((c) => colourFamily(hexToHsl(c))));
	if (t.fonts.some((f) => /mono/i.test(f))) allow.add('mono');
	if (t.keys.some((k) => /gradient/.test(k))) allow.add('gradient');
	if (t.keys.some((k) => /hairline|divider|rule|border/.test(k))) allow.add('hairline').add('outlined-box');
	if (fam.has('ai-purple') || probeIds.includes('purple')) allow.add('palette-purple');
	if (t.keys.some((k) => /glass|blur/.test(k))) allow.add('glass');
	if (t.keys.some((k) => /shadow|elevation/.test(k))) allow.add('shadow');
	if (fam.has('cream')) allow.add('palette-cream');
	if (fam.has('terracotta')) allow.add('palette-terracotta');
	if ((fam.has('cream') && fam.has('terracotta')) || probeIds.includes('claude-palette')) allow.add('palette-claude');
	return [...allow];
}

/** 글꼴 발견 문자열에서 글꼴 이름을 뽑는다(엔진별 규칙). 못 뽑으면 null. */
export function fontFromFinding(source: string, text: string): string | null {
	if (!text) return null;
	if (source === 'impeccable') {
		const m = /^Primary font:\s*(.+)$/.exec(text.trim());
		return m ? normFont(m[1]) : null;
	}
	const fam = /family=([^&:]+)/.exec(text);
	if (fam) return normFont(fam[1]);
	const css = /font-family\s*:\s*([^,;]+)/.exec(text);
	if (css) return normFont(css[1]);
	const ids = text.match(/[A-Za-z_][A-Za-z0-9_]*/g);
	return ids ? normFont(ids[ids.length - 1]) : null;
}

/** 발견의 글꼴이 토큰 글꼴과 정규화 후 완전 일치하면 true. */
export function fontAllowed(source: string, text: string, fonts: string[]): boolean {
	const f = fontFromFinding(source, text);
	return f !== null && fonts.includes(f);
}

/** 토큰 색마다 `.tN{color:<hex>}` 를 쓴 token-probe.css 를 taste lint 로 검사해 색별 발견 id 를 모은다. */
export async function probeTokenColours(dir: string, colours: string[], cwd = process.cwd()): Promise<ProbeResult> {
	if (!colours.length) return { ids: [], byColour: {}, failed: false };
	const file = join(dir, 'token-probe.css');
	writeFileSync(file, colours.map((c, i) => `.t${i}{color:${c}}`).join('\n') + '\n');
	const r = await runSub(process.execPath, [join(TASTE_SCRIPTS, 'lint.mjs'), file, '--json'], { cwd, env: subEnv(join(dir, '..')) });
	if (r.code !== 0 && r.code !== 1) return { ids: [], byColour: {}, failed: true };
	try {
		const byColour: Record<string, string[]> = {};
		for (const f of (JSON.parse(r.stdout) as { findings: { id: string; line: number }[] }).findings) {
			const c = colours[f.line - 1];
			if (!c) continue;
			byColour[c] = [...new Set([...(byColour[c] ?? []), f.id])];
		}
		return { ids: [...new Set(Object.values(byColour).flat())], byColour, failed: false };
	} catch {
		return { ids: [], byColour: {}, failed: true };
	}
}

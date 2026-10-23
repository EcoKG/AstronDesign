// 충돌 해소 우선순위(P0~P7)·엔진별 규칙 id 대응표(CANON)·발견 병합과 등급 결정.
import { fontAllowed } from './tokens.ts';

export type Level = 'FAIL' | 'WARN' | 'INFO';
export const SURFACES = ['persuade', 'operate', 'read', 'experience'] as const;
export type Surface = (typeof SURFACES)[number];
export type Source = 'impeccable' | 'taste-lint' | 'taste-gate' | 'harness';
export type RawFinding = { source: Source; id: string; level?: Level; category?: string; location: string; line?: number; width?: number; message: string; match?: string; urls?: string[] };
export type Finding = { id: string; level: Level; location: string; lines: number[]; widths: number[]; sources: Source[]; ids: string[]; message: string; overridden_by?: string; conflict?: true; floor: boolean; urls?: string[] };
export type Context = { surface: Surface; userAllow?: string[]; tokenAllow?: string[]; tokenFonts?: string[]; sheetAllow?: string[]; blocked?: string[]; blockedMedia?: number };
export type Resolved = { findings: Finding[]; surfaceSkipped: number; counts: { FAIL: number; WARN: number; INFO: number; allowed: number; blocked: number } };

export const PRECEDENCE = [
	'P0 노드·그래프 지시(출력 형식, 노드 정책)',
	'P1 사용자·브리프의 명시 요구(도구 인자 allow)',
	'P2 프로젝트 기존 디자인 시스템(DESIGN.md 토큰, 그다음 기존 코드 토큰)',
	'P3 접근성·품질 하한(allow 로 낮추지 않고 conflict 표시)',
	'P4 impeccable craft-floor·모드 규칙(모든 surface, defaults not bans)',
	'P5 taste 하우스 규칙(persuade 에서만)',
	'P6 UI UX Pro Max 검색 결과(권고)',
	'P7 브랜드 참고 DESIGN.md(awesome-design-md)'
];

/** 정규 id → 엔진별 id(impeccable, taste lint, taste gate). */
export const CANON: Record<string, { impeccable: string[]; tasteLint: string[]; tasteGate: string[] }> = {
	eyebrow: { impeccable: ['kicker-above-heading', 'hero-eyebrow-chip'], tasteLint: ['eyebrow'], tasteGate: ['eyebrow'] },
	'numbered-labels': { impeccable: ['numbered-section-labels'], tasteLint: ['numbering'], tasteGate: ['numbering'] },
	'gradient-text': { impeccable: ['gradient-text'], tasteLint: ['gradient-text'], tasteGate: ['gradient-text'] },
	gradient: { impeccable: [], tasteLint: ['gradient'], tasteGate: ['gradient'] },
	'palette-purple': { impeccable: ['ai-color-palette'], tasteLint: ['purple'], tasteGate: ['palette-purple'] },
	'palette-claude': { impeccable: [], tasteLint: ['claude-palette'], tasteGate: ['palette-claude'] },
	'palette-cream': { impeccable: ['cream-palette'], tasteLint: [], tasteGate: ['palette-cream'] },
	'palette-terracotta': { impeccable: [], tasteLint: [], tasteGate: ['palette-terracotta'] },
	'default-font': { impeccable: ['overused-font'], tasteLint: ['default-font'], tasteGate: [] },
	mono: { impeccable: [], tasteLint: ['mono'], tasteGate: ['mono'] },
	hairline: { impeccable: [], tasteLint: ['hairline'], tasteGate: ['hairline'] },
	'outlined-box': { impeccable: [], tasteLint: ['outlined-box'], tasteGate: ['outlined-box'] },
	glass: { impeccable: [], tasteLint: ['glass'], tasteGate: ['glass'] },
	shadow: { impeccable: [], tasteLint: ['shadow'], tasteGate: ['shadow'] },
	'micro-label': { impeccable: [], tasteLint: ['micro-label'], tasteGate: ['micro-label'] },
	emoji: { impeccable: [], tasteLint: ['emoji'], tasteGate: ['emoji'] },
	bounce: { impeccable: ['bounce-easing'], tasteLint: ['bounce'], tasteGate: [] },
	'em-dash': { impeccable: ['em-dash-overuse'], tasteLint: ['em-dash'], tasteGate: [] },
	contrast: { impeccable: ['low-contrast', 'gray-on-color'], tasteLint: [], tasteGate: ['contrast'] },
	'small-text': { impeccable: ['tiny-text'], tasteLint: [], tasteGate: ['small-text'] },
	overflow: { impeccable: [], tasteLint: [], tasteGate: ['overflow'] },
	'text-overflow': { impeccable: ['text-overflow'], tasteLint: [], tasteGate: [] },
	'covered-text': { impeccable: ['text-occlusion'], tasteLint: [], tasteGate: ['covered-text'] },
	'clipped-text': { impeccable: [], tasteLint: [], tasteGate: ['clipped-text'] },
	'broken-image': { impeccable: ['broken-image'], tasteLint: [], tasteGate: ['broken-image'] },
	'script-error': { impeccable: ['script-error'], tasteLint: [], tasteGate: [] },
	'skipped-heading': { impeccable: ['skipped-heading'], tasteLint: [], tasteGate: [] }
};

export const A11Y_FLOOR = new Set(['contrast', 'small-text', 'overflow', 'text-overflow', 'covered-text', 'clipped-text', 'broken-image', 'script-error', 'skipped-heading']);

const BLOCKABLE_MEDIA = new Set(['few-pictures', 'no-real-pictures', 'no-footage']);
const RANK: Record<Level, number> = { INFO: 0, WARN: 1, FAIL: 2 };
const TO_CANON = new Map<string, string>();
for (const [c, e] of Object.entries(CANON)) for (const id of [c, ...e.impeccable, ...e.tasteLint, ...e.tasteGate]) TO_CANON.set(id, c);

/** 엔진 id·사용자 allow 를 정규 id 로 바꾼다. 대응표에 없으면 그대로. */
export function canon(id: string): string {
	return TO_CANON.get(id.trim()) ?? id.trim();
}

const normLoc = (loc: string) => (/^(https?:|\()/.test(loc) ? loc : loc.toLowerCase().split('\\').join('/'));
const isTaste = (s: Source) => s === 'taste-lint' || s === 'taste-gate';

type Judged = { raw: RawFinding; id: string; level: Level; floor: boolean; overridden_by?: string; conflict?: true; urls?: string[]; message: string };

/** 출처 하나의 등급을 C2 규칙 → allow → 차단 유발 순서로 정한다. */
function judgeOne(f: RawFinding, ctx: Context, user: Set<string>, tokens: Set<string>, sheet: Set<string>): Judged {
	const id = canon(f.id);
	const j: Judged = { raw: f, id, level: f.level ?? 'WARN', floor: A11Y_FLOOR.has(id), message: f.message, urls: f.urls };
	if (f.source === 'harness') return { ...j, floor: false };
	if (f.source === 'impeccable') j.level = j.floor ? 'FAIL' : 'WARN';
	const by = user.has(id) ? 'P1'
		: tokens.has(id) || (id === 'default-font' && fontAllowed(f.source, f.match ?? '', ctx.tokenFonts ?? [])) ? 'P2'
		: isTaste(f.source) && sheet.has(id) ? 'sheet'
		: undefined;
	if (by && j.floor) j.conflict = true;
	else if (by) {
		j.level = 'INFO';
		j.overridden_by = by;
	}
	if (f.source === 'taste-gate' && id === 'broken-image' && f.urls?.length) {
		const blocked = ctx.blocked ?? [];
		const left = f.urls.filter((u) => !blocked.some((b) => b.slice(0, 120) === u));
		if (!left.length) {
			Object.assign(j, { level: 'INFO', overridden_by: 'blocked-by-harness', floor: false });
			delete j.conflict;
		} else if (left.length < f.urls.length) {
			j.urls = left;
			j.message = `Broken image(s): ${left.slice(0, 4).join(', ')}`;
		}
	}
	if (f.source === 'taste-gate' && BLOCKABLE_MEDIA.has(id) && (ctx.blockedMedia ?? 0) >= 1 && j.level !== 'INFO') {
		j.level = 'INFO';
		j.overridden_by = 'blocked-by-harness';
	}
	return j;
}

/** 엔진 발견을 surface·allow·차단 규칙으로 판정하고 (정규 id, 위치) 로 합친다. */
export function resolveFindings(raw: RawFinding[], ctx: Context): Resolved {
	const user = new Set((ctx.userAllow ?? []).map(canon));
	const tokens = new Set((ctx.tokenAllow ?? []).map(canon));
	const sheet = new Set((ctx.sheetAllow ?? []).map(canon));
	let surfaceSkipped = 0;
	const groups = new Map<string, Judged[]>();
	for (const f of raw) {
		if (ctx.surface !== 'persuade' && isTaste(f.source)) {
			surfaceSkipped++;
			continue;
		}
		const j = judgeOne(f, ctx, user, tokens, sheet);
		const key = `${j.id}|${normLoc(f.location)}`;
		groups.set(key, [...(groups.get(key) ?? []), j]);
	}
	const findings: Finding[] = [];
	for (const js of groups.values()) {
		const top = js.reduce((a, b) => (RANK[b.level] > RANK[a.level] ? b : a));
		const f: Finding = {
			id: top.id,
			level: top.level,
			location: normLoc(top.raw.location),
			lines: [...new Set(js.map((j) => j.raw.line).filter((n): n is number => n !== undefined))].sort((a, b) => a - b),
			widths: [...new Set(js.map((j) => j.raw.width).filter((n): n is number => n !== undefined))].sort((a, b) => b - a),
			sources: [...new Set(js.map((j) => j.raw.source))],
			ids: [...new Set(js.map((j) => j.raw.id))],
			message: top.message,
			floor: js.some((j) => j.floor)
		};
		if (f.level === 'INFO') f.overridden_by = js.find((j) => j.overridden_by)?.overridden_by;
		if (js.some((j) => j.conflict)) f.conflict = true;
		const urls = js.find((j) => j.urls)?.urls;
		if (urls) f.urls = urls;
		findings.push(f);
	}
	findings.sort((a, b) => RANK[b.level] - RANK[a.level] || a.id.localeCompare(b.id));
	const count = (l: Level) => findings.filter((f) => f.level === l).length;
	return {
		findings,
		surfaceSkipped,
		counts: {
			FAIL: count('FAIL'), WARN: count('WARN'), INFO: count('INFO'),
			allowed: findings.filter((f) => f.overridden_by && f.overridden_by !== 'blocked-by-harness').length,
			blocked: findings.filter((f) => f.overridden_by === 'blocked-by-harness').length
		}
	};
}

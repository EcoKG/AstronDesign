import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { FIXTURES, cleanup, makeProj, startServer, textOf } from '../helpers.ts';

after(cleanup);

type Finding = { id: string; level: string; sources: string[]; ids: string[]; lines: number[]; location: string; message: string; overridden_by?: string; conflict?: boolean };
type Report = { findings: Finding[]; surfaceSkipped: number; engines_run: string[]; exit: Record<string, number>; notes: string[]; sheet?: { path: string; allow: string[] } };

/** 결과 text 의 `report: <경로>` 줄로 report.json 을 읽는다. */
function reportOf(text: string): Report {
	const m = /^report: (.+)$/m.exec(text);
	assert.ok(m, text.slice(0, 300));
	return JSON.parse(readFileSync(m[1].trim(), 'utf8')) as Report;
}

test("S1 style 도메인 결과 ≥1(query 'minimalism', 실측 count 1)", async () => {
	const c = await startServer(makeProj());
	const r = await c.call('design_search', { query: 'minimalism', domain: 'style' });
	const t = textOf(r);
	assert.notEqual(r.isError, true, t);
	const m = /^OK design_search: (\d+)건/.exec(t);
	assert.ok(m && Number(m[1]) >= 1, t.slice(0, 200));
	assert.match(t, /권고\(P6\)/);
	assert.match(t, /report\.json/);
});

test("S2 design_system 마크다운 출력(query 'fintech saas dashboard')", async () => {
	const c = await startServer(makeProj());
	const r = await c.call('design_search', { query: 'fintech saas dashboard', design_system: true, project_name: 'Fixture' });
	const t = textOf(r);
	assert.notEqual(r.isError, true, t);
	assert.match(t, /^OK design_search: design-system/);
	assert.match(t, /권고\(P6\)/);
	assert.match(t, /^#{1,3} /m);
	assert.ok(t.length <= 3800);
});

test("S3 0건 안내 문구(query 'zzqxv', 실측 count 0)", async () => {
	const c = await startServer(makeProj());
	const r = await c.call('design_search', { query: 'zzqxv' });
	const t = textOf(r);
	assert.notEqual(r.isError, true, t);
	assert.match(t, /0건: 지어내지 말고 기본값임을 밝힐 것/);
});

test('S4 python 경로 없음 → isError E_ENGINE', async () => {
	const c = await startServer(makeProj(), { ASTRONDESIGN_PYTHON: 'D:\\no-such-dir\\python.exe' });
	const r = await c.call('design_search', { query: 'minimalism' });
	assert.equal(r.isError, true);
	assert.match(textOf(r), /^ERROR E_ENGINE: UUPM 사용 불가: 기본값임을 밝히고 진행/);
});

test('L1 persuade fixture(S52·S53 표본과 같은 CSS 를 포함): gradient-text 가 1건으로 합쳐짐(sources=[impeccable, taste-lint], lines 에 0 과 taste 줄 포함), palette-purple 이 1건(ids 에 purple·ai-color-palette), default-font 가 1건(ids 에 default-font·overused-font)', async () => {
	const c = await startServer(makeProj('persuade'));
	const r = await c.call('design_lint', { paths: ['persuade/index.html'], surface: 'persuade' });
	const t = textOf(r);
	assert.notEqual(r.isError, true, t);
	assert.match(t, /^FAIL design_lint: FAIL \d+ · WARN \d+ · INFO \d+ \(allowed \d+, surface-skipped 0\)/);
	const f = reportOf(t).findings;
	const gt = f.filter((x) => x.id === 'gradient-text');
	assert.equal(gt.length, 1);
	assert.deepEqual(gt[0].sources, ['impeccable', 'taste-lint']);
	assert.ok(gt[0].lines.includes(0) && gt[0].lines.includes(7), String(gt[0].lines));
	const pp = f.filter((x) => x.id === 'palette-purple');
	assert.equal(pp.length, 1);
	assert.ok(pp[0].ids.includes('purple') && pp[0].ids.includes('ai-color-palette'));
	const df = f.filter((x) => x.id === 'default-font');
	assert.equal(df.length, 1);
	assert.ok(df[0].ids.includes('default-font') && df[0].ids.includes('overused-font'));
	assert.match(t, /^\[FAIL\] gradient-text \(impeccable, taste-lint\) persuade\/index\.html:0,7 — /m);
});

test('L2 operate surface: 결과의 taste 발견 0, surface-skipped ≥1(operate fixture 에 `font-family: Inter` 를 넣어 taste default-font 가 반드시 나오게 함), taste lint 가 실행됐음을 report.json 의 engines_run 으로 확인', async () => {
	const c = await startServer(makeProj('operate'));
	const r = await c.call('design_lint', { paths: ['operate/index.html'], surface: 'operate' });
	const t = textOf(r);
	assert.notEqual(r.isError, true, t);
	const rep = reportOf(t);
	assert.ok(rep.engines_run.includes('taste'));
	assert.ok(rep.surfaceSkipped >= 1);
	assert.equal(rep.findings.filter((x) => x.sources.some((s) => s.startsWith('taste'))).length, 0);
	assert.match(t, /surface-skipped [1-9]/);
});

test('L3 brand fixture: 토큰 글꼴 Geist 의 default-font(impeccable `Primary font: geist`) → INFO, overridden_by=P2. brand/mono.html(`font-family: \\"Geist Mono\\"` 만 씀)을 토큰이 Geist 뿐인 DESIGN.md(design_md 인자로 brand/DESIGN-geist-only.md)와 검사하면 그 글꼴 발견은 WARN 유지', async () => {
	const c = await startServer(makeProj('brand'));
	const a = reportOf(textOf(await c.call('design_lint', { paths: ['brand/index.html'], surface: 'persuade', design_md: 'brand/DESIGN.md' })));
	const g = a.findings.find((x) => x.id === 'default-font');
	assert.ok(g, JSON.stringify(a.findings.map((x) => x.id)));
	assert.equal(g.level, 'INFO');
	assert.equal(g.overridden_by, 'P2');
	const b = reportOf(textOf(await c.call('design_lint', { paths: ['brand/mono.html'], surface: 'persuade', design_md: 'brand/DESIGN-geist-only.md' })));
	const m = b.findings.find((x) => x.id === 'default-font');
	assert.ok(m);
	assert.equal(m.level, 'WARN');
	assert.equal(m.overridden_by, undefined);
});

test('L4 cwd 밖 경로 E_PATH', async () => {
	const c = await startServer(makeProj('persuade'));
	const r = await c.call('design_lint', { paths: ['..\\..\\README.md'], surface: 'persuade' });
	assert.equal(r.isError, true);
	assert.match(textOf(r), /^ERROR E_PATH:/);
});

test('L5 low-contrast 는 allow 해도 FAIL+conflict', async () => {
	const c = await startServer(makeProj('persuade'));
	const t = textOf(await c.call('design_lint', { paths: ['persuade/index.html'], surface: 'persuade', allow: ['contrast', 'low-contrast'] }));
	const f = reportOf(t).findings.find((x) => x.id === 'contrast');
	assert.ok(f);
	assert.equal(f.level, 'FAIL');
	assert.equal(f.conflict, true);
	assert.match(t, /\[FAIL\] contrast .*conflict: 사람 결정 필요/);
});

test('L6 impeccable 종료 2·taste 종료 1 을 성공으로 처리(isError 아님)', async () => {
	const c = await startServer(makeProj('persuade'));
	const r = await c.call('design_lint', { paths: ['persuade/index.html'], surface: 'persuade' });
	assert.notEqual(r.isError, true);
	assert.deepEqual(reportOf(textOf(r)).exit, { impeccable: 2, taste: 1 });
});

test("L7 대상 폴더에 소스 파일 0 → 성공·'소스 없음'", async () => {
	const cwd = makeProj();
	mkdirSync(join(cwd, 'empty'));
	writeFileSync(join(cwd, 'empty', 'notes.txt'), 'no sources here');
	const c = await startServer(cwd);
	const r = await c.call('design_lint', { paths: ['empty'], surface: 'persuade' });
	const t = textOf(r);
	assert.notEqual(r.isError, true, t);
	assert.match(t, /^OK design_lint:/);
	assert.match(t, /소스 없음/);
});

test('L8 링크 CSS 를 못 읽음: external-css/index.html 만 test-proj 에 복사하고 style.css 는 복사하지 않음 → isError 아님, WARN `harness:css-incomplete` 1건(message 에 style.css)', async () => {
	const cwd = makeProj();
	mkdirSync(join(cwd, 'external-css'));
	copyFileSync(join(FIXTURES, 'external-css', 'index.html'), join(cwd, 'external-css', 'index.html'));
	const c = await startServer(cwd);
	const r = await c.call('design_lint', { paths: ['external-css/index.html'], surface: 'persuade' });
	const t = textOf(r);
	assert.notEqual(r.isError, true, t);
	const inc = reportOf(t).findings.filter((x) => x.id === 'harness:css-incomplete');
	assert.equal(inc.length, 1);
	assert.equal(inc[0].level, 'WARN');
	assert.match(inc[0].message, /style\.css/);
});

test('D1 list sectors', async () => {
	const c = await startServer(makeProj());
	const r = await c.call('design_direction', { list: 'sectors' });
	const t = textOf(r);
	assert.notEqual(r.isError, true, t);
	assert.match(t, /^OK design_direction: list sectors/);
	assert.match(t, /^saas$/m);
	assert.match(t, /^restaurant$/m);
});

test('D2 options 3·seed 고정 → 같은 출력 2회, 후보 3개, 파일 쓰기 없음', async () => {
	const cwd = makeProj();
	const c = await startServer(cwd);
	const args = { sector: 'saas', brief: 'Invoicing for small studios', options: 3, seed: 42 };
	const a = textOf(await c.call('design_direction', args));
	const b = textOf(await c.call('design_direction', args));
	assert.match(a, /^OK design_direction: options 3/);
	assert.equal(a, b);
	assert.equal((a.match(/^## `/gm) ?? []).length, 3);
	assert.equal(existsSync(join(cwd, '.astron-logs', 'astrondesign', 'direction', 'direction.json')), false);
	assert.equal(existsSync(join(cwd, '.astron-logs', 'astrondesign', 'direction', 'history.json')), false);
});

test('D3 options 생략 → direction.json 이 OUT/direction 에 생성', async () => {
	const cwd = makeProj();
	const c = await startServer(cwd);
	const r = await c.call('design_direction', { sector: 'saas', brief: 'Invoicing for small studios', seed: 7 });
	const t = textOf(r);
	assert.notEqual(r.isError, true, t);
	const sheet = join(cwd, '.astron-logs', 'astrondesign', 'direction', 'direction.json');
	assert.ok(existsSync(sheet));
	assert.ok(t.includes(`direction.json: ${sheet}`));
	assert.match(t, /assets\.mjs 는 제공하지 않음/);
	assert.ok(Array.isArray(JSON.parse(readFileSync(sheet, 'utf8')).allow));
	assert.ok(existsSync(join(cwd, '.astron-logs', 'astrondesign', 'direction', 'history.json')));
});

test('D4 시트 allow 적용: OUT/direction/direction.json 에 fixture 시트 `{\\"version\\":1,\\"allow\\":[\\"mono\\"]}` 를 두고 persuade lint → taste mono 발견이 INFO, overridden_by=sheet, 결과에 `sheet: <경로> allow=[mono]`. 같은 상태에서 allow 인자 [\\"mono\\"] 를 주면 overridden_by=P1', async () => {
	const cwd = makeProj('persuade');
	const dir = join(cwd, '.astron-logs', 'astrondesign', 'direction');
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'direction.json'), JSON.stringify({ version: 1, allow: ['mono'] }));
	const c = await startServer(cwd);
	const t = textOf(await c.call('design_lint', { paths: ['persuade/index.html'], surface: 'persuade' }));
	assert.ok(t.includes(`sheet: ${join(dir, 'direction.json')} allow=[mono]`), t.slice(0, 400));
	const mono = reportOf(t).findings.find((x) => x.id === 'mono');
	assert.ok(mono);
	assert.equal(mono.level, 'INFO');
	assert.equal(mono.overridden_by, 'sheet');
	const p1 = reportOf(textOf(await c.call('design_lint', { paths: ['persuade/index.html'], surface: 'persuade', allow: ['mono'] }))).findings.find((x) => x.id === 'mono');
	assert.equal(p1?.overridden_by, 'P1');
});

test('D5 시트 읽기 순서: OUT 시트가 없고 `<cwd>/.taste-skill/direction.json` 만 있으면 그것을 씀. 둘 다 있으면 OUT 시트만 씀', async () => {
	const cwd = makeProj('persuade');
	mkdirSync(join(cwd, '.taste-skill'));
	const projSheet = join(cwd, '.taste-skill', 'direction.json');
	writeFileSync(projSheet, JSON.stringify({ version: 1, allow: ['mono'] }));
	const c = await startServer(cwd);
	const a = reportOf(textOf(await c.call('design_lint', { paths: ['persuade/index.html'], surface: 'persuade' })));
	assert.equal(a.sheet?.path, projSheet);
	assert.equal(a.findings.find((x) => x.id === 'mono')?.level, 'INFO');
	const outDir = join(cwd, '.astron-logs', 'astrondesign', 'direction');
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, 'direction.json'), JSON.stringify({ version: 1, allow: [] }));
	const b = reportOf(textOf(await c.call('design_lint', { paths: ['persuade/index.html'], surface: 'persuade' })));
	assert.equal(b.sheet?.path, join(outDir, 'direction.json'));
	assert.equal(b.findings.find((x) => x.id === 'mono')?.level, 'FAIL');
});

test('D6 없는 direction id → E_INPUT(draw 종료 2)', async () => {
	const c = await startServer(makeProj());
	const r = await c.call('design_direction', { sector: 'saas', brief: 'x', direction: 'no-such-direction' });
	assert.equal(r.isError, true);
	assert.match(textOf(r), /^ERROR E_INPUT: No direction with id no-such-direction/);
	const s = await c.call('design_direction', { brief: 'missing sector' });
	assert.match(textOf(s), /^ERROR E_INPUT:/);
});

/** 폴더 아래 파일의 상대 경로 → sha256 을 모은다. */
function hashTree(dir: string, skip: (rel: string) => boolean): Record<string, string> {
	const out: Record<string, string> = {};
	const walk = (d: string) => {
		for (const n of readdirSync(d)) {
			const p = join(d, n);
			const rel = relative(dir, p).split('\\').join('/');
			if (skip(rel)) continue;
			if (statSync(p).isDirectory()) walk(p);
			else out[rel] = createHash('sha256').update(readFileSync(p)).digest('hex');
		}
	};
	walk(dir);
	return out;
}

/** 실제 홈의 하위 프로세스 쓰기 후보 위치 상태를 찍는다. */
function homeSnapshot(): Record<string, string> {
	const out: Record<string, string> = {};
	for (const d of ['.taste-skill', '.impeccable', '.config/impeccable', 'AppData/Roaming/impeccable', 'AppData/Local/impeccable']) {
		const p = join(homedir(), d);
		out[d] = existsSync(p) ? JSON.stringify(hashTree(p, () => false)) : 'absent';
	}
	return out;
}

test('W2 OUT/.home 밖 홈 쓰기 0·프로젝트 파일 해시 불변', async () => {
	const cwd = makeProj('persuade', 'brand');
	const before = hashTree(cwd, (rel) => rel.startsWith('.astron-logs'));
	const home = homeSnapshot();
	const c = await startServer(cwd);
	assert.notEqual((await c.call('design_direction', { sector: 'saas', brief: 'Invoicing for small studios', seed: 3 })).isError, true);
	assert.notEqual((await c.call('design_lint', { paths: ['persuade/index.html', 'brand/index.html'], surface: 'persuade', design_md: 'brand/DESIGN.md' })).isError, true);
	assert.notEqual((await c.call('design_search', { query: 'minimalism' })).isError, true);
	assert.deepEqual(hashTree(cwd, (rel) => rel.startsWith('.astron-logs')), before);
	assert.deepEqual(homeSnapshot(), home);
	assert.ok(existsSync(join(cwd, '.astron-logs', 'astrondesign', '.home')));
	assert.deepEqual(readdirSync(cwd).sort(), ['.astron-logs', 'brand', 'persuade']);
});
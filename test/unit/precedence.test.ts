import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFindings, canon, type RawFinding, type Context } from '../../src/precedence.ts';

const FILE = 'D:\\Proj\\Site\\Index.html';
const URL1 = 'http://127.0.0.1:5000/index.html';
const imp = (id: string, category: string, extra: Partial<RawFinding> = {}): RawFinding => ({ source: 'impeccable', id, category, location: FILE, line: 0, message: id, ...extra });
const tl = (id: string, level: 'FAIL' | 'WARN', extra: Partial<RawFinding> = {}): RawFinding => ({ source: 'taste-lint', id, level, location: 'd:/proj/site/index.html', line: 7, message: id, ...extra });
const tg = (id: string, level: 'FAIL' | 'WARN', extra: Partial<RawFinding> = {}): RawFinding => ({ source: 'taste-gate', id, level, location: URL1, width: 1440, message: id, ...extra });
const run = (raw: RawFinding[], ctx: Partial<Context> = {}) => resolveFindings(raw, { surface: 'persuade', ...ctx });
const one = (raw: RawFinding[], ctx: Partial<Context> = {}) => {
	const r = run(raw, ctx);
	assert.equal(r.findings.length, 1, JSON.stringify(r.findings));
	return r.findings[0];
};

// C1 모션: persuade 만 still-page 적용
test('C1', () => {
	assert.equal(run([tg('still-page', 'FAIL')], { surface: 'operate' }).findings.length, 0);
	assert.equal(one([tg('still-page', 'FAIL')]).level, 'FAIL');
});

// C2 금지 강도: impeccable slop → WARN, floor → FAIL, 그 밖 quality → WARN, taste FAIL 유지
test('C2', () => {
	assert.equal(one([imp('gradient-text', 'slop')]).level, 'WARN');
	const lc = one([imp('low-contrast', 'quality')]);
	assert.equal(lc.level, 'FAIL');
	assert.equal(lc.id, 'contrast');
	assert.equal(lc.floor, true);
	assert.equal(one([imp('layout-transition', 'quality')]).level, 'WARN');
	assert.equal(one([tl('gradient', 'FAIL')]).level, 'FAIL');
});

// C3 브리프 우선: P1 > P2 > sheet, overridden_by 는 하나
test('C3', () => {
	const mono = [tl('mono', 'FAIL')];
	const a = one(mono, { userAllow: ['mono'], tokenAllow: ['mono'], sheetAllow: ['mono'] });
	assert.equal(a.level, 'INFO');
	assert.equal(a.overridden_by, 'P1');
	assert.equal(one(mono, { tokenAllow: ['mono'], sheetAllow: ['mono'] }).overridden_by, 'P2');
	assert.equal(one(mono, { sheetAllow: ['mono'] }).overridden_by, 'sheet');
	const p = one([imp('ai-color-palette', 'slop')], { userAllow: ['purple'] });
	assert.equal(p.id, 'palette-purple');
	assert.equal(p.overridden_by, 'P1');
	assert.equal(canon('ai-color-palette'), 'palette-purple');
	assert.equal(canon('claude-palette'), 'palette-claude');
});

// C4 범위: persuade 가 아니면 taste 발견을 버리고 개수만 셈
test('C4', () => {
	const r = run([tl('default-font', 'WARN', { match: 'font-family: Inter' }), imp('overused-font', 'slop', { match: 'Primary font: inter' })], { surface: 'operate' });
	assert.equal(r.surfaceSkipped, 1);
	assert.equal(r.findings.length, 1);
	assert.deepEqual(r.findings[0].sources, ['impeccable']);
});

// C6 서체: 토큰 글꼴과 완전 일치하면 INFO
test('C6', () => {
	const g = one([imp('overused-font', 'slop', { match: 'Primary font: geist' })], { tokenFonts: ['geist'] });
	assert.equal(g.level, 'INFO');
	assert.equal(g.overridden_by, 'P2');
	const i = one([imp('overused-font', 'slop', { match: 'Primary font: inter' })], { tokenFonts: ['geist'] });
	assert.equal(i.level, 'WARN');
	assert.equal(i.overridden_by, undefined);
});

// C7 mono·hairline: 토큰이 있으면 허용, 없으면 persuade 는 taste FAIL
test('C7', () => {
	assert.equal(one([tl('mono', 'FAIL')]).level, 'FAIL');
	assert.equal(one([tl('mono', 'FAIL')], { tokenAllow: ['mono'] }).level, 'INFO');
	assert.equal(one([tl('hairline', 'FAIL')], { tokenAllow: ['hairline', 'outlined-box'] }).level, 'INFO');
	assert.equal(one([tl('outlined-box', 'WARN')], { tokenAllow: ['hairline', 'outlined-box'] }).level, 'INFO');
});

// C8 그라디언트·글래스: gradient·glass·보라 허용, gradient-text 는 허용 안 함
test('C8', () => {
	const ctx = { tokenAllow: ['gradient', 'glass', 'palette-purple'] };
	assert.equal(one([tl('gradient', 'FAIL')], ctx).level, 'INFO');
	assert.equal(one([tl('glass', 'WARN')], ctx).level, 'INFO');
	assert.equal(one([tl('purple', 'FAIL')], ctx).level, 'INFO');
	assert.equal(one([tl('gradient-text', 'FAIL')], ctx).level, 'FAIL');
});

// C11 중복: (정규 id, 위치) 로 합치고 sources·lines·ids 를 모음
test('C11', () => {
	const f = one([imp('gradient-text', 'slop'), tl('gradient-text', 'FAIL')]);
	assert.equal(f.id, 'gradient-text');
	assert.deepEqual(f.sources, ['impeccable', 'taste-lint']);
	assert.deepEqual(f.lines, [0, 7]);
	assert.deepEqual(f.ids, ['gradient-text']);
	assert.equal(f.level, 'FAIL');
	assert.equal(f.location, 'd:/proj/site/index.html');
	const p = one([imp('ai-color-palette', 'slop'), tl('purple', 'FAIL', { line: 6 }), tl('purple', 'FAIL', { line: 7 })]);
	assert.deepEqual(p.ids.sort(), ['ai-color-palette', 'purple']);
	assert.deepEqual(p.lines, [0, 6, 7]);
});

// P3 하한: allow 로 낮추지 않고 conflict 표시
test('P3', () => {
	const a = one([imp('low-contrast', 'quality')], { userAllow: ['contrast'] });
	assert.equal(a.level, 'FAIL');
	assert.equal(a.conflict, true);
	assert.equal(a.overridden_by, undefined);
	const b = one([tg('contrast', 'WARN')], { userAllow: ['contrast'] });
	assert.equal(b.level, 'WARN');
	assert.equal(b.conflict, true);
	assert.equal(one([imp('low-contrast', 'quality')]).conflict, undefined);
});

test('C8g gate: 토큰 gradient·보라 색이 gate 의 gradient·palette-purple 을 INFO 로, gate gradient-text 는 FAIL 유지', () => {
	const r = run([tg('gradient', 'FAIL'), tg('palette-purple', 'FAIL'), tg('gradient-text', 'FAIL')], { tokenAllow: ['gradient', 'palette-purple'] });
	const by = Object.fromEntries(r.findings.map((f) => [f.id, f]));
	assert.equal(by.gradient.level, 'INFO');
	assert.equal(by.gradient.overridden_by, 'P2');
	assert.equal(by['palette-purple'].level, 'INFO');
	assert.equal(by['gradient-text'].level, 'FAIL');
});

test('P3g gate: gate contrast(FAIL)·small-text(FAIL)·overflow(FAIL)는 allow 를 줘도 FAIL+conflict, gate contrast(WARN)는 WARN+conflict', () => {
	const r = run([tg('contrast', 'FAIL'), tg('small-text', 'FAIL'), tg('overflow', 'FAIL')], { userAllow: ['contrast', 'small-text', 'overflow'] });
	assert.equal(r.findings.length, 3);
	for (const f of r.findings) {
		assert.equal(f.level, 'FAIL', f.id);
		assert.equal(f.conflict, true, f.id);
	}
	const w = one([tg('contrast', 'WARN')], { userAllow: ['contrast'] });
	assert.equal(w.level, 'WARN');
	assert.equal(w.conflict, true);
});

test('C3s 시트 allow 는 taste 출처만 낮추고 impeccable 출처는 유지(합친 등급=WARN)', () => {
	const f = one([imp('ai-color-palette', 'slop'), tl('purple', 'FAIL')], { sheetAllow: ['palette-purple'] });
	assert.equal(f.level, 'WARN');
	assert.deepEqual(f.sources, ['impeccable', 'taste-lint']);
	assert.equal(one([tl('purple', 'FAIL')], { sheetAllow: ['palette-purple'] }).level, 'INFO');
	assert.equal(one([imp('ai-color-palette', 'slop')], { sheetAllow: ['palette-purple'] }).level, 'WARN');
});

test('B1 차단 유발: 깨진 URL 이 모두 차단 목록이면 broken-image INFO blocked-by-harness·floor 아님 / 하나라도 차단 목록 밖이면 FAIL·그 URL 만 남김 / 차단 image 요청 1건 이상이면 few-pictures INFO', () => {
	const ext = 'https://example.invalid/a.png';
	const long = 'https://example.invalid/' + 'x'.repeat(150) + '.png';
	const all = one([tg('broken-image', 'FAIL', { urls: [ext, long.slice(0, 120)] })], { blocked: [ext, long] });
	assert.equal(all.level, 'INFO');
	assert.equal(all.overridden_by, 'blocked-by-harness');
	assert.equal(all.floor, false);
	const local = 'http://127.0.0.1:5000/missing.png';
	const some = one([tg('broken-image', 'FAIL', { urls: [ext, local], message: `Broken image(s): ${ext}, ${local}` })], { blocked: [ext] });
	assert.equal(some.level, 'FAIL');
	assert.equal(some.floor, true);
	assert.deepEqual(some.urls, [local]);
	assert.ok(!some.message.includes(ext));
	assert.ok(some.message.includes(local));
	for (const id of ['few-pictures', 'no-real-pictures', 'no-footage']) {
		const f = one([tg(id, id === 'few-pictures' ? 'FAIL' : 'WARN')], { blockedMedia: 1 });
		assert.equal(f.level, 'INFO', id);
		assert.equal(f.overridden_by, 'blocked-by-harness', id);
	}
	assert.equal(one([tg('few-pictures', 'FAIL')], { blockedMedia: 0 }).level, 'FAIL');
});

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readTokens, deriveAllow, fontAllowed, probeTokenColours } from '../../src/tokens.ts';
import { callDir } from '../../src/output.ts';
import { FIXTURES, cleanup, makeProj } from '../helpers.ts';

after(cleanup);

const empty = { fonts: [] as string[], colours: [] as string[], keys: [] as string[] };

test('T1 글꼴·색·키 추출(fixtures/brand/DESIGN.md)', () => {
	const t = readTokens(join(FIXTURES, 'brand', 'DESIGN.md'));
	assert.deepEqual(t.fonts.sort(), ['geist', 'geist mono']);
	assert.ok(t.colours.includes('#7928ca'));
	assert.ok(t.colours.includes('#171717'));
	for (const k of ['gradient-start', 'gradient-end', 'hairline', 'fontFamily']) assert.ok(t.keys.includes(k), k);
});

test('T2 파일 없으면 빈 토큰', () => {
	const t = readTokens(join(FIXTURES, 'brand', 'NOPE.md'));
	assert.deepEqual({ fonts: t.fonts, colours: t.colours, keys: t.keys }, empty);
	assert.deepEqual(deriveAllow(t, []), []);
});

test('T3 allow 도출 8규칙(3.3 토큰 표 1~8행을 각각 단언. deriveAllow 에 합성 probeIds 를 넣는 순수 시험. 4행: #7928ca → palette-purple(경로 A), probeIds=[purple] 인 #6366f1 → palette-purple(경로 B). 8행: #faf9f5 → palette-cream, #c15f3c → palette-terracotta, 둘 다 → palette-claude. 7행: 토큰 글꼴 Geist 일 때 impeccable snippet `Primary font: geist` → 허용, `Primary font: geist mono` → 불허, taste match `font-family:\\"Geist\\"` → 허용, `family=Geist+Mono` → 불허)', () => {
	const d = (t: Partial<typeof empty>, probe: string[] = []) => deriveAllow({ ...empty, ...t }, probe);
	// 1행 mono 글꼴
	assert.deepEqual(d({ fonts: ['geist mono'] }), ['mono']);
	// 2행 gradient 키
	assert.deepEqual(d({ keys: ['gradient-start'] }), ['gradient']);
	// 3행 hairline·divider·rule·border 키
	for (const k of ['hairline', 'divider', 'rule', 'borderColor']) assert.deepEqual(d({ keys: [k] }).sort(), ['hairline', 'outlined-box'], k);
	// 4행 보라: 경로 A(colourFamily) 와 경로 B(lint 프로브)
	assert.deepEqual(d({ colours: ['#7928ca'] }), ['palette-purple']);
	assert.deepEqual(d({ colours: ['#6366f1'] }), []);
	assert.deepEqual(d({ colours: ['#6366f1'] }, ['purple']), ['palette-purple']);
	// 5행 glass·blur 키
	assert.deepEqual(d({ keys: ['glass'] }), ['glass']);
	assert.deepEqual(d({ keys: ['blur-md'] }), ['glass']);
	// 6행 shadow·elevation 키
	assert.deepEqual(d({ keys: ['elevation'] }), ['shadow']);
	// 7행 글꼴 단위 허용(정규화 뒤 완전 일치)
	const fonts = ['geist'];
	assert.equal(fontAllowed('impeccable', 'Primary font: geist', fonts), true);
	assert.equal(fontAllowed('impeccable', 'Primary font: geist mono', fonts), false);
	assert.equal(fontAllowed('taste-lint', 'font-family:"Geist"', fonts), true);
	assert.equal(fontAllowed('taste-lint', 'family=Geist+Mono', fonts), false);
	assert.equal(fontAllowed('taste-lint', 'Geist({', fonts), true);
	assert.equal(fontAllowed('taste-lint', '', fonts), false);
	// 8행 cream·terracotta·claude
	assert.deepEqual(d({ colours: ['#faf9f5'] }), ['palette-cream']);
	assert.deepEqual(d({ colours: ['#c15f3c'] }), ['palette-terracotta']);
	assert.deepEqual(d({ colours: ['#faf9f5', '#c15f3c'] }).sort(), ['palette-claude', 'palette-cream', 'palette-terracotta']);
	assert.deepEqual(d({ colours: ['#171717'] }, ['claude-palette']), ['palette-claude']);
	assert.deepEqual(d({ colours: ['#171717'] }), []);
});

test('T4 lint 프로브 실측: probeTokenColours 가 #6366f1 에서 purple, #c15f3c·#faf9f5 에서 claude-palette 를 돌려주고 token-probe.css 가 호출 폴더 안에만 생김(S59)', async () => {
	const cwd = makeProj();
	const dir = callDir('design_lint', cwd);
	const r = await probeTokenColours(dir, ['#6366f1', '#c15f3c', '#faf9f5', '#171717'], cwd);
	assert.equal(r.failed, false);
	assert.deepEqual(r.byColour['#6366f1'], ['purple']);
	assert.deepEqual(r.byColour['#c15f3c'], ['claude-palette']);
	assert.deepEqual(r.byColour['#faf9f5'], ['claude-palette']);
	assert.equal(r.byColour['#171717'], undefined);
	assert.deepEqual(r.ids.sort(), ['claude-palette', 'purple']);
	assert.ok(existsSync(join(dir, 'token-probe.css')));
	assert.deepEqual(readdirSync(cwd).filter((f) => f !== '.astron-logs'), [], '프로젝트 쪽 새 파일 없음');
	const none = await probeTokenColours(dir, [], cwd);
	assert.deepEqual(none, { ids: [], byColour: {}, failed: false });
});

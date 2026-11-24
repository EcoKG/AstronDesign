import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_HEIGHT, OVERVIEW_MIN, READ_MIN, boardHeight, boardLabel, boardName, boardTag, initialView } from '../../src/shared/boards.js';

test('BD1 boardHeight 는 프리셋 폭 높이, 그 밖 폭은 round(w*0.625), 320·2560 경계', () => {
	for (const [w, h] of Object.entries(BOARD_HEIGHT)) assert.equal(boardHeight(Number(w)), h, `프리셋 ${w}`);
	assert.deepEqual([boardHeight(1440), boardHeight(768), boardHeight(390)], [900, 1024, 844]);
	assert.equal(boardHeight(1000), 625);
	assert.equal(boardHeight(320), 200, '하한 320');
	assert.equal(boardHeight(2560), 1600, '상한 2560');
	for (const bad of [319, 2561, 0, -1, 1440.5, Number.NaN]) assert.throws(() => boardHeight(bad), RangeError, String(bad));
	assert.deepEqual([boardName(2560), boardName(1024), boardName(1023), boardName(600), boardName(599), boardName(320)], ['데스크톱', '데스크톱', '태블릿', '태블릿', '모바일', '모바일']);
	assert.equal(boardLabel(1440), '데스크톱 · 1440 × 900');
	assert.equal(boardLabel(390), '모바일 · 390 × 844');
});

test('BD2 첫 보기: 유효 ?w 는 그 보드 맞춤, 모든 보드 맞춤 배율 0.25 이상이면 모든 보드, 아니면 첫 보드 맞춤 0.5 이상이면 첫 보드, 그 밖은 화면 폭에 가장 가까운 보드', () => {
	const widths = [1440, 768, 390];
	const fits = (m: Record<number, number>) => (w: number) => m[w] ?? 0;
	const base = { widths, requested: null, overview: 0.12, fitOf: fits({ 1440: 0.23, 768: 0.45, 390: 0.78 }), viewport: 390 };
	assert.deepEqual([OVERVIEW_MIN, READ_MIN], [0.25, 0.5]);
	assert.deepEqual(initialView({ ...base, requested: 1440 }), { active: 1440, fit: 'board' }, '유효 ?w 우선(모든 보드 배율과 무관)');
	assert.deepEqual(initialView({ ...base, requested: 768, overview: 0.9 }), { active: 768, fit: 'board' }, '모든 보드 배율이 커도 ?w 우선');
	assert.deepEqual(initialView({ ...base, overview: 0.25 }), { active: 1440, fit: 'all' }, '0.25 정확히는 모든 보드');
	assert.deepEqual(initialView({ ...base, overview: 0.3, viewport: 1440 }), { active: 1440, fit: 'all' });
	assert.deepEqual(initialView({ ...base, overview: 0.2499, fitOf: fits({ 1440: 0.5 }) }), { active: 1440, fit: 'board' }, '첫 보드 0.5 정확히는 첫 보드');
	assert.deepEqual(initialView({ ...base, overview: 0.2499, fitOf: fits({ 1440: 0.4999 }) }), { active: 390, fit: 'board' }, '첫 보드 0.4999 는 가까운 보드');
	assert.deepEqual(initialView(base), { active: 390, fit: 'board' }, '뷰포트 390 → 390 보드');
	assert.deepEqual(initialView({ ...base, viewport: 768 }), { active: 768, fit: 'board' }, '뷰포트 768 → 768 보드');
	assert.deepEqual(initialView({ ...base, viewport: 579 }), { active: 390, fit: 'board' }, '같은 거리(189)면 좁은 보드');
	assert.deepEqual(initialView({ ...base, widths: [390, 768], viewport: 579 }), { active: 390, fit: 'board' }, '순서와 무관하게 좁은 보드');
	assert.deepEqual(initialView({ ...base, viewport: 2560 }), { active: 1440, fit: 'board' }, '가장 넓은 보드보다 넓은 화면');
	assert.deepEqual(initialView({ ...base, widths: [1440], fitOf: fits({ 1440: 0.2 }) }), { active: 1440, fit: 'board' }, '보드 1개');
	assert.deepEqual(initialView({ ...base, widths: [320, 768, 1440, 2560], overview: 0.16, fitOf: fits({ 320: 1 }), viewport: 1440 }), { active: 320, fit: 'board' }, '보드 넷: 첫 보드 320 이 읽히면 첫 보드');
});

test('BD3 보드 이름표 글: 자리 150 이상 전체, 96 이상 이름·폭, 그 아래 이름만', () => {
	assert.equal(boardTag(390, 150), '모바일 · 390 × 844');
	assert.equal(boardTag(1440, 400), '데스크톱 · 1440 × 900');
	assert.equal(boardTag(390, 149.9), '모바일 · 390');
	assert.equal(boardTag(768, 96), '태블릿 · 768');
	assert.equal(boardTag(768, 95.9), '태블릿');
	assert.equal(boardTag(1440, 0), '데스크톱');
	assert.equal(boardTag(390, -10), '모바일', '음수 자리도 이름은 남김');
});

test('BD4 첫 보기: 빈 보드 목록이면 활성 없이 모든 보드 맞춤, fitOf 를 부르지 않음', () => {
	const fitOf = () => assert.fail('fitOf 호출');
	const base = { widths: [], requested: null, overview: 0.1, fitOf, viewport: 390 };
	const empty = { active: null, fit: 'all' };
	assert.deepEqual(initialView(base), empty);
	assert.deepEqual(initialView({ ...base, requested: 1440 }), empty, '목록에 없는 ?w');
	assert.deepEqual(initialView({ ...base, overview: 0 }), empty, '배율 0');
	assert.deepEqual(initialView({ ...base, overview: Number.NaN }), empty, '배율 NaN');
	assert.deepEqual(initialView({ ...base, overview: 1 }), empty, '배율 1');
});

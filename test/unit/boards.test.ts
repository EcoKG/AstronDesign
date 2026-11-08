import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_HEIGHT, boardHeight, boardLabel, boardName } from '../../src/shared/boards.js';

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

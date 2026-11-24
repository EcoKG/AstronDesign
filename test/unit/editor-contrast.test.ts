import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, judgeContrast, parseColor, requiredRatio } from '../../src/shared/contrast.js';

const color = (s: string) => {
	const c = parseColor(s);
	assert.ok(c, s);
	return c;
};

test('CT1 WCAG 대비: #000/#fff 21:1, #777/#fff 4.5:1 미만 판정, 같은 색 1:1', () => {
	assert.equal(Math.round(contrastRatio(color('#000'), color('#fff')) * 100) / 100, 21);
	const grey = judgeContrast(color('#777'), color('#ffffff'), 16, 400);
	assert.ok(grey.ratio < 4.5, String(grey.ratio));
	assert.equal(grey.need, 4.5);
	assert.equal(grey.verdict, 'poor');
	assert.equal(contrastRatio(color('#33aa77'), color('#3a7')), 1);
	assert.equal(judgeContrast(color('rgb(0, 0, 0)'), color('rgb(255, 255, 255)'), 16, 400).verdict, 'good');
	assert.equal(judgeContrast(color('rgb(179, 179, 179)'), color('#fff'), 18, 400).ratio, 2.1);
});

test('CT2 필요 대비: 24px 이상 또는 18.5px·700 이상은 3:1, 그 밖 4.5:1', () => {
	assert.equal(requiredRatio(24, 400), 3);
	assert.equal(requiredRatio(23.9, 400), 4.5);
	assert.equal(requiredRatio(18.5, 700), 3);
	assert.equal(requiredRatio(18.5, 600), 4.5);
	assert.equal(requiredRatio(18.4, 700), 4.5);
	assert.equal(judgeContrast(color('#949494'), color('#fff'), 24, 400).verdict, 'good');
	assert.equal(judgeContrast(color('#949494'), color('#fff'), 16, 400).verdict, 'poor');
});

test('CT3 알파 1 미만 글자색은 판정 보류(unknown)', () => {
	assert.equal(judgeContrast(color('rgba(0, 0, 0, 0.5)'), color('#fff'), 16, 400).verdict, 'unknown');
	assert.equal(judgeContrast(color('rgb(0 0 0 / 0.9)'), color('#fff'), 16, 400).verdict, 'unknown');
	assert.equal(judgeContrast(color('#000'), null, 16, 400).verdict, 'unknown');
	assert.equal(parseColor('transparent')?.a, 0);
	assert.equal(parseColor('not-a-color'), null);
});

// @ts-check
// 보드 폭별 높이·이름 표: 편집기 아트보드·design_render·design_export 가 같은 높이를 쓰게 한다.

/** 기기 폭별 보드 높이(px). */
export const BOARD_HEIGHT = Object.freeze({ 1440: 900, 1280: 800, 1024: 768, 768: 1024, 390: 844, 375: 812 });

/**
 * 폭 320~2560 정수의 보드 높이. 표에 없으면 round(w × 0.625).
 * @param {number} w
 * @returns {number}
 */
export function boardHeight(w) {
	if (!Number.isInteger(w) || w < 320 || w > 2560) throw new RangeError(`보드 폭은 320~2560 정수: ${w}`);
	return /** @type {Record<number, number>} */ (BOARD_HEIGHT)[w] ?? Math.round(w * 0.625);
}

/**
 * 폭으로 정한 기기 이름(1024 이상 데스크톱, 600 이상 태블릿, 그 아래 모바일).
 * @param {number} w
 * @returns {string}
 */
export function boardName(w) {
	return w >= 1024 ? '데스크톱' : w >= 600 ? '태블릿' : '모바일';
}

/**
 * 보드 이름표 글("데스크톱 · 1440 × 900").
 * @param {number} w
 * @returns {string}
 */
export function boardLabel(w) {
	return `${boardName(w)} · ${w} × ${boardHeight(w)}`;
}

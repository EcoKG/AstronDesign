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

/**
 * 보드 이름표 글. 쓸 자리 150px 이상이면 전체, 96px 이상이면 "모바일 · 390", 그 아래는 "모바일".
 * 96 은 굵게 그린 활성 이름표의 "데스크톱 · 1440"(약 80px)이 들어가는 폭이다.
 * @param {number} w
 * @param {number} room
 * @returns {string}
 */
export function boardTag(w, room) {
	return room >= 150 ? boardLabel(w) : room >= 96 ? `${boardName(w)} · ${w}` : boardName(w);
}

/** 모든 보드 맞춤을 첫 화면으로 쓰는 최소 배율(390 보드가 이름표 중간 단계 폭 96px 이상으로 보이는 0.25). */
export const OVERVIEW_MIN = 0.25;
/** 보드 하나를 읽히는 보드로 보는 최소 배율(본문 16px 이 8px 이상으로 보이는 0.5). */
export const READ_MIN = 0.5;

/**
 * 편집기 첫 보기. 유효한 ?w 가 있으면 그 보드 맞춤.
 * 없으면 모든 보드 맞춤 배율 ≥ OVERVIEW_MIN 일 때 모든 보드, 첫 보드 맞춤 배율 ≥ READ_MIN 일 때 첫 보드,
 * 그 밖에는 화면 폭에 가장 가까운 보드(같은 거리면 좁은 쪽)에 맞춘다. 보드가 없으면 활성 없이 모든 보드 맞춤.
 * @param {{ widths: number[], requested: number | null, overview: number, fitOf: (w: number) => number, viewport: number }} a
 * @returns {{ active: number | null, fit: 'all' | 'board' }}
 */
export function initialView(a) {
	if (a.widths.length === 0) return { active: null, fit: 'all' };
	if (a.requested !== null && a.widths.includes(a.requested)) return { active: a.requested, fit: 'board' };
	const first = a.widths[0];
	if (a.overview >= OVERVIEW_MIN) return { active: first, fit: 'all' };
	if (a.fitOf(first) >= READ_MIN) return { active: first, fit: 'board' };
	const gap = (/** @type {number} */ w) => Math.abs(w - a.viewport);
	const near = a.widths.reduce((best, w) => (gap(w) < gap(best) || (gap(w) === gap(best) && w < best) ? w : best), first);
	return { active: near, fit: 'board' };
}

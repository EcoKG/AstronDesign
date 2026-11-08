// @ts-check
// WCAG 글자 대비 계산과 판정. design_render 의 taste probe(probe.mjs lum·contrast·필요 대비)와 같은 식·임계값을 브라우저와 Node 가 함께 쓴다.

/** @typedef {{ r: number; g: number; b: number; a: number }} Rgba */
/** @typedef {{ ratio: number; need: number; verdict: 'good' | 'poor' | 'unknown' }} Judgement */

/**
 * `#rgb`·`#rrggbb`·`#rrggbbaa`·`rgb()`·`rgba()`(쉼표·공백 표기)·`transparent` 를 읽는다. 못 읽으면 null.
 * @param {string} s
 * @returns {Rgba | null}
 */
export function parseColor(s) {
	const v = s.trim().toLowerCase();
	if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
	if (hex) {
		const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
		const n = (/** @type {number} */ i) => parseInt(h.slice(i, i + 2), 16);
		return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
	}
	const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
	if (!fn) return null;
	const alpha = fn[4] === undefined ? 1 : fn[4].endsWith('%') ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
	return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: alpha };
}

/**
 * 상대 휘도.
 * @param {Rgba} c
 */
export function luminance(c) {
	const f = (/** @type {number} */ x) => {
		const v = x / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/**
 * 두 색의 대비(반올림 안 함).
 * @param {Rgba} a
 * @param {Rgba} b
 */
export function contrastRatio(a, b) {
	const l1 = luminance(a);
	const l2 = luminance(b);
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * 필요 대비: 24px 이상 또는 18.5px·700 이상은 3, 그 밖은 4.5.
 * @param {number} sizePx
 * @param {number} weight
 */
export function requiredRatio(sizePx, weight) {
	return sizePx >= 24 || (sizePx >= 18.5 && weight >= 700) ? 3 : 4.5;
}

/**
 * 글자색·배경색 대비를 판정한다. 글자색 알파가 1 미만이거나 배경을 모르면 unknown.
 * @param {Rgba | null} fg
 * @param {Rgba | null} bg
 * @param {number} sizePx
 * @param {number} weight
 * @returns {Judgement}
 */
export function judgeContrast(fg, bg, sizePx, weight) {
	const need = requiredRatio(sizePx, weight);
	if (!fg || !bg || fg.a < 1) return { ratio: 0, need, verdict: 'unknown' };
	const raw = contrastRatio(fg, bg);
	return { ratio: Math.round(raw * 100) / 100, need, verdict: raw < need ? 'poor' : 'good' };
}

/**
 * 요소 뒤 배경색(불투명도 0.9 이상인 가장 가까운 조상). 배경 그림·영상·겹침 가능 위치면 null.
 * @param {Element} el
 * @returns {Rgba | null}
 */
export function backgroundBehind(el) {
	const win = el.ownerDocument.defaultView;
	if (!win) return null;
	for (let p = /** @type {Element | null} */ (el); p && p !== el.ownerDocument.documentElement; p = p.parentElement) {
		const cs = win.getComputedStyle(p);
		if (cs.backgroundImage !== 'none' || p.tagName === 'VIDEO' || p.tagName === 'CANVAS') return null;
		const v = parseColor(cs.backgroundColor);
		if (v && v.a >= 0.9) return v;
		if (cs.position === 'absolute' || cs.position === 'fixed') return null;
	}
	const root = parseColor(win.getComputedStyle(el.ownerDocument.documentElement).backgroundColor);
	return root && root.a >= 0.9 ? root : { r: 255, g: 255, b: 255, a: 1 };
}

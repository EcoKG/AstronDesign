// @ts-check
// 요소 묶음 수집·고유 선택자·요소 경로·Design Feedback 마크다운. design_inspect(페이지 안 평가)와 편집기 화면이 함께 쓴다.
// 페이지 안에서 평가하는 함수(collectBundle·selectorAt·elementPath)는 모듈 바깥 이름을 쓰지 않는다.

/**
 * @typedef {{ text: number; html: number; ancestors: number; nearby: number; selector: number }} Limits
 * @typedef {{ location: string; source: string; react: string; bounds: string; classes: string; text: string; nearby: string[]; styles: Record<string, string>; domPath: string; html: string }} Bundle
 */

/** 묶음 길이 한도. */
export const LIMITS = { text: 200, html: 4096, ancestors: 10, nearby: 6, selector: 700 };

/**
 * 요소 하나의 묶음(정리한 HTML·계산 스타일 16개·위치 등)을 만든다.
 * @param {Element} el
 * @param {Limits} L
 * @returns {Bundle}
 */
export function collectBundle(el, L) {
	const win = /** @type {Window & typeof globalThis} */ (el.ownerDocument.defaultView);
	const SECRET = /(access_|refresh_|id_)?token|passw(or)?d|secret|api[_-]?key|authorization|session|cookie/i;
	const ALLOWED = new Set(['id', 'class', 'role', 'href', 'src', 'alt', 'title', 'type', 'name', 'for', 'placeholder', 'tabindex', 'data-testid']);
	const HASHED = /^(css|sc|jsx|emotion)-[a-z0-9]{4,}$/i;
	const STYLE_KEYS = /** @type {const} */ (['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'backgroundColor', 'border', 'borderRadius', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'zIndex']);
	const squash = (/** @type {string | null | undefined} */ s, /** @type {number} */ n) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
	const stripUrl = (/** @type {string} */ v) => v.replace(/[?#].*$/, '');
	const classes = (/** @type {string} */ v) => v.split(/\s+/).filter((c) => c && !HASHED.test(c)).join(' ');
	const innerText = (/** @type {Element} */ e) => /** @type {HTMLElement} */ (e).innerText;
	const clean = (/** @type {Element} */ node) => {
		const copy = /** @type {Element} */ (node.cloneNode(true));
		for (const s of Array.from(copy.querySelectorAll('script'))) s.remove();
		for (const e of [copy, ...Array.from(copy.querySelectorAll('*'))]) {
			for (const at of Array.from(e.attributes)) {
				const n = at.name;
				let v = at.value;
				if (SECRET.test(n)) { e.setAttribute(n, '[redacted]'); continue; }
				if (!ALLOWED.has(n) && !n.startsWith('aria-')) { e.removeAttribute(n); continue; }
				if (n === 'href' || n === 'src') v = stripUrl(v);
				if (n === 'class') v = classes(v);
				e.setAttribute(n, SECRET.test(v) ? '[redacted]' : v);
			}
		}
		return copy.outerHTML.slice(0, L.html);
	};
	const label = (/** @type {Element} */ e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && classes(e.className) ? '.' + classes(e.className).split(' ').join('.') : '');
	/** @type {string[]} */
	const path = [];
	for (let e = /** @type {Element | null} */ (el); e && path.length < L.ancestors; e = e.parentElement) path.unshift(label(e));
	/** @type {string[]} */
	const nearby = [];
	for (const e of [el.previousElementSibling, el.nextElementSibling, el.parentElement, ...Array.from(el.children)]) {
		if (!e || nearby.length >= L.nearby) continue;
		nearby.push(`${label(e)} "${squash(innerText(e), 80)}"`);
	}
	const cs = win.getComputedStyle(el);
	/** @type {Record<string, string>} */
	const styles = {};
	for (const k of STYLE_KEYS) styles[k] = cs[k];
	const r = el.getBoundingClientRect();
	const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
	let source = 'null (dev 소스 정보 없음)';
	/** @type {string[]} */
	const react = [];
	for (let f = fiberKey ? /** @type {any} */ (el)[fiberKey] : null; f && react.length < 3; f = f.return) {
		if (f._debugSource && source.startsWith('null')) source = `${f._debugSource.fileName}:${f._debugSource.lineNumber}`;
		const name = typeof f.type === 'function' ? f.type.displayName || f.type.name : null;
		if (name) react.push(name);
	}
	return {
		location: `(${Math.round(r.left + win.scrollX)}, ${Math.round(r.top + win.scrollY)}) in page`,
		source,
		react: react.join(' < ') || 'none',
		bounds: `x=${Math.round(r.left)} y=${Math.round(r.top)} w=${Math.round(r.width)} h=${Math.round(r.height)}`,
		classes: typeof el.className === 'string' ? classes(el.className) : '',
		text: squash(innerText(el), L.text),
		nearby: nearby.map((n) => n.slice(0, 120)).slice(0, L.nearby),
		styles,
		domPath: path.join(' > '),
		html: clean(el)
	};
}

/**
 * 좌표의 요소(또는 주어진 요소)에 고유 선택자를 만든다(id 가 있으면 id, 없으면 nth-of-type 경로).
 * @param {{ x: number; y: number } | null} p
 * @param {Element} [given]
 * @returns {string | null}
 */
export function selectorAt(p, given) {
	const el = given ?? (p ? document.elementFromPoint(p.x, p.y) : null);
	if (!el) return null;
	const root = el.ownerDocument.documentElement;
	/** @type {string[]} */
	const parts = [];
	for (let e = /** @type {Element | null} */ (el); e && e !== root; e = e.parentElement) {
		if (e.id) { parts.unshift('#' + CSS.escape(e.id)); break; }
		const tag = e.tagName;
		const same = e.parentElement ? Array.from(e.parentElement.children).filter((c) => c.tagName === tag) : [];
		parts.unshift(tag.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(e) + 1})` : ''));
	}
	return parts.join(' > ');
}

/**
 * `<html>` 부터 센 요소 자식 순번 경로(parse5 경로와 같은 규칙).
 * @param {Element} el
 * @returns {number[]}
 */
export function elementPath(el) {
	/** @type {number[]} */
	const out = [];
	const root = el.ownerDocument.documentElement;
	for (let e = el; e !== root && e.parentElement; e = e.parentElement) out.unshift(Array.prototype.indexOf.call(e.parentElement.children, e));
	return out;
}

/**
 * 경로의 요소. 없으면 null.
 * @param {Document} doc
 * @param {number[]} path
 * @returns {Element | null}
 */
export function elementByPath(doc, path) {
	let e = /** @type {Element | null} */ (doc.documentElement);
	for (const i of path) e = e?.children[i] ?? null;
	return e;
}

/**
 * Design Feedback 마크다운(Orca 필드 순서).
 * @param {string} url
 * @param {string} viewport
 * @param {(Bundle & { selector: string; intent: string; note: string; matches: number })[]} items
 */
export function feedbackMd(url, viewport, items) {
	const out = ['## Design Feedback', `- URL: ${url}`, `- Viewport: ${viewport}`, ''];
	items.forEach((it, i) => {
		out.push(`### ${i + 1}. ${it.selector}`,
			`- Intent: ${it.intent}`,
			`- Selector: \`${it.selector}\`${it.matches > 1 ? ` (${it.matches}개 일치, 첫 요소)` : ''}`,
			`- Location: ${it.location}`,
			`- Source: ${it.source}`,
			`- React: ${it.react}`,
			`- Bounds: ${it.bounds}`,
			`- Classes: ${it.classes || '(없음)'}`,
			`- Text: "${it.text}"`,
			`- Nearby: ${it.nearby.join(' | ') || '(없음)'}`,
			`- Computed styles: ${Object.entries(it.styles).map(([k, v]) => `${k}: ${v}`).join('; ')}`,
			`- DOM path: ${it.domPath}`,
			'- HTML:', '```html', it.html, '```',
			`- Feedback: ${it.note || '(없음)'}`, '');
	});
	return out.join('\n');
}

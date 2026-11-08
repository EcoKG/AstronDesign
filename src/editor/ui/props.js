// 속성 패널: 고른 요소의 글자·색·크기·정렬을 보여 주고 바꾸며, 글자색 대비를 design_render 와 같은 기준으로 판정한다.
import { backgroundBehind, judgeContrast, parseColor } from './shared/contrast.js';
import { selectorAt } from './shared/dom-bundle.js';

const FIELDS = ['color', 'background-color', 'font-size', 'font-weight', 'width', 'height', 'translate'];

/** rgb(a) 계산값 → #rrggbb(색 입력칸 값). */
function toHex(v) {
	const c = parseColor(v);
	if (!c) return '#000000';
	return '#' + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
}

/**
 * @param {{ onStyle: (prop: string, value: string) => void, onText: (value: string) => void }} cb
 */
export function createProps(cb) {
	const $ = (id) => document.getElementById(id);
	const form = $('p-form'), empty = $('p-empty'), badge = $('contrast'), textField = $('p-text-field');
	let el = null;

	for (const prop of FIELDS) {
		$(`p-${prop}`).addEventListener('change', (e) => cb.onStyle(prop, e.target.value.trim()));
	}
	$('p-text').addEventListener('change', (e) => cb.onText(e.target.value));
	for (const b of form.querySelectorAll('[data-align]')) b.addEventListener('click', () => cb.onStyle('text-align', b.dataset.align));
	form.addEventListener('submit', (e) => e.preventDefault());

	/** 글자색 대비 표시(좋음·나쁨·판정 보류). */
	function contrast() {
		const cs = el.ownerDocument.defaultView.getComputedStyle(el);
		const j = judgeContrast(parseColor(cs.color), backgroundBehind(el), parseFloat(cs.fontSize), parseInt(cs.fontWeight, 10) || 400);
		badge.dataset.verdict = j.verdict;
		if (j.verdict === 'unknown') return void (badge.textContent = '대비 판정 보류(반투명 글자색 또는 배경 그림)');
		const digits = Math.abs(j.ratio - j.need) < 0.1 ? 2 : 1;
		badge.textContent = `대비 ${j.ratio.toFixed(digits)}:1 ${j.verdict === 'good' ? '좋음' : '나쁨'} (필요 ${j.need}:1)`;
	}

	return {
		/** 요소를 보여 준다(null 이면 빈 안내). */
		show(next) {
			el = next;
			form.hidden = !el;
			empty.hidden = !!el;
			if (!el) return;
			const cs = el.ownerDocument.defaultView.getComputedStyle(el);
			$('p-selector').textContent = selectorAt(null, el);
			const textOnly = el.children.length === 0;
			textField.hidden = !textOnly;
			if (textOnly) $('p-text').value = el.textContent;
			$('p-color').value = toHex(cs.color);
			$('p-background-color').value = toHex(cs.backgroundColor);
			$('p-font-size').value = cs.fontSize;
			$('p-font-weight').value = String(parseInt(cs.fontWeight, 10) || 400);
			$('p-width').value = el.style.getPropertyValue('width') || cs.width;
			$('p-height').value = el.style.getPropertyValue('height') || cs.height;
			$('p-translate').value = el.style.getPropertyValue('translate');
			for (const b of form.querySelectorAll('[data-align]')) b.setAttribute('aria-pressed', String(cs.textAlign === b.dataset.align || (cs.textAlign === 'start' && b.dataset.align === 'left')));
			contrast();
		}
	};
}

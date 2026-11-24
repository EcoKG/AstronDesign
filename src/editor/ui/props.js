// 속성 패널: 고른 요소의 글자·색(투명 표시 포함)·크기·정렬을 보여 주고 바꾸며, 글자색 대비를 design_render 와 같은 기준으로 판정한다.
import { backgroundBehind, judgeContrast, parseColor } from './shared/contrast.js';
import { selectorAt } from './shared/dom-bundle.js';

const FIELDS = ['color', 'background-color', 'font-size', 'font-weight', 'width', 'height', 'translate'];
const COLOR_FIELDS = ['color', 'background-color'];

/** rgb(a) 계산값 → 색 입력칸 값 #rrggbb 와 알파(0~1). 못 읽으면 검정·불투명. */
function toColor(v) {
	const c = parseColor(v);
	if (!c) return { hex: '#000000', alpha: 1 };
	return { hex: '#' + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join(''), alpha: c.a };
}

/**
 * @param {{ onStyle: (prop: string, value: string) => void, onText: (value: string) => void }} cb
 */
export function createProps(cb) {
	const $ = (id) => document.getElementById(id);
	const form = $('p-form'), empty = $('p-empty'), badge = $('contrast'), textField = $('p-text-field');
	let el = null;

	/** 색 입력칸 옆 투명 표시: 알파 0 은 체커와 '투명', 0~1 은 체커 위 반투명 색과 '투명도 n%'. 불투명이면 지운다. */
	function swatch(prop, value) {
		const input = $(`p-${prop}`), wrap = input.closest('.swatch'), note = $(`p-${prop}-note`);
		const c = value == null ? { hex: input.value, alpha: 1 } : toColor(value);
		input.value = c.hex;
		if (c.alpha >= 1) {
			delete wrap.dataset.transparent;
			wrap.style.removeProperty('--swatch-color');
			note.textContent = '';
			return;
		}
		wrap.dataset.transparent = c.alpha <= 0 ? 'true' : 'partial';
		wrap.style.setProperty('--swatch-color', value);
		note.textContent = c.alpha <= 0 ? '투명' : `투명도 ${Math.round((1 - c.alpha) * 100)}%`;
	}

	for (const prop of FIELDS) {
		$(`p-${prop}`).addEventListener('change', (e) => cb.onStyle(prop, e.target.value.trim()));
	}
	for (const prop of COLOR_FIELDS) $(`p-${prop}`).addEventListener('input', () => swatch(prop, null));
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
			swatch('color', cs.color);
			swatch('background-color', cs.backgroundColor);
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

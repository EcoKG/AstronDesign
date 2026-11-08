// @ts-check
// 편집 연산 종류 등록표(OP_KINDS): 종류마다 입력 검사·적용·역적용을 둔다. 브라우저 편집기와 Node(기록·내보내기)가 함께 쓴다.

/**
 * @typedef {{ id: string; kind: 'style' | 'text'; path: number[]; tag: string; selector: string; prop?: string; before: string; after: string; attr?: string | null }} Op
 * attr 는 style 연산 직전의 style 속성 원문(없으면 null). 역적용과 원본 충돌 판정에 쓴다.
 */

export const MAX_OPS = 500;
const VALUE_MAX = 200;
const TEXT_MAX = 2000;
const BAD_VALUE = /url\(|expression\(|[;{}<>\\]/i;

/** 편집 가능한 CSS 속성. */
export const STYLE_PROPS = new Set([
	'color', 'background-color', 'opacity',
	'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform',
	'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'translate',
	'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
	'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
	'gap', 'justify-content', 'align-items', 'align-self', 'justify-self',
	'border-radius', 'border-width', 'border-style', 'border-color'
]);

/** 연산 입력 오류. 서버는 code 로 E_INPUT 결과를 만든다. */
export class OpError extends Error {
	/** @param {string} message */
	constructor(message) {
		super(message);
		/** @type {'E_INPUT'} */
		this.code = 'E_INPUT';
	}
}

/**
 * 글자만 가진 요소의 글자를 바꾼다.
 * @param {any} el
 * @param {string} v
 */
function setText(el, v) {
	if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) el.childNodes[0].nodeValue = v;
	else el.textContent = v;
}

/**
 * @param {unknown} v
 * @param {number} max
 * @param {string} name
 * @returns {string}
 */
function str(v, max, name) {
	if (typeof v !== 'string' || v.length > max) throw new OpError(`${name}: ${max}자 이하 문자열이어야 합니다`);
	return v;
}

/** 연산 종류 등록표. 새 종류는 항목 하나를 더한다. */
export const OP_KINDS = {
	style: {
		/** @param {any} op @returns {Partial<Op>} */
		validate(op) {
			const prop = str(op.prop, 40, 'prop');
			if (!STYLE_PROPS.has(prop)) throw new OpError(`허용 밖 CSS 속성: ${prop}`);
			const after = str(op.after, VALUE_MAX, 'after');
			if (BAD_VALUE.test(after)) throw new OpError(`허용 밖 CSS 값: ${after.slice(0, 40)}`);
			const attr = op.attr == null ? null : str(op.attr, 4000, 'attr');
			return { prop, after: after.trim(), before: str(op.before ?? '', TEXT_MAX, 'before'), attr };
		},
		/** @param {any} el @param {Op} op */
		apply(el, op) {
			if (op.after === '') el.style.removeProperty(op.prop);
			else el.style.setProperty(op.prop, op.after);
		},
		/** @param {any} el @param {Op} op */
		invert(el, op) {
			if (op.attr == null) el.removeAttribute('style');
			else el.setAttribute('style', op.attr);
		}
	},
	text: {
		/** @param {any} op @returns {Partial<Op>} */
		validate(op) {
			return { after: str(op.after, TEXT_MAX, 'after'), before: str(op.before ?? '', TEXT_MAX, 'before') };
		},
		/** @param {any} el @param {Op} op */
		apply(el, op) {
			setText(el, op.after);
		},
		/** @param {any} el @param {Op} op */
		invert(el, op) {
			setText(el, op.before);
		}
	}
};

/**
 * 연산 하나를 검사하고 알려진 칸만 남긴 새 연산을 돌려준다.
 * @param {any} op
 * @returns {Op}
 */
export function validateOp(op) {
	if (!op || typeof op !== 'object') throw new OpError('연산은 객체여야 합니다');
	const kind = /** @type {keyof typeof OP_KINDS} */ (op.kind);
	if (!Object.hasOwn(OP_KINDS, kind)) throw new OpError(`모르는 연산 종류: ${String(op.kind).slice(0, 20)}`);
	if (typeof op.id !== 'string' || !/^[\w-]{1,64}$/.test(op.id)) throw new OpError('id 형식 오류');
	if (!Array.isArray(op.path) || op.path.length < 1 || op.path.length > 64 || !op.path.every((/** @type {unknown} */ n) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 100000)) throw new OpError('path 는 0 이상 정수 배열이어야 합니다');
	if (typeof op.tag !== 'string' || !/^[a-z][a-z0-9-]{0,40}$/.test(op.tag)) throw new OpError('tag 형식 오류');
	const selector = str(op.selector, 700, 'selector');
	return /** @type {Op} */ ({ id: op.id, kind, path: [...op.path], tag: op.tag, selector, ...OP_KINDS[kind].validate(op) });
}

/**
 * 연산 목록을 검사한다(최대 MAX_OPS 개).
 * @param {unknown} list
 * @returns {Op[]}
 */
export function validateOps(list) {
	if (!Array.isArray(list)) throw new OpError('연산 목록은 배열이어야 합니다');
	if (list.length > MAX_OPS) throw new OpError(`연산은 ${MAX_OPS}개 이하여야 합니다(${list.length})`);
	return list.map(validateOp);
}

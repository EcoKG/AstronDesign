import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_OPS, OP_KINDS, validateOp, validateOps } from '../../src/shared/ops.js';

const base = { id: 'o1', kind: 'style' as const, path: [1, 0, 2], tag: 'p', selector: 'p.low', prop: 'color', before: 'rgb(179, 179, 179)', after: '#595959', attr: 'color: #b3b3b3' };

/** style 속성 문자열과 글자 노드 하나를 가진 가짜 요소. */
function fakeEl(attr: string | null, text: string) {
	const map = new Map<string, string>();
	const parse = (v: string | null) => {
		map.clear();
		for (const d of (v ?? '').split(';')) {
			const i = d.indexOf(':');
			if (i > 0) map.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
		}
	};
	let raw = attr;
	parse(attr);
	const sync = () => { raw = map.size ? [...map].map(([k, v]) => `${k}: ${v}`).join('; ') : null; };
	const node = { nodeType: 3, nodeValue: text };
	return {
		style: {
			getPropertyValue: (p: string) => map.get(p) ?? '',
			setProperty: (p: string, v: string) => { map.set(p, v); sync(); },
			removeProperty: (p: string) => { map.delete(p); sync(); }
		},
		getAttribute: (n: string) => (n === 'style' ? raw : null),
		setAttribute: (n: string, v: string) => { if (n === 'style') { raw = v; parse(v); } },
		removeAttribute: (n: string) => { if (n === 'style') { raw = null; map.clear(); } },
		childNodes: [node],
		children: [],
		get textContent() { return node.nodeValue; },
		set textContent(v: string) { node.nodeValue = v; },
		get raw() { return raw; }
	};
}

const code = (e: unknown) => (e as { code?: string }).code;

test('OP1 허용 밖 CSS 속성 거부(E_INPUT)', () => {
	for (const prop of ['behavior', '-moz-binding', 'COLOR', 'content', '--x']) {
		assert.throws(() => validateOp({ ...base, prop }), (e) => code(e) === 'E_INPUT', prop);
	}
	assert.throws(() => validateOp({ ...base, kind: 'remove' }), (e) => code(e) === 'E_INPUT');
	assert.equal(validateOp(base).prop, 'color');
	assert.equal(validateOp({ ...base, prop: 'translate', after: '10px 4px' }).after, '10px 4px');
});

test('OP2 값에 url(·expression(·세미콜론·중괄호·꺾쇠 거부', () => {
	for (const after of ['url(x.png)', 'URL(x)', 'expression(alert(1))', 'red; background: blue', 'red}', '{red', '<b>', 'a>b', 'x'.repeat(201)]) {
		assert.throws(() => validateOp({ ...base, after }), (e) => code(e) === 'E_INPUT', after);
	}
	assert.throws(() => validateOp({ ...base, path: [1, -1] }), (e) => code(e) === 'E_INPUT');
	assert.throws(() => validateOp({ ...base, tag: 'p onclick' }), (e) => code(e) === 'E_INPUT');
	assert.equal(validateOp({ ...base, prop: 'font-family', after: '"Noto Sans", sans-serif' }).after, '"Noto Sans", sans-serif');
});

test('OP3 연산 역적용 왕복이 원상태', () => {
	const el = fakeEl('color: #b3b3b3; margin: 0', '처리 대기');
	OP_KINDS.style.apply(el, base);
	assert.equal(el.style.getPropertyValue('color'), '#595959');
	OP_KINDS.style.invert(el, { ...base, attr: 'color: #b3b3b3; margin: 0' });
	assert.equal(el.raw, 'color: #b3b3b3; margin: 0');
	const t = { ...base, kind: 'text' as const, prop: undefined, before: '처리 대기', after: '바뀐 글' };
	OP_KINDS.text.apply(el, t);
	assert.equal(el.textContent, '바뀐 글');
	OP_KINDS.text.invert(el, t);
	assert.equal(el.textContent, '처리 대기');
	const none = fakeEl(null, 'x');
	OP_KINDS.style.apply(none, { ...base, attr: null });
	OP_KINDS.style.invert(none, { ...base, attr: null });
	assert.equal(none.raw, null);
});

test('OP4 연산 500개 초과 거부', () => {
	assert.equal(MAX_OPS, 500);
	assert.equal(validateOps(Array.from({ length: 500 }, (_, i) => ({ ...base, id: `o${i}` }))).length, 500);
	assert.throws(() => validateOps(Array.from({ length: 501 }, (_, i) => ({ ...base, id: `o${i}` }))), (e) => code(e) === 'E_INPUT');
	assert.throws(() => validateOps('x' as unknown as unknown[]), (e) => code(e) === 'E_INPUT');
});

test('OP5 빈 값은 속성 제거로 처리', () => {
	const op = validateOp({ ...base, after: '' });
	assert.equal(op.after, '');
	const el = fakeEl('color: #b3b3b3; margin: 0', 'x');
	OP_KINDS.style.apply(el, op);
	assert.equal(el.style.getPropertyValue('color'), '');
	assert.equal(el.raw, 'margin: 0');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'parse5';
import { writerFor } from '../../src/editor/writers/registry.ts';
import type { Op } from '../../src/shared/ops.js';

const SRC = '<!doctype html>\n<html><head><title>t</title></head>\n<body>\n<main>\n\t<h1>제목</h1>\n\t<p class="x" style="margin: 0">가</p>\n\t<p>나</p>\n</main>\n</body>\n</html>\n';
const html = writerFor('page/index.html')!;
const op = (o: Partial<Op>): Op => ({ id: 'o', kind: 'style', path: [1, 0, 1], tag: 'p', selector: 'p.x', prop: 'color', before: '', after: '#111111', attr: 'margin: 0', ...o }) as Op;

/** parse5 로 다시 읽어 경로의 요소 속성·글자를 돌려준다. */
function nodeAt(src: string, path: number[]) {
	let n: any = parse(src).childNodes.find((c: any) => c.nodeName === 'html');
	for (const i of path) n = n.childNodes.filter((c: any) => c.tagName)[i];
	return { style: n.attrs.find((a: any) => a.name === 'style')?.value ?? null, text: n.childNodes.map((c: any) => c.value ?? '').join('') };
}

test('HW1 경로 인덱스로 찾은 요소에 style 속성 추가·기존 style 병합', () => {
	const r = html.plan(SRC, [op({}), op({ id: 'o2', path: [1, 0, 2], selector: 'p:nth-of-type(2)', attr: null, after: '#222222' }), op({ id: 'o3', prop: 'margin', after: '4px' })]);
	assert.equal(r.skipped.length, 0);
	assert.equal(nodeAt(r.text, [1, 0, 1]).style, 'margin: 4px; color: #111111');
	assert.equal(nodeAt(r.text, [1, 0, 2]).style, 'color: #222222');
	assert.match(r.text, /<p style="color: #222222">나<\/p>/);
	assert.equal(r.lines.o, 6);
});

test('HW2 따옴표·앰퍼샌드 값은 속성 이스케이프', () => {
	const value = `'A&B', "C D"`;
	const r = html.plan(SRC, [op({ prop: 'font-family', after: value })]);
	assert.match(r.text, /style="margin: 0; font-family: 'A&amp;B', &quot;C D&quot;"/);
	assert.equal(nodeAt(r.text, [1, 0, 1]).style, `margin: 0; font-family: ${value}`);
});

test('HW3 글자 연산은 텍스트 노드만 바꾸고 HTML 은 이스케이프', () => {
	const r = html.plan(SRC, [op({ kind: 'text', prop: undefined, path: [1, 0, 0], tag: 'h1', selector: 'h1', before: '제목', after: '<b>굵게</b> & 끝', attr: null })]);
	assert.equal(r.skipped.length, 0);
	assert.match(r.text, /<h1>&lt;b&gt;굵게&lt;\/b&gt; &amp; 끝<\/h1>/);
	assert.equal(nodeAt(r.text, [1, 0, 0]).text, '<b>굵게</b> & 끝');
	const nested = html.plan('<html><body><h1>a<b>b</b></h1></body></html>', [op({ kind: 'text', prop: undefined, path: [1, 0], tag: 'h1', before: 'ab', after: 'x', attr: null })]);
	assert.equal(nested.skipped.length, 1);
	assert.match(nested.skipped[0].reason, /넘겨주기 전용/);
});

test('HW4 before 불일치 → 충돌(쓰지 않음)', () => {
	const r = html.plan(SRC, [op({ attr: 'margin: 8px' })]);
	assert.equal(r.text, SRC);
	assert.equal(r.skipped.length, 1);
	assert.match(r.skipped[0].reason, /충돌/);
	const t = html.plan(SRC, [op({ kind: 'text', prop: undefined, path: [1, 0, 0], tag: 'h1', before: '다른 제목', after: 'x', attr: null })]);
	assert.equal(t.text, SRC);
	assert.match(t.skipped[0].reason, /충돌/);
});

test('HW5 태그 불일치(스크립트가 만든 요소) → 넘겨주기 전용', () => {
	const r = html.plan(SRC, [op({ path: [1, 0, 0], tag: 'aside', attr: null }), op({ id: 'gone', path: [1, 0, 9], attr: null })]);
	assert.equal(r.text, SRC);
	assert.equal(r.skipped.length, 2);
	for (const s of r.skipped) assert.match(s.reason, /넘겨주기 전용/);
});

test('HW6 CRLF·BOM 보존, 바뀐 범위 밖 바이트 동일', () => {
	const src = '﻿' + SRC.replace(/\n/g, '\r\n');
	const r = html.plan(src, [op({})]);
	assert.ok(r.text.startsWith('﻿<!doctype html>\r\n'));
	assert.equal(r.text.split('\r\n').length, src.split('\r\n').length);
	assert.doesNotMatch(r.text, /[^\r]\n/, 'LF 단독 없음');
	const at = src.indexOf('style="margin: 0"');
	assert.equal(r.text.slice(0, at), src.slice(0, at));
	const tail = src.slice(at + 'style="margin: 0"'.length);
	assert.ok(r.text.endsWith(tail));
	assert.equal(r.text.length - tail.length - at, 'style="margin: 0; color: #111111"'.length);
});

test('HW7 미등록 확장자(.tsx) → writerFor 가 null, 넘겨주기 전용', () => {
	assert.equal(writerFor('src/App.tsx'), null);
	assert.equal(writerFor('src/App.vue'), null);
	assert.equal(writerFor('a/index.HTML')?.id, 'html-static');
	assert.equal(writerFor('a/page.htm')?.id, 'html-static');
});

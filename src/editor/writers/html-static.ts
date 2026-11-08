// 정적 HTML 기록기: parse5 원본 위치로 요소를 찾아 style 속성 병합·글자 노드 교체만 하고 나머지 바이트(BOM·CRLF 포함)는 그대로 둔다.
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { Op } from '../../shared/ops.js';
import type { Writer, WriterPlan } from './registry.ts';

type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];
type Splice = { start: number; end: number; text: string };

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
const isElement = (n: Node): n is Element => 'tagName' in n;
const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** style 속성 글을 선언 목록으로 나눈다(괄호·따옴표 안 세미콜론은 나누지 않음). */
function parseStyle(text: string): [string, string][] {
	const out: [string, string][] = [];
	let depth = 0, quote = '', cur = '';
	const push = () => {
		const i = cur.indexOf(':');
		if (i > 0) out.push([cur.slice(0, i).trim().toLowerCase(), cur.slice(i + 1).trim()]);
		cur = '';
	};
	for (const ch of text) {
		if (quote) quote = ch === quote ? '' : quote;
		else if (ch === '"' || ch === "'") quote = ch;
		else if (ch === '(') depth++;
		else if (ch === ')') depth = Math.max(0, depth - 1);
		else if (ch === ';' && depth === 0) {
			push();
			continue;
		}
		cur += ch;
	}
	push();
	return out;
}

const styleText = (decls: [string, string][]) => decls.map(([p, v]) => `${p}: ${v}`).join('; ');

/** 경로(요소 자식 순번)로 `<html>` 아래 요소를 찾는다. */
function elementAt(root: Element | undefined, path: number[]): Element | null {
	let n: Element | undefined = root;
	for (const i of path) n = n?.childNodes.filter(isElement)[i];
	return n ?? null;
}

/** 한 요소의 style 연산을 원본 style 속성에 병합하는 고침을 만든다. 편집 시점 속성과 원본이 다르면 충돌. */
function styleSplice(src: string, el: Element, ops: Op[]): Splice | string | null {
	const attr = el.attrs.find((a) => a.name === 'style');
	const current = attr?.value ?? null;
	if ((ops[0].attr ?? null) !== current) return `충돌: 원본 style 속성(${current ?? '없음'})이 편집 시점(${ops[0].attr ?? '없음'})과 다름`;
	const decls = parseStyle(current ?? '');
	for (const op of ops) {
		const i = decls.findIndex(([p]) => p === op.prop);
		if (op.after === '') {
			if (i >= 0) decls.splice(i, 1);
		} else if (i >= 0) decls[i] = [op.prop!, op.after];
		else decls.push([op.prop!, op.after]);
	}
	const next = styleText(decls);
	if (current !== null && next === styleText(parseStyle(current))) return null;
	const loc = el.sourceCodeLocation!;
	const range = loc.attrs?.style;
	if (range) {
		if (next) return { start: range.startOffset, end: range.endOffset, text: `style="${escAttr(next)}"` };
		let start = range.startOffset;
		while (start > 0 && /\s/.test(src[start - 1])) start--;
		return { start, end: range.endOffset, text: '' };
	}
	if (!next) return null;
	const end = loc.startTag!.endOffset;
	const at = src[end - 2] === '/' ? end - 2 : end - 1;
	return { start: at, end: at, text: ` style="${escAttr(next)}"` };
}

/** 글자만 가진 요소의 글자 노드를 바꾸는 고침을 만든다. */
function textSplice(el: Element, ops: Op[]): Splice | string | null {
	const kids = el.childNodes;
	if (RAW_TEXT.has(el.tagName) || kids.length > 1 || (kids.length === 1 && kids[0].nodeName !== '#text')) return '글자 연산은 글자만 가진 요소에만 쓸 수 있음: 넘겨주기 전용';
	const node = kids[0] as DefaultTreeAdapterMap['textNode'] | undefined;
	const current = node?.value ?? '';
	if (ops[0].before !== current) return `충돌: 원본 글자가 편집 시점과 다름`;
	const after = ops[ops.length - 1].after;
	if (after === current) return null;
	if (node?.sourceCodeLocation) return { start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset, text: escText(after) };
	const end = el.sourceCodeLocation!.startTag!.endOffset;
	return { start: end, end, text: escText(after) };
}

export const htmlStatic: Writer = {
	id: 'html-static',
	match: (file) => /\.html?$/i.test(file),
	plan(original: string, ops: Op[]): WriterPlan {
		const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
		const src = original.slice(bom.length);
		const doc = parse(src, { sourceCodeLocationInfo: true });
		const root = doc.childNodes.find((n): n is Element => isElement(n) && n.tagName === 'html');
		const groups = new Map<string, Op[]>();
		for (const op of ops) groups.set(op.path.join('.'), [...(groups.get(op.path.join('.')) ?? []), op]);
		const plan: WriterPlan = { text: src, applied: [], skipped: [], lines: {} };
		const splices: Splice[] = [];
		for (const group of groups.values()) {
			const el = elementAt(root, group[0].path);
			const known = el?.sourceCodeLocation?.startTag ? el : null;
			const mine = group.filter((op) => known && op.tag === known.tagName);
			for (const op of group) if (!mine.includes(op)) plan.skipped.push({ op, reason: `태그 불일치 또는 원본에 없는 요소(스크립트가 만든 요소일 수 있음): 넘겨주기 전용` });
			if (!known || !mine.length) continue;
			for (const kind of ['style', 'text'] as const) {
				const part = mine.filter((op) => op.kind === kind);
				if (!part.length) continue;
				const r = kind === 'style' ? styleSplice(src, known, part) : textSplice(known, part);
				if (typeof r === 'string') {
					for (const op of part) plan.skipped.push({ op, reason: r });
					continue;
				}
				if (r) splices.push(r);
				for (const op of part) {
					plan.applied.push(op);
					plan.lines[op.id] = known.sourceCodeLocation!.startLine;
				}
			}
		}
		for (const s of splices.sort((a, b) => b.start - a.start)) plan.text = plan.text.slice(0, s.start) + s.text + plan.text.slice(s.end);
		return { ...plan, text: bom + plan.text };
	}
};

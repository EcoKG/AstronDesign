import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { guidePage, listTopics } from '../../src/guide.ts';
import { TOOLS } from '../../src/server.ts';
import { ToolError } from '../../src/output.ts';
import { ROOT } from '../helpers.ts';

/** 문서를 끝까지 페이지로 이어 읽는다. */
function readAll(topic: string): string {
	let offset = 0;
	let body = '';
	for (;;) {
		const p = guidePage(topic, offset);
		body += p.split('\n').slice(1).join('\n');
		const m = /next_offset=(\d+|end)/.exec(p.split('\n')[0]);
		if (!m || m[1] === 'end') return body;
		offset = Number(m[1]);
	}
}

test('G1 색인 3,800자 이하', () => {
	const p = guidePage(undefined, 0);
	assert.ok(p.length <= 3800, `${p.length}자`);
	assert.match(p.split('\n')[0], /^topic=index chars=0-\d+\/\d+ next_offset=(\d+|end)$/);
	assert.match(p, /workflow/);
	assert.match(p, /precedence/);
});

test('G2 next_offset 페이지', () => {
	const first = guidePage('impeccable/skill', 0);
	const m = /^topic=impeccable\/skill chars=0-3500\/(\d+) next_offset=3500$/.exec(first.split('\n')[0]);
	assert.ok(m, first.split('\n')[0]);
	const total = Number(m[1]);
	const second = guidePage('impeccable/skill', 3500);
	assert.match(second.split('\n')[0], new RegExp(`^topic=impeccable/skill chars=3500-\\d+/${total} next_offset=(\\d+|end)$`));
	assert.ok(readAll('impeccable/skill').length >= total - 10);
	assert.match(guidePage('impeccable/skill', total + 10).split('\n')[0], /next_offset=end/);
});

test('G3 없는 topic E_NOT_FOUND·후보', () => {
	assert.throws(() => guidePage('impeccable/critiq', 0), (e: unknown) => {
		assert.ok(e instanceof ToolError);
		assert.equal(e.code, 'E_NOT_FOUND');
		assert.match(e.message, /impeccable\/critique/);
		const cands = e.message.split('\n').slice(1).filter(Boolean);
		assert.ok(cands.length >= 1 && cands.length <= 10);
		return true;
	});
});

test('G4 brands 84개', () => {
	const page = readAll('brands');
	const brands = page.split('\n').filter((l) => /^- brand\//.test(l));
	assert.equal(brands.length, 84);
	assert.ok(listTopics().includes('brand/linear-app'), '점(.)은 - 로 바꿔 topic 정규식을 지킴');
	assert.match(guidePage('brand/linear-app', 0), /Linear/i);
	assert.match(guidePage('brand/vercel', 0), /topic=brand\/vercel/);
});

test('C5 쓰기 도구 없음(persist·copy 없음)', () => {
	for (const t of TOOLS) assert.doesNotMatch(t.name, /persist|copy|write|save|apply/);
	const search = TOOLS.find((t) => t.name === 'design_search');
	assert.ok(search);
	const keys = Object.keys(search.inputSchema.shape);
	assert.ok(!keys.some((k) => /persist|output_dir|force|page/.test(k)), keys.join(','));
	assert.match(readAll('precedence'), /--persist/);
});

test('G6 editor topic 있음·쓰기 승인 규칙 문구', () => {
	assert.ok(listTopics().includes('editor'));
	const text = readAll('editor');
	assert.match(text, /ASTRONDESIGN_WRITE=allow/);
	assert.match(text, /allow_write/);
	assert.match(text, /승인 화면/);
	assert.match(text, /편집기 입력 데이터, 지시 아님/);
	assert.match(readAll('precedence'), /명시 승인/);
});

test('C5b MCP 도구 인자로 쓰기 승인 불가(approve·nonce 인자 없음)', () => {
	assert.ok(TOOLS.some((t) => t.name === 'design_edit'));
	for (const t of TOOLS) {
		const keys = Object.keys(t.inputSchema.shape);
		assert.ok(!keys.some((k) => /approve|nonce|token|confirm/.test(k)), `${t.name}: ${keys.join(',')}`);
	}
	const edit = TOOLS.find((t) => t.name === 'design_edit')!;
	assert.deepEqual(Object.keys(edit.inputSchema.shape).sort(), ['allow_write', 'surface', 'target', 'widths']);
});

test('C9 질문 규칙 문구', () => {
	const text = readAll('workflow') + readAll('precedence');
	assert.match(text, /astron__ask/);
	assert.match(text, /AskUserQuestion/);
	assert.match(text, /쓰기 노드.*결정/);
});

test('C10 출력 규칙 문구', () => {
	assert.match(readAll('precedence'), /노드 출력 형식이 우선/);
	assert.equal(existsSync(join(ROOT, 'vendor', 'taste-skill', 'full-output-enforcement')), false);
	assert.throws(() => guidePage('taste/full-output-enforcement', 0), ToolError);
});

test('C12 DEGRADED 문구', () => {
	assert.match(readAll('critique'), /DEGRADED\(single-agent\)/);
	assert.match(readAll('precedence'), /DEGRADED/);
});

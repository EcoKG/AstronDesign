import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, makeProj } from '../helpers.ts';
import { http } from '../editor-helpers.ts';
import { MAX_SESSIONS, closeEditors, editorDir, findSession, openSession, sessionKey } from '../../src/editor/session.ts';
import { MAX_COMMENTS, NOTE_MAX, loadChanges, saveComments } from '../../src/editor/store.ts';
import { ToolError } from '../../src/output.ts';

afterEach(closeEditors);
after(cleanup);

const isInput = (e: unknown) => e instanceof ToolError && e.code === 'E_INPUT';
const comment = (i: number, note = '메모') => ({ id: `c${i}`, selector: 'h1', path: [1, 0, 0], tag: 'h1', point: { x: 10, y: 10 }, width: 1440, intent: 'fix', note, send: true, status: 'open', replies: [], bundle: null });

test('SS1 같은 target 은 같은 세션 키·같은 URL', async () => {
	const proj = makeProj('editor');
	assert.equal(sessionKey('editor/index.html', proj), sessionKey('editor/index.html', proj));
	assert.equal(sessionKey('editor', proj), sessionKey('editor/index.html', proj), '폴더는 index.html 로 풀림');
	assert.match(sessionKey('editor/index.html', proj), /^[0-9a-f]{12}$/);
	assert.notEqual(sessionKey('editor/react.html', proj), sessionKey('editor/index.html', proj));
	const a = await openSession({ target: 'editor/index.html', surface: 'operate', cwd: proj });
	const b = await openSession({ target: './editor/index.html', surface: 'operate', cwd: proj });
	assert.equal(a, b);
	assert.equal(a.workUrl, b.workUrl);
	assert.equal(a.dir, editorDir('editor/index.html', proj));
	assert.ok(existsSync(join(a.dir, 'session.json')));
});

test('SS2 세션 3개 초과 → 가장 오래된 세션 닫힘', async () => {
	assert.equal(MAX_SESSIONS, 3);
	const proj = makeProj('editor');
	const opened = [];
	for (const t of ['index', 'external', 'react', 'script-made']) opened.push(await openSession({ target: `editor/${t}.html`, surface: 'operate', cwd: proj }));
	assert.equal(findSession(opened[0].key), undefined);
	for (const s of opened.slice(1)) assert.equal(findSession(s.key), s);
	await assert.rejects(http(opened[0].workUrl));
	assert.equal((await http(opened[3].workUrl)).status, 200);
});

test('SS3 손상된 changes.json → 백업 후 빈 상태로 열고 경고', async () => {
	const proj = makeProj('editor');
	const dir = editorDir('editor/index.html', proj);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'changes.json'), '{"version":1,"events":[{"type":"do"');
	const r = loadChanges(dir);
	assert.deepEqual(r.events, []);
	assert.match(r.warning ?? '', /손상/);
	const backup = readdirSync(dir).find((n) => /^changes\.broken-.+\.json$/.test(n));
	assert.ok(backup);
	assert.equal(readFileSync(join(dir, backup), 'utf8'), '{"version":1,"events":[{"type":"do"');
	const s = await openSession({ target: 'editor/index.html', surface: 'operate', cwd: proj });
	assert.deepEqual(s.warnings, []);
	writeFileSync(join(dir, 'changes.json'), 'not json');
	await closeEditors();
	const again = await openSession({ target: 'editor/index.html', surface: 'operate', cwd: proj });
	assert.match(again.warnings.join('\n'), /손상/);
});

test('SS4 댓글 200개 초과 거부·note 2000자 초과 거부', () => {
	const proj = makeProj();
	const dir = join(proj, 'sess');
	mkdirSync(dir);
	assert.equal(MAX_COMMENTS, 200);
	assert.equal(NOTE_MAX, 2000);
	assert.equal(saveComments(dir, Array.from({ length: 200 }, (_, i) => comment(i))).length, 200);
	assert.throws(() => saveComments(dir, Array.from({ length: 201 }, (_, i) => comment(i))), isInput);
	assert.throws(() => saveComments(dir, [comment(1, 'x'.repeat(2001))]), isInput);
	assert.throws(() => saveComments(dir, [{ ...comment(1), intent: 'delete' }]), isInput);
	assert.equal(saveComments(dir, [comment(1, 'x'.repeat(2000))]).length, 1);
});

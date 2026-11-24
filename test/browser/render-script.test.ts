import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, cleanup, makeProj } from '../helpers.ts';

after(cleanup);

/** scripts/render.mjs 를 프로젝트 cwd 에서 실행한다. */
function run(cwd: string, args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; out: string; err: string }> {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [join(ROOT, 'scripts', 'render.mjs'), ...args], { cwd, env: { ...process.env, ...env }, windowsHide: true });
		let out = '';
		let err = '';
		child.stdout.setEncoding('utf8').on('data', (d: string) => (out += d));
		child.stderr.setEncoding('utf8').on('data', (d: string) => (err += d));
		child.on('close', (code) => resolve({ code, out, err }));
	});
}

const folds = (out: string) => [...out.matchAll(/^fold: (.+)$/gm)].map((m) => m[1].trim());

test('RS1 render 스크립트: 첫 줄·fold·report 경로·blocked=0 출력, 차단 1건 이상이면 종료코드 1', async () => {
	const cwd = makeProj('editor');
	const ok = await run(cwd, ['editor/index.html', '--surface', 'operate', '--widths', '1440']);
	assert.equal(ok.code, 0, ok.out + ok.err);
	assert.match(ok.out.split('\n')[0], /^(OK|FAIL) design_render:/);
	assert.ok(existsSync(folds(ok.out)[0]));
	assert.ok(existsSync(/^report: (.+)$/m.exec(ok.out)![1].trim()));
	assert.match(ok.out, /^blocked=0$/m);
	const ext = await run(cwd, ['editor/external.html', '--surface', 'operate', '--widths', '1440']);
	assert.equal(ext.code, 1, ext.out);
	assert.match(ext.out, /^blocked=1$/m);
});

test('RS2 --expect-blocked 1 이면 external.html 에서 종료코드 0, 2건이면 1', async () => {
	const cwd = makeProj('editor');
	const one = await run(cwd, ['editor/external.html', '--surface', 'operate', '--widths', '1440', '--expect-blocked', '1']);
	assert.equal(one.code, 0, one.out + one.err);
	const two = await run(cwd, ['editor/external.html', '--surface', 'operate', '--widths', '1440', '--expect-blocked', '2']);
	assert.equal(two.code, 1, two.out);
});

test('RS3 --edit·--states 상태마다 fold 경로 하나, --approve 는 승인 화면 fold 하나, 잘못된 상태 문자열 → 종료코드 2', async () => {
	const cwd = makeProj('editor');
	const states = await run(cwd, ['--edit', 'editor/index.html', '--states', 'w=1440&sel=h1;w=390&sel=h1;w=1440&mode=comment']);
	assert.equal(states.code, 0, states.out + states.err);
	assert.equal(folds(states.out).length, 3);
	for (const f of folds(states.out)) assert.ok(existsSync(f), f);
	assert.match(states.out, /^\[w=390&sel=h1\] (OK|FAIL) design_render/m);
	const approve = await run(cwd, ['--edit', 'editor/index.html', '--approve'], { ASTRONDESIGN_WRITE: 'allow' });
	assert.equal(approve.code, 0, approve.out + approve.err);
	assert.equal(folds(approve.out).length, 1);
	assert.match(approve.out, /^\[approve\] (OK|FAIL) design_render/m);
	const noKey = await run(cwd, ['--edit', 'editor/index.html', '--approve'], { ASTRONDESIGN_WRITE: '' });
	assert.equal(noKey.code, 2);
	for (const bad of ['w=abc', 'x=1', 'w=1440&mode=zoom', '']) {
		const r = await run(cwd, ['--edit', 'editor/index.html', '--states', bad]);
		assert.equal(r.code, 2, `${bad}: ${r.out}${r.err}`);
	}
});

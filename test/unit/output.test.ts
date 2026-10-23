import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { clip, outRoot, callDir } from '../../src/output.ts';
import { subEnv } from '../../src/config.ts';
import { cleanup, makeProj } from '../helpers.ts';

after(cleanup);

test('O1 clip 3800자 이하·머리줄 유지', () => {
	const head = 'OK 요약 줄';
	const out = clip(head + '\n' + 'x'.repeat(10000));
	assert.ok(out.length <= 3800, `길이 ${out.length}`);
	assert.equal(out.split('\n')[0], head);
	assert.match(out, /잘림/);
	assert.equal(clip('짧은 글'), '짧은 글');
});

test('O2 outRoot 기본 경로와 .gitignore', () => {
	delete process.env.ASTRONDESIGN_OUT_DIR;
	const cwd = makeProj();
	const out = outRoot(cwd);
	assert.equal(out, join(cwd, '.astron-logs', 'astrondesign'));
	assert.equal(readFileSync(join(out, '.gitignore'), 'utf8').trim(), '*');
	const custom = join(cwd, 'custom-out');
	process.env.ASTRONDESIGN_OUT_DIR = custom;
	try {
		assert.equal(outRoot(cwd), custom);
		assert.ok(existsSync(join(custom, '.gitignore')));
	} finally {
		delete process.env.ASTRONDESIGN_OUT_DIR;
	}
});

test('O3 callDir 이름 형식', () => {
	const cwd = makeProj();
	const d = callDir('design_lint', cwd);
	assert.ok(existsSync(d));
	assert.match(basename(d), /^\d{8}-\d{6}-design_lint-[0-9a-f]{4}$/);
	assert.equal(join(d, '..'), outRoot(cwd));
});

test('O4 subEnv 허용 목록·홈 격리·텔레메트리·프록시', () => {
	process.env.FAKE_API_KEY = 'secret-value';
	process.env.OPENAI_API_KEY = 'secret-value';
	const out = join(makeProj(), 'out');
	const env = subEnv(out);
	assert.equal(env.FAKE_API_KEY, undefined);
	assert.equal(env.OPENAI_API_KEY, undefined);
	assert.ok(!Object.values(env).includes('secret-value'));
	const home = join(out, '.home');
	for (const k of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) assert.equal(env[k], home, k);
	assert.ok(existsSync(home));
	assert.equal(env.DO_NOT_TRACK, '1');
	assert.equal(env.IMPECCABLE_NO_TELEMETRY, '1');
	assert.equal(env.IMPECCABLE_NO_UPDATE_CHECK, '1');
	assert.match(env.IMPECCABLE_BIN ?? '', /impeccable\.exe$/);
	for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) assert.equal(env[k], 'http://127.0.0.1:9');
	assert.equal(env.NO_PROXY, '127.0.0.1,localhost');
	const allowed = new Set(['SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'COMSPEC', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'DO_NOT_TRACK', 'IMPECCABLE_NO_TELEMETRY', 'IMPECCABLE_NO_UPDATE_CHECK', 'IMPECCABLE_BIN', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']);
	assert.deepEqual(Object.keys(env).filter((k) => !allowed.has(k)), []);
	assert.ok(env.PATH && env.SYSTEMROOT, 'PATH·SYSTEMROOT 전달');
	assert.equal(subEnv(out, { TASTE_SKILL_HISTORY: 'h.json' }).TASTE_SKILL_HISTORY, 'h.json');
});

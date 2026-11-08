import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VENDOR = join(ROOT, 'vendor');
const COMMITS: Record<string, string> = {
	impeccable: '6af45ac9a5eb8792f033d3242f52e99812fd91fa',
	'ui-ux-pro-max': '56ea9cf174ed86786187daa9de0e6247cb0747e4',
	'taste-skill': 'f624f37a8c650b9cc550253104925efe4c8de246',
	'awesome-design-md': '3b605329240ce735b510037cca322f1831fdd7f8'
};
const ENGINE_SHA256 = '981324EA15CC3C107D46B8133B5BE77F639DBCD22E671F1EB7D8C69136E9693B';

type Source = { name: string; repo: string; commit: string; license: string; from: string; to: string; included: string[]; excluded: string[]; modified: boolean; files: Record<string, string> };

/** 폴더 아래 파일을 상대 경로(`/` 구분)로 모두 나열한다. */
function walk(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...walk(p));
		else out.push(relative(VENDOR, p).split('\\').join('/'));
	}
	return out;
}

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const SRC_ROOT = join(tmpdir(), 'design-skills-src');

/** git cat-file --batch 로 여러 `<개정>:<경로>` 의 원본 바이트를 한 번에 읽는다(없으면 null). */
function catBlobs(cwd: string, specs: string[]): (Buffer | null)[] {
	const out = execFileSync('git', ['-C', cwd, 'cat-file', '--batch'], { input: specs.join('\n') + '\n', maxBuffer: 1 << 28 });
	const res: (Buffer | null)[] = [];
	let i = 0;
	for (let k = 0; k < specs.length; k++) {
		const nl = out.indexOf(10, i);
		const head = out.subarray(i, nl).toString('utf8');
		i = nl + 1;
		if (head.endsWith(' missing')) {
			res.push(null);
			continue;
		}
		const size = Number(head.split(' ')[2]);
		res.push(out.subarray(i, i + size));
		i += size + 1;
	}
	return res;
}

/** 원본 폴더가 그 커밋을 가진 독립 git 저장소면 null, 아니면 원본 blob 비교를 건너뛸 사유를 돌려준다. */
function srcRepoSkip(dir: string, commit: string): string | null {
	if (!existsSync(dir)) return '원본 없음';
	const top = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
	if (top.status !== 0) return `git 저장소 아님(${top.status}): ${(top.stderr ?? '').trim().split('\n')[0]}`;
	const norm = (p: string) => {
		const r = realpathSync.native(p).replace(/[\\/]+$/, '');
		return process.platform === 'win32' ? r.toLowerCase() : r;
	};
	if (norm(top.stdout.trim()) !== norm(dir)) return '상위 저장소에 속한 폴더';
	const has = spawnSync('git', ['-C', dir, 'cat-file', '-e', `${commit}^{commit}`]);
	return has.status === 0 ? null : '커밋 없음';
}

test('V1 원본 4종 LICENSE 보존', () => {
	for (const f of ['impeccable/LICENSE', 'impeccable/NOTICE.md', 'ui-ux-pro-max/LICENSE', 'taste-skill/LICENSE', 'awesome-design-md/LICENSE']) {
		const p = join(VENDOR, f);
		assert.ok(existsSync(p), `없음: ${f}`);
		assert.ok(readFileSync(p, 'utf8').length > 100, `비어 있음: ${f}`);
	}
	assert.match(readFileSync(join(VENDOR, 'impeccable/LICENSE'), 'utf8'), /Apache License/);
	for (const f of ['ui-ux-pro-max/LICENSE', 'taste-skill/LICENSE', 'awesome-design-md/LICENSE']) assert.match(readFileSync(join(VENDOR, f), 'utf8'), /MIT License|Permission is hereby granted/);
});

test('V2 SOURCES.json 커밋 고정·sha256 일치', () => {
	const sources = JSON.parse(readFileSync(join(VENDOR, 'SOURCES.json'), 'utf8')) as Source[];
	assert.deepEqual(sources.map((s) => s.name).sort(), Object.keys(COMMITS).sort());
	const listed = new Set<string>();
	for (const s of sources) {
		assert.equal(s.commit, COMMITS[s.name], `${s.name} 커밋`);
		assert.equal(s.modified, false);
		assert.match(s.repo, /^https:\/\/github\.com\//);
		assert.ok(Object.keys(s.files).length > 0);
		for (const [rel, hash] of Object.entries(s.files)) {
			const p = join(VENDOR, rel);
			assert.ok(existsSync(p), `없음: ${rel}`);
			assert.equal(sha256(p), hash, `해시 불일치: ${rel}`);
			listed.add(rel);
		}
	}
	const actual = walk(VENDOR).filter((f) => f !== 'SOURCES.json');
	assert.deepEqual(actual.filter((f) => !listed.has(f)), [], 'SOURCES.json 에 없는 파일');
});

test('V3 네트워크 스크립트 제외(taste assets.mjs 없음)', () => {
	assert.equal(existsSync(join(VENDOR, 'taste-skill/scripts/assets.mjs')), false);
	assert.equal(existsSync(join(VENDOR, 'taste-skill/scripts/lib/cdp.mjs')), true, 'scripts/lib 는 포함');
	assert.equal(existsSync(join(VENDOR, 'taste-skill/scripts/draw.mjs')), true);
});

test('V4 제외 대상 없음(full-output-enforcement·design·ui-styling·scripts/tests)', () => {
	const all = walk(VENDOR);
	const banned = /full-output-enforcement|(^|\/)evals\/|^ui-ux-pro-max\/scripts\/tests\/|^ui-ux-pro-max\/scripts\/validate_data\.py$|^impeccable\/(scripts|agents)\/|(^|\/)ui-styling\/|^ui-ux-pro-max\/design\//;
	assert.deepEqual(all.filter((f) => banned.test(f)), []);
	const readmes = all.filter((f) => /(^|\/)README\.md$/.test(f));
	assert.deepEqual(readmes.sort(), ['awesome-design-md/README.md', 'taste-skill/README.md']);
	assert.equal(all.filter((f) => /^awesome-design-md\/design-md\/[^/]+\/DESIGN\.md$/.test(f)).length, 84);
});

test('V5 엔진 exe SHA256 일치', () => {
	const exe = join(ROOT, 'node_modules/@impeccable/cli-windows-x64/bin/impeccable.exe');
	assert.ok(existsSync(exe), '엔진 없음');
	assert.equal(sha256(exe).toUpperCase(), ENGINE_SHA256);
});

test('V6 SOURCES.json 해시가 인덱스 blob·원본 커밋 blob 과 일치', (t) => {
	const sources = JSON.parse(readFileSync(join(VENDOR, 'SOURCES.json'), 'utf8')) as Source[];
	const hash = (b: Buffer | null) => (b ? createHash('sha256').update(b).digest('hex') : 'missing');
	for (const s of sources) {
		const rels = Object.keys(s.files);
		const index = catBlobs(ROOT, rels.map((r) => `:vendor/${r}`));
		const badIndex = rels.filter((r, k) => hash(index[k]) !== s.files[r]);
		assert.equal(badIndex.length, 0, `${s.name} 인덱스 blob 불일치 ${badIndex.length}/${rels.length}: ${badIndex.slice(0, 3).join(', ')}`);
		const repo = join(SRC_ROOT, s.repo.split('/').pop()!);
		const skip = srcRepoSkip(repo, s.commit);
		if (skip) {
			t.diagnostic(`원본 blob 비교 생략(${skip}): ${repo}`);
			continue;
		}
		const toRel = s.to.replace(/^vendor\//, '');
		const rootNames = s.included.filter((x) => x.startsWith('(repo root) ')).map((x) => x.slice('(repo root) '.length));
		const srcPath = (r: string) => {
			const parts = r.split('/');
			if (parts.length === 2 && rootNames.includes(parts[1])) return parts[1];
			return `${s.from}/${r.slice(toRel.length + 1)}`;
		};
		const orig = catBlobs(repo, rels.map((r) => `${s.commit}:${srcPath(r)}`));
		const badOrig = rels.filter((r, k) => hash(orig[k]) !== s.files[r]);
		assert.equal(badOrig.length, 0, `${s.name} 원본 blob 불일치 ${badOrig.length}/${rels.length}: ${badOrig.slice(0, 3).join(', ')}`);
	}
});

test('V7 원본 폴더가 커밋을 가진 독립 git 저장소가 아니면 원본 비교를 건너뛴다', (t) => {
	const commit = COMMITS.impeccable;
	assert.equal(srcRepoSkip(join(tmpdir(), `v7-none-${process.pid}`), commit), '원본 없음');
	const base = mkdtempSync(join(tmpdir(), 'v7-'));
	t.after(() => rmSync(base, { recursive: true, force: true }));
	const empty = join(base, 'empty');
	mkdirSync(empty);
	assert.match(srcRepoSkip(empty, commit) ?? '', /^(git 저장소 아님|상위 저장소)/, '빈 폴더');
	const headless = join(base, 'headless');
	mkdirSync(join(headless, '.git', 'objects'), { recursive: true });
	mkdirSync(join(headless, '.git', 'refs'));
	assert.match(srcRepoSkip(headless, commit) ?? '', /^(git 저장소 아님|상위 저장소)/, 'HEAD 없는 .git');
	assert.equal(srcRepoSkip(join(ROOT, 'test'), commit), '상위 저장소에 속한 폴더');
	const fresh = join(base, 'fresh');
	mkdirSync(fresh);
	execFileSync('git', ['-C', fresh, '-c', 'init.defaultBranch=main', 'init', '-q']);
	assert.equal(srcRepoSkip(fresh, commit), '커밋 없음', 'git init 만 한 폴더');
	const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	assert.equal(srcRepoSkip(ROOT, head), null, '끝 구분자 포함 ROOT');
	assert.equal(srcRepoSkip(ROOT.replace(/[\\/]+$/, ''), head), null, '끝 구분자 없는 ROOT');
	if (process.platform === 'win32') assert.equal(srcRepoSkip(ROOT.toUpperCase(), head), null, '대문자 ROOT');
	assert.equal(srcRepoSkip(ROOT, '0'.repeat(40)), '커밋 없음', '없는 커밋');
});

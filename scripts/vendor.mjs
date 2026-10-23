// 로컬 원본 저장소 4종을 고정 커밋으로 확인하고 그 커밋의 blob 바이트를 vendor/ 에 그대로 쓴 뒤 SOURCES.json 을 쓴다.
//   node scripts/vendor.mjs [원본 루트]   (기본: %TEMP%\design-skills-src)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VENDOR = join(ROOT, 'vendor');
const SRC_ROOT = process.argv[2] || join(tmpdir(), 'design-skills-src');

const SOURCES = [
	{
		name: 'impeccable', dir: 'impeccable', repo: 'https://github.com/pbakaus/impeccable', commit: '6af45ac9a5eb8792f033d3242f52e99812fd91fa', license: 'Apache-2.0',
		from: '.agents/skills/impeccable', to: 'impeccable',
		include: ['SKILL.md', 'reference/'], rootFiles: ['LICENSE', 'NOTICE.md'],
		excluded: ['scripts/**', 'agents/**']
	},
	{
		name: 'ui-ux-pro-max', dir: 'ui-ux-pro-max-skill', repo: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill', commit: '56ea9cf174ed86786187daa9de0e6247cb0747e4', license: 'MIT',
		from: '.claude/skills/ui-ux-pro-max', to: 'ui-ux-pro-max',
		include: ['SKILL.md', 'data/', 'references/', 'scripts/core.py', 'scripts/search.py', 'scripts/design_system.py', 'scripts/reasoning_contract.py'], rootFiles: ['LICENSE'],
		excluded: ['scripts/tests/**', 'scripts/validate_data.py']
	},
	{
		name: 'taste-skill', dir: 'taste-skill', repo: 'https://github.com/Leonxlnx/taste-skill', commit: 'f624f37a8c650b9cc550253104925efe4c8de246', license: 'MIT',
		from: 'skills/taste-skill', to: 'taste-skill',
		include: ['SKILL.md', 'README.md', 'references/', 'library/', 'assets/', 'scripts/draw.mjs', 'scripts/lint.mjs', 'scripts/inspect.mjs', 'scripts/lib/'], rootFiles: ['LICENSE'],
		excluded: ['scripts/assets.mjs', 'evals/**']
	},
	{
		name: 'awesome-design-md', dir: 'awesome-design-md', repo: 'https://github.com/VoltAgent/awesome-design-md', commit: '3b605329240ce735b510037cca322f1831fdd7f8', license: 'MIT',
		from: 'design-md', to: 'awesome-design-md/design-md',
		include: ['*/DESIGN.md'], rootFiles: ['LICENSE', 'README.md'], rootTo: 'awesome-design-md',
		excluded: ['*/README.md', 'preview*']
	}
];

/** 포함 규칙 하나를 고정 커밋 트리의 `from` 기준 상대 경로 목록으로 펼친다. */
function expand(tree, rule) {
	if (rule === '*/DESIGN.md') return tree.filter((p) => /^[^/]+\/DESIGN\.md$/.test(p));
	if (rule.endsWith('/')) return tree.filter((p) => p.startsWith(rule));
	if (!tree.includes(rule)) throw new Error(`원본에 없음: ${rule}`);
	return [rule];
}

/** 원본 커밋의 blob 바이트를 줄 끝 변환 없이 그대로 쓰고 sha256 을 기록한다. */
function copy(repoDir, commit, srcPath, dest, files, rel) {
	const bytes = execFileSync('git', ['-C', repoDir, 'show', `${commit}:${srcPath}`], { maxBuffer: 1 << 28 });
	mkdirSync(dirname(dest), { recursive: true });
	writeFileSync(dest, bytes);
	files[rel] = createHash('sha256').update(bytes).digest('hex');
}

const manifest = [];
for (const s of SOURCES) {
	const repoDir = join(SRC_ROOT, s.dir);
	const head = execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	if (head !== s.commit) {
		console.error(`${s.name}: 커밋 불일치 ${head} != ${s.commit}`);
		process.exit(1);
	}
	const tree = execFileSync('git', ['-C', repoDir, 'ls-tree', '-r', '-z', '--name-only', s.commit, '--', `${s.from}/`], { encoding: 'utf8', maxBuffer: 1 << 26 })
		.split('\0').filter(Boolean).map((p) => p.slice(s.from.length + 1));
	const files = {};
	for (const rule of s.include) for (const rel of expand(tree, rule)) copy(repoDir, s.commit, `${s.from}/${rel}`, join(VENDOR, s.to, rel), files, `${s.to}/${rel}`);
	const rootTo = s.rootTo || s.to;
	for (const f of s.rootFiles) copy(repoDir, s.commit, f, join(VENDOR, rootTo, f), files, `${rootTo}/${f}`);
	manifest.push({ name: s.name, repo: s.repo, commit: s.commit, license: s.license, from: s.from, to: `vendor/${s.to}`, included: [...s.include, ...s.rootFiles.map((f) => `(repo root) ${f}`)], excluded: s.excluded, modified: false, files });
	console.log(`${s.name}: ${Object.keys(files).length} files`);
}
writeFileSync(join(VENDOR, 'SOURCES.json'), JSON.stringify(manifest, null, '\t') + '\n');
console.log('vendor/SOURCES.json written');

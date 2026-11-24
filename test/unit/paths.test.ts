import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { get } from 'node:http';
import { join, relative } from 'node:path';
import { resolveTarget } from '../../src/browser.ts';
import { insideCwd, lintTargets, serveStatic } from '../../src/paths.ts';
import { ToolError } from '../../src/output.ts';
import { cleanup, makeProj } from '../helpers.ts';

after(cleanup);

async function policy(roots: unknown, fn: () => void | Promise<void>): Promise<void> {
	const old = process.env.ASTRONDESIGN_ALLOWED_ROOTS;
	if (roots === undefined) delete process.env.ASTRONDESIGN_ALLOWED_ROOTS;
	else process.env.ASTRONDESIGN_ALLOWED_ROOTS = typeof roots === 'string' ? roots : JSON.stringify(roots);
	try { await fn(); } finally {
		if (old === undefined) delete process.env.ASTRONDESIGN_ALLOWED_ROOTS;
		else process.env.ASTRONDESIGN_ALLOWED_ROOTS = old;
	}
}

const denied = (fn: () => unknown) => assert.throws(fn, (e: unknown) => e instanceof ToolError && e.code === 'E_PATH');

test('lint_directory_validates_all_descendants_and_allows_shared_internal_links', async () => {
	const cwd = proj(), extra = proj(), outside = proj();
	await policy([cwd, extra], () => {
		const site = join(extra, 'site');
		mkdirSync(join(site, 'deep'));
		writeFileSync(join(site, 'deep/local.css'), '.local { color: red }');
		symlinkSync(join(site, 'deep/local.css'), join(site, 'local.css'), 'file');
		symlinkSync(join(site, 'deep'), join(site, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
		assert.deepEqual(lintTargets([relative(cwd, site), join(site, 'index.html')], cwd), [site, join(site, 'index.html')]);
		symlinkSync(outside, join(site, 'deep/escape'), process.platform === 'win32' ? 'junction' : 'dir');
		denied(() => lintTargets([site], cwd));
		unlinkSync(join(site, 'deep/escape'));
		symlinkSync(join(outside, 'site/index.html'), join(site, 'deep/escape.html'), 'file');
		denied(() => lintTargets([site], cwd));
		unlinkSync(join(site, 'deep/escape.html'));
		assert.deepEqual(lintTargets([site], cwd), [site]);
	});
});

test('lint_directory_rejects_cycles_and_rechecks_after_link_removal', async () => {
	const cwd = proj(), site = join(cwd, 'site');
	await policy([cwd], () => {
		symlinkSync(site, join(site, 'loop'), process.platform === 'win32' ? 'junction' : 'dir');
		denied(() => lintTargets([site], cwd));
		unlinkSync(join(site, 'loop'));
		assert.deepEqual(lintTargets([site], cwd), [site]);
	});
});

test('allowed_roots_accepts_absolute_relative_and_directory_targets', async () => {
	const cwd = proj(), extra = proj();
	await policy([cwd, extra], async () => {
		for (const root of [cwd, extra]) {
			const file = join(root, 'site', 'index.html');
			for (const p of [file, relative(cwd, file)]) assert.equal(insideCwd(p, cwd), file);
			const srv = await resolveTarget(join(root, 'site'), false, cwd);
			try { assert.match(await (await fetch(srv.url)).text(), /<h1>hi/); } finally { await srv.close(); }
		}
	});
});

test('allowed_roots_preserves_special_characters_and_dotdot_prefix_names', async () => {
	const cwd = proj();
	await policy([cwd], async () => {
		for (const name of ['한글 공백%#.html', '..assets']) {
			const file = join(cwd, name); writeFileSync(file, name);
			assert.equal(insideCwd(name, cwd), file);
			const srv = await resolveTarget(file, false, cwd);
			try { assert.equal(await (await fetch(srv.url)).text(), name); } finally { await srv.close(); }
		}
	});
});

test('allowed_roots_invalid_policy_falls_back_to_cwd', async () => {
	const cwd = proj(), extra = proj();
	for (const value of [undefined, '', '[]', '{', '{}', JSON.stringify([cwd, 4]), JSON.stringify([extra, 'relative'])]) {
		await policy(value, () => {
			assert.equal(insideCwd('site/index.html', cwd), join(cwd, 'site/index.html'));
			denied(() => insideCwd(join(extra, 'site/index.html'), cwd));
		});
	}
});

test('allowed_roots_rejects_outside_prefix_siblings_drives_and_missing_files', async () => {
	const cwd = proj(), other = proj();
	mkdirSync(cwd + '-sibling'); writeFileSync(cwd + '-sibling/file.html', 'outside');
	try {
		await policy([cwd], () => {
			for (const p of [join(other, 'site/index.html'), cwd + '-sibling/file.html', 'site/missing.html', process.platform === 'win32' ? 'Z:\\missing.html' : '/missing.html']) denied(() => insideCwd(p, cwd));
		});
	} finally { const { rmSync } = await import('node:fs'); rmSync(cwd + '-sibling', { recursive: true }); }
});

test('allowed_roots_rejects_symlink_and_junction_escape', async () => {
	const cwd = proj(), outside = proj();
	await policy([cwd], async () => {
		for (const type of ['dir', ...(process.platform === 'win32' ? ['junction'] : [])] as ('dir' | 'junction')[]) {
			const link = join(cwd, 'escape-' + type);
			symlinkSync(outside, link, type);
			denied(() => insideCwd(join(link, 'site/index.html'), cwd));
			await assert.rejects(resolveTarget(link, false, cwd), (e: unknown) => e instanceof ToolError && e.code === 'E_PATH');
		}
		const link = join(cwd, 'linked.html'); symlinkSync(join(outside, 'site/index.html'), link, 'file');
		denied(() => insideCwd(link, cwd));
		mkdirSync(join(cwd, 'index-link')); symlinkSync(join(outside, 'site/index.html'), join(cwd, 'index-link/index.html'), 'file');
		await assert.rejects(resolveTarget(join(cwd, 'index-link'), false, cwd), (e: unknown) => e instanceof ToolError && e.code === 'E_PATH');
	});
});

test('allowed_roots_selects_deepest_root_independent_of_order', async () => {
	const cwd = proj(), nested = join(cwd, 'site');
	for (const roots of [[cwd, nested, cwd], [nested, cwd]]) await policy(roots, async () => {
		const srv = await resolveTarget(join(nested, 'index.html'), false, cwd);
		try { assert.equal(new URL(srv.url).pathname, '/index.html'); assert.equal(await status(srv.url, '/..%2fsecret.txt'), 403); } finally { await srv.close(); }
	});
});

test('static_server_rejects_encoded_traversal_and_symlink_assets', async () => {
	const cwd = proj(), outside = proj();
	for (const name of ['escape.css', 'escape.png']) symlinkSync(join(outside, 'secret.txt'), join(cwd, 'site', name), 'file');
	await policy([cwd, outside], async () => {
		const srv = await serveStatic(join(cwd, 'site'), join(cwd, 'site/index.html'));
		try {
			for (const path of ['/..%2fsecret.txt', '/..%5csecret.txt', '/escape.css', '/escape.png']) {
				assert.equal(await status(srv.url, path), 403, path);
				assert.doesNotMatch(await (await fetch(new URL(path, srv.url))).text(), /secret/);
			}
		} finally { await srv.close(); }
	});
});

test('static_server_rechecks_retargeted_symlinks', async () => {
	const cwd = proj(), outside = proj(), link = join(cwd, 'site/asset.txt');
	symlinkSync(join(cwd, 'site/index.html'), link, 'file');
	const srv = await serveStatic(join(cwd, 'site'), join(cwd, 'site/index.html'));
	try {
		assert.equal(await status(srv.url, '/asset.txt'), 200);
		unlinkSync(link); symlinkSync(join(outside, 'secret.txt'), link, 'file');
		assert.equal(await status(srv.url, '/asset.txt'), 403);
	} finally { await srv.close(); }
});

function proj(): string {
	const d = makeProj();
	mkdirSync(join(d, 'site'), { recursive: true });
	writeFileSync(join(d, 'site', 'index.html'), '<h1>hi</h1>');
	writeFileSync(join(d, 'secret.txt'), 'secret');
	return d;
}

const status = (url: string, path: string) => new Promise<number>((resolve, reject) => {
	const u = new URL(url);
	get({ host: u.hostname, port: u.port, path }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }).on('error', reject);
});

test('PA1 cwd 밖 경로 거부', () => {
	const cwd = proj();
	assert.equal(insideCwd('site/index.html', cwd), join(cwd, 'site', 'index.html'));
	for (const bad of ['..\\outside.html', 'C:\\Windows\\win.ini', 'site/none.html']) {
		assert.throws(() => insideCwd(bad, cwd), (e: unknown) => e instanceof ToolError && e.code === 'E_PATH', bad);
	}
});

test('PA2 정적 서버 경로 이탈 403', async () => {
	const cwd = proj();
	const srv = await serveStatic(join(cwd, 'site'), join(cwd, 'site', 'index.html'));
	try {
		assert.match(srv.url, /^http:\/\/127\.0\.0\.1:\d+\/index\.html$/);
		assert.equal(await status(srv.url, '/index.html'), 200);
		assert.equal(await status(srv.url, '/..%2fsecret.txt'), 403);
		assert.equal(await status(srv.url, '/..%5csecret.txt'), 403);
		assert.equal(await status(srv.url, '/none.html'), 404);
	} finally {
		await srv.close();
	}
});

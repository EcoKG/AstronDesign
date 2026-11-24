import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cleanup, makeProj, startServer, textOf, type Client } from '../helpers.ts';
import { getBrowser, closeBrowser } from '../../src/browser.ts';

after(cleanup);

function fixture(label: string): string {
	const root = makeProj();
	mkdirSync(join(root, 'site'));
	writeFileSync(join(root, 'site/index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/root.css"></head><body><h1>' + label + '</h1><img alt="fixture" src="/root.svg"></body></html>');
	writeFileSync(join(root, 'root.css'), 'h1{color:rgb(12, 34, 56)}img{width:73px;height:41px}');
	writeFileSync(join(root, 'root.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="73" height="41"><rect width="73" height="41" fill="red"/></svg>');
	return root;
}

async function server(cwd: string, roots: string[], fn: (c: Client) => Promise<void>): Promise<void> {
	const c = await startServer(cwd, { ASTRONDESIGN_ALLOWED_ROOTS: JSON.stringify(roots) });
	try { await fn(c); } finally { await c.close(); }
}

async function call(c: Client, tool: string, path: string) {
	return c.call(tool, tool === 'design_lint' ? { paths: [path], surface: 'read', engines: ['impeccable'] } : { target: path, surface: 'read', widths: [390], checks: ['impeccable'], wait_ms: 0, inline_image: false });
}

function report(r: Awaited<ReturnType<typeof call>>): any {
	assert.ok(!r.isError, textOf(r));
	const match = /^report: (.+)$/m.exec(textOf(r));
	assert.ok(match, textOf(r));
	return JSON.parse(readFileSync(match[1].trim(), 'utf8'));
}

test('mcp_lint_render_enforces_session_specific_allowed_roots', async () => {
	const master = fixture('MASTER_MARKER'), node = fixture('NODE_MARKER'), outsider = fixture('OTHER_USER');
	symlinkSync(outsider, join(master, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
	symlinkSync(join(outsider, 'site/index.html'), join(master, 'escape.html'), 'file');
	await server(master, [master, node], async (c) => {
		for (const tool of ['design_lint', 'design_render']) {
			for (const root of [master, node]) for (const p of [join(root, 'site/index.html'), relative(master, join(root, 'site/index.html')), join(root, 'site')]) {
				const rep = report(await call(c, tool, p));
				if (tool === 'design_render') assert.match(readFileSync(rep.dom, 'utf8'), new RegExp(root === master ? 'MASTER_MARKER' : 'NODE_MARKER'));
			}
			for (const p of [join(outsider, 'site/index.html'), join(master, 'escape/site/index.html'), join(master, 'escape.html')]) {
				const r = await call(c, tool, p); assert.equal(r.isError, true); assert.match(textOf(r), /E_PATH/);
			}
		}
	});
});

test('mcp_lint_directory_rejects_nested_symlink_and_junction_escape', async (t) => {
	const linkTypes = process.platform === 'win32' ? ['file', 'dir', 'junction'] as const : ['file', 'dir'] as const;
	for (const type of linkTypes) await t.test(type, async () => {
		const master = fixture('MASTER'), allowed = fixture('ALLOWED'), outside = fixture('OUTSIDE_SOURCE');
		writeFileSync(join(outside, 'external-only.css'), '.external { font-family: monospace; background: linear-gradient(red, blue); }');
		mkdirSync(join(allowed, 'site/deep'));
		symlinkSync(type === 'file' ? join(outside, 'external-only.css') : outside, join(allowed, 'site/deep', type === 'file' ? 'escape.css' : 'escape'), type);
		await server(master, [master, allowed], async (c) => {
			for (const engines of [['taste'], ['impeccable'], undefined]) {
				for (const path of [join(allowed, 'site'), relative(master, join(allowed, 'site'))]) {
					const r = await c.call('design_lint', { paths: [path], surface: 'persuade', ...(engines ? { engines } : {}) });
					assert.equal(r.isError, true, '디렉터리 내부 링크를 엔진 실행 전에 거절해야 함: ' + textOf(r));
					assert.match(textOf(r), /E_PATH/);
					assert.doesNotMatch(textOf(r), /^report:/m);
				}
			}
		});
	});
});

test('mcp_lint_directory_preserves_valid_nested_files_and_internal_links', async () => {
	const master = fixture('MASTER'), allowed = fixture('ALLOWED');
	mkdirSync(join(allowed, 'site/deep'));
	writeFileSync(join(allowed, 'site/deep/local.css'), '.local { background: linear-gradient(red, blue); }');
	symlinkSync(join(allowed, 'site/deep/local.css'), join(allowed, 'site/internal.css'), 'file');
	symlinkSync(join(allowed, 'site/deep'), join(allowed, 'site/alias'), process.platform === 'win32' ? 'junction' : 'dir');
	await server(master, [master, allowed], async (c) => {
		const rep = report(await c.call('design_lint', { paths: [join(allowed, 'site')], surface: 'persuade', engines: ['taste'] }));
		assert.ok(rep.findings.some((f: any) => /local.css/.test(f.location) && f.sources.includes('taste-lint')), JSON.stringify(rep.findings));
		assert.ok(rep.findings.some((f: any) => /internal.css/.test(f.location)), JSON.stringify(rep.findings));
	});
});

test('mcp_render_serves_assets_from_selected_root', async () => {
	const master = fixture('MASTER_MARKER'), node = fixture('NODE_ASSETS');
	writeFileSync(join(master, 'root.css'), 'h1{color:rgb(99, 88, 77)}');
	await server(master, [master, node], async (c) => {
		const rep = report(await call(c, 'design_render', join(node, 'site/index.html')));
		const dom = readFileSync(rep.dom, 'utf8');
		assert.match(dom, /NODE_ASSETS/); assert.match(dom, /12, 34, 56/); assert.doesNotMatch(dom, /99, 88, 77/);
		assert.ok(existsSync(rep.images[0].fold));
		const { browser } = await getBrowser();
		try {
			const page = await browser.newPage();
			const data = readFileSync(rep.images[0].fold).toString('base64');
			const redPixels = await page.evaluate(async (data) => {
				const image = new Image(); image.src = 'data:image/jpeg;base64,' + data; await image.decode();
				const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
				const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
				const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
				let red = 0;
				for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 180 && pixels[i + 1] < 70 && pixels[i + 2] < 70) red++;
				return red;
			}, data);
			assert.ok(redPixels > 1500 && redPixels < 4000, 'fixture의 73×41 빨간 이미지가 실제 캡처에 있어야 함: ' + redPixels);
		} finally { await closeBrowser(); }
		assert.ok(!rep.findings.some((f: any) => /broken-image/.test(f.id)), JSON.stringify(rep.findings));
	});
});

test('mcp_allowed_roots_isolates_sessions_and_recovers_after_failure', async () => {
	const master = fixture('MASTER'), a = fixture('NODE_A'), b = fixture('NODE_B');
	await Promise.all([[a, b], [b, a]].map(([allowed, forbidden]) => server(master, [master, allowed], async (c) => {
		for (const tool of ['design_lint', 'design_render']) {
			const bad = await call(c, tool, join(forbidden, 'site/index.html'));
			assert.equal(bad.isError, true); assert.match(textOf(bad), /E_PATH/);
			const rep = report(await call(c, tool, join(allowed, 'site/index.html')));
			if (tool === 'design_render') assert.match(readFileSync(rep.dom, 'utf8'), new RegExp(allowed === a ? 'NODE_A' : 'NODE_B'));
		}
	})));
});

test('mcp_allowed_roots_preserves_input_limits_and_empty_path_semantics', async () => {
	const cwd = fixture('LIMITS'); writeFileSync(join(cwd, 'index.html'), '<h1>EMPTY_TARGET</h1>');
	await server(cwd, [cwd], async (c) => {
		for (const n of [1, 20]) report(await c.call('design_lint', { paths: Array(n).fill('site/index.html'), surface: 'read', engines: ['impeccable'] }));
		for (const paths of [[], Array(21).fill('site/index.html'), ['x'.repeat(401)]]) assert.equal((await c.call('design_lint', { paths, surface: 'read' })).isError, true);
		for (const n of [400, 2000]) {
			const r = await call(c, n === 400 ? 'design_lint' : 'design_render', 'x'.repeat(n)); assert.equal(r.isError, true); assert.match(textOf(r), /E_PATH/);
		}
		assert.equal((await call(c, 'design_render', 'x'.repeat(2001))).isError, true);
		report(await call(c, 'design_lint', ''));
		assert.match(readFileSync(report(await call(c, 'design_render', '')).dom, 'utf8'), /EMPTY_TARGET/);
	});
});

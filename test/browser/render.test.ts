import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cleanup, makeProj, startServer, textOf, type Client } from '../helpers.ts';

after(cleanup);

type Finding = { id: string; level: string; sources: string[]; ids: string[]; message: string; overridden_by?: string; conflict?: boolean };
type Report = { findings: Finding[]; blocked: { url: string; type: string }[]; dom?: string; images: { width: number; fold: string; aria?: string }[]; browser: string; counts: Record<string, number> };

/** 서버를 띄워 fn 을 실행하고 브라우저가 남지 않게 바로 닫는다. */
async function withServer(cwd: string, fn: (c: Client) => Promise<void>, env: Record<string, string> = {}): Promise<void> {
	const c = await startServer(cwd, env);
	try {
		await fn(c);
	} finally {
		await c.close();
	}
}

const render = (c: Client, args: Record<string, unknown>) => c.call('design_render', args, 180000);

function reportOf(text: string): Report {
	const m = /^report: (.+)$/m.exec(text);
	assert.ok(m, text.slice(0, 400));
	return JSON.parse(readFileSync(m[1].trim(), 'utf8')) as Report;
}

/** 서버 프로세스의 직속 브라우저 자식 수. */
function browserChildren(pid: number): number {
	const r = spawnSync('powershell', ['-NoProfile', '-Command', `@(Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | Where-Object { $_.Name -match 'chrome|msedge' }).Count`], { encoding: 'utf8' });
	return Number(r.stdout.trim());
}

function hashTree(dir: string, skip: (rel: string) => boolean): Record<string, string> {
	const out: Record<string, string> = {};
	const walk = (d: string) => {
		for (const n of readdirSync(d)) {
			const p = join(d, n);
			const rel = relative(dir, p).split('\\').join('/');
			if (skip(rel)) continue;
			if (statSync(p).isDirectory()) walk(p);
			else out[rel] = createHash('sha256').update(readFileSync(p)).digest('hex');
		}
	};
	walk(dir);
	return out;
}

/** dom.html 의 인라인 style 본문. */
const inlined = (dom: string) => /<style data-astrondesign-inlined[^>]*>([\s\S]*?)<\/style>/.exec(dom)?.[1] ?? '';

test('R1 3폭 fold jpg·report.json', async () => {
	await withServer(makeProj('persuade'), async (c) => {
		const t = textOf(await render(c, { target: 'persuade/index.html', surface: 'persuade' }));
		assert.match(t, /^(OK|FAIL) design_render:/, t.slice(0, 300));
		const rep = reportOf(t);
		assert.deepEqual(rep.images.map((i) => i.width), [1440, 768, 390]);
		for (const i of rep.images) assert.ok(existsSync(i.fold) && /fold-\d+\.jpg$/.test(i.fold), i.fold);
		assert.match(t, /^@1440: load=load screens=\d+ blocked=\d+$/m);
	});
});

test("R2 외부 이미지 요청 차단·목록, 그 이미지로 생긴 broken-image·few-pictures 는 INFO blocked-by-harness 이고 FAIL 수에 들지 않음, 첫 줄 아래에 '외부 자원 n건 차단' 문구", async () => {
	await withServer(makeProj('persuade'), async (c) => {
		const t = textOf(await render(c, { target: 'persuade/index.html', surface: 'persuade', widths: [1440] }));
		const rep = reportOf(t);
		assert.ok(rep.blocked.some((b) => b.url === 'https://example.invalid/a.png' && b.type === 'image'), JSON.stringify(rep.blocked));
		for (const id of ['broken-image', 'few-pictures']) {
			const f = rep.findings.find((x) => x.id === id);
			assert.ok(f, `${id} 없음: ${rep.findings.map((x) => x.id).join(',')}`);
			assert.equal(f.level, 'INFO', id);
			assert.equal(f.overridden_by, 'blocked-by-harness', id);
		}
		assert.equal(rep.counts.FAIL, rep.findings.filter((x) => x.level === 'FAIL').length);
		assert.match(t.split('\n')[1], /외부 자원 \d+건 차단: 실제 화면과 다를 수 있음/);
	});
});

test('R3 외부 URL 대상 → E_NETWORK_DISABLED', async () => {
	await withServer(makeProj(), async (c) => {
		const r = await render(c, { target: 'https://example.com/', surface: 'persuade' });
		assert.equal(r.isError, true);
		assert.match(textOf(r), /^ERROR E_NETWORK_DISABLED:/);
		const r2 = await render(c, { target: 'https://example.com/', surface: 'persuade', allow_network: true });
		assert.match(textOf(r2), /^ERROR E_NETWORK_DISABLED:/, '등록 env 없이 인자만으로는 허용 안 함');
	});
});

test("R4 persuade 에서 taste FAIL(still-page·eyebrow 등) / operate 에서 taste 발견 없음·'taste-gate: not-run(surface)'", async () => {
	await withServer(makeProj('persuade', 'operate'), async (c) => {
		const p = reportOf(textOf(await render(c, { target: 'persuade/index.html', surface: 'persuade', widths: [1440] })));
		const gate = p.findings.filter((x) => x.sources.includes('taste-gate'));
		assert.ok(gate.some((x) => x.id === 'still-page' && x.level === 'FAIL'), gate.map((x) => `${x.id}:${x.level}`).join(','));
		assert.ok(gate.filter((x) => x.level === 'FAIL').length >= 2);
		const t = textOf(await render(c, { target: 'operate/index.html', surface: 'operate', widths: [1440], checks: ['taste', 'impeccable', 'a11y'] }));
		assert.match(t, /taste-gate: not-run\(surface\)/);
		assert.equal(reportOf(t).findings.filter((x) => x.sources.includes('taste-gate')).length, 0);
	});
});

test('R5 aria-<w>.yml 생성', async () => {
	await withServer(makeProj('operate'), async (c) => {
		const rep = reportOf(textOf(await render(c, { target: 'operate/index.html', surface: 'operate', widths: [1440, 390] })));
		for (const w of [1440, 390]) {
			const img = rep.images.find((i) => i.width === w);
			assert.ok(img?.aria && img.aria.endsWith(`aria-${w}.yml`) && existsSync(img.aria), JSON.stringify(img));
			assert.match(readFileSync(img.aria, 'utf8'), /heading "Orders"/);
		}
	});
});

test('R6 inline 이미지 base64 ≤350,000자 + text ≤3,800자', async () => {
	await withServer(makeProj('persuade'), async (c) => {
		const r = await render(c, { target: 'persuade/index.html', surface: 'persuade' });
		const img = r.content.find((x) => x.type === 'image');
		assert.ok(img?.data, '이미지 블록 없음');
		assert.equal(img.mimeType, 'image/jpeg');
		assert.ok(img.data.length <= 350000, `${img.data.length}`);
		assert.ok(textOf(r).length <= 3800);
		const off = await render(c, { target: 'persuade/index.html', surface: 'persuade', widths: [390], inline_image: false });
		assert.equal(off.content.some((x) => x.type === 'image'), false);
	});
});

test('R7 IDLE_MS=1500 뒤 브라우저 종료', async () => {
	await withServer(makeProj('operate'), async (c) => {
		await render(c, { target: 'operate/index.html', surface: 'operate', widths: [390] });
		assert.ok(browserChildren(c.pid) >= 1, '렌더 직후 브라우저가 있어야 함');
		await new Promise((r) => setTimeout(r, 4000));
		assert.equal(browserChildren(c.pid), 0);
	}, { ASTRONDESIGN_IDLE_MS: '1500' });
});

test('R8 brand fixture(보라 색·gradient 토큰, 저대비 문단), allow 인자 [\\"contrast\\"]: gate 의 palette-purple·gradient 가 발견 목록에 남아 있고 INFO(overridden_by=P2). gate contrast 는 FAIL 이고 conflict:true(allow 로 지워지거나 낮아지지 않음)', async () => {
	await withServer(makeProj('brand'), async (c) => {
		const rep = reportOf(textOf(await render(c, { target: 'brand/index.html', surface: 'persuade', widths: [1440], design_md: 'brand/DESIGN.md', allow: ['contrast'] })));
		const by = (id: string) => rep.findings.find((x) => x.id === id && x.sources.includes('taste-gate'));
		for (const id of ['palette-purple', 'gradient']) {
			const f = by(id);
			assert.ok(f, `${id} 없음: ${rep.findings.map((x) => `${x.id}(${x.sources})`).join(',')}`);
			assert.equal(f.level, 'INFO', id);
			assert.equal(f.overridden_by, 'P2', id);
		}
		const ct = by('contrast');
		assert.ok(ct);
		assert.equal(ct.level, 'FAIL');
		assert.equal(ct.conflict, true);
	});
});

test('R9 링크 CSS 반영: external-css/index.html(style.css 에 gradient-text·저대비 규칙)을 persuade 로 렌더 → dom.html 에 `data-astrondesign-inlined` 가 있고 그 안에 `background-clip:text` 가 longhand 로 있음(`background:` shorthand 없음), impeccable 출처의 gradient-text·contrast 가 나옴, `harness:css-incomplete` 없음', async () => {
	await withServer(makeProj('external-css'), async (c) => {
		const rep = reportOf(textOf(await render(c, { target: 'external-css/index.html', surface: 'persuade', widths: [1440] })));
		assert.ok(rep.dom && existsSync(rep.dom));
		const css = inlined(readFileSync(rep.dom, 'utf8'));
		assert.match(css, /background-clip:text/);
		assert.doesNotMatch(css, /(^|[;{\s])background\s*:/);
		const imp = rep.findings.filter((x) => x.sources.includes('impeccable')).map((x) => x.id);
		assert.ok(imp.includes('gradient-text') && imp.includes('contrast'), imp.join(','));
		assert.equal(rep.findings.filter((x) => x.id === 'harness:css-incomplete').length, 0);
	});
});

test("R10 외부 시트 차단: external-css/blocked.html(`https://example.invalid/theme.css` 링크) → 차단 목록에 그 URL, WARN `harness:css-incomplete`, 첫 줄 아래에 'CSS 미반영 1'", async () => {
	await withServer(makeProj('external-css'), async (c) => {
		const t = textOf(await render(c, { target: 'external-css/blocked.html', surface: 'operate', widths: [1440] }));
		const rep = reportOf(t);
		assert.ok(rep.blocked.some((b) => b.url === 'https://example.invalid/theme.css'));
		const inc = rep.findings.filter((x) => x.id === 'harness:css-incomplete');
		assert.equal(inc.length, 1);
		assert.equal(inc[0].level, 'WARN');
		assert.ok(t.split('\n').slice(1, 6).some((l) => l.startsWith('CSS 미반영 1')), t.slice(0, 400));
	});
});

test('R11 CSSOM 규칙 반영: external-css/cssom.html(스크립트가 insertRule 로 그라디언트 텍스트 규칙 `.g`·`:root{--grad}`·`.v` 를, adoptedStyleSheets 로 저대비 규칙을 넣음)을 persuade 로 렌더 → dom.html 의 `<style data-astrondesign-inlined>` 하나에 `.g`·`.p` 규칙이 있고 다른 `<style>`·`<link>` 는 없음, `.g` 안에 `background-clip:text` 가 longhand 로 있음, impeccable 출처의 gradient-text(`.g`)·contrast 가 나옴, `harness:css-incomplete` 는 정확히 1건이고 message 에 `var-shorthand .v` 가 있음, 인라인 style 에 빈 선언(`/:\\s*(;|\\})/`)이 없음', async () => {
	await withServer(makeProj('external-css'), async (c) => {
		const rep = reportOf(textOf(await render(c, { target: 'external-css/cssom.html', surface: 'persuade', widths: [1440] })));
		assert.ok(rep.dom);
		const dom = readFileSync(rep.dom, 'utf8');
		assert.equal((dom.match(/<style\b/g) ?? []).length, 1);
		assert.equal((dom.match(/<link\b[^>]*stylesheet/g) ?? []).length, 0);
		const css = inlined(dom);
		const g = /\.g\{([^}]*)\}/.exec(css)?.[1] ?? '';
		assert.match(g, /background-clip:text/, css);
		assert.match(css, /\.p\{/);
		assert.doesNotMatch(css, /:\s*(;|\})/);
		const imp = rep.findings.filter((x) => x.sources.includes('impeccable')).map((x) => x.id);
		assert.ok(imp.includes('gradient-text') && imp.includes('contrast'), imp.join(','));
		const inc = rep.findings.filter((x) => x.id === 'harness:css-incomplete');
		assert.equal(inc.length, 1);
		assert.match(inc[0].message, /var-shorthand \.v/);
	});
});

test('W1 프로젝트 파일 불변·새 파일은 OUT 안에만', async () => {
	const cwd = makeProj('persuade', 'brand');
	const before = hashTree(cwd, () => false);
	await withServer(cwd, async (c) => {
		await render(c, { target: 'persuade/index.html', surface: 'persuade', widths: [1440] });
		await render(c, { target: 'brand/index.html', surface: 'operate', widths: [390], design_md: 'brand/DESIGN.md' });
	});
	const after = hashTree(cwd, (rel) => rel.startsWith('.astron-logs/astrondesign'));
	assert.deepEqual(after, before);
	assert.deepEqual(readdirSync(cwd).sort(), ['.astron-logs', 'brand', 'persuade']);
	assert.deepEqual(readdirSync(join(cwd, '.astron-logs')), ['astrondesign']);
});

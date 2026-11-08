import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, makeProj } from '../helpers.ts';
import { approveHeaders, http, styleOp, workApi, workHeaders } from '../editor-helpers.ts';
import { closeEditors, openSession, type Session } from '../../src/editor/session.ts';
import { appendEvents } from '../../src/editor/store.ts';
import { NONCE_TTL_MS, approveApply, checkWritePath, planApply } from '../../src/editor/apply.ts';
import { unifiedDiff } from '../../src/editor/diff.ts';
import { ToolError } from '../../src/output.ts';

afterEach(async () => {
	await closeEditors();
	delete process.env.ASTRONDESIGN_WRITE;
});
after(cleanup);

const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const isCode = (c: string) => (e: unknown) => e instanceof ToolError && e.code === c;
const META = { userAgent: 'astron-test' };

/** 쓰기 키 둘을 켠 세션과 p.low 색 편집 하나. */
async function writable(write = true, allowWrite = true): Promise<{ s: Session; file: string; original: string }> {
	if (write) process.env.ASTRONDESIGN_WRITE = 'allow';
	const proj = makeProj('editor');
	const s = await openSession({ target: 'editor/index.html', surface: 'operate', allowWrite, cwd: proj });
	s.render = async () => 'OK design_render: stub';
	appendEvents(s.dir, [{ type: 'do', op: styleOp({}) }]);
	const file = join(proj, 'editor', 'index.html');
	return { s, file, original: readFileSync(file, 'utf8') };
}

test('AP1 env 쓰기 키 없음 → E_WRITE_DISABLED, 파일 불변', async () => {
	const { s, file } = await writable(false);
	const before = sha(file);
	assert.equal(s.approveUrl, null);
	assert.throws(() => planApply(s), isCode('E_WRITE_DISABLED'));
	assert.throws(() => approveApply(s, 'x', META), isCode('E_WRITE_DISABLED'));
	assert.equal(sha(file), before);
});

test('AP2 env 있음·allow_write 없음 → E_WRITE_DISABLED', async () => {
	const { s, file } = await writable(true, false);
	const before = sha(file);
	assert.equal(s.approveUrl, null);
	assert.throws(() => planApply(s), isCode('E_WRITE_DISABLED'));
	assert.equal(sha(file), before);
});

test('AP3 nonce 재사용 → 거부', async () => {
	const { s, file } = await writable();
	const plan = planApply(s);
	assert.equal(plan.files.length, 1);
	approveApply(s, plan.nonce, META);
	assert.match(readFileSync(file, 'utf8'), /style="color: #595959"/);
	const after = sha(file);
	assert.throws(() => approveApply(s, plan.nonce, META), ToolError);
	assert.equal(sha(file), after);
});

test('AP4 nonce 5분 만료 → 거부', async () => {
	const { s, file } = await writable();
	const before = sha(file);
	assert.equal(NONCE_TTL_MS, 5 * 60 * 1000);
	const plan = planApply(s);
	const t0 = Date.now();
	s.now = () => t0 + NONCE_TTL_MS + 1;
	assert.throws(() => approveApply(s, plan.nonce, META), ToolError);
	assert.equal(sha(file), before);
});

test('AP5 계획 뒤 파일 해시 바뀜 → E_CONFLICT, 파일 불변', async () => {
	const { s, file, original } = await writable();
	const plan = planApply(s);
	const changed = original + '<!-- 외부 수정 -->\n';
	writeFileSync(file, changed);
	assert.throws(() => approveApply(s, plan.nonce, META), isCode('E_CONFLICT'));
	assert.equal(readFileSync(file, 'utf8'), changed);
});

test('AP6 cwd 밖·점 폴더·node_modules·.astron-logs 경로 거부(E_PATH)', () => {
	for (const rel of ['../x.html', '..\\x.html', '/abs/x.html', 'C:/x.html', '.git/x.html', 'a/.hidden/x.html', '.env.html', 'node_modules/a/index.html', 'a/node_modules/b.html', '.astron-logs/x.html']) {
		assert.throws(() => checkWritePath(rel), isCode('E_PATH'), rel);
	}
	assert.doesNotThrow(() => checkWritePath('editor/index.html'));
});

test('AP7 승인 쓰기 → 백업·applied.json 기록, 원자 교체', async () => {
	const { s, file, original } = await writable();
	const plan = planApply(s);
	const r = approveApply(s, plan.nonce, META);
	assert.deepEqual(r.files, ['editor/index.html']);
	assert.equal(readFileSync(join(r.backup, 'editor', 'index.html'), 'utf8'), original);
	const log = JSON.parse(readFileSync(join(s.dir, 'applied.json'), 'utf8'));
	assert.equal(log.length, 1);
	assert.equal(log[0].userAgent, 'astron-test');
	assert.equal(log[0].files[0].rel, 'editor/index.html');
	assert.equal(log[0].files[0].after, sha(file));
	assert.deepEqual(readdirSync(join(file, '..')).sort(), ['chart.svg', 'external.html', 'hostile.html', 'index.html', 'react.html', 'script-made.html']);
	assert.equal(planApply(s).files.length, 0, '적용한 편집은 다시 계획되지 않음');
});

test('AP8 동시 승인 2건 → 1건만 성공', async () => {
	const { s } = await writable();
	const plan = JSON.parse((await http(`${s.approveOrigin}/api/plan`, { method: 'POST', headers: approveHeaders(s), body: '{}' })).body);
	const body = JSON.stringify({ nonce: plan.nonce });
	const same = await Promise.all([1, 2].map(() => http(`${s.approveOrigin}/api/approve`, { method: 'POST', headers: approveHeaders(s), body })));
	assert.deepEqual(same.map((r) => r.status).sort(), [200, 409]);
	appendEvents(s.dir, [{ type: 'do', op: styleOp({ prop: 'font-size', before: '', after: '20px', attr: 'color: #595959' }) }]);
	const p1 = planApply(s);
	const p2 = planApply(s);
	const two = await Promise.all([p1, p2].map((p) => http(`${s.approveOrigin}/api/approve`, { method: 'POST', headers: approveHeaders(s), body: JSON.stringify({ nonce: p.nonce }) })));
	assert.deepEqual(two.map((r) => r.status).sort(), [200, 409]);
	assert.match(two.find((r) => r.status === 409)!.body, /E_CONFLICT/);
	assert.equal(JSON.parse(readFileSync(join(s.dir, 'applied.json'), 'utf8')).length, 2);
});

test('AP9 대상 출처(작업 포트) 스크립트가 parent 주소를 읽어 승인 API 호출 → 거부(토큰 없음·Origin 다름), 원본 해시 불변, applied.json 없음', async () => {
	const { s, file } = await writable();
	const before = sha(file);
	const plan = planApply(s);
	const body = JSON.stringify({ nonce: plan.nonce });
	const tries: Record<string, string>[] = [
		{ origin: s.workOrigin, 'sec-fetch-site': 'same-site', 'content-type': 'text/plain' },
		{ ...approveHeaders(s), origin: s.workOrigin, 'sec-fetch-site': 'same-site' },
		{ ...approveHeaders(s), 'x-astron-approve': 'guess' }
	];
	for (const headers of tries) {
		for (const p of ['plan', 'approve']) {
			const r = await http(`${s.approveOrigin}/api/${p}`, { method: 'POST', headers, body });
			assert.equal(r.status, 403, `${p} ${JSON.stringify(headers)}`);
		}
	}
	assert.equal(sha(file), before);
	assert.equal(existsSync(join(s.dir, 'applied.json')), false);
	assert.ok(readFileSync(join(s.dir, 'denied.jsonl'), 'utf8').includes(s.workOrigin));
});

test('AP10 승인 화면 diff 와 실제 쓰인 바이트 diff 가 같고, 자동 저장 API 로 끼워 넣은 편집도 diff 에 모두 보임', async () => {
	const { s, file, original } = await writable();
	const injected = styleOp({ path: [1, 0, 0], tag: 'h1', selector: 'h1', before: '', after: 'rgb(200, 0, 0)', attr: null });
	const ins = await http(workApi(s, 'changes'), { method: 'POST', headers: workHeaders(s), body: JSON.stringify({ events: [{ type: 'do', op: injected }] }) });
	assert.equal(ins.status, 200);
	const plan = JSON.parse((await http(`${s.approveOrigin}/api/plan`, { method: 'POST', headers: approveHeaders(s), body: '{}' })).body);
	assert.match(plan.diff, /\+\t<h1 style="color: rgb\(200, 0, 0\)">/);
	assert.match(plan.diff, /\+\t<p class="low" style="color: #595959">/);
	const r = await http(`${s.approveOrigin}/api/approve`, { method: 'POST', headers: approveHeaders(s), body: JSON.stringify({ nonce: plan.nonce }) });
	assert.equal(r.status, 200, r.body);
	assert.equal(JSON.parse(r.body).render, 'OK design_render: stub');
	assert.equal(unifiedDiff('editor/index.html', original, readFileSync(file, 'utf8')), plan.diff);
});

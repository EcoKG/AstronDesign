// 렌더 검증 스크립트: src/server.ts 를 stdio 로 띄워 design_edit·design_render 를 MCP 와 같은 경로로 부르고 첫 줄·fold·report·차단 수를 출력한다.
// 사용: node scripts/render.mjs <target> [--surface operate] [--widths 1440,390] [--expect-blocked 0]
//       node scripts/render.mjs --edit <target> [--states "w=1440&sel=h1;w=390&mode=comment"] [--approve]
// 종료코드: 0 정상, 1 예상과 다른 외부 요청 차단 수, 2 인자 오류.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STATE_KEYS = new Set(['w', 'sel', 'mode']);
const SURFACES = new Set(['persuade', 'operate', 'read', 'experience']);

/** 인자 오류: 사유를 쓰고 종료코드 2. */
function usage(msg) {
	console.error(`render.mjs: ${msg}`);
	process.exit(2);
}

/** 인자를 읽는다. */
function parseArgs(argv) {
	const a = { target: null, edit: null, states: null, approve: false, surface: 'operate', widths: null, expect: 0 };
	for (let i = 0; i < argv.length; i++) {
		const k = argv[i];
		const val = () => (i + 1 < argv.length ? argv[++i] : usage(`${k} 값 없음`));
		if (k === '--edit') a.edit = val();
		else if (k === '--states') a.states = val();
		else if (k === '--approve') a.approve = true;
		else if (k === '--surface') a.surface = val();
		else if (k === '--widths') a.widths = val().split(',').map(Number);
		else if (k === '--expect-blocked') a.expect = Number(val());
		else if (k.startsWith('--')) usage(`모르는 옵션 ${k}`);
		else a.target = k;
	}
	if (!a.target && !a.edit) usage('target 또는 --edit <target> 이 필요합니다');
	if (!SURFACES.has(a.surface)) usage(`surface 는 ${[...SURFACES].join('·')} 중 하나`);
	if (a.widths && !a.widths.every((w) => Number.isInteger(w) && w >= 320 && w <= 2560)) usage('widths 는 320~2560 정수 목록');
	if (!Number.isInteger(a.expect) || a.expect < 0) usage('--expect-blocked 는 0 이상 정수');
	if (a.approve && process.env.ASTRONDESIGN_WRITE !== 'allow') usage('--approve 는 env ASTRONDESIGN_WRITE=allow 가 있어야 합니다');
	return a;
}

/** 상태 문자열("w=1440&sel=h1;w=390")을 검사해 질의 문자열 목록으로 바꾼다. */
function parseStates(text) {
	const states = text.split(';').map((s) => s.trim());
	if (!states.length || states.some((s) => !s)) usage(`잘못된 상태 문자열: "${text}"`);
	for (const s of states) {
		const q = new URLSearchParams(s);
		for (const [k, v] of q) {
			if (!STATE_KEYS.has(k)) usage(`상태 키는 w·sel·mode 만: ${k}`);
			if (k === 'w' && !(/^\d+$/.test(v) && Number(v) >= 320 && Number(v) <= 2560)) usage(`w 는 320~2560 정수: ${v}`);
			if (k === 'mode' && v !== 'edit' && v !== 'comment') usage(`mode 는 edit·comment: ${v}`);
		}
	}
	return states;
}

/** stdio MCP 서버를 띄우고 요청 함수를 돌려준다. */
function startServer() {
	const server = fileURLToPath(new URL('../src/server.ts', import.meta.url));
	const child = spawn(process.execPath, [server], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
	const waiting = new Map();
	let buf = '';
	let id = 0;
	child.stdout.setEncoding('utf8');
	child.stdout.on('data', (d) => {
		buf += d;
		let i;
		while ((i = buf.indexOf('\n')) >= 0) {
			const line = buf.slice(0, i);
			buf = buf.slice(i + 1);
			try {
				const msg = JSON.parse(line);
				waiting.get(msg.id)?.(msg);
			} catch {}
		}
	});
	const request = (method, params = {}, ms = 300000) => new Promise((resolve, reject) => {
		const n = ++id;
		const t = setTimeout(() => reject(new Error(`timeout ${method}`)), ms);
		waiting.set(n, (m) => { clearTimeout(t); resolve(m); });
		child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n');
	});
	const call = async (name, args) => {
		const r = await request('tools/call', { name, arguments: args });
		return r.result.content.find((c) => c.type === 'text')?.text ?? '';
	};
	return { request, call, close: () => child.stdin.end(), child };
}

/** design_render 한 번: 첫 줄, fold 경로들, report 경로, 차단 수를 출력하고 차단 수를 돌려준다. */
async function render(srv, label, args) {
	const text = await srv.call('design_render', { inline_image: false, ...args });
	const first = text.split('\n')[0];
	console.log(label ? `[${label}] ${first}` : first);
	const report = /^report: (.+)$/m.exec(text)?.[1]?.trim();
	if (!report) {
		console.log(text.split('\n').slice(1, 6).join('\n'));
		return -1;
	}
	const rep = JSON.parse(readFileSync(report, 'utf8'));
	for (const img of rep.images) console.log(`fold: ${img.fold}`);
	console.log(`report: ${report}`);
	console.log(`blocked=${rep.blocked.length}`);
	return rep.blocked.length;
}

const a = parseArgs(process.argv.slice(2));
const states = a.edit && !a.approve ? parseStates(a.states ?? 'w=1440') : [];
const srv = startServer();
let code = 0;
try {
	await srv.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'render.mjs', version: '0' } });
	srv.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
	const counts = [];
	if (a.edit) {
		const text = await srv.call('design_edit', { target: a.edit, surface: a.surface, allow_write: a.approve || undefined });
		const work = /^편집기: (\S+)$/m.exec(text)?.[1];
		if (!work) throw new Error(text.split('\n')[0]);
		console.log(`editor: ${work}`);
		for (const s of states) counts.push(await render(srv, s, { target: `${work}?${s}`, surface: 'operate', widths: [1440], wait_ms: 1500 }));
		if (a.approve) {
			const approve = /^승인 주소: (\S+)$/m.exec(text)?.[1];
			if (!approve) throw new Error('승인 주소 없음: env ASTRONDESIGN_WRITE=allow 확인');
			counts.push(await render(srv, 'approve', { target: approve, surface: 'operate', widths: [1440], wait_ms: 1500 }));
		}
	} else counts.push(await render(srv, '', { target: a.target, surface: a.surface, ...(a.widths ? { widths: a.widths } : {}) }));
	const total = counts.reduce((x, y) => x + Math.max(0, y), 0);
	if (counts.some((c) => c < 0) || total !== a.expect) code = 1;
	if (total !== a.expect) console.log(`차단 ${total}건 ≠ 예상 ${a.expect}건`);
} catch (e) {
	console.log(`FAIL ${e.message}`);
	code = 1;
} finally {
	srv.close();
}
process.exitCode = code;

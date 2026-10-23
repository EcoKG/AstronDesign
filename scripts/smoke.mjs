// 서버를 띄워 initialize → tools/list → design_guide 를 호출하고 결과를 출력한다. 성공하면 마지막 줄이 OK.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const server = fileURLToPath(new URL('../src/server.ts', import.meta.url));
const child = spawn(process.execPath, [server], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const waiting = new Map();
let buf = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (d) => {
	buf += d;
	let i;
	while ((i = buf.indexOf('\n')) >= 0) {
		const msg = JSON.parse(buf.slice(0, i));
		buf = buf.slice(i + 1);
		waiting.get(msg.id)?.(msg);
	}
});
let id = 0;
const request = (method, params = {}) => new Promise((resolve, reject) => {
	const n = ++id;
	const t = setTimeout(() => reject(new Error(`timeout ${method}`)), 15000);
	waiting.set(n, (m) => { clearTimeout(t); resolve(m); });
	child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n');
});

try {
	const t0 = Date.now();
	const init = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
	child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
	const list = await request('tools/list');
	const ms = Date.now() - t0;
	const guide = await request('tools/call', { name: 'design_guide', arguments: {} });
	console.log(`server: ${init.result.serverInfo.name} ${init.result.serverInfo.version} protocol=${init.result.protocolVersion}`);
	console.log(`tools(${list.result.tools.length}): ${list.result.tools.map((t) => t.name).join(', ')}`);
	console.log(`tools/list json: ${JSON.stringify(list.result).length} chars, start→list ${ms}ms`);
	console.log(`design_guide: ${guide.result.content[0].text.split('\n')[0]}`);
	const good = list.result.tools.length === 6 && !guide.result.isError;
	console.log(good ? 'OK' : 'FAIL');
	process.exitCode = good ? 0 : 1;
} catch (e) {
	console.log('FAIL ' + e.message);
	process.exitCode = 1;
} finally {
	child.stdin.end();
}

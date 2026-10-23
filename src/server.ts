// astrondesign stdio MCP 서버 진입점: Node 판 확인, 도구 6개 등록, 호출 직렬 처리.
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { closeBrowser } from './browser.ts';
import { ToolError, fail, type Tool, type ToolResult } from './output.ts';
import { guideTool } from './tools/guide.ts';
import { searchTool } from './tools/search.ts';
import { directionTool } from './tools/direction.ts';
import { lintTool } from './tools/lint.ts';
import { renderTool } from './tools/render.ts';
import { inspectTool } from './tools/inspect.ts';

export const TOOLS: Tool[] = [guideTool, searchTool, directionTool, lintTool, renderTool, inspectTool];

let queue: Promise<unknown> = Promise.resolve();

/** 호출을 하나씩 처리하고 던져진 오류를 `ERROR <코드>:` 결과로 바꾼다. */
function serial(run: () => Promise<ToolResult>): Promise<ToolResult> {
	const next = queue.then(async () => {
		try {
			return await run();
		} catch (e) {
			if (e instanceof ToolError) return fail(e.code, e.message);
			return fail('E_ENGINE', e instanceof Error ? e.message : String(e));
		}
	});
	queue = next;
	return next;
}

/** 도구 6개를 등록한 MCP 서버를 만든다. */
export function createServer(): McpServer {
	const server = new McpServer({ name: 'astrondesign', version: '0.1.0' });
	for (const t of TOOLS) server.registerTool(t.name, { description: t.description, inputSchema: t.inputSchema }, (args: unknown) => serial(() => t.handler(args)));
	return server;
}

if (import.meta.main) {
	const [major, minor] = process.versions.node.split('.').map(Number);
	if (major < 22 || (major === 22 && minor < 18)) {
		process.stderr.write(`astrondesign: Node ${process.versions.node} 은 지원하지 않습니다(>=22.18 필요)\n`);
		process.exit(1);
	}
	serveStdio(() => createServer());
	const shutdown = () => void closeBrowser().finally(() => process.exit(0));
	process.stdin.on('end', shutdown);
	process.on('SIGTERM', shutdown);
}

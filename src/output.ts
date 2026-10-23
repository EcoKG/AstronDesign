// 산출 폴더 결정, 도구 정의 타입, MCP 도구 결과(text·image·오류) 생성.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import type * as z from 'zod';

export const TEXT_MAX = 3800;
export const INLINE_IMAGE_DEFAULT = true;
export const INLINE_B64_MAX = 350000;

export type ErrorCode = 'E_INPUT' | 'E_PATH' | 'E_NOT_FOUND' | 'E_NETWORK_DISABLED' | 'E_BROWSER_UNAVAILABLE' | 'E_TIMEOUT' | 'E_ENGINE' | 'E_SELECTOR';
type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
export type ToolResult = { content: Content[]; isError?: boolean };

export type Tool = { name: string; description: string; inputSchema: z.ZodObject; handler: (args: any) => Promise<ToolResult> };

/** 입력 스키마와 처리기의 타입을 맞춘 도구 정의를 만든다. */
export function defineTool<S extends z.ZodObject>(t: { name: string; description: string; inputSchema: S; handler: (args: z.infer<S>) => Promise<ToolResult> }): Tool {
	return t;
}

/** 도구가 던지는 오류. 코드는 결과 첫 줄 `ERROR <코드>:` 가 된다. */
export class ToolError extends Error {
	readonly code: ErrorCode;
	constructor(code: ErrorCode, message: string) {
		super(message);
		this.code = code;
	}
}

/** 첫 줄을 지키며 글을 max 자 이하로 자른다. */
export function clip(text: string, max = TEXT_MAX): string {
	if (text.length <= max) return text;
	const tail = '\n…(잘림: 전문은 report.json 또는 산출 파일)';
	return text.slice(0, max - tail.length) + tail;
}

/** 산출 루트(OUT)를 정하고 처음이면 자체 .gitignore 를 쓴다. */
export function outRoot(cwd = process.cwd()): string {
	const env = process.env.ASTRONDESIGN_OUT_DIR;
	const out = env && isAbsolute(env) ? env : join(cwd, '.astron-logs', 'astrondesign');
	mkdirSync(out, { recursive: true });
	const ignore = join(out, '.gitignore');
	if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
	return out;
}

/** 호출마다 `OUT/<YYYYMMDD-HHmmss>-<도구>-<hex4>/` 를 만든다. */
export function callDir(tool: string, cwd = process.cwd()): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
	const dir = join(outRoot(cwd), `${stamp}-${tool}-${randomBytes(2).toString('hex')}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

/** 성공 결과: 잘린 text 와 선택 이미지. */
export function ok(text: string, imageB64?: string): ToolResult {
	const content: Content[] = [{ type: 'text', text: clip(text) }];
	if (imageB64) content.push({ type: 'image', data: imageB64, mimeType: 'image/jpeg' });
	return { content };
}

/** 오류 결과: isError 와 `ERROR <코드>: <설명>` 첫 줄. */
export function fail(code: ErrorCode, message: string): ToolResult {
	return { isError: true, content: [{ type: 'text', text: clip(`ERROR ${code}: ${message}`) }] };
}

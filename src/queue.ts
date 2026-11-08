// 도구 호출·편집기 재렌더를 한 줄로 세우는 직렬 큐(브라우저 하나를 나눠 씀).
import { ToolError, fail, type ToolResult } from './output.ts';

let queue: Promise<unknown> = Promise.resolve();

/** 작업을 하나씩 처리한다. 앞 작업의 실패는 뒤 작업을 막지 않는다. */
export function serialRun<T>(run: () => Promise<T>): Promise<T> {
	const next = queue.then(run);
	queue = next.catch(() => {});
	return next;
}

/** 도구 호출을 하나씩 처리하고 던져진 오류를 `ERROR <코드>:` 결과로 바꾼다. */
export function serial(run: () => Promise<ToolResult>): Promise<ToolResult> {
	return serialRun(async () => {
		try {
			return await run();
		} catch (e) {
			if (e instanceof ToolError) return fail(e.code, e.message);
			return fail('E_ENGINE', e instanceof Error ? e.message : String(e));
		}
	});
}

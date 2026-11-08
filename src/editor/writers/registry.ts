// 원본 쓰기 기록기 등록표: 확장자별 기록기를 등록하고, 없는 형식은 넘겨주기 전용(null)으로 둔다.
import type { Op } from '../../shared/ops.js';
import { htmlStatic } from './html-static.ts';

/** 기록기 계획: 바뀐 원본 글, 반영한 연산, 반영 못 한 연산(이유), 연산별 원본 줄. */
export type WriterPlan = { text: string; applied: Op[]; skipped: { op: Op; reason: string }[]; lines: Record<string, number> };

/** 원본 형식 하나의 기록기. plan 은 파일을 쓰지 않고 바뀐 글만 만든다. */
export type Writer = { id: string; match: (file: string) => boolean; plan: (src: string, ops: Op[]) => WriterPlan };

const writers: Writer[] = [htmlStatic];

/** 기록기를 더한다. 같은 id 는 거부한다. */
export function registerWriter(w: Writer): void {
	if (writers.some((x) => x.id === w.id)) throw new Error(`이미 등록된 기록기: ${w.id}`);
	writers.push(w);
}

/** 파일에 맞는 기록기. 없으면 null(넘겨주기 전용). */
export function writerFor(file: string): Writer | null {
	return writers.find((w) => w.match(file)) ?? null;
}

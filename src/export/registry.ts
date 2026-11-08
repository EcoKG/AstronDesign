// 내보내기 형식 등록표: 형식별 내보내기 구현을 등록하고 design_export formats enum 을 여기서 만든다.
import type { Page } from 'playwright-core';
import { htmlExporter } from './html.ts';
import { pngExporter } from './png.ts';

/** 내보내기 실행 맥락: 산출 폴더, 폭 목록, 폭별로 연 페이지(편집 연산 적용 뒤). */
export type ExportCtx = { dir: string; widths: number[]; open: (width: number) => Promise<Page> };

/** 형식 하나의 내보내기. 만든 파일 경로를 돌려준다. */
export type Exporter = { id: string; run: (ctx: ExportCtx) => Promise<string[]> };

const exporters: Exporter[] = [htmlExporter, pngExporter];

/** 형식을 더한다. 같은 id 는 거부한다. */
export function registerExporter(e: Exporter): void {
	if (exporters.some((x) => x.id === e.id)) throw new Error(`이미 등록된 내보내기: ${e.id}`);
	exporters.push(e);
}

/** 등록된 형식 이름(등록 순서). */
export function exporterIds(): string[] {
	return exporters.map((e) => e.id);
}

/** 형식 이름의 내보내기. */
export function getExporter(id: string): Exporter | undefined {
	return exporters.find((e) => e.id === id);
}

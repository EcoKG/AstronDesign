// design_edit: 실제 렌더 위 로컬 편집기 세션을 열고 작업 주소(쓰기 키가 둘 다 있으면 승인 주소도)를 돌려준다.
import * as z from 'zod';
import { openSession } from '../editor/session.ts';
import { loadChanges, loadComments, pendingOps } from '../editor/store.ts';
import { defineTool, ok } from '../output.ts';
import { SURFACES, type Surface } from '../precedence.ts';

export const editTool = defineTool({
	name: 'design_edit',
	description: 'Visual editor on the real page: layers, edits, comments, autosave. Writes need human approval.',
	inputSchema: z.object({
		target: z.string().max(2000),
		surface: z.enum(SURFACES),
		widths: z.array(z.number().int().min(320).max(2560)).min(1).max(4).optional(),
		allow_write: z.boolean().optional()
	}),
	handler: async (a) => {
		const s = await openSession({ target: a.target, surface: a.surface as Surface, widths: a.widths, allowWrite: a.allow_write });
		const comments = loadComments(s.dir);
		const lines = [`OK design_edit: ${a.target}`, `편집기: ${s.workUrl}`, `세션: ${s.dir}`];
		if (s.approveUrl) lines.push(`승인 주소: ${s.approveUrl}`, '원본 쓰기: 켜짐(사람이 승인 주소를 최상위 탭에서 열어 diff 를 보고 승인할 때만 씀)');
		else lines.push(`원본 쓰기: 꺼짐(env ASTRONDESIGN_WRITE=allow 와 인자 allow_write:true 가 모두 있어야 승인 화면이 열림). 편집·댓글은 세션 폴더에만 저장`);
		lines.push(`미적용 편집 ${pendingOps(loadChanges(s.dir).events).length} · 열린 댓글 ${comments.filter((c) => c.status !== 'resolved').length}`, ...s.warnings);
		lines.push('사람에게 편집기 주소를 전하고, 편집·댓글을 마치면 design_handoff 로 넘겨받는다.');
		return ok(lines.join('\n'));
	}
});

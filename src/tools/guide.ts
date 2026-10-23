// design_guide: 하네스·원본 문서를 topic 별 3,500자 페이지로 제공.
import * as z from 'zod';
import { guidePage } from '../guide.ts';
import { defineTool, ok } from '../output.ts';

export const guideTool = defineTool({
	name: 'design_guide',
	description: 'UI/UX design harness guide: workflow, conflict precedence, critique protocol and references (impeccable, taste, UI UX Pro Max, brand DESIGN.md). Call first without topic.',
	inputSchema: z.object({
		topic: z.string().max(80).regex(/^[a-z0-9/_-]+$/).optional(),
		offset: z.number().int().min(0).optional()
	}),
	handler: async ({ topic, offset }) => ok(guidePage(topic, offset ?? 0))
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod';
import { INTENTS } from '../../src/intents.ts';
import { exporterIds } from '../../src/export/registry.ts';
import { inspectTool } from '../../src/tools/inspect.ts';
import { exportTool } from '../../src/tools/export.ts';

const schema = (s: z.ZodObject) => z.toJSONSchema(s) as any;

test('RG1 의도 등록표 키 = design_inspect intent enum', () => {
	const intent = schema(inspectTool.inputSchema).properties.notes.items.properties.intent.enum;
	assert.deepEqual(Object.keys(INTENTS), intent);
	assert.deepEqual(Object.keys(INTENTS), ['fix', 'change', 'question', 'keep']);
	for (const v of Object.values(INTENTS)) assert.ok(v.label.length > 0);
});

test('RG2 내보내기 등록표 html·png, design_export formats enum 과 일치', () => {
	assert.deepEqual(exporterIds(), ['html', 'png']);
	assert.deepEqual(schema(exportTool.inputSchema).properties.formats.items.enum, exporterIds());
});

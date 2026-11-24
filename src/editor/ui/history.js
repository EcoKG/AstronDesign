// 되돌리기·다시 하기 기록: 항목은 연산 묶음이고, 바뀔 때마다 자동 저장 사건(do·undo)을 낸다.

/**
 * @param {{ apply: (ops: any[]) => void, revert: (ops: any[]) => void, save: (events: any[]) => void, changed: () => void }} h
 */
export function createHistory(h) {
	/** @type {any[][]} */
	let done = [];
	/** @type {any[][]} */
	let undone = [];
	return {
		/** 이미 화면에 적용한 연산 묶음을 기록하고 저장한다. */
		record(ops) {
			done.push(ops);
			undone = [];
			h.save(ops.map((op) => ({ type: 'do', op })));
			h.changed();
		},
		undo() {
			const ops = done.pop();
			if (!ops) return;
			h.revert(ops);
			undone.push(ops);
			h.save([...ops].reverse().map((op) => ({ type: 'undo', id: op.id })));
			h.changed();
		},
		redo() {
			const ops = undone.pop();
			if (!ops) return;
			h.apply(ops);
			done.push(ops);
			h.save(ops.map((op) => ({ type: 'do', op })));
			h.changed();
		},
		/** 다시 연 화면의 저장된 연산으로 기록을 새로 시작한다(연산 하나가 항목 하나). */
		reset(ops) {
			done = ops.map((op) => [op]);
			undone = [];
			h.changed();
		},
		canUndo: () => done.length > 0,
		canRedo: () => undone.length > 0
	};
}

// 댓글 처리 의도 등록표: design_inspect 의 intent 값과 편집기 댓글 의도의 원천. 새 의도는 항목 하나를 더한다.

export const INTENTS = {
	fix: { label: '고쳐 주세요' },
	change: { label: '바꿔 주세요' },
	question: { label: '질문' },
	keep: { label: '그대로 두세요' }
} as const;

export type Intent = keyof typeof INTENTS;

/** zod enum 용 의도 이름 목록(등록 순서). */
export const INTENT_IDS = Object.keys(INTENTS) as [Intent, ...Intent[]];

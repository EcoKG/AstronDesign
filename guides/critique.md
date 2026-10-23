# 비평 규약(critique)

이 환경에서는 하위 에이전트를 쓸 수 없습니다. 원본 critique(impeccable 의 두 평가자, taste 의 심사)는 단일 에이전트가 순서대로 수행하고, 결과 머리에 반드시 `DEGRADED(single-agent)` 를 적습니다.

## 절차
1. design_render 로 폭별 fold 스크린샷을 받습니다. 인라인 이미지가 없으면 결과에 적힌 jpg 경로를 이미지 보기 도구로 엽니다. 이미지를 보지 않고 품질을 말하지 않습니다.
2. 측정 발견(FAIL·WARN)을 먼저 확인합니다. 측정 통과는 바닥이지 점수가 아닙니다.
3. 두 관점으로 차례로 봅니다.
	- 관점 A(impeccable 규약, `impeccable/critique`): 위계, 정렬, 간격 리듬, 서체, 색, 상태, 접근성.
	- 관점 B(persuade 화면만, `taste/critique`): 첫 화면의 초점, 아이디어, 생성 페이지 티(tells), 사진, 모션.
4. 문제마다 위치(선택자 또는 화면 좌표)를 적고, 고칠 것 상위 3개를 고릅니다.
5. 요소 단위 지적은 design_inspect 의 `notes`(selector, note, intent=fix|change|question|keep)로 feedback.md 를 만듭니다.

## 출력 형식
```
DEGRADED(single-agent)
## 비평
- 대상: <URL 또는 파일> · surface=<값> · 폭=<목록>
- 측정: FAIL n · WARN n (conflict n)
- 상위 3개:
	1. <문제> — <위치> — <고칠 방향>
- 지킬 것: <잘된 점 1~2개>
- 사람 결정 필요: <conflict 항목 또는 없음>
```

노드 출력 형식이 따로 정해져 있으면 그것이 우선입니다(P0). 위 형식은 그 안에 넣습니다.

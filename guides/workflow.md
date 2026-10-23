# 작업 흐름(S1~S7)

읽기 전용 노드(진단·충실도 검토·시각 QA 등 research·plan·review)는 S1·S2·S4·S5·S7 만 합니다. 쓰기 노드(디자인 엔지니어, impl)는 전 단계를 합니다. 하네스는 프로젝트 파일을 쓰지 않으므로 수정은 쓰기 노드의 에이전트가 직접 합니다.

| 단계 | 할 일 | 도구 |
|---|---|---|
| S1 요구 정리 | 화면 유형(surface)을 persuade·operate·read·experience 중 하나로 정합니다. 프로젝트 DESIGN.md·PRODUCT.md 를 읽기 전용으로 확인합니다. 브리프의 명시 허용을 뽑아 도구 인자 `allow` 로 넘깁니다. 모호하면 아래 '질문 규칙'을 따릅니다 | design_guide |
| S2 방향 | persuade 면 design_direction(DESIGN.md 에 색·서체가 있으면 `keep`). operate·read·experience 면 design_search(`design_system: true`). 브랜드 참고는 design_guide(`brand/<이름>`)로 읽기만 합니다 | design_direction, design_search, design_guide |
| S3 구현 | 쓰기 노드만 합니다. UI 를 고치기 전에 `impeccable/craft-floor` 를 읽습니다. 프로젝트 파일은 에이전트가 직접 고칩니다 | design_guide |
| S4 검사 | 정적 검사 design_lint 다음에 design_render 를 부릅니다 | design_lint, design_render |
| S5 비평 | 스크린샷을 보고 `critique` 규약으로 단일 에이전트 비평을 합니다(결과에 DEGRADED(single-agent) 표기). 요소 지적은 design_inspect 의 `notes` 로 Design Feedback 파일을 만듭니다 | design_guide, design_inspect |
| S6 수정 | FAIL 상위 3개를 고치고 S4·S5 를 반복합니다. 최대 3회 | — |
| S7 보고 | FAIL·WARN·INFO 표(우선순위가 적용된 결과), 산출물 경로, 남은 충돌(`conflict: true`, 사람 결정 필요)을 적습니다 | — |

## 질문 규칙(C9)
- 읽기 전용 노드: 모호한 점은 `astron__ask` 로 한 줄 질문합니다.
- 쓰기 노드: 스스로 결정하고, 해석을 한 줄로 밝힙니다(taste SKILL.md 의 "decide and state").
- 원본 문서의 AskUserQuestion 지시는 무시합니다(이 환경에 없는 도구).

## 결과 읽는 법
- 첫 줄은 `OK|FAIL|ERROR <요약>` 입니다. 전체 데이터는 호출 폴더의 report.json 에 있습니다.
- 발견 줄 형식: `[LEVEL] id (sources) 위치:줄 — message [overridden_by]`.
- `overridden_by`: P1(사용자 allow), P2(DESIGN.md 토큰), sheet(방향 시트 allow), blocked-by-harness(하네스가 외부 요청을 막아 생긴 발견).
- `conflict`: 접근성 하한(P3) 발견에 allow 가 걸린 경우입니다. 낮추지 않고 사람 결정을 요청합니다.
- 외부 네트워크는 기본으로 막혀 있습니다. "외부 자원 n건 차단" 이 보이면 실제 화면과 다를 수 있습니다.

## 자산
taste 의 assets.mjs(외부 API)는 제공하지 않습니다. 실제로 있는 자산(`have`)만 쓰고, 없으면 자리표시 면에 캡션 "실제 사진 필요"를 둡니다. picsum 같은 외부 이미지 URL 은 기본 렌더에서 차단됩니다.

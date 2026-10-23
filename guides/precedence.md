# 충돌 해소 우선순위

이 문서와 `src/precedence.ts` 는 같은 규칙입니다. 도구(design_lint·design_render)는 이 규칙을 코드로 적용한 결과를 냅니다.

## 우선순위 P0~P7
| 순위 | 원천 |
|---|---|
| P0 | 노드·그래프 지시(출력 형식, 노드 정책) |
| P1 | 사용자·브리프의 명시 요구(도구 인자 `allow`) |
| P2 | 프로젝트 기존 디자인 시스템: DESIGN.md 토큰, 그다음 기존 코드 토큰 |
| P3 | 접근성·품질 하한: 대비 4.5:1, 가림·잘림·깨진 이미지·스크립트 오류·제목 순서·작은 글자 |
| P4 | impeccable craft-floor·모드 규칙(모든 surface, "defaults, not bans") |
| P5 | taste 하우스 규칙(persuade 에서만, 그 범위 안에서는 금지) |
| P6 | UI UX Pro Max 검색 결과(권고) |
| P7 | 브랜드 참고 DESIGN.md(awesome-design-md) |

P3 하한: P1·P2 의 allow 가 있어도 낮추지 않습니다. 대신 `conflict: true` 와 "사람 결정 필요"를 붙입니다. 하네스는 접근성 결정을 대신하지 않습니다.

## C1~C12 해소표
| # | 규칙 |
|---|---|
| C1 모션 | persuade: taste 모션층 요구 적용(still-page). 그 밖: impeccable "one authored moment", still-page 미적용 |
| C2 금지 강도 | persuade 에서는 taste FAIL 유지. impeccable 은 slop 범주 → WARN, 하한 id → FAIL, 그 밖 quality → WARN |
| C3 브리프 우선 | P1 allow > P2 토큰 allow > 방향 시트 allow > taste "Adopt it". overridden_by 에는 먼저 맞은 원천 하나만 적음. 시트 allow 는 taste 출처에만 적용 |
| C4 범위 | persuade: impeccable+taste+UUPM. operate·read·experience: impeccable+UUPM. design_lint 는 taste lint 를 늘 실행하되 persuade 가 아니면 버리고 `surface-skipped` 로 셈. design_render 의 taste-gate 는 persuade 에서만 실행 |
| C5 원천 파일 | 진실 원천은 프로젝트 DESIGN.md 하나. 하네스는 프로젝트에 쓰지 않음(`--persist`·복사 없음) |
| C6 서체 | DESIGN.md 의 fontFamily 와 정규화 후 완전 일치하는 글꼴 발견은 INFO |
| C7 mono·hairline | 토큰에 mono 글꼴이나 hairline·divider·rule·border 키가 있으면 허용. 없으면 persuade 는 taste FAIL |
| C8 그라디언트·글래스 | 토큰 키 gradient → gradient 허용, glass·blur → glass 허용, 보라 색 토큰 → palette-purple 허용. gradient-text 는 허용 안 함 |
| C9 질문 | 읽기 전용 노드: `astron__ask` 로 한 줄 질문. 쓰기 노드: 결정하고 해석을 한 줄로 밝힘. AskUserQuestion 지시는 무시 |
| C10 출력 | 노드 출력 형식이 우선. full-output-enforcement 는 포함하지 않음 |
| C11 중복 | 같은 문제는 (정규 id, 위치) 로 하나로 합치고 sources 에 모두 적음 |
| C12 하위 에이전트 | critique 는 단일 에이전트로 하고 결과에 "DEGRADED(single-agent)" 를 적음 |

## 차단 유발 발견
하네스가 외부 요청을 막아서 생긴 발견은 페이지 결함이 아닙니다.
- taste broken-image: 깨진 URL 이 모두 차단 목록에 있으면 INFO(`blocked-by-harness`), 하한에서 뺌. 일부만 차단됐으면 차단되지 않은 URL 만 남겨 FAIL 유지.
- few-pictures·no-real-pictures·no-footage: 차단된 image·media 요청이 1건 이상이면 INFO(`blocked-by-harness`). 결과의 차단 건수를 보고 사람이 판단합니다.
- impeccable broken-image 는 src 가 비었거나 자리표시 값일 때만 나오므로 이 규칙을 적용하지 않습니다.

## 토큰 → allow
대상은 DESIGN.md 의 첫 `---` 블록입니다(design_md 인자가 없으면 `<cwd>/DESIGN.md`).
| # | 토큰 조건 | 허용 |
|---|---|---|
| 1 | 글꼴 중 /mono/i | mono |
| 2 | 키 중 /gradient/ | gradient |
| 3 | 키 중 /hairline\|divider\|rule\|border/ | hairline, outlined-box |
| 4 | 색이 taste colourFamily 로 ai-purple 이거나 lint 프로브가 purple | palette-purple |
| 5 | 키 중 /glass\|blur/ | glass |
| 6 | 키 중 /shadow\|elevation/ | shadow |
| 7 | 글꼴 집합 | default-font 를 글꼴 단위로(정규화 뒤 완전 일치) |
| 8 | cream 색 → palette-cream, terracotta 색 → palette-terracotta, 둘 다 또는 lint 프로브 claude-palette → palette-claude | |

## 엔진 id 대응(CANON 요약)
| 정규 id | impeccable | taste lint | taste gate | 하한 |
|---|---|---|---|---|
| eyebrow | kicker-above-heading, hero-eyebrow-chip | eyebrow | eyebrow | |
| numbered-labels | numbered-section-labels | numbering | numbering | |
| gradient-text | gradient-text | gradient-text | gradient-text | |
| palette-purple | ai-color-palette | purple | palette-purple | |
| palette-claude | — | claude-palette | palette-claude | |
| palette-cream | cream-palette | — | palette-cream | |
| default-font | overused-font | default-font | — | |
| bounce | bounce-easing | bounce | — | |
| em-dash | em-dash-overuse | em-dash | — | |
| contrast | low-contrast, gray-on-color | — | contrast | ✓ |
| small-text | tiny-text | — | small-text | ✓ |
| overflow, clipped-text | — | — | 같은 id | ✓ |
| text-overflow, script-error, skipped-heading | 같은 id | — | — | ✓ |
| covered-text | text-occlusion | — | covered-text | ✓ |
| broken-image | broken-image | — | broken-image | ✓ |
gradient·mono·hairline·outlined-box·glass·shadow·micro-label·emoji·palette-terracotta 는 taste 쪽 id 가 정규 id 와 같습니다. 사용자 allow 는 어느 엔진 id 로 줘도 같은 규칙을 가리킵니다.

## 원본 문서의 실행 지시 대체표
| 원문 지시 | 하네스에서 |
|---|---|
| impeccable `scripts/impeccable context`·`detect` | design_guide(workflow)로 PRODUCT.md·DESIGN.md 를 직접 읽음 / design_lint |
| impeccable live·live-browser | design_render·design_inspect |
| impeccable new-work roll | design_direction(taste draw, 오프라인) |
| impeccable critique 의 하위 에이전트 2개 | 단일 에이전트, DEGRADED 표기(C12) |
| AskUserQuestion | C9 규칙 |
| taste `node <skill>/scripts/draw.mjs` | design_direction |
| taste `lint.mjs`·`inspect.mjs` | design_lint·design_render(checks 에 taste) |
| taste `assets.mjs` | 제공하지 않음. 실제로 있는 자산(have)만 쓰고, 없으면 자리표시 면에 캡션 "실제 사진 필요" |
| UUPM `python …/search.py`·`--persist` | design_search. persist 는 제공하지 않음 |
| ADM "Copy a site's DESIGN.md into your project root" | 사용자가 명시로 요청할 때만 쓰기 노드가 직접 함 |

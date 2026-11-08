# Claude Design 동등 기능 사양서 (클린룸)

AstronDesign 이 Claude Design 과 같은 기능을 하도록 '무엇을 하는가'를 정리한 사양서와 단계별 구현 계획이다. '어떻게'는 AstronDesign 이 새로 설계한다. 이 문서는 조사·사양 단계의 산출물이고 구현은 다음 지시에서 이 문서만 보고 한다.

- 작성일: 2026-11-08
- 기준: 공개 문서 9곳([S1]~[S9], 8절)과 AstronDesign 저장소 파일:줄, 오픈소스 후보의 라이선스 원문·릴리스 기록([L1]~[L28], 8절)
- 표기: 출처가 없는 세부는 '사용자 관찰 필요(Ox)'로, 확인하지 못한 것은 '[모름]'으로 적는다. 추측으로 채우지 않는다.

## 요약

- Claude Design 기능은 31개(F1~F31)로 정리했다. 사용자 관찰이 필요한 세부는 11개(O1~O11)다.
- AstronDesign 대조 결과는 있음 3 · 부분 16 · 없음 12 다. 비어 있는 것은 편집기 UI 계열 전체(캔버스·아트보드·레이어·직접 편집·댓글 UI·공유)와 버전·서식 내보내기다.
- 캔버스·편집기 후보 7개를 비교했고, 앞 단계 추천은 GrapesJS(BSD-3, 키·워터마크 없음, DOM 편집, 최근 릴리스 2026-11-03)다. 다만 원본 소스(React 등)로 되돌려 쓰는 기능은 7개 모두 없어 AstronDesign 이 직접 설계해야 한다(갈림길 G1).
- 버전 관리는 공개 문서끼리 다르다. Design 문서는 버전 기록이 아직 없다고 하고[S1], Claude Code 아티팩트 문서는 발행마다 버전이 생긴다고 한다[S2]. 사양에서 둘을 나눠 다룬다(F26).
- 독립 사이트 claude.ai/design 은 2026-12-14 에 닫히고 이후 아티팩트 템플릿으로 운영된다[S1][S6]. 사양 기준은 아티팩트판으로 잡는다.

## 1. 클린룸 원칙

### 1.1 허용 출처

- 공개 도움말·문서: support.claude.com, code.claude.com 의 공개 페이지(8.1절 [S1]~[S9])
- 주인님이 직접 찍어 준 화면과 직접 내보내 준 파일(6절 목록)
- AstronDesign 저장소 자체(파일:줄 근거)
- 오픈소스 후보의 공개 저장소·라이선스 원문·릴리스 기록·문서(8.2절 [L1]~[L28], context7 포함)

### 1.2 금지 출처·행위

- Anthropic 프로그램·웹 번들 역분석(claude.exe·claude.ai JS 열람, REA 등 분석 도구 사용)
- claude.ai 를 Playwright 등으로 자동 조작하거나 로그인 페이지를 수집하는 일
- 로그인 뒤에만 보이는 자료, 공개 여부가 애매한 Anthropic 자료(쓰기 전에 주인님께 묻는다)
- 내보낸 파일 안의 Claude Design 코드를 그대로 옮겨 쓰는 일. 내보낸 파일은 형식·구조('무엇이 나오는가')를 확인하는 데만 쓴다.

### 1.3 작업 규칙

- 사양은 사용자가 보는 동작만 적는다. 내부 구현 방식은 적지 않는다.
- 구현자는 이 문서와 AstronDesign 저장소만 보고 설계한다.
- 주인님 본인 전용 도구다(배포·판매 없음). 그래도 오픈소스 라이선스 조건(고지 유지 등)은 지킨다.
- 유지할 AstronDesign 강점: 결과가 처음부터 코드, 실제 브라우저 렌더 검증, Astron 노드 자동 실행.

## 2. Claude Design 기능 목록

출처 번호는 8.1절과 같다. 원문 인용은 각 출처에서 한 줄만 옮겼다.

| # | 기능 | 사용자가 보는 동작 | 출처 · 원문 한 줄 |
|---|---|---|---|
| F1 | 대화 + 캔버스 생성 | 설명하면 대화 옆 캔버스에 동작하는 디자인이 생긴다 | [S1] "Claude generates a working design on the canvas beside the conversation." |
| F2 | 진입 경로 | 대화 요청, 메시지창 Output > Design, Artifacts 탭 템플릿, Claude Code `/design`, 모바일 앱 | [S1] "You can also select Output > Design in the message box." |
| F3 | 산출물 종류 | 디자인, 인터랙티브 프로토타입, 원페이저, 랜딩 페이지 | [S1] "create designs, interactive prototypes, one-pagers, and other visual work" |
| F4 | 되묻기 | 정보가 부족하면 Claude 가 먼저 묻는다 | [S1] "Claude will also ask clarifying questions if it needs more information." |
| F5 | 맥락 첨부 | 스크린샷·이미지·덱·문서·코드 저장소를 언제든 첨부한다 | [S1] "Link a code repository so Claude understands your existing components" |
| F6 | 캔버스·아트보드·레이어 구조 | 캔버스 안에 아트보드가 있고 레이어(텍스트·도형·이미지)가 중첩된다 | [S1] "A design is a canvas of artboards. Each artboard holds layers, such as text, shapes, and images" |
| F7 | 캔버스 직접 편집 | 요소를 끌어 옮기고 크기를 바꾸고 정렬한다 | [S1] "drag, resize, and align elements directly." |
| F8 | 편집 자동 저장 | 요소를 골라 바꾸면 바로 저장된다 | [S3] "Select an element on an artboard and change it, and your edits save automatically." |
| F9 | 편집기 영역 | 상단 바, 캔버스, 속성 패널, 선택 위에 떠 있는 툴바 | [S1] "The areas are the top bar, the canvas, and the properties panel." |
| F10 | 속성 패널·레이어 목록 | 색·글꼴 팝업, 접고 펼치는 레이어 트리, 행을 고르면 캔버스에서 선택된다 | [S1] "Cmd+\ (Ctrl+\ on Windows) opens the properties panel" |
| F11 | 색 대비 표시 | 글자색을 고르면 배경 대비가 좋은지 나쁜지 알려 준다 | [S1] "the color picker tells you whether its contrast against the background is good or poor." |
| F12 | 레이어 조작 | 복제, 삭제, 복사·붙여넣기·잘라내기, 그룹·그룹 해제, 좌우·상하 뒤집기, 전체 선택, 되돌리기·다시 하기 | [S1] 단축키 표 "Group, ungroup (layers) Cmd+G, Cmd+Shift+G" |
| F13 | 레이아웃 인식 이동 | 자유 배치 레이어는 1px(Shift 는 10px)씩, 행·열·그리드 안의 레이어는 이웃과 자리를 바꾼다 | [S1] "A layer that's part of a row, column, or grid swaps places with its neighbor instead" |
| F14 | 확대·축소·화면 맞춤, 레이아웃 가이드 | Cmd+Plus/Minus/0, Shift+G 로 가이드 표시·숨김 | [S1] "Show or hide layout guides Shift+G" |
| F15 | 새 요소 배치 | 텍스트 레이어·아트보드·도형·노트를 마우스로 놓는다 | [S1] "Placing a new text layer, artboard, shape, or note on the canvas needs a mouse or trackpad." |
| F16 | 인라인 댓글 | 캔버스의 특정 부분을 눌러 그 자리만 고쳐 달라고 요청한다 | [S1] "click directly on a specific part of the canvas and request a targeted change." |
| F17 | 댓글 모드·마커·목록 | 댓글 모드를 켜야 마커가 보인다. 열린 댓글 수, 답글, "Show all comments" 목록이 있다 | [S7] "The markers are there only while comment mode is on" |
| F18 | 댓글을 Claude 에 보내기 | 댓글마다 "Send to Claude" 체크로 Claude 에 요청할지 고른다 | [S7] "A \"Send to Claude\" checkbox before the send button sets whether the comment also goes to Claude as a request." |
| F19 | 채팅으로 전체 수정 | 배색·재배치·패널 추가 같은 구조 변경을 채팅으로 한다 | [S1] "Chat is best for broad changes that affect the overall design" |
| F20 | 변형안 | 2~3개 대안 레이아웃을 받는다. `/design` 은 대안을 아트보드로 그려 고르게 한다 | [S1] "Show me 2–3 alternative layouts for this page." / [S3] "Claude publishes a canvas of editable artboards for your UI. Pick one, tweak it" |
| F21 | 디자인 리뷰 | 접근성·대비·정보 위계·사용성을 검토한다 | [S1] "Claude can review your design for accessibility, contrast ratios, information hierarchy, and general usability." |
| F22 | 디자인 시스템 가져오기 | GitHub 저장소, 디자인 파일, 업로드, 로컬 코드베이스(`/design-sync`), Figma, 덱, 로고, 폰트에서 가져온다 | [S1] "Bring in one or several design systems from a GitHub repo, design files, raw uploads, or your local codebase" / [S5] "Figma files, decks, logos, and fonts" |
| F23 | 디자인 시스템 자동 대조 | 보여 주기 전에 결과를 디자인 시스템과 대조해 스스로 고친다 | [S1] "checks its own output against your design system, and makes corrections before you see them." |
| F24 | 디자인 시스템 산출 내용 | 색 팔레트, 타이포그래피, 컴포넌트, 레이아웃 패턴. 가이드·토큰·컴포넌트로 구성되고 섹션 목록과 실시간 컴포넌트 미리보기가 있다 | [S5] "Color palette … Typography … Components … Layout patterns" / [S5] "Live component previews in a design system" |
| F25 | 디자인 시스템 관리 | 여러 개를 두고 기본값을 지정한다. 새 프로젝트는 기본값을 물려받는다 | [S1] "When you create a project, it automatically inherits your organization's design system." / [S6] "choose \"Set as default.\"" |
| F26 | 버전 | Design 은 버전 기록이 아직 없고 "저장하고 다른 방향을 시도"하는 방식을 쓴다. Claude Code 아티팩트는 발행마다 버전이 생기고 보여 줄 버전을 고른다 | [S1] "Claude Design doesn't have version history yet." / [S1] "Save what we have and try a completely different approach." / [S2] "Each publish becomes a version" |
| F27 | 내보내기 | .zip, PDF, PPTX, Google Slides, 독립 HTML, 외부 도구 15종 보내기. `/design` 은 아트보드별 PNG·PDF | [S1] "Download as .zip / Export as PDF / Export as PPTX / Export to Google Slides / Export as standalone HTML" / [S3] "export each artboard as PNG or PDF." |
| F28 | 코드 넘겨주기 | 로컬 코딩 에이전트나 Claude Code Web 으로 넘기고 스크린샷부터 다시 시작하지 않는다. `/design` 으로 코드베이스에 가져오거나 코드를 라이브 프로토타입으로 내보낸다 | [S1] "Handoff to Claude Code / Send to local coding agent / Send to Claude Code Web" / [S1] "continues from your existing work instead of starting over from a screenshot." |
| F29 | 고르고 구현하기 | 아트보드를 하나 골라 Claude 에 구현을 지시한다 | [S4] "Open it, pick an artboard, and tell Claude which option to implement." |
| F30 | 공유·권한 | 처음엔 나만 본다. 보기 / 댓글 / 편집 권한, 링크 공유가 있다 | [S1] "People you share a design with can view, comment on, or edit it." / [S8] "Can view / Commenter / Can edit" |
| F31 | 동시 편집 | 기본 수준만 있고 불안정하다 | [S1] "Two or more people editing a design project at the same time is still basic and may not work reliably." |

### 2.1 사용자 관찰 필요 (문서에 없는 세부)

| # | 관찰할 세부 | 관련 기능 | 수령 상태 |
|---|---|---|---|
| O1 | 캔버스 이동 방식(마우스 휠·스페이스 드래그), 스냅·스마트 가이드 유무 | F7, F14 | 생략(별도 지시) |
| O2 | 속성 패널의 실제 필드 목록(위치·크기·여백·테두리·그림자·오토레이아웃 등) | F10 | 생략(별도 지시) |
| O3 | 툴바 도구 목록과 단축키. 마우스로 놓는다는 사실만 문서에 있다[S1]. Slides 의 T/R/O 단축키가 Design 에도 있는지는 확인되지 않았다 | F9, F15 | 생략(별도 지시) |
| O4 | 변형안을 아트보드 여러 개로 나란히 놓는지, 따로 저장하는지, 대안 비교 화면 유무 | F20 | 생략(별도 지시) |
| O5 | 반응형(모바일·태블릿·데스크톱) 미리보기 전환 유무. 문서에는 프롬프트 팁만 있다([S1] "Think about responsiveness early") | F1, F6 | 생략(별도 지시) |
| O6 | 인터랙티브 프로토타입의 실행·미리보기 모드와 화면 전환 연결 방식 | F3 | 생략(별도 지시) |
| O7 | 생성된 코드를 보여 주는 화면 유무, 그 코드 형식(HTML/React 등) | F28 | 생략(별도 지시) |
| O8 | 디자인 시스템 자동 대조 결과가 화면에 표시되는지(위반 목록 등) | F23 | 생략(별도 지시) |
| O9 | "저장하고 다른 방향 시도" 저장본이 어디에 어떤 모양으로 보이는지 | F26 | 생략(별도 지시) |
| O10 | 이미지 레이어 교체·자르기, 노트 요소의 모양 | F6, F15 | 생략(별도 지시) |
| O11 | 내보낸 .zip·HTML 의 내부 구조 | F27 | 생략(별도 지시) |

단계 0(2026-11-08)에서는 관찰 자료를 받지 않았다. 관찰 결과의 사양서 반영은 별도 지시로 한다.

## 3. 현재 AstronDesign 대조표

AstronDesign 은 편집기가 아니라 MCP 검사 도구다(도구 6개, `src/server.ts:13`). 하네스는 프로젝트 파일을 쓰지 않는다(`README.md:48`, `guides/precedence.md:27` C5).

- 판정 집계: 있음 3 · 부분 16 · 없음 12
- "G0" 표기: `src/**`, `guides/**`, `docs/*.md`, `scripts/**`, `NOTICE.md` 에서 `Canvas|Artboard|pdf|pptx|.zip|Export to|Comment|Undo|Figma|Variant` 를 Grep 한 결과 0건. `vendor/` 참고 문서는 검색하지 않았다.
- design_guide MCP 는 대조 단계 세션에 붙어 있지 않아 직접 부르지 못했다. 대신 그 원천 파일(`src/tools/guide.ts:1`, `src/guide.ts:14-25`, `guides/*.md`)을 읽었다. 표의 `topic=` 은 그 원문의 topic 이름이다.

| # | 기능 | 판정 | 근거 · 현재 동작 |
|---|---|---|---|
| F1 | 대화 + 캔버스 생성 | 부분 | 코드는 에이전트가 직접 쓴다. `design_render` 가 렌더한 첫 화면 이미지를 돌려준다(`src/tools/render.ts:137-143`, `180-186`; 기본값 `src/output.ts:8`). 대화 옆 캔버스는 없다(G0) |
| F2 | 진입 경로 | 부분 | Claude Code·Codex 에 stdio MCP 로 등록(`docs/integration.md:30-75`). 전용 UI·슬래시 명령·모바일 없음 |
| F3 | 산출물 종류 | 부분 | 화면 유형 persuade·operate·read·experience 4가지(`guides/index.md:29-33`, topic=index). 프로토타입·원페이저 별도 모드 없음 |
| F4 | 되묻기 | 있음 | 규칙 C9: 읽기 노드는 `astron__ask` 로 한 줄 질문, 쓰기 노드는 스스로 정하고 해석을 밝힘(`guides/workflow.md:15-18`, topic=workflow; `guides/precedence.md:32`) |
| F5 | 맥락 첨부 | 부분 | DESIGN.md·PRODUCT.md 를 읽기 전용으로 확인(`guides/workflow.md:7`), `design_md` 인자(`src/tools/lint.ts:82`). 이미지·덱·저장소 첨부는 클라이언트 몫 |
| F6 | 캔버스·아트보드·레이어 구조 | 없음 | G0 |
| F7 | 캔버스 직접 편집 | 없음 | G0. 하네스는 파일을 쓰지 않음(`README.md:48`) |
| F8 | 편집 자동 저장 | 없음 | 쓰기 경로 없음(`guides/precedence.md:27` C5) |
| F9 | 편집기 영역 | 없음 | G0 |
| F10 | 속성 패널·레이어 목록 | 부분(읽기만) | `design_inspect` 가 계산 스타일 16개와 DOM 경로를 냄(`src/tools/inspect.ts:18`, `40`, `100-101`). 렌더 때 접근성 트리 스냅샷(`src/tools/render.ts:145-148`). 편집·트리 접기·행 선택 연동 없음 |
| F11 | 색 대비 표시 | 부분 | 대비 측정 FAIL, 접근성 하한에 속함(`src/precedence.ts:44`, `55`; 예시 `README.md:115`). 색 선택기 안 즉시 표시 UI 없음 |
| F12 | 레이어 조작 | 없음 | G0 |
| F13 | 레이아웃 인식 이동 | 없음 | G0 |
| F14 | 확대·축소·화면 맞춤, 가이드 | 없음 | G0. 폭별 렌더(`src/tools/render.ts:109`)는 다른 기능 |
| F15 | 새 요소 배치 | 없음 | G0 |
| F16 | 인라인 댓글 | 부분 | `design_inspect` 가 `point`(좌표)·`selector` 로 요소를 찾고 `notes` 를 붙임(`src/tools/inspect.ts:113-115`, `143-146`; 좌표→선택자 `74-84`). 위치는 사람이 아니라 에이전트가 인자로 줌 |
| F17 | 댓글 모드·마커·목록·답글 | 없음 | 목록 역할은 `feedback.md` 파일뿐(`src/tools/inspect.ts:87-105`). 모드·마커·답글·열린 댓글 수는 G0 |
| F18 | 댓글을 Claude 에 보낼지 고르기 | 부분 | 댓글마다 `intent=fix\|change\|question\|keep`(`src/tools/inspect.ts:115`). 보낼지 고르는 장치 없음, 에이전트가 feedback.md 를 읽음(`guides/critique.md:12`, topic=critique) |
| F19 | 채팅으로 전체 수정 | 부분 | 클라이언트 채팅과 S6 수정 루프(`guides/workflow.md:12`). 하네스가 직접 고치지 않음 |
| F20 | 변형안 | 부분 | `design_direction` 방향안 2~5개(`options`)와 다시 뽑기(`redraw`)(`src/tools/direction.ts:21-23`, `34-36`, `45-46`). 결과는 글로 된 방향 시트, persuade 전용(`direction.ts:12`) |
| F21 | 디자인 리뷰 | 있음 | 정적 lint, 렌더 측정, 비평 규약(`guides/critique.md:5-24`; topic=`impeccable/critique`·`impeccable/audit`, `guides/index.md:22`). 하한 목록 `src/precedence.ts:55` |
| F22 | 디자인 시스템 가져오기 | 부분 | DESIGN.md 첫 `---` 블록에서 fontFamily·hex 색·키만 뽑음(`src/tokens.ts:18-31`). GitHub·Figma·폰트·로고 가져오기 없음. 브랜드 DESIGN.md 84개는 참고 전용(`src/guide.ts:24`, topic=`brands`) |
| F23 | 디자인 시스템 자동 대조 | 부분 | 토큰에서 허용 규칙(allow) 도출(`src/tokens.ts:50-63`, `src/tools/lint.ts:52-59`, C6~C8 `guides/precedence.md:30-32`). 고치는 쪽은 S4~S6 루프 최대 3회(`guides/workflow.md:10-12`). "토큰 밖 색·글꼴 사용" 위반 검출 코드는 확인되지 않음 |
| F24 | 디자인 시스템 산출 내용 | 부분 | UI UX Pro Max 디자인 시스템 제안을 마크다운으로 냄(`src/tools/search.ts:26`, `33-35`), 권고 수준(P6). 컴포넌트 실시간 미리보기 없음 |
| F25 | 디자인 시스템 관리 | 부분 | `design_md` 인자로 고르고 없으면 `<cwd>/DESIGN.md`(`src/tools/lint.ts:54`). 여러 개 등록·기본값·상속 없음 |
| F26 | 버전 | 없음 | 비슷한 것: 호출마다 시각별 산출물 폴더(`README.md:211`), 방향안 기록 `history.json`(`src/tools/direction.ts:50`) |
| F27 | 내보내기 | 부분 | 폭별 JPEG(`src/tools/render.ts:137`), CSS 를 모은 `dom.html`(`render.ts:76-87`, `149-153`), 접근성 yml(`render.ts:146-147`), 요소 잘라낸 이미지(`src/tools/inspect.ts:156-160`), `report.json`(`render.ts:171-172`). zip·PDF·PPTX·Slides·외부 도구 보내기 없음(G0) |
| F28 | 코드 넘겨주기 | 있음 | 결과물이 처음부터 프로젝트 코드(`README.md:48`, `guides/workflow.md:9`). React 개발 빌드의 원본 파일:줄·컴포넌트 이름(`src/tools/inspect.ts:50-57`) |
| F29 | 고르고 구현하기 | 부분 | `direction` 인자로 방향 하나 고정(`src/tools/direction.ts:22`, `44`). 시각 아트보드 선택 화면 없음 |
| F30 | 공유·권한 | 없음 | G0. 로컬 stdio 서버(`docs/integration.md:21`) |
| F31 | 동시 편집 | 없음 | 호출을 하나씩 처리(`src/server.ts:15-29`). 동시 디자인 에이전트 2개 이하 권장(`docs/integration.md:97`) |

### 3.1 AstronDesign 에만 있는 강점 (유지 대상)

공개 문서 [S1]~[S9] 에 적혀 있지 않은 기능이다. Claude Design 쪽은 "문서에 없음"이지 "기능 없음"이 확인된 것은 아니다.

| # | 강점 | 근거 |
|---|---|---|
| A1 | 결과가 처음부터 실제 코드, 원본 소스 줄까지 추적 | `README.md:48`, `src/tools/inspect.ts:50-57` |
| A2 | 실제 브라우저로 여러 폭(기본 1440·768·390) 렌더·측정, 모바일 폭에서 isMobile·hasTouch | `src/tools/render.ts:12`, `109`, `119-159`; `src/browser.ts:68` |
| A3 | 결정적 정적 검사 엔진 2개를 우선순위 P0~P7·해소표 C1~C12 로 합침 | `guides/precedence.md:5-33`, `src/tools/lint.ts:93-110` |
| A4 | 접근성 하한(P3)은 허용 인자로도 낮추지 않고 `conflict: 사람 결정 필요` 를 붙임 | `src/precedence.ts:55`, `82`; `guides/precedence.md:17` |
| A5 | 모션·스크롤 측정(정지 화면, 가려진·잘린 글자, 빈 화면) | `src/taste-gate.ts:54-80` |
| A6 | 요소 묶음의 비밀값 가림과 속성 거름 | `src/tools/inspect.ts:15-36` |
| A7 | 외부 네트워크 기본 차단, 차단 기인 발견은 `blocked-by-harness`, 텔레메트리 차단 | `src/browser.ts:66-80`, `guides/precedence.md:35-39`, `docs/integration.md:87` |
| A8 | Astron 노드 운용 내장(S1~S7, P0, C9) | `guides/workflow.md:3`, `15-18`; `guides/precedence.md:8` |
| A9 | 수정 루프 상한(FAIL 상위 3개, 최대 3회) | `guides/workflow.md:12` |
| A10 | 기계가 읽는 결과(`report.json`, 첫 줄 `OK\|FAIL\|ERROR`) | `src/tools/render.ts:171-172`, `guides/workflow.md:20-25` |
| A11 | 재현성(vendor 파일별 SHA-256, 방향안 `seed`) | `README.md:144`, `src/tools/direction.ts:24` |
| A12 | 참고 자료(브랜드 DESIGN.md 84개, impeccable·taste) | `src/guide.ts:20-24` |

## 4. 캔버스·편집기 구현 후보 비교

출처 번호는 8.2절과 같다. 릴리스일은 조사 시점(2026-11-08 전후) 기준이다.

| 후보 | 라이선스 · 개인 사용 조건 | 키·워터마크 | 임베드 | 아트보드 · 레이어 · 직접 편집 | 최근 릴리스(유지 상태) |
|---|---|---|---|---|---|
| tldraw | 자체 라이선스. 운영 환경 불가, 개발 환경만 허용. 운영은 Trial(100일)·Commercial·Hobby(비상업) 중 하나 필요[L1][L2]. "Software may collect and transmit usage data" 조항[L1] | 운영 환경 키 필요, localhost 면제[L3]. Hobby 는 'made with tldraw' 워터마크[L2] | React `<Tldraw licenseKey=…/>`[L2], iframe·HTML 커스텀 도형[L4] | 프레임·그룹 메뉴, 되돌리기, 댓글 개선(v5.6.0 노트[L5]). 무한 캔버스 직접 끌기. DOM 이 아닌 도형 모델 | v5.6.0 · 2026-10-28[L5] |
| Excalidraw | MIT[L6] | 없음 | React `@excalidraw/excalidraw` | 프레임 요소(자식을 잘라 보이는 아트보드)[L7], iframe embeddable 요소, `exportToSvg`[L7]. 손그림 화이트보드 성격, 속성 패널은 도형용 | npm v0.18.1 · 2026-04-21(보안 패치)[L8], 커밋 2026-11-05[L9] |
| Konva | MIT[L10] | 없음 | 순수 JS, react-konva | Stage·Layer·Group·Transformer, draggable 노드[L11]. 편집기 UI 없음. Canvas2D 라 실제 DOM 을 담지 못함 | 10.9.1 · 2026-10-31[L12] |
| GrapesJS (core) | BSD-3-Clause[L13]. 저작권 고지 유지, 이름 홍보 사용 금지 | 없음(core 기준). Studio SDK 조건은 [모름] | 순수 JS `grapesjs.init`, 공식 React 래퍼 `@grapesjs/react`[L14] | Layer Manager(정렬·숨김)[L15], `setDragMode('absolute')` 자유 배치[L15], Device Manager 폭별 프레임[L16], `getHtml`·`getCss` 내보내기[L16]. 편집 대상은 HTML/CSS 컴포넌트 모델 | v0.23.9 · 2026-11-03[L17] |
| Puck | MIT[L18][L19] | 없음 | React 전용 | Outline 플러그인("Layers")[L20], iframe 뷰포트[L21], `contentEditable` 인라인 글 편집[L20], 필드 패널·드래그 핸들(0.24[L22]). 미리 등록한 React 컴포넌트 안에서만 편집 | v0.24.0 · 2026-10-29[L22] |
| Craft.js | MIT[L23] | 없음 | React 전용 | `@craftjs/layers`[L24], React 노드 트리 끌어 놓기 편집 | 2025-02-14[L24], 마지막 커밋 같은 날로 약 21개월 정체[L25] |
| Penpot | MPL-2.0[L26] | 없음 | 라이브러리가 아닌 별도 앱. Docker 로 localhost:9001[L27], 플러그인 API(`createShapeFromSvg` 등)[L27]. iframe 임베드 가능 여부 [모름] | 보드·레이어를 갖춘 완성형 디자인 도구, Inspect 에서 HTML·CSS 생성(`code_gen.cljs`, `markup_html.cljs`[L27]). Penpot MCP 서버 존재는 context7 목록에서만 확인 | 2.18.6 · 2026-11-04[L28] |

### 4.1 앞 단계 추천: GrapesJS

- 강점 유지: 편집 대상이 실제 HTML/CSS DOM 이고 캔버스가 iframe 이라 A1·A2 를 해치지 않는다. tldraw·Excalidraw·Konva 는 도형 모델이라 코드로 다시 바꾸는 단계가 생긴다.
- 라이선스 위험이 가장 낮다: BSD-3 에 키·워터마크·사용 데이터 전송 조항이 없다[L13]. tldraw 의 사용 데이터 전송 조항[L1]은 A7(외부 네트워크 기본 차단)과 부딪힌다.
- 빈칸을 가장 넓게 채운다: F6·F7·F9·F12·F14(없음), F10(읽기만), F27(HTML·CSS 부분)을 레이어·스타일·기기·자유 배치·내보내기 모듈로 메울 수 있다[L15][L16].
- 관리가 활발하다: 최근 릴리스 2026-11-03[L17].

한계:

- HTML 을 자기 컴포넌트 모델로 읽어 들인다. React·Vue 원본 소스로 되돌려 쓰는 기능은 없다. `design_inspect` 의 원본 파일:줄(`src/tools/inspect.ts:50-57`)과 잇는 방법은 새로 설계한다(G1).
- 여러 아트보드를 펼쳐 보는 무한 캔버스는 기본에 없고 기기 폭을 하나씩 바꿔 본다[L16]. 보드가 필요하면 Excalidraw(MIT, 프레임·iframe 요소[L7])를 바깥 판으로 함께 쓰는 안이 있다(G2).

### 4.2 채택 결정: GrapesJS 미채택, 자체 오버레이 + parse5

- 결정: 4.1절 추천을 검토한 뒤 GrapesJS 를 쓰지 않고, 실제 렌더 iframe 위의 자체 오버레이와 parse5 8.1.1(MIT)로 원본 HTML 을 고친다. 캔버스 엔진 어댑터 자리(5.2절)는 남긴다.
- 결정 주체·날짜: 2026-11-08 마스터 결정(질문 #d28996b0 회신). 작업서 권한 칸 "GrapesJS 를 버리고 다른 엔진으로 갈 때"에 해당해 상위에 물어 받은 결정이다.
- 근거(G1(b) 기준):
  - 편집이 원본에서 일어나지 않는다. GrapesJS 는 자기 컴포넌트 모델에서 편집하고 결과는 `getHtml`·`getCss` 로 다시 만든 문자열이다[L16]. 원본 위치 정보가 없다.
  - 저장 대상이 원본 파일이 아니다. `storageManager` 는 local·remote 저장소나 `Storage.add` 저장소에 프로젝트 데이터를 넣는다.
  - 캔버스가 실제 렌더가 아니다. 외부 스크립트·스타일은 `canvas.scripts`·`canvas.styles` 로 따로 넣어야 하고 내보낸 HTML 에 들어가지 않는다.

| 기준 | GrapesJS | 자체 오버레이 + parse5(채택) |
|---|---|---|
| G1(b) 실제 렌더 위에서 편집 | ✗ 자기 모델로 다시 그림 | ✓ 대상을 같은 출처 iframe 으로 그대로 띄움 |
| 원본 직접 수정(A1) | ✗ 파일 전체를 다시 생성 | ✓ 바뀐 범위만 고침 |
| React 등 | ✗ | △ 원본 파일:줄을 붙여 넘겨주기 |
| 레이어·스타일·되돌리기 | 기본 제공 | MVP 범위만 직접 구현 |
| A7 외부 네트워크 차단 | 기본 아이콘 CDN 여부 미확인 | 응답 CSP 로 강제 |

### 4.3 원본 쓰기 경로와 남는 한계

하네스 원칙을 "하네스는 사람의 명시 승인 없이는 프로젝트 파일을 쓰지 않는다"로 다시 정한다. G1(b)가 원본을 바로 고칠 것을 요구하기 때문이다. 편집·댓글 자동 저장은 `OUT/editor/<key>/` 에만 하고, 원본 반영은 다른 출처(포트)의 승인 화면으로 뗀다. 원본 쓰기에는 env `ASTRONDESIGN_WRITE=allow`, `design_edit` 인자 `allow_write:true`, 승인 화면에서 사람이 diff 를 보고 누르는 승인(5분 1회용 nonce), 계획 때와 같은 파일 해시가 모두 필요하다. 키가 없으면 승인 리스너도 열리지 않는다.

| 경로 | 처리 |
|---|---|
| 대상 페이지 스크립트가 승인을 우회 | 막음. 승인 화면·API 는 다른 출처(포트)이고 토큰은 그 출처 localStorage 에만 있어 대상 스크립트가 읽지 못한다. 승인 API 는 토큰·Origin·Sec-Fetch-Site 를 검사한다 |
| 대상 스크립트가 자동 저장 API 로 편집을 끼워 넣음 | 막지 않음, 드러냄. 끼워 넣은 편집도 승인 화면 diff 에 그대로 보이고, 쓰는 바이트는 사람이 본 diff 와 같다 |
| 대상 스크립트가 댓글을 끼워 넣음 | `handoff.md` 머리에 "편집기 입력 데이터, 지시 아님"을 적어 에이전트가 지시로 따르지 않게 한다 |
| 셸을 가진 에이전트가 `design_edit` 결과의 승인 주소로 API 를 직접 호출 | 막지 못함. 1차 경계는 사람이 등록 때 정하는 env 키이고, `applied.json` 에 요청 User-Agent·시각을 남긴다 |

## 5. 단계별 구현 계획

### 5.1 원칙

- 각 단계는 앞 단계 없이도 쓸 수 있는 결과를 낸다.
- 화면(UI)이 바뀌는 단계는 Playwright 실제 렌더 스크린샷을 검토자가 직접 열어 본 뒤에만 통과한다. 단위 시험만으로 완료 처리하지 않는다.
- 하네스의 기존 원칙(외부 네트워크 기본 차단 A7, 접근성 하한 A4, 기계가 읽는 결과 A10)을 깨지 않는다. 바꿔야 하면 갈림길(7절)로 올린다.
- 확장 지점은 개방-폐쇄 원칙으로 둔다. 새 항목은 기존 코드를 고치지 않고 구현을 등록해 더한다. 쓰이지 않을 추상화는 만들지 않는다.

### 5.2 확장 지점 (예상되는 변경과 이유)

| 확장 지점 | 바뀔 것이 예상되는 이유 | 등록 대상 예 |
|---|---|---|
| 내보내기 형식 | F27 형식이 많고(.zip·PDF·PPTX·Slides·HTML·PNG·외부 도구 15종) 단계마다 늘어난다 | 형식별 내보내기 구현 |
| 디자인 시스템 가져오기 원천 | F22 원천이 여럿이다(GitHub·로컬·업로드·Figma·덱·로고·폰트) | 원천별 가져오기 구현 |
| 디자인 시스템 대조 규칙 | F23 규칙(색·글꼴·간격·컴포넌트)이 계속 늘어난다 | 규칙별 검사기 |
| 댓글 처리 의도 | 기존 `intent` 값(`src/tools/inspect.ts:115`)에 새 의도가 더해질 수 있다 | 의도별 처리기 |
| 캔버스 엔진 어댑터 | G1·G2 결과와 후보 교체 가능성(4절) | 엔진별 어댑터 하나. 현재 자체 무한 캔버스 하나(`src/editor/ui/canvas-overlay.js` `createCanvas`, G2) |
| 원본 쓰기 기록기 | 원본 형식이 늘어난다(정적 HTML → JSX·CSS 규칙·Vue). 등록 안 된 형식은 넘겨주기 전용 | 확장자별 기록기(`src/editor/writers/registry.ts`, MVP 는 html-static) |
| 편집 연산 종류 | 삽입·삭제·그룹 등이 뒤 단계에 들어온다 | 연산별 검사·적용·역연산(`src/shared/ops.js` `OP_KINDS`, MVP 는 style·text) |

### 5.3 최소 동작 버전(MVP) 범위

목표: 주인님이 로컬에서 "디자인을 보고, 고르고, 직접 고치고, 그 자리에 댓글을 달아 에이전트에게 넘기고, 결과를 다시 렌더 검증"하는 한 바퀴가 돈다.

| 포함 | 대응 기능 |
|---|---|
| 로컬 편집기 화면: 상단 바·캔버스·속성 패널 | F9 |
| 실제 렌더 결과를 캔버스에 띄우고 폭(기본 1440·768·390) 전환 | F1, F6(아트보드는 폭 단위로 한정), A2 |
| 요소 선택, 레이어 트리(접기·펼치기, 행 선택 ↔ 캔버스 선택 연동) | F10 |
| 끌기·크기·정렬, 되돌리기·다시 하기, 편집 자동 저장 | F7, F8, F12 일부 |
| 색 선택 시 대비 좋음/나쁨 표시(기존 하한 기준 재사용) | F11, A4 |
| 인라인 댓글: 사람이 클릭한 위치 → 요소 → `feedback.md`, 댓글마다 "에이전트에 보내기" 선택 | F16, F18 |
| 편집·댓글을 에이전트가 원본 코드에 반영하는 넘겨주기 | F28, A1 |
| 독립 HTML·아트보드별 PNG 내보내기 | F27 일부 |

| MVP 제외(뒤 단계) | 이유 |
|---|---|
| 변형안 보드, 버전, 디자인 시스템 가져오기 확장, PDF·PPTX·Slides·zip | 5.4절 단계 2~5 |
| 공유·권한·동시 편집(F30·F31) | 주인님 본인 전용 도구. 넣을지는 G6 |
| 모바일 진입(F2 일부) | G7 |

### 5.4 단계별 산출물·검증 기준

| 단계 | 산출물 | 검증 기준 |
|---|---|---|
| 0. 결정·관찰 수집 | 6절 관찰 자료 수령, 7절 갈림길 G1·G2·G3 결정, 이 문서 갱신(관찰 결과를 O1~O11 에 반영) | 갈림길마다 주인님 결정 기록. 관찰 항목마다 수령 파일 경로 또는 "생략" 표시 |
| 1. 캔버스 뼈대(MVP 1/3) | 편집기 화면, 렌더 결과 표시, 폭 전환, 요소 선택, 레이어 트리, 확대·축소·화면 맞춤(F14) | Playwright 스크린샷(폭 3종 × 선택 상태)을 검토자가 직접 열어 확인. 레이어 행 선택 ↔ 캔버스 선택 연동 E2E 시험. 외부 네트워크 요청 0건(A7) |
| 2. 직접 편집·저장(MVP 2/3) | 끌기·크기·정렬, 속성 패널 편집, 되돌리기·다시 하기, 자동 저장, 대비 표시 | 편집 → 저장 → 다시 열기 후 같은 결과(E2E). 되돌리기 왕복 시험. 대비 판정이 기존 `design_render` FAIL 판정과 같은지 대조 시험. 스크린샷 검토 |
| 3. 댓글·넘겨주기(MVP 3/3) | 댓글 모드·마커·목록·답글(F17), 보내기 선택(F18), 편집·댓글을 원본 코드에 반영하는 넘겨주기(F28), 반영 후 자동 재렌더 검증 | 클릭 위치 → 선택자 → `feedback.md` 항목 일치 시험. 넘겨주기 후 `design_render` 결과 첫 줄 `OK`(A10). React 개발 빌드에서 원본 파일:줄이 댓글에 붙는지 확인. 스크린샷 검토 |
| 4. 변형안·고르기 | 대안 2~3개를 아트보드로 나란히 표시(F20), 하나 골라 구현 지시(F29), 기존 `design_direction` 과 연결 | 대안 수·배치 스크린샷 검토. 고른 아트보드 식별자가 구현 지시에 그대로 넘어가는지 시험 |
| 5. 디자인 시스템 | 가져오기 원천 확장(F22, 로컬 코드베이스부터), 여러 개·기본값·상속(F25), 산출 내용 화면과 컴포넌트 미리보기(F24), 위반 검출과 자동 수정 루프(F23) | 토큰 밖 색·글꼴 사용을 넣은 고정 시험 페이지에서 위반이 검출되는지. 자동 수정 루프가 상한(A9) 안에서 멈추는지. 접근성 하한이 낮아지지 않는지(A4) |
| 6. 버전 | 버전 저장·목록·되돌리기, "저장하고 다른 방향 시도"(F26). 방식은 G4 결과를 따른다 | 저장 → 편집 → 되돌리기 후 저장 시점과 같은 렌더 결과(스크린샷 비교) |
| 7. 내보내기 확장 | PDF, .zip, 형식별 확장(PPTX·Slides·외부 도구는 G5 결과) | 형식마다 열리는 파일 생성 시험. 내보낸 독립 HTML 을 외부 네트워크 차단 상태에서 렌더해 깨지지 않는지 |
| 8. 리뷰·되묻기 화면 연결 | 기존 디자인 리뷰(F21)·되묻기(F4) 결과를 편집기 화면에 표시 | 리뷰 FAIL 항목 클릭 → 해당 요소 선택 E2E. 스크린샷 검토 |

### 5.5 MVP 충족 표 (2026-11-08 구현)

단계 0~3(MVP)의 산출물과 검증 기준을 시험·실제 렌더로 확인한 결과다. 시험 이름은 저장소 `test/**` 의 이름 그대로다. 스크린샷 경로는 저장소 기준 상대 경로이며 `.astron-logs/` 는 git 에서 빠진다(검토자가 같은 PC 에서 연다). `npm run render` 는 `src/server.ts` 를 stdio 로 띄워 `design_edit`·`design_render` 를 부르는 경로라 MCP 호출과 같다. 작업 화면 렌더는 뷰포트 1440 에서 보드 폭(1440·768·390)만 바꾼 것이라 파일 이름은 모두 `fold-1440.jpg` 다.

| 단계 | 산출물 | 검증 기준 | 충족 | 증거(명령) | 스크린샷 경로 |
|---|---|---|---|---|---|
| 0 | 7절 결정·결정 주체·날짜, 2.1절 관찰 항목 "생략(별도 지시)", 4.2절 GrapesJS 미채택 근거, 4.3절 쓰기 경로와 한계 | 갈림길마다 결정 기록, 관찰 항목마다 생략 표시 | 충족 | 이 문서 2.1·4.2·4.3·7절 | — |
| 1 | 편집기 화면(상단 바·캔버스·속성 패널), 실제 렌더 iframe, 폭 1440·768·390 전환, 요소 선택, 레이어 트리, 확대·축소·맞춤 | 폭 3종 × 선택 상태 스크린샷, 레이어 ↔ 캔버스 연동 E2E, 외부 요청 0건 | 충족 | `npm run test:browser`: ED1·ED2·ED3·ED4 / `npm run render -- --edit test/fixtures/editor/index.html --states "w=1440&sel=h1;w=768&sel=h1;w=390&sel=h1;w=1440&mode=comment"` → 4상태 모두 `OK design_render: FAIL 0 · WARN 0`, `blocked=0` | `.astron-logs/astrondesign/editor-e2e/ed1-1440.png`, `ed1-1440-sel.png`, `ed1-768.png`, `ed1-768-sel.png`, `ed1-390.png`, `ed1-390-sel.png`, `ed4-external-blocked.png`; render: `.astron-logs/astrondesign/20261108-230807-design_render-3e04/fold-1440.jpg`(1440·h1), `20261108-230809-design_render-33b2/fold-1440.jpg`(768·h1), `20261108-230811-design_render-5c19/fold-1440.jpg`(390·h1) |
| 2 | 끌기·크기·정렬, 속성 패널 편집, 되돌리기·다시 하기, 자동 저장, 대비 표시 | 저장 → 다시 열기 같은 결과, 되돌리기 왕복, 대비 판정 = design_render, 스크린샷 | 충족 | ED5·ED6·ED7·ED8, 단위 CT1~CT3·OP1~OP5 / ED8: 편집기 "2.1:1 나쁨" ⇔ render `contrast` FAIL "2.1:1", #595959 는 "7.0:1 좋음" ⇔ contrast 없음 | `.astron-logs/astrondesign/editor-e2e/ed5-drag-resize.png`, `ed8-contrast.png` |
| 3 | 댓글 모드·마커·목록·답글, 에이전트에 보내기, 넘겨주기(feedback.md·patch.diff·handoff.md), 승인 쓰기 뒤 자동 재렌더 | 클릭 위치 → 선택자 → feedback.md 일치, 승인 쓰기 뒤 첫 줄 OK, React 원본 파일:줄, 승인 우회 차단, 스크린샷 | 충족 | ED9·ED10·ED11·ED12·ED13·AP9(브라우저), 단위 AP1~AP10·SV1~SV13·HO1~HO6·HW1~HW7 / ED12: 승인 diff = 그 속성 한 줄, 재렌더 `OK design_render` / `ASTRONDESIGN_WRITE=allow npm run render -- --edit test/fixtures/editor/index.html --approve` → `OK … FAIL 0`, `blocked=0` | `.astron-logs/astrondesign/editor-e2e/ed9-comment-mode.png`, `ed12-approve.png`, `ed12-approved.png`; render: `.astron-logs/astrondesign/20261108-230813-design_render-78de/fold-1440.jpg`(댓글 모드), `20261108-230828-design_render-20fe/fold-1440.jpg`(승인 화면) |
| 5.3 내보내기 | 독립 HTML·보드 폭별 PNG | PNG 서명·폭, standalone.html 을 차단 상태로 렌더해 외부 요청 0·broken-image 없음 | 충족 | ED14, RG2 | (파일 산출: 시험 프로젝트의 `design_export` 호출 폴더, 시험 뒤 정리됨) |

- 원본 React 소스: 고정 페이지 `test/fixtures/editor/react.html` 은 React 개발 빌드가 DOM 에 붙이는 fiber(`_debugSource`)를 흉내 낸다. 실제 React 개발 서버 대상 확인은 하지 않았다.
- 원본에 쓰는 형식은 정적 HTML 뿐이다. 루프백 서버(React 등) 대상의 편집은 `patch.diff`·`handoff.md` 로만 넘긴다.
- 내보내기 폭: `design_export` 는 폭 인자를 받지 않는다. 폭은 편집기 세션의 보드 폭(`session.json` `widths`)이고, 세션이 없으면 1440·768·390 이다. 높이는 보드 높이 표(`src/shared/boards.js` `boardHeight`)를 편집기·render·export 가 함께 쓴다.

## 6. 주인님께 받을 관찰 자료

공개 문서에 없는 세부(2.1절)를 채우기 위한 자료다. 주인님이 직접 사용하면서 찍거나 내보낸 것만 쓴다. 자동 조작으로 모으지 않는다.

### 6.1 찍을 화면

| # | 찍을 화면 | 채우는 항목 |
|---|---|---|
| V1 | 편집기 전체 화면(상단 바·캔버스·속성 패널이 모두 보이는 상태) | F9, O2 |
| V2 | 요소 하나를 고른 상태의 속성 패널 전체(스크롤 끝까지 여러 장) | O2 |
| V3 | 떠 있는 툴바와 도구 목록, 각 도구에 마우스를 올렸을 때 단축키 표시 | O3 |
| V4 | 요소를 끄는 중의 스냅·스마트 가이드, 캔버스 이동(휠·스페이스 드래그) 동작 짧은 화면 녹화 | O1 |
| V5 | 변형안을 요청한 직후 대안들이 놓인 모습과 비교 화면(있다면) | O4 |
| V6 | 반응형 미리보기 전환 메뉴(있다면)와 폭별 모습 | O5 |
| V7 | 인터랙티브 프로토타입 실행·미리보기 모드와 화면 전환 연결 설정 | O6 |
| V8 | 생성된 코드를 보는 화면(있다면) | O7 |
| V9 | 디자인 시스템 자동 대조 결과 표시(위반 목록 등이 있다면) | O8 |
| V10 | "저장하고 다른 방향 시도" 뒤 저장본이 보이는 위치 | O9 |
| V11 | 이미지 레이어 교체·자르기 화면, 노트 요소 | O10 |
| V12 | 댓글 모드의 마커·열린 댓글 수·답글·"Show all comments" 목록·"Send to Claude" 체크 | F17, F18 |
| V13 | 레이어 트리 접기·펼치기와 행 선택 시 캔버스 강조 | F10 |
| V14 | 내보내기 메뉴 전체와 외부 도구 15종 목록 | F27 |

### 6.2 내보낼 파일

| # | 내보낼 파일 | 채우는 항목 |
|---|---|---|
| X1 | 같은 디자인 하나를 .zip 으로 내보낸 파일 | O11 |
| X2 | 같은 디자인의 독립 HTML | O11, O7 |
| X3 | 같은 디자인의 PDF, PPTX | F27 형식 확인 |
| X4 | `/design` 으로 아트보드별 PNG·PDF | F27 |
| X5 | 디자인 시스템을 하나 만든 뒤 그 화면 캡처 또는 내보낼 수 있는 형태(있다면) | F24, O8 |

내보낸 파일은 형식·구조 확인용이다. 안의 코드를 옮겨 쓰지 않는다(1.2절).

## 7. 결정 갈림길

결정 주체 "주인님 지시(작업서 decided)"는 작업서 task-v1 #dd537ed8 의 "이미 정한 것" 칸이다. G2 는 작업서 task-v1 #6dd42a49 의 "이미 정한 것" 칸(2026-11-08 주인님 지시)이다. 미정 행은 관찰(6절) 뒤 정하고, 그때까지 MVP 는 임시 형태로만 만든다.

| # | 갈림길 | 선택지 | 판단에 필요한 것 | 결정 | 결정 주체 | 결정일 | 비고 |
|---|---|---|---|---|---|---|---|
| G1 | 직접 편집의 기준 | (a) 캔버스 엔진 모델에서 편집하고 차이를 에이전트가 원본 코드에 반영 / (b) 실제 프로젝트 렌더 iframe 위에 자체 오버레이를 만들어 원본을 바로 고침 / (c) 정적 HTML 산출물만 편집 | A1(결과가 처음부터 코드) 유지 강도, O7 관찰 | (b) | 주인님 지시(작업서 decided) | 2026-11-08 | 작업서 문구: "실제 프로젝트 렌더 위 오버레이에서 편집하고 원본 코드를 바로 고친다(A1 유지)". 원본 쓰기는 명시 승인 단계로 분리(4.3절) |
| G2 | 아트보드 보드 | GrapesJS 단독(기기 전환) / Excalidraw 바깥 판과 함께 / 자체 구현 | O4·O5 관찰, 단계 4 범위 | 자체 구현 | 주인님 지시(작업서 task-v1 #6dd42a49 decided) | 2026-11-08 | 작업서 문구: "자체 구현 무한 캔버스 위에 아트보드(폭 1440·768·390 등)를 나란히 둔다. 이동(스페이스+드래그·휠)·확대축소·화면 맞춤". 구현은 `src/editor/ui/canvas-overlay.js`(엔진 어댑터 하나), 시각 언어와 하네스 진행 근거는 `docs/editor-canvas-design.md`. 보드 상태는 세션 `boards:[{id:'w1440',width:1440},…]` 그대로 |
| G3 | tldraw 제외 여부 | 제외 / 개발 환경 한정 사용 / 라이선스 구입 | 사용 데이터 전송 조항[L1]과 A7 충돌 | 제외 | 주인님 지시(작업서 decided) | 2026-11-08 | 작업서 문구: "tldraw 제외". 캔버스 엔진은 GrapesJS 미채택, 자체 오버레이 + parse5(MIT) — 2026-11-08 마스터 결정(질문 #d28996b0 회신), 근거 4.2절 |
| G4 | 버전 모델 | Design 방식("저장하고 다른 방향 시도", 버전 기록 없음[S1]) / 아티팩트 방식(발행마다 버전[S2]) / 둘 다 | O9 관찰 | 미정(관찰 뒤 결정) | — | — | MVP 임시 형태: 버전 UI 없음. `changes.json` 은 덧붙이기만 하고, 원본 적용마다 백업(`applied/<stamp>/`)과 `applied.json` 을 남김 |
| G5 | 외부 서비스 내보내기 | Google Slides·외부 도구 15종을 넣음 / 파일 형식(PDF·PPTX·zip·HTML·PNG)만 | A7(외부 네트워크 기본 차단)과의 관계 | 파일 형식만 | 주인님 지시(작업서 decided) | 2026-11-08 | 작업서 문구: "내보내기는 파일 형식만(PDF·PNG·HTML·zip)". PPTX 는 작업서 목록에 없어 넣지 않음. MVP 는 HTML·PNG |
| G6 | 공유·권한·동시 편집(F30·F31) | 넣지 않음 / 읽기 공유만 / 넣음 | 본인 전용 도구라는 확정 사항 | 넣지 않음 | 주인님 지시(작업서 decided) | 2026-11-08 | 작업서 문구: "공유·동시 편집 없음" |
| G7 | 진입 경로(F2) | MCP 도구 + 로컬 편집기 화면만 / 슬래시 명령 추가 / 모바일까지 | 사용 환경 | 미정(관찰 뒤 결정) | — | — | MVP 임시 형태: MCP 도구 3개(`design_edit`·`design_handoff`·`design_export`)와 로컬 URL 만 |
| G8 | Figma 가져오기(F22) | 넣음 / 넣지 않음 | 주인님이 Figma 를 쓰는지 | 넣지 않음 | 주인님 지시(작업서 decided) | 2026-11-08 | 작업서 문구: "G8 Figma 가져오기 제외" |
| G9 | 기준 제품판 | 아티팩트판 기준(요약 결론) 그대로 / 독립 사이트 기능도 포함 | 2026-12-14 종료 전에 독립판 관찰을 할지 | 아티팩트판 기준(요약 결론) 그대로 | 주인님 지시(작업서 decided) | 2026-11-08 | 작업서 문구: "독립 사이트 관찰 안 함(통합판 기준)". 통합판 = 아티팩트판 |

## 8. 출처

### 8.1 Claude Design 공개 문서

- [S1] https://support.claude.com/en/articles/14604416-get-started-with-claude-design (지정 출처)
- [S2] https://code.claude.com/docs/en/artifacts.md (지정 출처)
- [S3] [S2] 문서의 "Draft a design canvas" 절
- [S4] https://code.claude.com/docs/en/whats-new/2026-w34.md (지정 출처)
- [S5] https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design
- [S6] https://support.claude.com/en/articles/17440474-move-from-standalone-claude-design-to-claude
- [S7] https://support.claude.com/en/articles/17457950-use-artifacts-with-a-keyboard-or-screen-reader
- [S8] https://support.claude.com/en/articles/9547008-share-artifacts
- [S9] https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them

링크 URL 찾기용(내용 출처로는 쓰지 않음): https://support.claude.com/en/?q=...

### 8.2 오픈소스 후보

- [L1] https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md
- [L2] https://tldraw.dev/community/license · https://tldraw.dev/get-a-license/hobby · https://tldraw.dev/sdk-features/license-key (context7 `/llmstxt/tldraw_dev_llms_txt`)
- [L3] https://tldraw.dev/releases/v4.0.0 · https://tldraw.dev/releases/v3.9.0 (context7)
- [L4] https://tldraw.dev/sdk-features/embed-shape · https://tldraw.dev/examples/persistent-iframe-shape (context7)
- [L5] https://github.com/tldraw/tldraw/releases/tag/v5.6.0
- [L6] https://raw.githubusercontent.com/excalidraw/excalidraw/master/LICENSE
- [L7] https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/codebase/frames.mdx · …/api/utils/export.mdx (context7 `/excalidraw/excalidraw`)
- [L8] https://github.com/excalidraw/excalidraw/releases/tag/v0.18.1
- [L9] https://api.github.com/repos/excalidraw/excalidraw/commits?per_page=1 (2026-11-05)
- [L10] https://raw.githubusercontent.com/konvajs/konva/master/LICENSE
- [L11] context7 `/konvajs/konva` (test/text-paths.html, resources/doc-includes/NodeParams.txt)
- [L12] https://github.com/konvajs/konva/releases/tag/10.9.1
- [L13] https://raw.githubusercontent.com/GrapesJS/grapesjs/dev/packages/core/LICENSE
- [L14] context7 `/grapesjs/react`
- [L15] https://github.com/grapesjs/grapesjs/blob/dev/docs/modules/Layers.md · docs/api/editor.md `setDragMode` (context7)
- [L16] https://github.com/grapesjs/grapesjs/blob/dev/docs/api/editor.md `getHtml` · Device Manager `select` (context7)
- [L17] https://github.com/GrapesJS/grapesjs/releases/tag/v0.23.9
- [L18] https://raw.githubusercontent.com/puckeditor/puck/main/LICENSE
- [L19] https://puckeditor.com/docs (context7)
- [L20] context7 `/puckeditor/puck` (outline-plugin.mdx, fields/text.mdx `contentEditable`)
- [L21] https://puckeditor.com/docs/api-reference/components/puck (viewports)
- [L22] https://github.com/puckeditor/puck/releases/tag/v0.24.0
- [L23] https://raw.githubusercontent.com/prevwong/craft.js/main/LICENSE
- [L24] https://github.com/prevwong/craft.js/releases/tag/%40craftjs/layers%400.2.7
- [L25] https://api.github.com/repos/prevwong/craft.js/commits?per_page=1 (2025-02-14)
- [L26] https://raw.githubusercontent.com/penpot/penpot/develop/LICENSE
- [L27] context7 `/penpot/penpot` (docs/technical-guide/getting-started/docker.md, plugins-runtime api, developer/data-guide.md)
- [L28] https://github.com/penpot/penpot/releases/tag/2.18.6

## 9. 모름 목록

| # | 모르는 것 | 가르는 방법 |
|---|---|---|
| U1 | [S5]~[S9] 본문 끝부분(바이트 한도로 잘림). 특히 [S5] 검증 절 이후, [S8] 이메일 초대 절 이후 | 바이트 한도를 늘려 다시 읽기 |
| U2 | O1~O11 전체 | 6절 관찰 자료 |
| U3 | 외부 도구 15종의 이름 목록 | V14 관찰 또는 [S1] 재확인 |
| U4 | GrapesJS Studio SDK 라이선스 조건 | Studio SDK 라이선스 원문 확인(core 만 쓰면 무관) |
| U5 | Penpot 을 다른 페이지에 iframe 으로 넣을 수 있는지 | Penpot 문서·저장소 확인 |
| U6 | tldraw 프레임 기능의 실제 범위(v5.6.0 노트의 메뉴 항목으로만 확인) | tldraw 문서 확인(G3 에서 제외하면 불필요) |
| U7 | Penpot MCP 서버의 기능 | 해당 저장소 확인 |
| U8 | AstronDesign 에 "토큰 밖 색·글꼴 사용" 위반 검출 코드가 있는지(`src/tokens.ts` 는 allow 도출용으로만 확인) | `src/` 전체에서 토큰 위반 판정 경로 확인 |
| U9 | AstronDesign `vendor/` 참고 문서에 대조표 G0 키워드가 있는지(검색 안 함) | `vendor/` Grep |
| U10 | design_guide MCP 를 직접 부른 결과(원천 파일로 대신 확인함) | MCP 가 붙은 세션에서 호출 |
| U11 | WebSearch 로만 찾을 수 있는 자료(검색 API 키가 없어 못 씀) | 키 설정 뒤 재조사 |

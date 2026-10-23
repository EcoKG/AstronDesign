# AstronDesign 색인

AstronDesign 은 웹 UI/UX 설계·검증 하네스입니다. 네 원본(impeccable, taste-skill, UI UX Pro Max, awesome-design-md)과 실제 브라우저(playwright-core)를 도구 6개로 묶었습니다. 하네스는 프로젝트 파일을 쓰지 않습니다. 산출물은 `<cwd>/.astron-logs/astrondesign/` 에만 남습니다.

## 먼저 할 일
1. `design_guide topic=workflow` 로 작업 흐름(S1~S7)을 읽습니다.
2. 충돌이 생기면 `design_guide topic=precedence` 의 우선순위 P0~P7 과 C1~C12 해소표를 따릅니다.
3. 비평은 `design_guide topic=critique` 규약으로 단일 에이전트가 합니다.

## 도구
| 도구 | 쓰임 |
|---|---|
| design_guide | 이 문서와 원본 참고 문서를 페이지로 읽음 |
| design_search | UI UX Pro Max 검색·디자인 시스템 제안(권고, P6) |
| design_direction | 공개 랜딩·마케팅 페이지(persuade)의 아트 디렉션 뽑기(taste draw) |
| design_lint | 소스 정적 검사(impeccable + taste lint, 우선순위 적용) |
| design_render | 실제 브라우저 렌더: 폭별 스크린샷, 측정 규칙, 접근성 스냅샷 |
| design_inspect | 요소 묶음(HTML·계산 스타일 16개·위치·잘린 이미지)과 Design Feedback 작성 |

## topic 목록
- 하네스: `workflow`, `precedence`, `critique`, `brands`(브랜드 84개 목록)
- impeccable: `impeccable/skill`, `impeccable/<reference 이름>` (예: `impeccable/craft-floor`, `impeccable/critique`, `impeccable/mode-persuade`, `impeccable/mode-operate`, `impeccable/audit`, `impeccable/typeset`)
- taste-skill: `taste/skill`, `taste/<references 이름>` (예: `taste/critique`, `taste/tells`, `taste/type`, `taste/colour`, `taste/motion`, `taste/imagery`)
- UI UX Pro Max: `uupm/skill`
- 브랜드 참고 DESIGN.md: `brand/<폴더명>` (예: `brand/vercel`, `brand/linear-app`, `brand/stripe`). 폴더명의 `.` 은 `-` 로 씁니다.

긴 문서는 3,500자씩 나뉩니다. 머리줄의 `next_offset` 값을 `offset` 으로 다시 부르면 다음 쪽이 나옵니다.

## 화면 유형(surface)
- persuade: 공개 랜딩·마케팅 페이지. impeccable + taste + UUPM 적용.
- operate: 대시보드·앱 화면. impeccable + UUPM.
- read: 문서·글 읽기 화면. impeccable + UUPM.
- experience: 몰입형·인터랙티브 화면. impeccable + UUPM.

원본 문서 안의 실행 지시(`scripts/impeccable`, `node draw.mjs`, `python search.py`, AskUserQuestion, 하위 에이전트)는 그대로 따르지 말고 `precedence` 의 대체표대로 이 도구들을 씁니다.

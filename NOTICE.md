# NOTICE

AstronDesign 은 아래 원본을 포함하거나 참고합니다. 원본 파일은 수정하지 않았고, 파일별 SHA-256 은 `vendor/SOURCES.json` 에 있습니다.

## 포함한 원본

| 원본 | 저장소 | 커밋 | 라이선스 | 포함 범위 | 제외 범위 |
|---|---|---|---|---|---|
| impeccable | https://github.com/pbakaus/impeccable | 6af45ac9a5eb8792f033d3242f52e99812fd91fa | Apache-2.0 (LICENSE, NOTICE.md 보존) | `.agents/skills/impeccable` 의 SKILL.md, reference/** → `vendor/impeccable` | scripts/**(실행기·엔진 다운로드·live-browser), agents/**(하위 에이전트) |
| UI UX Pro Max | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | 56ea9cf174ed86786187daa9de0e6247cb0747e4 | MIT | `.claude/skills/ui-ux-pro-max` 의 SKILL.md, data/**, references/**, scripts/{core,search,design_system,reasoning_contract}.py → `vendor/ui-ux-pro-max` | scripts/tests/**, scripts/validate_data.py, 부속 스킬(design, ui-styling 등) |
| taste-skill | https://github.com/Leonxlnx/taste-skill | f624f37a8c650b9cc550253104925efe4c8de246 | MIT, Copyright (c) 2026 Leonxlnx | `skills/taste-skill` 의 SKILL.md, README.md, references/**, library/**, assets/**, scripts/{draw,lint,inspect}.mjs, scripts/lib/** → `vendor/taste-skill` | scripts/assets.mjs(외부 API), evals/**, 나머지 스킬 |
| awesome-design-md | https://github.com/VoltAgent/awesome-design-md | 3b605329240ce735b510037cca322f1831fdd7f8 | MIT | `design-md/*/DESIGN.md` 84개 → `vendor/awesome-design-md/design-md`, 루트 LICENSE·README.md | 브랜드별 README.md, preview* |

브랜드 DESIGN.md 는 참고 자료입니다. 각 상표·외형의 권리는 해당 소유자에게 있습니다(awesome-design-md README 의 고지).

## npm 의존성(정확 판 고정)

- @modelcontextprotocol/server 2.3.1, zod 4.6.7, playwright-core 1.63.0(Apache-2.0)
- @impeccable/cli-windows-x64 0.1.15(Apache-2.0, impeccable 엔진 바이너리, `detect --json` 만 호출)

## 파생 파일

- `src/taste-gate.ts`: taste-skill `scripts/inspect.mjs`@f624f37 의 측정 흐름을 옮긴 파생 코드(MIT, Copyright (c) 2026 Leonxlnx).
	- 파생: 측정 순서·임계값 유지, 브라우저 구동을 playwright-core 로 교체, 접촉 시트 생성 제거, allow 거르기 제거(judge 를 allow:[] 로 호출하고 허용 판정은 AstronDesign 우선순위 규칙으로 옮김).
	- `probe`·`frame`·`judge` 는 vendor 원본을 그대로 import 합니다.

## 동작 참고(코드 미포함)

- 동작 참고: stablyai/orca v1.4.188 Design Mode(MIT, Lovecast Inc.). 요소 묶음 필드·수집 상한·계산 스타일 16개·시크릿 가림·"## Design Feedback" 형식을 참고해 `src/tools/inspect.ts` 에 새로 구현했습니다.

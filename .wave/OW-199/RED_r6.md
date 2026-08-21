[RED r6]

읽은 라운드 — `[ANALYZE]` · `[GATE]` + `[GATE r2]` · `[PLAN r6]` + `[PLAN r6 cont.1]` · `[CHECK r6]` · 부모 description · 실행 이슈 11건(OW-200~OW-210)의 1·2·3절. `[GATE]` 는 r1 과 r2 를 모두 읽었다 — r2 는 Q1~Q5 를 대체하지 않는 증분(OW-210 백스톱 구조 지시 1행)이라 r1 의 확정 답변 5건이 계획의 유일한 출처로 살아 있기 때문이다.

기준선 재측정 — `git rev-parse --short HEAD` = `7b3e205`, `git status --porcelain` 무출력.

## Attack surfaces

### A1 premise

method: (1) `[ANALYZE]` `anchor_candidates` 34행 전량을 그 행이 적은 명령으로 재실행 — `git grep -I -l -F -- "<s>" | wc -l` 와 `git grep -I -o -F -- "<s>" | wc -l`. (2) `target_state` 31행 중 파일 20건을 `stat -f "%z %N"` 로, 신규 9건을 `test -e` 로, 디렉터리 3건을 `ls | wc -l` 로 재측정. (3) 기준선 `npx vitest run` 재실행. (4) 스냅샷 `find <dir> -type f | wc -l`. (5) 호스트 `which nvidia-smi`, `python3.12 --version`. (6) `[GATE]` 인용 5건을 `sed -n '<n>p'` 로 원문 대조(227·250·263·284·349행). (7) 로드맵 출처 `tasks-eng-review-20260721-095918.jsonl` 을 파싱해 행수와 run_id 대조. (8) `## Provisional requirements` 의 `(assumed: ...)` 4건(2·12·22·23항)을 `[GATE]` 확정 답변과 1:1 대조.

result: anchor_candidates 34행 전부 files/hits 가 기록값과 정확히 일치(`Colab` 17/74, `colab` 20/100, `ColabJobRunner` 4/28, `AbortSignal.any` 2/2, `IMAGEWORK_RECOVERY_ROOT` 7/10, 0건 24행 전부 0/0 포함). target_state 파일 20건의 바이트 크기 전부 일치(`lib/colab-job-runner.ts` 20466, `tests/colab-job-runner.test.ts` 29615, `components/image-processor.tsx` 22178, `DESIGN.md` 16259 등), 신규 9건 전부 부재. `runner/` 5 · `scripts/` 2 는 일치하나 `docs/` 는 기록 "2개 파일" 과 달리 실측 3(`colab-results.md`·`reverse-proxy.md`·`server-worker.md`) — `[PLAN]` `## refutations` 1번이 이미 반박한 그대로이며 그 반박이 유효하다. `npx vitest run` = 6 파일 / 68 테스트 통과(8.78초)로 기준선 일치. 스냅샷 50 파일 일치. `nvidia-smi` not found · `python3.12` = 3.12.13 일치. GATE 인용 — 263행은 "모든 엔드포인트에 `proxy_read_timeout 120s` 수준", 349행은 "만료 jobId를 잘못된 jobId와 동일 취급 400" 으로 원문 정확 일치. Q2 가 인용한 227행은 `### 프로비저닝 (1회, scripts/provision-worker.sh 신규)` 라는 절 제목이고 "프로비저닝 0단계" 문구는 250·284행에 있다 — `[PLAN r6]` `## refutations` 6번이 이미 이 줄 포인터를 정정했고 답변 (C) 의 실질은 284행 "(b) torch/torchvision CUDA 휠 해시 고정 가능성 검증(프로비저닝 0단계)" 가 그대로 뒷받침한다. jsonl 20행 / run_id `20260721T005918Z-89757` 단일값으로 일치. assumed 4건 — 2항(Q2 A/C 채택 가정) → GATE (C) 채택, 12항(400 고정) → Q5 (B) 400 고정, 22항(Q4 A/B) → (A), 23항(Q4 A) → (A) 로 전부 성립.

### A2 anchor

method: dispatch table 앵커 **전수 40건**을 `git grep -I -c -F -- '<s>'` 로 저장소 전역 계수(아래 목록), 그리고 이슈 11건의 `## 1. Preconditions` 에 적힌 기대값 검사 46건을 그대로 실행해 기대값과 대조. 별도로 각 이슈 `## 2. Change` 의 펜스 앵커가 `## 1. Preconditions` 에 대응 검사를 갖는지 1:1 대조. skills 는 표 11건의 `skills` 배열 길이 합을 세고(0), 3-루트 해소 스크립트를 대조군 3건(`superpowers:brainstorming`·`ponytail:ponytail`·`no-such-skill-xyz`)으로 실행해 검사 자체가 동작함을 확인했다.

result: 40건 전부 존재·계수 일치, 0건 앵커는 신규 도입 대상 2건(`local-job-runner`, `sam3-local-requirements.lock`)뿐이다. 파일 지정 없이 전역 유일하지 않은 앵커는 8건(`sam3-requirements.lock` 8 files, `IMAGEWORK_RECOVERY_ROOT` 7, `check:colab-notebook` 3, `createCancelHandler` 3, `proxy_read_timeout 7350s` 2, `import { ImageProcessor } ...` 2, `AbortSignal.any` 2, `colab` 20)이나 전부 해당 이슈의 전제조건이 파일과 기대 건수를 못박아 모호성이 없다(`colab`·`AbortSignal.any` 는 OW-210 의 의도된 전역 스윕). 전제조건 46건 실행 결과 기대값과 어긋난 항목 0건 — 예: `grep -ci colab app/api/process/route.ts` = 8, `grep -cE 'from "@/lib/colab-(errors|input)"' app/api/process/route.ts` = 2 로 OW-203 2-1 상한 게이트의 두 기대값이 성립하고, 그 8줄은 1·2·3·9·21·53·55·56행이며 편집 지시가 닿지 않는 줄은 2·3행(허용된 import 2건)뿐이다. `grep -cF -- 'createCancelHandler' tests/process-cancel.test.ts` = 7, `grep -cE 'IMAGEWORK_(HF_TOKEN|JOB_SCRIPT|RECOVERY_ROOT|GOOGLE_APPLICATION_CREDENTIALS|COLAB_AUTH_MODE|COLAB_CONFIG|COLAB_ACCELERATOR)' tests/process-cancel.test.ts` = 7, `docs/server-worker.md` 4종 정규식 = 5, `README.md` = 1, `CLAUDE.md` = 1 로 전부 기록값과 동일. `## 2. Change` 펜스 앵커 대 전제조건 대조 — 대응 검사가 없는 것은 OW-204 2-2 의 `<p>파일의 실제 픽셀 크기를 ... 다운로드합니다.</p>` 1건뿐이고, 전제조건이 그 부분 문자열(`전용 Colab GPU 작업자가 결과를 만든 뒤 브라우저로 다운로드합니다.`)을 검사하며 전체 줄도 `grep -cF` = 1 로 실재한다. skills — 11개 태스크의 `skills` 합계 0건이라 해소할 이름이 없다(대조군 스크립트는 설치된 2건 resolved / 가짜 1건 MISSING 으로 정상 동작).

```
OW-200  sam3-requirements.lock  ->  8 files
OW-200  # Torch, torchvision, numpy<2, and Pillow are Colab base-runtime invariants and are preflighted separately.  ->  runner/sam3-requirements.lock:1
OW-201  def run_inference(job_root: Path) -> None:  ->  runner/remote-worker.py:1
OW-201  const workerPath = resolve(process.cwd(), "runner/remote-worker.py");  ->  tests/remote-worker-contract.test.ts:1
OW-202  export class ProcessJobRegistry {  ->  lib/process-job-registry.ts:1
OW-202  local-job-runner  ->  0 (exit 1)
OW-203  const result = await runnerProvider().run(input, AbortSignal.any([jobSignal, request.signal]));  ->  app/api/process/route.ts:1
OW-203  import { ColabJobRunner, matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner";  ->  app/api/process/route.ts:1
OW-203  type Runner = Pick<ColabJobRunner, "run">;  ->  app/api/process/route.ts:1
OW-203  let serverRunner: ColabJobRunner | undefined;  ->  app/api/process/route.ts:1
OW-203  const runnerFromEnvironment = (): ColabJobRunner => {  ->  app/api/process/route.ts:1
OW-203  if (!serverRunner) serverRunner = new ColabJobRunner(parseRunnerConfig(process.env));  ->  app/api/process/route.ts:1
OW-203  현재 Colab 작업을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.  ->  app/api/process/route.ts:1
OW-203  import { matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner";  ->  app/api/process/cancel/route.ts:1
OW-203  super("The client cancelled the Colab job.");  ->  lib/colab-errors.ts:1
OW-203  super("The Colab job exceeded its allowed time.");  ->  lib/colab-errors.ts:1
OW-203  super("The Colab command did not complete.");  ->  lib/colab-errors.ts:1
OW-204  case "running": return "전용 Colab GPU 작업자가 이미지를 처리하고 있습니다. 이 창을 닫지 마세요.";  ->  components/image-processor.tsx:1
OW-204  case "running": return "Colab GPU에서 처리 중입니다";  ->  components/image-processor.tsx:1
OW-204  전용 Colab GPU 작업자가 결과를 만든 뒤 브라우저로 다운로드합니다.  ->  app/page.tsx:1
OW-204  type JobState =  ->  components/image-processor.tsx:1
OW-205  createCancelHandler  ->  CLAUDE.md:1; app/api/process/cancel/route.ts:2; tests/process-cancel.test.ts:7
OW-205  import { parseRunnerConfig } from "../lib/colab-job-runner";  ->  tests/process-cancel.test.ts:1
OW-205  import { ImageProcessor } from "../components/image-processor";  ->  app/page.tsx:1; tests/image-processor.test.tsx:1
OW-206  IMAGEWORK_RECOVERY_ROOT  ->  7 files
OW-206  proxy_read_timeout 7350s;  ->  deploy/nginx.conf.example:1
OW-206  proxy_read_timeout 7350s  ->  deploy/nginx.conf.example:1; docs/reverse-proxy.md:1
OW-206  ## 2. Configure Google Colab CLI authentication  ->  docs/server-worker.md:1
OW-206  check:colab-notebook  ->  CLAUDE.md:2; README.md:2; package.json:1
OW-206  AbortSignal.any  ->  CLAUDE.md:1; app/api/process/route.ts:1
OW-207  sam3-local-requirements.lock  ->  0 (exit 1)
OW-208  "check:colab-notebook": "node scripts/check-colab-notebook.mjs",  ->  package.json:1
OW-208  # generated Colab artifacts (the canonical notebook and results template are intended for tracking)  ->  .gitignore:1
OW-209  import type { AssetMode } from "./colab-input";  ->  lib/zip-contract.ts:1
OW-209  import { ResultContractError } from "./colab-errors";  ->  lib/zip-contract.ts:1
OW-209  import { ImageworkInputError } from "./colab-errors";  ->  lib/colab-input.ts:1
OW-209  colab\/  ->  scripts/check-public-artifacts.mjs:1
OW-210  "check:public-artifacts": "node scripts/check-public-artifacts.mjs"  ->  package.json:1
OW-210  colab  ->  20 files
OW-210  AbortSignal.any  ->  CLAUDE.md:1; app/api/process/route.ts:1
```

### A3 conflict

method: dispatch table 을 파싱해 (1) `target_files` 경로별 소유자 표를 만들고 모든 2-조합을 열거해 한쪽 이상이 `write: true` 인 쌍에 대해 `deps` 이행 폐포로 순서 존재 여부를 판정, (2) 이슈 11건의 `## 2. Change` 본문에서 정규식으로 저장소 경로를 추출해 각 태스크의 `target_files` 집합과 차집합을 계산, (3) 각 이슈 `## 1. Preconditions` 의 "선행 태스크 ID" 행과 표의 `deps` 배열을 11건 전부 문자열 대조.

result: 고유 경로 46개, 경로 공유 쌍 97건, 그중 순서가 필요한(한쪽 이상 write) 쌍 87건, **미정렬 0건** — `[PLAN r6 cont.1]` 이 인용한 87건과 동일하고 `[CHECK r6]` check 4 와도 일치한다. write:true 소유자가 2인 이상인 경로 20개(`app/api/process/*.ts` 4종 = OW-203→OW-209→OW-210, `tests/*` 6종 = OW-201/205→OW-209→OW-210 등)도 전부 사슬이 존재한다. 본문 경로 대 `target_files` 차집합 — 11건 전부에서 "읽거나 쓰는데 표에 없는" 경로 0건이다. 검출된 차집합 항목은 전부 (a) 정규식이 잘라낸 접두사(`lib/colab-`, `lib/local-job-runner`), (b) 다른 태스크 소유임을 명시하는 참조(OW-203 의 `CLAUDE.md`, OW-208 의 `runner/vtracer-Cargo.lock`, OW-209 의 `tests/zip-contract.test.ts`), (c) 모듈 지정자 문자열(`@/lib/colab-job-runner`)이며 셋 다 §3 에 out-of-scope 로 명시돼 있다. 반대 방향(본문이 쓰는데 `write: false`)도 0건 — OW-203 의 `lib/process-job-registry.ts`, OW-205 의 `lib/`·`app/`·`components/` 전부, OW-210 의 `package.json` 이 §3 에서 읽기 전용으로 재확인된다. 선행 태스크 ID 대 `deps` 는 11건 전부 일치(OW-208 의 8건 목록 포함).

### A4 irreversible

method: `[ANALYZE]` `non_git_paths` 행(`(none)`)을 `D=$(mktemp -d); git check-ignore -v -- "$D"` 로 재측정하고, 표 11건의 `irreversible` 값을 각 태스크의 `target_files`·본문과 대조. 대량 삭제를 수행하는 OW-208 의 삭제 대상 8건 전부에 `git ls-files --error-unmatch` 를 실행해 추적 여부를 확인. OW-200 2-3 의 `rm -rf` 대상 범위와 `.gitignore` 의 빌드 산출물 규칙(`grep -n next .gitignore`)도 확인.

result: `git check-ignore` 가 `fatal: ... is outside repository` / 종료 128 — `[PLAN]` `## refutations` 2번 그대로이며 `non_git_paths: (none)` 은 여전히 사실과 다르다. 다만 그 비-git 경로는 OW-200 이 같은 실행 안에서 `mktemp -d` 로 만들고 `rm -rf "$LOCKGATE_DEST"` 로 지우는 디렉터리 하나뿐이고, 삭제 대상이 변수 하나로 한정돼 있어 `irreversible: false` 는 타당하다. OW-208 삭제 8건은 전부 `tracked`(lib/colab-job-runner.ts · colab/imagework.ipynb · scripts/check-colab-notebook.mjs · tests/colab-job-runner.test.ts · runner/remote-worker.py · runner/sam3-requirements.lock · runner/sam3-build-requirements.lock · docs/colab-results.md)이고 §3 가 `git commit` 을 금지하므로 HEAD `7b3e205` 에서 복구 가능 — `irreversible: false` 타당. OW-210 의 `npm run build` 산출물은 `.gitignore` 17행 `/.next/` 로 무시되어 `git status --porcelain` 을 오염시키지 않는다. 11건 전부 `irreversible: false` 가 유지될 근거가 있다.

### A5 model

method: 표에서 `model` 이 `haiku` 인 태스크를 추출(OW-208 1건, 나머지 10건 sonnet)하고, 그 `## 2. Change` 3개 절을 노드 2 기준("어떻게"까지 확정 — 결정적 치환 / 앵커가 유일한 삭제 / 세기 / 파일 분할)에 대조. 삭제 경계 서술의 결정성을 `grep -n -A9 -- '# generated Colab artifacts' .gitignore` 로 실측 대조.

result: OW-208 의 세 작업 전부 "무엇"이 아니라 "어떻게"까지 확정돼 있다 — 2-1 은 경로 8개를 열거한 `git rm`(각 경로 `test -e` 로 사전 확인, 부재 시 건너뛰고 보고), 2-2 는 저장소 전역 유일 앵커 1줄 삭제(`git grep -c -F` = `package.json:1`), 2-3 은 앵커 줄부터 시작하는 블록 삭제이고 실측상 24행이 앵커, 25~31행이 `/colab/` 로 시작하는 7줄, 32행이 빈 줄이라 "그 바로 아래 `/colab/` 로 시작하는 7줄" 과 "첫 비-`/colab/` 줄 직전까지" 두 서술이 같은 경계(24~31행)를 가리킨다. 판단 잔여 0건이므로 haiku 유지가 타당하다. sonnet 10건은 A5 판정 대상이 아니다.

## Blockers

* {surface: A3, task_id: OW-206, evidence: 이 웨이브가 삭제하는 파일을 가리키는 참조 중 이름에 `colab` 이 없는 것들이 `docs/server-worker.md` 에 남고 어떤 게이트도 이를 잡지 못한다. 측정(커밋 `7b3e205`) — `grep -nE 'sam3-(build-)?requirements\.lock|remote[- ]worker' docs/server-worker.md` = **5줄**: 66행(`IMAGEWORK_JOB_SCRIPT` 표 행의 `runner/remote-worker.py`) · 122행(`The remote worker verifies the SHA-256 of the uploaded`) · 123행(`[sam3-build-requirements.lock](../runner/sam3-build-requirements.lock),`) · 124행(`[sam3-requirements.lock](../runner/sam3-requirements.lock) and`) · 131행(`remote worker also verifies the SHA-256 of the official Rust 1.80.0 archive`). 66행만 OW-206 2-5 의 `grep -cE 'IMAGEWORK_(HF_TOKEN|JOB_SCRIPT|RECOVERY_ROOT|GOOGLE_APPLICATION_CREDENTIALS)'` 게이트에 걸리고 122·123·124·131행은 어디에도 걸리지 않는다 — `grep -ci colab docs/server-worker.md` 0건 게이트는 이 문자열들에 `colab` 이 없어 통과하고, OW-210 2-2 의 전역 스윕 2건은 `colab` 과 `AbortSignal.any` 뿐이며, 이 파일은 어떤 테스트·tsc·lint·build 도 읽지 않는다. 두 락 파일과 `runner/remote-worker.py` 는 OW-208 2-1 이 삭제하므로(셋 다 `git ls-files --error-unmatch` = tracked 확인) 웨이브 종료 시점에 `docs/server-worker.md` 는 존재하지 않는 파일로 가는 상대 링크 2건과 원격 워커 서술 2문단을 갖는다. 같은 삭제 대상을 참조하는 다른 두 파일은 문자열 단위 지시가 있다 — `runner/LOCKS.md` 는 OW-200 2-4 가 "`sam3-requirements.lock` / `sam3-build-requirements.lock` 을 가리키는 서술은 모두 로컬 락 이름으로 바꾼다" 로, `tests/remote-worker-contract.test.ts` 는 OW-201 2-2 가 "락 경로 상수를 ... 로 바꾸고" 로 못박는데 `docs/server-worker.md` 만 지시도 게이트도 없다. `git grep -I -c -F -- 'sam3-requirements.lock'` = 8 files 중 웨이브 종료 후 살아남는 파일은 `runner/LOCKS.md` · `tests/remote-worker-contract.test.ts` · `docs/server-worker.md` 3개뿐이고 앞 두 개만 소유자가 있다. 2-5 본문의 "작업 수명주기 절을 비동기 흐름으로 다시 쓴다" 가 122~131행을 포함하는 `## 4. Job lifecycle and cleanup` 절(82행 시작)을 덮기는 하지만, 2-5 스스로 `IMAGEWORK_*` 정규식 게이트를 추가하며 인정한 것과 똑같은 이유로("이름에 `colab` 이 없어 위 검사만으로는 통과해 버린다") 이 문자열들에도 대응 게이트가 필요하다, fix_instruction: OW-206 2-5 에 완료 판정 1줄을 `IMAGEWORK_*` 정규식 게이트 바로 아래 같은 형식으로 추가한다 — `grep -cE 'sam3-(build-)?requirements\.lock|remote[- ]worker' docs/server-worker.md; echo "exit=$?"` 기대 `0` / `exit=1`, 측정 기준값 5건(66·122·123·124·131행)을 함께 적는다. `## 1. Preconditions` 에도 착수 시점 5건을 확인하는 대응 줄을 넣는다. 정규식은 로컬 전환 후의 정상 표기를 잡지 않는다 — `sam3-local-requirements.lock` · `sam3-local-build-requirements.lock` · `runner/local-worker.py` · `the local worker verifies` 4줄을 이 정규식에 통과시킨 결과 히트 0 / 종료 1 로 확인했다. OW-206 의 `target_files` · `deps` 변경은 필요 없다}

## Notes

* {surface: A2, task_id: OW-199, text: `[PLAN r6]` `## new_anchors` 는 "`[ANALYZE]` 의 `anchor_candidates` 에 없던 앵커 전량. 25건" 이라고 선언하지만 실제로는 8건이 빠져 있다 — `## 2. Configure Google Colab CLI authentication`(OW-206), `"check:colab-notebook": "node scripts/check-colab-notebook.mjs",`(OW-208), `# generated Colab artifacts (the canonical notebook and results template are intended for tracking)`(OW-208), `import type { AssetMode } from "./colab-input";` · `import { ResultContractError } from "./colab-errors";` · `import { ImageworkInputError } from "./colab-errors";` · `colab\/`(OW-209), `"check:public-artifacts": "node scripts/check-public-artifacts.mjs"`(OW-210). 8건 모두 `anchor_candidates` 34행에 없다(그 표에 있는 것은 `check:colab-notebook` · `colab` 같은 짧은 토큰이지 이 줄 전체가 아니다). 이번 라운드에 8건을 전부 직접 계수했고 각각 저장소 전역 1 file / 1 hit 로 유일하므로 워커가 오도될 여지는 없다 — 기록 누락이며 다음 라운드가 `## new_anchors` 를 33건으로 고치면 끝난다}
* {surface: A1, task_id: OW-206, text: `.env.example` 의 환경 변수 목록(OW-206 2-1)과 zod 스키마(OW-202 2-2)는 서로를 검증하지 않는다. OW-206 의 `deps` 는 `[]` 이고 `## 1. Preconditions` 도 OW-202 의 `## Decisions` 를 읽으라고 하지 않으며, `.env.example` 을 읽는 테스트·tsc·lint·build 가 없어 두 목록이 어긋나도 OW-210 체크 세트가 잡지 못한다. 이번 라운드에 두 목록을 문자 대조한 결과 현재는 완전 일치한다 — 제거 7종(`IMAGEWORK_HF_TOKEN` · `COLAB_AUTH_MODE` · `GOOGLE_APPLICATION_CREDENTIALS` · `COLAB_CONFIG` · `COLAB_ACCELERATOR` · `JOB_SCRIPT` · `RECOVERY_ROOT`), 추가 5종(`WORKER_PYTHON` · `WORKER_SCRIPT` · `MODEL_CACHE` · `VTRACER_BIN` · `RESULT_TTL_SECONDS`), 유지 3종, 변경 1종(`JOB_TIMEOUT_SECONDS` 30~600)이 두 스펙에서 동일하다. 현행 불일치가 없으므로 블로커가 아니며, 값을 굳히려면 OW-206 `## 1. Preconditions` 에 "OW-202 의 `## Decisions` 가 이미 있으면 그 목록을 정본으로 쓰고 불일치를 `worker_done` 에 적는다" 한 줄이면 충분하다}
* {surface: A3, task_id: OW-207, text: venv·모델 캐시·vtracer 바이너리 경로와 NVIDIA 드라이버/CUDA 임계값은 GATE Q5 (B) 로 OW-207 워커에게 위임됐는데, 같은 값이 들어가는 `.env.example`(`IMAGEWORK_WORKER_PYTHON` · `IMAGEWORK_MODEL_CACHE` · `IMAGEWORK_VTRACER_BIN`)과 `docs/server-worker.md` 는 OW-206 소유이고 OW-206 은 OW-207 에 의존하지 않는다(`deps: []`). 두 태스크는 파일을 공유하지 않아 A3 의 공유-쓰기 판정에는 걸리지 않지만 값 일치를 강제하는 게이트도 없다 — 현재 안전장치는 OW-207 `## Decisions` 절의 "문서 태스크가 이미 끝났다면 불일치를 `worker_done` 에 보고한다" 산문 한 줄뿐이다. 자리표시자 성격의 경로라 실패 강도가 낮아 노트로 남긴다}
* {surface: A4, task_id: OW-200, text: `[ANALYZE]` `non_git_paths` 의 `(none)` 과 `[PLAN]` `## refutations` 2번의 불일치가 라운드 3~6 내내 남아 있다(이번 라운드 재측정 종료 128 로 반박 재현). `[PLAN r6 cont.1]` N3 이 밝힌 대로 노드 2 에는 `[ANALYZE]` 코멘트를 고칠 verb 가 없고, 실제 위험은 `mktemp -d` 디렉터리 1건으로 한정돼 `irreversible: false` 판정이 유지된다. 이번에도 계획 변경을 요구하지 않는다 — 다음 웨이브 노드 1 이 `non_git_paths` 를 그대로 승계하지 않게 하는 것이 유일한 후속 조치다}
* {surface: A2, task_id: OW-203, text: 이 웨이브가 새로 만드는 파일 중 `app/api/process/status/route.ts` · `app/api/process/result/route.ts`(OW-203 2-2·2-3)와 `tests/local-job-runner.test.ts` · `tests/process-job-registry.test.ts` · `tests/process-async-api.test.ts`(OW-205 2-1~2-3) 5건만 자기 파일 `colab` 0건/상한 1차 방어선이 없다. 나머지 신규 파일은 전부 있다 — `runner/sam3-local-requirements.lock` · `runner/sam3-local-build-requirements.lock`(OW-200 2-4b), `runner/local-worker.py`(OW-201 2-1), `lib/local-job-runner.ts`(OW-202 2-2b 상한 게이트), `deploy/imagework.service.example`(OW-206 2-3), `scripts/provision-worker.sh`(OW-207). 5건 모두 `@/lib/colab-errors` · `@/lib/colab-input` 임포트를 갖게 되므로 OW-209 2-2 의 대상 목록에 이미 명시돼 있고 OW-210 전역 스윕이 2차로 받으므로 커버리지 구멍은 아니다 — 다만 웨이브의 "신규 파일마다 1차 방어선" 패턴에서 이 5건만 예외라는 사실을 기록한다}

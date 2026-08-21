[RED r7]

읽은 라운드 — `[ANALYZE]` · `[GATE]` + `[GATE r2]` · `[PLAN r7]` + `[PLAN r7 cont.1]` · `[CHECK r7]` · 부모 description · 실행 이슈 11건(OW-200~OW-210)의 1·2·3절. `[GATE]` 는 r1 과 r2 를 모두 읽었다 — r2 는 Q1~Q5 를 대체하지 않는 증분(OW-210 백스톱 구조 지시 1행)이라 r1 의 확정 답변 5건이 계획의 유일한 출처로 살아 있다.

기준선 재측정 — `git rev-parse --short HEAD` = `7b3e205`, `git status --porcelain` 무출력.

## Attack surfaces

### A1 premise

method: (1) `[ANALYZE]` `anchor_candidates` 34행 전량을 그 표가 적은 명령으로 재실행 — `git grep -I -l -F -- "<s>" | wc -l` 와 `git grep -I -o -F -- "<s>" | wc -l`. (2) `target_state` 31행 — 기존 파일 20건을 `stat -f "%z %N"`, 신규 9건을 `test -e`, 디렉터리 3건을 `ls | wc -l`. (3) 기준선 `npx vitest run` 재실행. (4) 스냅샷 `find <dir> -type f | wc -l`. (5) 호스트 `which nvidia-smi`, `python3.12 -m pip --version`. (6) `[GATE]` 인용 5건을 `sed -n '<n>p'` 로 설계 문서 원문 대조(227·250·263·284·349행). (7) 로드맵 `tasks-eng-review-20260721-095918.jsonl` 을 파싱해 행수와 run_id 를 셌다. (8) `## Provisional requirements` 의 `(assumed: ...)` 4건(2·12·22·23항)을 `[GATE]` 확정 답변과 1:1 대조.

result: `anchor_candidates` 34행 전부 files/hits 가 기록값과 정확히 일치 — `Colab` 17/74, `colab` 20/100, `ColabJobRunner` 4/28, `AbortSignal.any` 2/2, `IMAGEWORK_RECOVERY_ROOT` 7/10, `remote-worker` 6/9, `check:colab-notebook` 3/5, 0건 24행 전부 0/0. `target_state` 기존 파일 20건의 바이트 크기 전부 일치(`lib/colab-job-runner.ts` 20466 · `tests/colab-job-runner.test.ts` 29615 · `components/image-processor.tsx` 22178 · `docs/server-worker.md` 11158 · `DESIGN.md` 16259 등), 신규 9건 전부 부재. `runner/` 5 · `scripts/` 2 는 일치하나 `docs/` 는 기록 "2개 파일" 과 달리 실측 3(`colab-results.md` · `reverse-proxy.md` · `server-worker.md`) — `[PLAN]` `## refutations` 1번이 이미 반박한 그대로다. `npx vitest run` = 6 파일 / 68 테스트 통과(8.81초)로 기준선 일치. 스냅샷 50 파일 일치. `nvidia-smi` not found · `pip 26.1.2 (python 3.12)` 일치. GATE 인용 — 263행 "모든 엔드포인트에 `proxy_read_timeout 120s` 수준" 과 349행 "만료 jobId를 잘못된 jobId와 동일 취급 400" 은 원문 정확 일치이고, 263행은 "각 위치 블록의 `limit_req` burst 값은 (구현 시 확정)" 도 함께 담아 Q5 (B) 의 위임 절반까지 뒷받침한다. 227행은 `### 프로비저닝 (1회, scripts/provision-worker.sh 신규)` 라는 절 제목이고 "프로비저닝 0단계" 는 250·284행에 있다 — `[PLAN r7 cont.1]` `## refutations` 6번이 이미 정정한 그대로다. jsonl 20행 / run_id `20260721T005918Z-89757` 단일값. assumed 4건 전부 성립 — 2항→Q2 (C), 12항→Q5 (B) 400 고정, 22항→Q4 (A), 23항→Q4 (A).

### A2 anchor

method: dispatch table 앵커 **전수 40건**(중복 제거 39)을 `git grep -I -c -F -- '<s>'` 로 저장소 전역 계수(아래 목록). 이슈 11건의 `## 1. Preconditions` 에 적힌 검사 46건을 그대로 실행해 기대값과 대조. 각 이슈 `## 2. Change` 의 펜스 블록 55건을 추출해 검색 대상 앵커가 `## 1. Preconditions` 에 대응 검사를 갖는지 1:1 대조. `## 2. Change` 안의 줄 번호 표기를 정규식 `\d+\s*(행|번째 줄)` 으로 전수 검출(4건). `## new_anchors` 33건 주장을 dispatch table 파싱값과 집합 연산으로 검증. skills 는 `skills` 배열 길이 합(0)을 세고 3-루트 해소 스크립트를 대조군 3건으로 실행. **OW-206 2-5 의 대응표는 실측 5줄에 실제로 적용해 게이트를 재실행했다** — `grep -nE 'sam3-(build-)?requirements\.lock|remote[- ]worker' docs/server-worker.md` 출력 5줄을 파일로 뽑아 대응표 4쌍을 문자열 치환한 뒤 같은 게이트를 돌렸다.

result: 앵커 40건 전부 존재·계수 일치, 0건은 신규 도입 대상 2건(`local-job-runner`, `sam3-local-requirements.lock`)뿐. 전제조건 46건 실행 결과 기대값과 어긋난 항목 0건 — 선행 태스크 산출물을 기대하는 `exists=0` 5건(OW-201 락 2종 · OW-203 `lib/local-job-runner.ts` · OW-207 락 2종·LOCKS.md)만 HEAD 시점에 미충족이고 이는 deps 순서상 정상이다. `## 2. Change` 펜스 대 전제조건 대조 — 대응 검사가 없는 검색 앵커는 OW-204 2-2 의 `<p>파일의 실제 픽셀 크기를 ... 다운로드합니다.</p>` 1건뿐이고 전제조건이 그 부분 문자열을 검사한다. 줄 번호 표기 4건 중 3건(OW-200 · OW-201 · OW-202)은 측정 근거이고 편집 주소가 아니다. **OW-206 2-5 만 줄 번호가 3개 위치의 유일한 주소다** — 대응표를 실제로 적용한 결과 게이트가 `5 → 3`(종료 0)으로만 내려가고 0 이 되지 않았다(블로커 1). `## new_anchors` 는 33건으로 정확하다 — 표 앵커 유일 39건 − `anchor_candidates` 중복 6건(`AbortSignal.any` · `IMAGEWORK_RECOVERY_ROOT` · `check:colab-notebook` · `colab` · `createCancelHandler` · `local-job-runner`) = 33, 목록의 33줄과 집합 차집합 양방향 0건으로 `[RED r6]` 노트 1 은 해소됐다. `[PLAN r7]` 펜스 4개 · `[PLAN r7 cont.1]` 펜스 6개 전부 짝이 맞고 절 제목 6개는 모두 펜스 밖이다. skills 합계 0건이라 해소할 이름이 없다(대조군: 설치된 2건 resolved, 가짜 1건 MISSING 으로 검사 자체는 동작).

```
OW-200  sam3-requirements.lock  ->  8 files (docs/server-worker.md:1 lib/colab-job-runner.ts:1 runner/LOCKS.md:3 runner/remote-worker.py:1 runner/sam3-build-requirements.lock:1 runner/sam3-requirements.lock:1 tests/colab-job-runner.test.ts:1 tests/remote-worker-contract.test.ts:1)
OW-200  # Torch, torchvision, numpy<2, and Pillow are Colab base-runtime invariants and are preflighted separately.  ->  runner/sam3-requirements.lock:1
OW-201  def run_inference(job_root: Path) -> None:  ->  runner/remote-worker.py:1
OW-201  const workerPath = resolve(process.cwd(), "runner/remote-worker.py");  ->  tests/remote-worker-contract.test.ts:1
OW-202  export class ProcessJobRegistry {  ->  lib/process-job-registry.ts:1
OW-202  local-job-runner  ->  0 (exit 1, 신규 도입 대상)
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
OW-205  createCancelHandler  ->  CLAUDE.md:1 app/api/process/cancel/route.ts:2 tests/process-cancel.test.ts:7
OW-205  import { parseRunnerConfig } from "../lib/colab-job-runner";  ->  tests/process-cancel.test.ts:1
OW-205  import { ImageProcessor } from "../components/image-processor";  ->  app/page.tsx:1 tests/image-processor.test.tsx:1
OW-206  IMAGEWORK_RECOVERY_ROOT  ->  7 files (.env.example:1 CLAUDE.md:1 README.md:1 docs/server-worker.md:1 lib/colab-job-runner.ts:3 tests/colab-job-runner.test.ts:1 tests/process-cancel.test.ts:1)
OW-206  proxy_read_timeout 7350s;  ->  deploy/nginx.conf.example:1
OW-206  proxy_read_timeout 7350s  ->  deploy/nginx.conf.example:1 docs/reverse-proxy.md:1
OW-206  ## 2. Configure Google Colab CLI authentication  ->  docs/server-worker.md:1
OW-206  check:colab-notebook  ->  CLAUDE.md:2 README.md:2 package.json:1
OW-206  AbortSignal.any  ->  CLAUDE.md:1 app/api/process/route.ts:1
OW-207  sam3-local-requirements.lock  ->  0 (exit 1, 신규 도입 대상)
OW-208  "check:colab-notebook": "node scripts/check-colab-notebook.mjs",  ->  package.json:1
OW-208  # generated Colab artifacts (the canonical notebook and results template are intended for tracking)  ->  .gitignore:1
OW-209  import type { AssetMode } from "./colab-input";  ->  lib/zip-contract.ts:1
OW-209  import { ResultContractError } from "./colab-errors";  ->  lib/zip-contract.ts:1
OW-209  import { ImageworkInputError } from "./colab-errors";  ->  lib/colab-input.ts:1
OW-209  colab\/  ->  scripts/check-public-artifacts.mjs:1
OW-210  "check:public-artifacts": "node scripts/check-public-artifacts.mjs"  ->  package.json:1
OW-210  colab  ->  20 files (의도된 전역 스윕)
OW-210  AbortSignal.any  ->  CLAUDE.md:1 app/api/process/route.ts:1
```

### A3 conflict

method: dispatch table 을 파싱해 (1) `target_files` 경로별 소유자 표를 만들고 전 2-조합을 열거해 한쪽 이상이 `write: true` 인 쌍에 대해 `deps` 이행 폐포로 순서 존재 여부를 판정, (2) 이슈 11건의 `## 2. Change` 본문에서 정규식으로 저장소 경로를 추출해 각 태스크의 `target_files` 와 차집합을 계산하고 차집합 항목이 `## 3. Out of scope` 에 명시돼 있는지 확인, (3) 각 이슈 `## 1. Preconditions` 의 "선행 태스크 ID" 행과 표의 `deps` 배열을 11건 전부 문자열 대조, (4) `## Decisions` 소비 사슬 7건(OW-200→201/207, OW-201→207, OW-202→203/205/206, OW-203→204/205, OW-204→205, OW-205→210)을 생산 측 절과 소비 측 요구로 짝지어 대조.

result: 고유 경로 46개, 경로 공유 쌍 97건, 순서가 필요한(한쪽 이상 write) 쌍 87건, **미정렬 0건** — `[CHECK r7]` check 4 및 `[RED r6]` 계측과 동일하다. write:true 소유자가 2인 이상인 경로 20개도 전부 사슬이 존재한다. 본문 경로 대 `target_files` 차집합은 5개 태스크에서 18건 나왔고(OW-202 1 · OW-203 1 · OW-205 1 · OW-206 13 · OW-208 1 · OW-210 1) **18건 전부 해당 이슈의 `## 3. Out of scope` 에 명시**돼 있다 — 특히 OW-206 의 13건은 2-5 대응표가 문서 안에 적어 넣는 경로 문자열이지 편집 대상 파일이 아니고 §3 가 그렇게 못박는다. 선행 태스크 ID 대 `deps` 는 11건 전부 일치(OW-208 의 8건 목록 포함). `## Decisions` 사슬 7건 전부 생산 절이 실재한다 — 예: OW-207 이 요구하는 `SAM3_SHA256` 은 OW-201 2-3 이 넘기기로 돼 있고, 그 값의 저장소 유일 보유자는 `git grep -I -c -F 'SAM3_SHA256'` = `runner/remote-worker.py:2` 로 OW-208 삭제 대상이며 OW-208 의 `deps` 가 OW-201 을 포함해 순서가 성립한다.

### A4 irreversible

method: `[ANALYZE]` `non_git_paths` 행(`(none)`)을 `D=$(mktemp -d); git check-ignore -v -- "$D"` 로 재측정. 표 11건의 `irreversible` 값을 각 태스크의 `target_files`·본문과 대조. OW-208 삭제 대상 8건에 `git ls-files --error-unmatch` 실행. OW-200 2-3 의 `rm -rf` 대상 범위와 OW-210 `npm run build` 산출물의 `.gitignore` 규칙(`grep -n next .gitignore`) 확인.

result: `git check-ignore` 가 `fatal: /var/folders/.../tmp.uLUnhXeH4Y ... is outside repository` / 종료 128 — `non_git_paths: (none)` 은 여전히 사실과 다르고 `[PLAN]` `## refutations` 2번이 반박한 그대로다. 그 비-git 경로는 OW-200 이 같은 실행 안에서 `mktemp -d` 로 만들고 `rm -rf "$LOCKGATE_DEST"` 로 지우는 디렉터리 하나뿐이며 삭제 대상이 변수 하나로 한정돼 `irreversible: false` 는 타당하다. OW-208 삭제 8건은 전부 tracked(`git ls-files --error-unmatch` 8건 종료 0)이고 §3 가 `git commit` 을 금지하므로 HEAD `7b3e205` 에서 복구 가능 — `irreversible: false` 타당. OW-209 의 `git mv` 2건도 커밋 없이 작업 트리에만 남는다. `npm run build` 산출물은 `.gitignore` 17행 `/.next/` 로 무시된다. 11건 전부 `irreversible: false` 가 유지될 근거가 있고, `skills` 는 11건 전부 `[]`, `strict_mcp` 는 11건 전부 `true` 다.

### A5 model

method: 표에서 `model` 이 `haiku` 인 태스크를 추출(OW-208 1건, 나머지 10건 sonnet)하고 그 `## 2. Change` 3개 절을 노드 2 기준("어떻게"까지 확정 — 결정적 치환 / 앵커가 유일한 삭제 / 세기 / 파일 분할)에 대조. 2-2 의 편집 안전성을 `grep -n -A8 '"scripts"' package.json` 으로, 2-3 의 삭제 경계를 `grep -n -A9 -- '# generated Colab artifacts' .gitignore` 로 실측 대조.

result: OW-208 의 세 작업 전부 "어떻게"까지 확정돼 있다 — 2-1 은 경로 8개를 열거한 `git rm`(각 경로 `test -e` 사전 확인, 부재 시 건너뛰고 보고)이고 8건 전부 실재·tracked 로 확인됐다. 2-2 는 저장소 전역 유일 앵커 1줄 삭제이고 실측상 `package.json` 10행이 `"test": "vitest run",`, 11행이 삭제 대상, 12행이 `"check:public-artifacts"`(쉼표 없음)이라 그 줄만 지우면 JSON 이 유효하게 남는다 — 스펙의 "앞줄의 쉼표는 그대로 두고" 서술과 실측이 일치한다. 2-3 은 실측상 24행이 앵커, 25~31행이 `/colab/` 로 시작하는 7줄, 32행이 빈 줄, 33행이 `# production` 이라 "그 바로 아래 7줄" 과 "첫 비-`/colab/` 줄 직전까지" 두 서술이 같은 경계(24~31행)를 가리킨다. 판단 잔여 0건이므로 haiku 유지가 타당하다. sonnet 10건은 A5 판정 대상이 아니다.

## Blockers

* {surface: A2, task_id: OW-206, evidence: 2-5 가 이번 라운드에 추가한 4쌍 대응표를 게이트가 지목한 5줄에 실제로 적용하면 게이트가 0 이 되지 않는다. 측정(커밋 `7b3e205`, 트리 clean) — `grep -nE 'sam3-(build-)?requirements\.lock|remote[- ]worker' docs/server-worker.md` 출력 5줄을 파일로 뽑아 대응표 4쌍(`runner/remote-worker.py`→`runner/local-worker.py`, `runner/sam3-requirements.lock`→`runner/sam3-local-requirements.lock`, `runner/sam3-build-requirements.lock`→`runner/sam3-local-build-requirements.lock`, `The remote worker verifies`→`The local worker verifies`)을 문자열 치환한 뒤 같은 정규식을 돌린 결과 **3 / 종료 0** 이다(66·122행만 해소). 남는 3줄은 — (a) 123행 치환 후 `` [`sam3-build-requirements.lock`](../runner/sam3-local-build-requirements.lock), `` 로 **링크 텍스트**가 그대로 남는다. 대응표 왼쪽이 `runner/` 접두사를 포함해서 링크 타깃만 잡고 대괄호 안 표기는 잡지 못한다. (b) 124행도 같은 이유로 `` [`sam3-requirements.lock`] `` 이 남는다. (c) 131행 `remote worker also verifies the SHA-256 of the official Rust 1.80.0 archive` 는 `The remote worker verifies` 와 어순이 달라 대응표 어느 왼쪽에도 걸리지 않는다 — `grep -cF -- 'The remote worker verifies' docs/server-worker.md` = 1 이고 그 1건은 122행이다. `[PLAN r7 cont.1]` 이 근거로 든 거짓 양성 검사는 대응표 **오른쪽 4개 문자열만** 담은 파일에 정규식을 돌린 것이라(재현 확인: 0 / 종료 1) 치환 **결과 줄**을 검사하지 않았고, 그래서 링크 텍스트 잔존을 보지 못했다. 그 결과 이 세 위치의 유일한 주소가 `## 2. Change` 본문의 "123·124행 · 131행" 이라는 줄 번호가 되어 A2 의 "줄 번호가 아닌 정확한 문자열로 주소를 지정" 요건도 함께 깨진다. 게이트가 0 을 요구하므로 워커는 이 상태로 완료 보고를 할 수 없고, 문자열 지시 없이 스스로 문안을 지어내야 하는데 §3 는 "문서 구조 전체를 재편하지 않는다" 로 그 재량을 좁힌다, fix_instruction: OW-206 2-5 의 대응표를 게이트 정규식이 실제로 지목하는 5줄 전부를 덮도록 고친다 — (1) 락 파일 2건은 `runner/` 접두사 없는 형태로 왼쪽을 다시 쓴다: `` `sam3-build-requirements.lock`](../runner/sam3-build-requirements.lock) `` → `` `sam3-local-build-requirements.lock`](../runner/sam3-local-build-requirements.lock) ``, `` `sam3-requirements.lock`](../runner/sam3-requirements.lock) `` → `` `sam3-local-requirements.lock`](../runner/sam3-local-requirements.lock) `` (링크 텍스트와 타깃을 한 문자열로 묶어 한 번에 치환되게 한다). (2) 131행용 5번째 쌍을 추가한다: `remote worker also verifies` → `local worker also verifies`. (3) 고친 대응표를 5줄에 적용한 뒤 게이트를 다시 돌려 `0` / `exit=1` 임을 스펙 본문에 측정값으로 적는다 — 이번 라운드처럼 오른쪽 문자열만 검사하지 말고 치환 결과 줄을 검사한다. 대응표는 인라인 백틱이 아니라 펜스 안에 둔다. `target_files` · `deps` 변경은 필요 없다}

* {surface: A2, task_id: OW-200, evidence: `runner/LOCKS.md` 는 이 웨이브가 끝난 뒤에도 살아남는데, 존재하지 않게 될 원격 워커를 서술하는 3줄이 지시도 게이트도 없이 남는다. 측정(커밋 `7b3e205`) — `grep -nE 'remote[- ]worker' runner/LOCKS.md` = **3줄**: 3행 `The remote worker consumes these files from the per-job directory. They are`, 19행 `packages, and the remote worker must preflight their supported versions before`, 58행 `The remote worker verifies the official Linux Rust archive hash before use,`. 이 3줄에는 락 파일 이름이 없어 2-4 의 유일한 문자열 지시("`sam3-requirements.lock` / `sam3-build-requirements.lock` 을 가리키는 서술은 모두 로컬 락 이름으로 바꾼다")가 닿지 않는다 — 그 지시가 덮는 것은 `grep -cE 'sam3-(build-)?requirements\.lock' runner/LOCKS.md` = 5 로 센 다섯 줄(8·9·31·32·40행)이고 3·19·58행은 그 5줄에 포함되지 않는다. 게이트도 없다: 2-4 마지막 항목의 `grep -ci colab runner/LOCKS.md` 종료 1 은 이 파일의 `colab` 2줄만 보고 `remote worker` 를 보지 못하며, `OW-210` 2-2 의 전역 스윕 2건은 `colab` 과 `AbortSignal.any` 뿐이고, `runner/LOCKS.md` 를 읽는 테스트·tsc·lint·build 는 없다. 제공요건 21 이 열거한 문서 4종(`docs/server-worker.md` · `docs/reverse-proxy.md` · `README.md` · `CLAUDE.md`)에도 이 파일은 들어 있지 않아 요건 쪽 백스톱도 없다. 원격 워커를 서술하는 다른 생존 파일 2건은 소유자가 있다 — `docs/server-worker.md` 는 `OW-206` 2-5(블로커 1로 그 지시가 불완전함이 드러났지만 게이트는 존재), `tests/remote-worker-contract.test.ts` 는 `OW-201` 2-2 의 문자열 지시 + vitest 라는 기능적 게이트. `runner/LOCKS.md` 만 둘 다 없다, fix_instruction: OW-200 2-4 에 문자열 지시 1줄과 완료 판정 1줄을 추가한다 — (1) "`The remote worker` / `the remote worker` 로 시작하는 서술 3건(3·19·58행 실측)을 `The local worker` / `the local worker` 로 바꾼다" 를 기존 락 이름 교체 항목 바로 아래에 넣는다. (2) 그 아래 같은 형식의 완료 판정을 넣는다: `grep -cE 'sam3-(build-)?requirements\.lock|remote[- ]worker' runner/LOCKS.md; echo "exit=$?"` 기대 `0` / `exit=1`, 착수 시점 측정 기준값 **8**(락 이름 5줄 + 원격 워커 3줄)을 함께 적는다. (3) `## 1. Preconditions` 에 착수 시점 8건을 확인하는 대응 줄을 넣는다(기대 8 / 종료 0). 이 정규식은 로컬 전환 후의 정상 표기를 잡지 않는다 — `sam3-local-requirements.lock` · `sam3-local-build-requirements.lock` · `runner/local-worker.py` · `The local worker verifies` 4줄에 돌린 결과 히트 0 / 종료 1 로 이번 라운드에 재확인했다. `target_files` · `deps` 변경은 필요 없다 — `runner/LOCKS.md` 는 이미 `OW-200` 의 `write: true` 항목이다}

## Notes

* {surface: A2, task_id: OW-206, text: `.env.example` 은 폐기 환경 변수 7종의 정의 원본인데 2-1 의 완료 판정이 `grep -ci colab .env.example` = 0 하나뿐이라 이름에 `colab` 이 없는 4종을 보지 못한다. 측정(커밋 `7b3e205`) — `grep -noE 'IMAGEWORK_(HF_TOKEN|JOB_SCRIPT|RECOVERY_ROOT|GOOGLE_APPLICATION_CREDENTIALS)' .env.example` = 15행 `IMAGEWORK_HF_TOKEN` · 34행 `IMAGEWORK_GOOGLE_APPLICATION_CREDENTIALS` · 58행 `IMAGEWORK_JOB_SCRIPT` · 72행 `IMAGEWORK_RECOVERY_ROOT` 4건이고, `colab` 을 이름에 담은 나머지 3종(27·41·46행)만 현행 게이트에 걸린다. 같은 파일 54~55행에는 `remote worker` 서술도 있다(`grep -cE 'remote[- ]worker' .env.example` = 2). 형제 파일 3종은 전부 이 4-키 정규식 게이트를 받았는데(`docs/server-worker.md` 2-5 기준값 5 · `README.md` 2-6 기준값 1 · `CLAUDE.md` 2-7 기준값 1 — 셋 다 이번 라운드에 재계측해 스펙 기재값과 일치 확인) 정작 정의 파일만 빠졌다. `.env.example` 을 읽는 테스트·tsc·lint·build 도 없고 `npm run check:public-artifacts` 는 키 이름이 아니라 값의 존재만 본다(`scripts/check-public-artifacts.mjs` 8·65·126행). 2-1 의 제거 지시 자체는 7종을 전부 열거해 완전하므로 블로커가 아니다 — 2-1 에 `grep -cE 'IMAGEWORK_(HF_TOKEN|JOB_SCRIPT|RECOVERY_ROOT|GOOGLE_APPLICATION_CREDENTIALS)' .env.example` 기대 `0` / `exit=1` 한 줄(기준값 4)을 형제 3종과 같은 형식으로 붙이면 닫힌다}

* {surface: A4, task_id: OW-200, text: `[ANALYZE]` `non_git_paths` 의 `(none)` 과 `[PLAN]` `## refutations` 2번의 불일치가 라운드 3~7 내내 남아 있다(이번 라운드 재측정 종료 128 로 반박 재현). 노드 2 에는 `[ANALYZE]` 코멘트를 고칠 verb 가 없고 실제 위험은 `mktemp -d` 디렉터리 1건으로 한정돼 `irreversible: false` 판정이 유지되므로 이번에도 계획 변경을 요구하지 않는다 — 다음 웨이브 노드 1 이 `non_git_paths` 를 그대로 승계하지 않게 하는 것이 유일한 후속 조치다}

* {surface: A1, task_id: OW-199, text: `[RED r6]` 이 낸 노트 5건 중 4건은 이번 라운드 측정으로 해소를 확인했다 — N1(`## new_anchors` 25→33)은 집합 차집합 양방향 0건으로 정확해졌고, N2·N3(형제 결정값 조회 경로)은 `OW-206` `## 1. Preconditions` 의 "형제 결정값" 줄로 `OW-202`·`OW-207` 양쪽이 열렸으며 `deps` 는 `[]` 로 유지돼 A3 계측(미정렬 0건)이 변하지 않았다. N5(신규 파일 5건의 1차 방어선 부재)는 `ls lib/` 실측으로 `colab-errors.ts`·`colab-input.ts` 가 생성 시점에 아직 옛 이름임이 확인돼 0건 게이트가 구조적으로 불가능하다는 `[PLAN r7 cont.1]` 의 반박이 성립한다 — 커버리지는 `OW-209` 2-2 대상 목록과 `OW-210` 전역 스윕이 받는다. 남은 N4 는 위 A4 노트로 이월했다}

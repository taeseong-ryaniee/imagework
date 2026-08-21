[RED r8]

읽은 라운드 — `[ANALYZE]` · `[GATE]` + `[GATE r2]` · `[PLAN r8]` + `[PLAN r8 cont.1]` · `[CHECK r8]` · 부모 description · 실행 이슈 11건(OW-200~OW-210)의 1·2·3절. `[GATE r2]` 는 Q1~Q5 를 대체하지 않는 증분(`OW-210` 백스톱 구조 지시 1행)이므로 `[GATE]` r1 의 확정 답변 5건이 계획의 출처로 그대로 살아 있다.

기준선 재측정 — `git rev-parse --short HEAD` = `7b3e205`, `git status --porcelain` 무출력.

## Attack surfaces

### A1 premise

method: (1) `[ANALYZE]` `anchor_candidates` 34행 전량을 그 표가 적은 명령으로 재실행 — `git grep -I -l -F -- "<s>" | wc -l` 와 `git grep -I -o -F -- "<s>" | wc -l`. (2) `target_state` 31행 — 기존 파일 20건을 `stat -f "%z %N"`, 신규 9건을 `test -e`, 디렉터리 3건을 `ls | wc -l`. (3) 기준선 `npx vitest run` 재실행. (4) 스냅샷 `find <dir> -type f | wc -l`. (5) 호스트 `which nvidia-smi` · `python3.12 -m pip --version`. (6) `[GATE]` 인용 5건을 `sed -n '<n>p'` 로 설계 문서 원문 대조(227·250·263·284·349행). (7) 로드맵 jsonl 을 파싱해 행수와 `run_id` 집합을 계수. (8) `## Provisional requirements` 의 `(assumed: ...)` 4건(2·12·22·23항)을 `[GATE]` 확정 답변과 1:1 대조.

result: `anchor_candidates` 34행 전부 files/hits 가 기록값과 정확히 일치 — `Colab` 17/74, `colab` 20/100, `ColabJobRunner` 4/28, `AbortSignal.any` 2/2, `IMAGEWORK_RECOVERY_ROOT` 7/10, `remote-worker` 6/9, `check:colab-notebook` 3/5, `ImageworkInputError` 6/28, `CommandExecutionError` 4/25, 0건 24행 전부 0/0. `target_state` 기존 파일 20건의 바이트 크기 전부 일치(`lib/colab-job-runner.ts` 20466 · `tests/colab-job-runner.test.ts` 29615 · `components/image-processor.tsx` 22178 · `docs/server-worker.md` 11158 · `DESIGN.md` 16259), 신규 9건 전부 부재. `runner/` 5 · `scripts/` 2 는 일치하나 `docs/` 는 기록 "2개 파일" 과 달리 실측 3(`colab-results.md` · `reverse-proxy.md` · `server-worker.md`) — `## refutations` 1번이 이미 반박한 그대로다. `npx vitest run` = 6 파일 / 68 테스트 통과(12.31초)로 기준선 일치. 스냅샷 50 파일 일치. `nvidia-smi` not found · `pip 26.1.2 (python 3.12)` 일치. GATE 인용 — 263행("모든 엔드포인트에 `proxy_read_timeout 120s` 수준" + "각 위치 블록의 `limit_req` burst 값은 (구현 시 확정)")과 349행("만료 jobId를 잘못된 jobId와 동일 취급 400")은 원문 정확 일치, 227행은 절 제목이고 "프로비저닝 0단계"는 250·284행에 있다 — `## refutations` 6번이 이미 정정한 그대로다. jsonl 20행 / `run_id` 단일값 `20260721T005918Z-89757`. assumed 4건 전부 성립 — 2항→Q2 (C), 12항→Q5 (B) 400 고정, 22항→Q4 (A), 23항→Q4 (A).

### A2 anchor

method: 범위는 **전수**다. dispatch table 앵커 40건(중복 제거 39)을 `git grep -I -c -F -- '<s>'` 로 저장소 전역 계수(아래 목록). 이슈 11건의 `## 1. Preconditions` 검사 **84건**(OW-208 의 8경로 루프를 8건으로 셈)을 그대로 실행해 기대값과 대조. 각 이슈 `## 2. Change` 의 비-bash 펜스 54줄을 줄 단위 토글로 추출해 검색 앵커(저장소에 실재)와 치환문(0건)을 분리하고 검색 앵커의 `## 1. Preconditions` 대응 검사를 1:1 확인. `## 2. Change` 의 줄 번호 표기를 정규식 `\d+\s*(행|번째 줄)` 로 전수 검출. `## new_anchors` 33건 주장을 dispatch table 파싱값과 집합 연산으로 양방향 검증. `skills` 배열 길이 합을 세고 3-루트 해소 스크립트를 대조군 4건으로 실행. **`[RED r7]` 블로커 2건은 대응표를 실측 게이트 줄에 실제로 적용해 재검증**했다 — 게이트 출력 줄을 파일로 뽑아 대응표를 순서대로 문자열 치환한 뒤 같은 정규식을 **치환 결과 줄**에 돌렸다.

result: 앵커 40건 전부 계수 일치, 0건은 신규 도입 대상 2건(`local-job-runner`, `sam3-local-requirements.lock`)뿐. 전제조건 84건 중 73건이 기대값과 일치했고, 어긋난 9건은 전부 선행 태스크 산출물을 기대하는 항목이라 `deps` 순서상 정상이다(OW-201 락 2종 · OW-203 `lib/local-job-runner.ts` · OW-207 LOCKS.md 락 이름 + 락 2종 · OW-209 `tests/remote-worker-contract.test.ts` 의 `colab` 0건 · OW-210 `check:colab-notebook` 부재). 나머지 2건은 `OW-210` 이 스스로 "0건이 아니어도 블로커가 아니다" 로 규정한 착수 기준선 스윕이다. `## 2. Change` 검색 앵커 대 전제조건 대조 — 대응 검사가 없는 검색 앵커는 OW-204 2-2 의 `<p>파일의 실제 픽셀 크기를 ... 다운로드합니다.</p>` 와 OW-206 2-2 의 `client_max_body_size 11m;` · 2-4 의 `7200` 3건이고, 첫째는 전제조건이 그 부분 문자열을 검사하며 나머지 2건은 노트 1·2 로 냈다. 줄 번호 표기 6건(OW-200 3 · OW-201 1 · OW-202 1 · OW-206 2)은 **전부 측정 근거이고 편집 주소가 아니다** — `[RED r7]` 이 지목한 "OW-206 2-5 만 줄 번호가 유일한 주소" 상태는 해소됐다. `## new_anchors` 33건은 정확하다(표 유일 39 − `anchor_candidates` 중복 6 = 33, 목록 33줄과 집합 차집합 양방향 0건). `skills` 합계 0건이라 해소할 이름이 없다(대조군: 설치된 3건 resolved, 가짜 1건 MISSING 으로 검사 자체는 동작).

**`[RED r7]` 블로커 1 해소 확인 — OW-206 2-5**: `grep -nE 'sam3-(build-)?requirements\.lock|remote[- ]worker' docs/server-worker.md` = 5줄(66·122·123·124·131행) / 종료 0. 그 5줄에 2-5 의 **5쌍** 대응표를 위에서 아래 순서로 치환한 결과 줄에 같은 정규식을 돌린 결과 **0 / 종료 1**. 치환 후 5줄은 `| \`IMAGEWORK_JOB_SCRIPT\` | Absolute path to the reviewed deployed \`runner/local-worker.py\`. |` · `The local worker verifies the SHA-256 of the uploaded` · `[\`sam3-local-build-requirements.lock\`](../runner/sam3-local-build-requirements.lock),` · `[\`sam3-local-requirements.lock\`](../runner/sam3-local-requirements.lock) and` · `local worker also verifies the SHA-256 of the official Rust 1.80.0 archive` 다 — r7 이 지적한 링크 텍스트 잔존(123·124행)과 어순 불일치(131행)가 모두 사라졌다.

**`[RED r7]` 블로커 2 해소 확인 — OW-200 2-4a**: `grep -nE 'sam3-(build-)?requirements\.lock|remote[- ]worker' runner/LOCKS.md` = **8줄** / 종료 0 — 락 이름 5줄(8·9·31·32·40행) + 원격 워커 3줄(3·19·58행)로 스펙 기재 기준값과 일치. 대응표 왼쪽은 `grep -cF -- 'The remote worker'` = 2(3·58행) · `grep -cF -- 'the remote worker'` = 1(19행)로 3줄을 정확히 덮는다. 8줄에 락 2쌍 + 원격 워커 2쌍을 순서대로 치환한 결과 줄에 같은 정규식을 돌린 결과 **0 / 종료 1**. `## 1. Preconditions` 의 기준값 8 도 실측과 일치한다.

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

method: dispatch table 을 파싱해 (1) `target_files` 경로별 소유자 표를 만들고 전 2-조합을 열거해 한쪽 이상이 `write: true` 인 쌍에 대해 `deps` 이행 폐포로 순서 존재 여부를 판정, 순환도 DFS 로 재확인, (2) 이슈 11건의 `## 2. Change` 본문에서 정규식으로 저장소 경로를 추출해 각 태스크의 `target_files` 와 차집합을 계산하고 차집합 항목이 `## 3. Out of scope` 에 명시돼 있는지 확인(`## 3. Out of scope` 문자열이 `OW-210` 2-2 본문에도 등장하므로 마지막 분할 조각을 §3 로 잡았다), (3) 각 이슈 `## 1. Preconditions` 의 "선행 태스크 ID" 행과 표의 `deps` 배열을 11건 전부 문자열 대조, (4) `## Decisions` 소비 사슬 8건을 생산 절과 짝지어 대조하고 그중 값의 저장소 유일 보유자를 `git grep -c -F` 로 계수.

result: 고유 경로 **46개**, 경로 공유 쌍 **97건**, 순서가 필요한(한쪽 이상 write) 쌍 **87건**, **미정렬 0건**, 순환 없음 — `[CHECK r8]` check 2·4 및 `[RED r7]` 계측과 동일하다. `write: true` 소유자가 2인 이상인 경로 20개도 전부 사슬이 존재한다. 본문 경로 대 `target_files` 차집합은 6개 태스크에서 18건 나왔고 **18건 전부 해당 이슈의 `## 3. Out of scope` 에 명시**돼 있다(OW-202 1 · OW-203 1 · OW-205 1 · OW-206 13 · OW-208 1 · OW-209 1 · OW-210 1). 선행 태스크 ID 대 `deps` 는 11건 전부 일치(OW-208 의 8건 목록 포함). `## Decisions` 사슬 8건 전부 생산 절이 실재한다 — OW-201→OW-200(락 SHA-256 3종, 2-5), OW-203→OW-202(2-3), OW-204→OW-203(2-6), OW-205→OW-202·203·204, OW-206→OW-202·207(조건부, `deps` 무증가), OW-207→OW-200·201(`SAM3_SHA256`, 2-3), OW-210→OW-205(2-7). 값 검증 2건 — `git grep -I -c -F 'SAM3_SHA256'` = `runner/remote-worker.py:2` 로 유일 보유자가 OW-208 삭제 대상이고 OW-208 의 `deps` 가 OW-201 을 포함해 순서가 성립한다. `shasum -a 256 runner/vtracer-Cargo.lock` = `79e8c98a...426bc4` 로 `runner/remote-worker.py:29` 의 `VTRACER_CARGO_LOCK_SHA256` 상수값과 일치해, OW-200 이 넘길 3번째 해시가 OW-201 이 승계할 값과 어긋나지 않는다.

### A4 irreversible

method: `[ANALYZE]` `non_git_paths` 행(`(none)`)을 `D=$(mktemp -d); git check-ignore -v -- "$D"` 로 재측정. 표 11건의 `irreversible` 값을 각 태스크의 `target_files`·본문과 대조. OW-208 삭제 대상 8건에 `git ls-files --error-unmatch` 실행. OW-200 2-3 의 `rm -rf` 대상 범위와 OW-210 `npm run build` 산출물의 `.gitignore` 규칙(`grep -n next .gitignore`) 확인. `skills`·`strict_mcp` 값을 표에서 직접 집계.

result: `git check-ignore` 가 `fatal: /var/folders/.../tmp.Uvxw61W7da ... is outside repository` / 종료 128 — `non_git_paths: (none)` 은 여전히 사실과 다르고 `## refutations` 2번이 반박한 그대로다(노트 3). 그 비-git 경로는 OW-200 이 같은 실행 안에서 `mktemp -d` 로 만들고 `rm -rf "$LOCKGATE_DEST"` 로 지우는 디렉터리 하나뿐이며 §3 가 `/tmp` 자체나 다른 경로 삭제를 금지하므로 `irreversible: false` 는 타당하다. OW-208 삭제 8건은 전부 tracked(`git ls-files --error-unmatch` 8건 종료 0)이고 §3 가 `git commit` 을 금지하므로 HEAD `7b3e205` 에서 복구 가능 — `irreversible: false` 타당. OW-209 의 `git mv` 2건도 커밋 없이 작업 트리에만 남는다. `npm run build` 산출물은 `.gitignore` 17행 `/.next/` 로 무시된다. 11건 전부 `irreversible: false` 근거가 있고, `skills` 는 11건 전부 `[]`, `strict_mcp` 는 11건 전부 `true` 다.

### A5 model

method: 표에서 `model` 이 `haiku` 인 태스크를 추출(OW-208 1건, 나머지 10건 sonnet)하고 그 `## 2. Change` 3개 절을 노드 2 기준("어떻게"까지 확정 — 결정적 치환 / 앵커가 유일한 삭제 / 세기 / 파일 분할)에 대조. 2-1 의 8경로를 `test -e` + `git ls-files --error-unmatch` 로, 2-2 의 편집 안전성을 `grep -n -A8 '"scripts"' package.json` 으로, 2-3 의 삭제 경계를 `grep -n -A10 -- '# generated Colab artifacts' .gitignore` 로 실측 대조.

result: OW-208 의 세 작업 전부 "어떻게"까지 확정돼 있다 — 2-1 은 경로 8개를 열거한 `git rm`(각 경로 `test -e` 사전 확인, 부재 시 건너뛰고 보고)이고 8건 전부 실재·tracked 로 확인됐다. 2-2 는 저장소 전역 유일 앵커 1줄 삭제이고 실측상 `package.json` 10행이 `"test": "vitest run",`, 11행이 삭제 대상, 12행이 `"check:public-artifacts"`(쉼표 없음)이라 그 줄만 지우면 JSON 이 유효하게 남는다 — 스펙의 "앞줄의 쉼표는 그대로 두고" 서술과 실측이 일치한다. 2-3 은 실측상 24행이 앵커, 25~31행이 `/colab/` 로 시작하는 7줄, 32행이 빈 줄, 33행이 `# production` 이라 "그 바로 아래 7줄" 과 "첫 비-`/colab/` 줄 직전까지" 두 서술이 같은 경계(24~31행)를 가리킨다. 판단 잔여 0건이므로 haiku 유지가 타당하다. sonnet 10건은 A5 판정 대상이 아니다.

## Blockers

(none)

## Notes

* {surface: A2, task_id: OW-206, text: 2-4 의 첫 항목("이 파일에서 실제로 바꿀 대상은 `7350` 1건과 `7200` 1건이 등장하는 서술**뿐**이다")이 같은 절 세 번째 항목(`client_max_body_size 11m` 서술 갱신)과 어긋난다 — 문자 그대로 읽는 워커는 세 번째 항목을 범위 밖으로 판단할 수 있다. 측정(커밋 `7b3e205`) — `grep -n '7350\|7200' docs/reverse-proxy.md` = **23행 한 줄**(`- \`proxy_read_timeout 7350s\` covers the worker's 7200-second job limit plus`)로 두 숫자가 같은 줄에 있어 "그 두 서술"도 실제로는 서술 1건이고, `grep -nF -- 'client_max_body_size' docs/reverse-proxy.md` = 16행으로 별개 줄이다. 이 파일의 완료 판정은 `grep -ci colab docs/reverse-proxy.md` = 0 하나뿐인데 그 값은 착수 시점에 이미 0(종료 1)이라 회귀 방지용이고, 세 항목 중 무엇을 빠뜨려도 잡히지 않는다. 첫 항목을 "이 파일에서 바꿀 대상은 23행 서술(7350·7200)과 16행 `client_max_body_size 11m` 서술 2건이다" 로 고쳐 문자열 주소 2건을 함께 열거하면 닫힌다. `target_files` · `deps` 변경 불요}

* {surface: A2, task_id: OW-206, text: 2-2 의 편집 주소 `client_max_body_size 11m;` 가 `## 1. Preconditions` 에 대응 검사가 없다 — 같은 절의 다른 주소 `proxy_read_timeout 7350s;` 는 §1 에 있다. 측정(커밋 `7b3e205`) — `grep -cF -- 'client_max_body_size 11m;' deploy/nginx.conf.example` = 1(19행, server 블록), `grep -n 'location' deploy/nginx.conf.example` = 29행 `location = /api/process` · 39행 `location = /api/process/cancel` · 48행 `location /` 로 이동 대상 블록이 실재한다. 앵커 자체는 파일 안에서 유일해 워커가 오도될 여지는 없고, 제공요건 20 의 나머지 절반(옛 7350초 공식 제거)은 §1 검사를 가진 앵커가 받으므로 블로커가 아니다 — §1 에 `grep -cF -- 'client_max_body_size 11m;' deploy/nginx.conf.example` 기대 1 한 줄을 형제 앵커와 같은 형식으로 붙이면 닫힌다}

* {surface: A2, task_id: OW-201, text: `## Provisional requirements` 4·7항의 일부가 어떤 게이트에도 걸리지 않는다. 4항("모델 로드 호출이 작업 루프 바깥에 정확히 1곳")과 7항의 "SIGUSR1 취소 체크포인트 2곳 이상"은 2-1 의 지시로는 정확하지만, 2-2 가 열거한 로컬 계약 어서션 4종은 `os.dup2(2, 1)` · `SIGUSR1` 핸들러 존재 · `os.rename` 기반 ZIP 확정 · `--self-test` 인자뿐이라 **존재만** 보고 **개수/위치**를 보지 않는다. 이 호스트에는 GPU 가 없어 `--self-test` 도 못 돌리므로(GATE Q1 = (A)) 대체 검증도 없다. 2-2 어서션 목록에 두 줄을 추가하면 닫힌다 — 모델 빌드 호출 문자열이 워커 본문에 정확히 1회 등장함을 세는 어서션, SIGUSR1 취소 플래그 검사 문자열이 2회 이상 등장함을 세는 어서션. `target_files` · `deps` 변경 불요 — `tests/remote-worker-contract.test.ts` 는 이미 `OW-201` 의 `write: true` 항목이다}

* {surface: A2, task_id: OW-205, text: `## Provisional requirements` 9항이 열거한 러너 7요소 중 **6번(GPU 단일 소유권 flock, D21a)** 만 2-1 의 유닛 11종에 대응 항목이 없다. 대조 결과 — 1 FIFO 큐→테스트 5, 2 워커 생존→테스트 1·7, 3 서킷 브레이커→테스트 8, 4 스코핑 취소→테스트 2·3·9, 5 방어적 파서→테스트 4, 7 tmp 스윕→테스트 11, **6 flock→없음**. `OW-210` 의 전역 스윕 2건은 `colab` 과 `AbortSignal.any` 뿐이라 이 요소를 받지 않고, GPU 가 없어 실측도 불가하다. 2-1 목록에 12번째 항목("flock 획득 실패 시 러너 기동 중단 — fake 락 파일로 재현")을 추가하면 닫힌다. `target_files` · `deps` 변경 불요}

* {surface: A1, task_id: OW-202, text: 2-2 요소 2 의 "Next.js 기동 시 즉시 스폰" 이 모듈 로드 시점인지 러너 생성자 시점인지 특정되지 않는다. 모듈 최상위 부작용으로 구현되면 `OW-210` 2-1 의 `npm run build` 가 라우트 모듈을 임포트하면서 워커 스폰·flock·`parseRunnerConfig` 를 트리거해 이 호스트(환경 변수 미설정, GPU 없음)에서 실패한다. 현행 구조는 그 위험이 없다 — 측정(커밋 `7b3e205`): `app/api/process/route.ts` 의 러너 인스턴스화는 `let serverRunner: ColabJobRunner | undefined;` + `const runnerFromEnvironment = (): ColabJobRunner => { if (!serverRunner) serverRunner = new ColabJobRunner(parseRunnerConfig(process.env)); ... }` 로 함수 안에 있고 `OW-203` 2-1 이 이 세 이름의 유지를 명시한다. 따라서 계획을 바꿀 필요는 없고, 2-2 요소 2 에 "스폰은 러너 생성자에서 일어나며 모듈 로드 시점에는 어떤 부작용도 넣지 않는다" 한 줄만 못박으면 이 경로가 닫힌다}

* {surface: A4, task_id: OW-200, text: `[ANALYZE]` `non_git_paths` 의 `(none)` 과 `## refutations` 2번의 불일치가 라운드 3~8 내내 남아 있다(이번 라운드 재측정 종료 128 로 반박 재현). 노드 2 에는 `[ANALYZE]` 코멘트를 고칠 verb 가 없고 실제 위험은 `mktemp -d` 디렉터리 1건으로 한정돼 `irreversible: false` 판정이 유지되므로 이번에도 계획 변경을 요구하지 않는다 — 다음 웨이브 노드 1 이 `non_git_paths` 를 그대로 승계하지 않게 하는 것이 유일한 후속 조치다}

* {surface: A2, task_id: OW-199, text: `[RED r7]` 이 낸 블로커 2건과 노트 3건 전부 이번 라운드 측정으로 해소를 확인했다 — 블로커 1(OW-206 2-5 대응표)과 블로커 2(OW-200 2-4a 원격 워커 서술)는 위 A2 의 치환 시뮬레이션 2건이 각각 `0` / 종료 1 을 냈고, N1(`.env.example` 폐기 환경 변수 게이트)은 2-1 에 `grep -cE 'IMAGEWORK_(HF_TOKEN|JOB_SCRIPT|RECOVERY_ROOT|GOOGLE_APPLICATION_CREDENTIALS)' .env.example` 기대 0 / `exit=1` 이 붙었고 착수 기준값 4 가 실측(15·34·58·72행)과 일치한다. N2 는 위 A4 노트로 이월했고 N3 는 해소 확인 보고였다. 이번 라운드 노트 5건은 전부 새 발견이며 어느 것도 워커의 완료를 막지 않는다 — 지시는 정확하고 게이트만 비어 있다}

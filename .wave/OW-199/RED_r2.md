[RED r2]

읽은 라운드 — `[ANALYZE]`, `[GATE]`, `[PLAN r2]`, `[CHECK r2]`, 자식 이슈 11건의 `## 1` · `## 2` · `## 3` 절. HEAD `7b3e205`, 작업 트리 clean(`git status --porcelain` 무출력).

## Attack surfaces

### A1 premise

method: `## Facts` 각 행이 인용한 명령을 전부 재실행했다. (1) `anchor_candidates` 34행 전량을 `git grep -I -l -F -- "<s>" | wc -l` / `git grep -I -o -F -- "<s>" | wc -l` 로 재측정. (2) `target_state` 의 "없음(신규)" 13경로를 `test -e` 로, "존재" 22경로를 `stat -f "%z %Sm %N"` 로 재측정. (3) 디렉터리 3행을 `ls runner/ | wc -l` = 5, `ls scripts/ | wc -l` = 2, `ls docs/ | wc -l` = 3 으로 재계수. (4) 기준선을 `npx vitest run` 과 `npx vitest run tests/colab-job-runner.test.ts` 로 재실행. (5) 호스트를 `which nvidia-smi` · `python3.12 -m pip --version` 으로 재확인. (6) 스냅샷을 `find <dir> -type f | wc -l` 로 재계수. (7) `[GATE]` 5행의 인용 출처를 `sed -n '227p;263p;349p' <설계문서>` · `grep -c '프로비저닝 0단계' <설계문서>` · `wc -l` + `grep -c 20260721T005918Z-89757 <tasks jsonl>` 로 대조. (8) `## Provisional requirements` 의 `(assumed:)` 4건(2·12·22·23항)을 `[GATE]` 채택안과 1:1 대조. (9) 스펙이 인용한 현행값 2건을 `grep -n 'min(30)' lib/colab-job-runner.ts` 와 `grep -cF -- 'IMAGEWORK_*' .env.example` 11종으로 검증.

result: 34행 전부 `[ANALYZE]` 기재값과 일치 — `Colab` 17/74, `colab` 20/100, `remote-worker` 6/9, `ColabJobRunner` 4/28, `AbortSignal.any` 2/2, `isolatedEnvironment` 2/5, `recoverStaleJobs` 2/3, `check:colab-notebook` 3/5, `createProcessHandler` 3/10, `createCancelHandler` 3/10, `CommandRunner` 3/13, `JobCancelledError` 5/17, `JobTimeoutError` 3/7, `CommandExecutionError` 4/25, `ImageworkInputError` 6/28, `IMAGEWORK_RECOVERY_ROOT` 7/10, `IMAGEWORK_HF_TOKEN` 5/8, `IMAGEWORK_JOB_SCRIPT` 5/8, `IMAGEWORK_MAX_QUEUE_DEPTH` 7/10, `IMAGEWORK_JOB_TIMEOUT_SECONDS` 5/8, `x-imagework-processing-code` 5/5, `stdio` 1/1, 나머지 12행 0/0. stat 값 일치(20466 / 29615 / 4744 / 16259 / 12501 / 22392 / 3438 / 4088 / 2018 / 22178 / 18208 / 10184 / 1526 / 4440 / 1889 / 11158 / 1912 / 7857 / 6247 / 929 / 2107 / 1032). 신규 13경로 전부 absent. `ls docs/` = 3(`colab-results.md` `reverse-proxy.md` `server-worker.md`) 으로 `[ANALYZE]` 의 "2개 파일" 은 여전히 오기이고 `[PLAN]` refutations 가 맞다. `npx vitest run` = 6파일 / 68테스트 전부 통과(3.82초), `tests/colab-job-runner.test.ts` = 27 — OW-210 의 41건 하한 근거 유효. `nvidia-smi` not found, `pip 26.1.2 (python 3.12)`, 스냅샷 50파일. 설계문서 L263 = "모든 엔드포인트에 `proxy_read_timeout 120s` 수준", L349 = "만료 jobId를 잘못된 jobId와 동일 취급 400" 으로 `[GATE]` 5행 근거 정확. L227 은 여전히 `### 프로비저닝 (1회, scripts/provision-worker.sh 신규)` 섹션 헤딩이고 `프로비저닝 0단계` 리터럴은 4건 별도 행 — 주장은 성립, `[PLAN r2]` 의 "인용 정밀도 문제" 판정에 동의하며 재차 블로커로 올리지 않는다. tasks jsonl 20행 / run_id 20행. `(assumed:)` 4건 전부 `[GATE]` 채택안과 정합(2항→Q2(C), 12항→Q5(B), 22·23항→Q4(A)). OW-202 가 인용한 현행 zod 범위는 `lib/colab-job-runner.ts:27` 의 `min(30).max(7200)` 로 실재하고, OW-206 2-1 이 제거·유지 목록에 올린 환경변수 11종 전부 `.env.example` 에 각 1건씩 실재한다.

### A2 anchor

method: 범위는 **전량**이다 — dispatch table `anchors` 29건 + `## new_anchors` 25행을 중복 제거해 distinct (파일, 문자열) 쌍 35건을 `grep -cF -- '<s>' <file>` 로 종료 상태까지 측정했다. 별도로 `skills` 필드 11건을 파싱해 해소 대상 스킬명 개수를 셌고, 태스크별로 `## 2. Change` 의 편집 지점이 `## 1. Preconditions` 에 대응 검사를 갖는지 11건 전수 대조했다. 개별 측정값:

- `sam3-requirements.lock` / runner/LOCKS.md — 3
- `sam3-local-requirements.lock` / runner/LOCKS.md — 0, 종료 1 (OW-200 산출물, OW-207 전제조건이 선행으로 명시)
- `iopath==0.1.10` / runner/sam3-requirements.lock — 1
- `def run_inference(job_root: Path) -> None:` / runner/remote-worker.py — 1
- `const workerPath = resolve(process.cwd(), "runner/remote-worker.py");` / tests/remote-worker-contract.test.ts — 1
- `export class ProcessJobRegistry {` / lib/process-job-registry.ts — 1
- `local-job-runner` / lib/ 재귀 — 출력 없음, 종료 1 (신규 도입 대상)
- `queuePosition` / lib/process-job-registry.ts — 0, 종료 1
- `const result = await runnerProvider().run(input, AbortSignal.any([jobSignal, request.signal]));` / app/api/process/route.ts — 1
- `import { ColabJobRunner, matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner";` / app/api/process/route.ts — 1
- `import { matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner";` / app/api/process/cancel/route.ts — 1
- `super("The client cancelled the Colab job.");` · `super("The Colab job exceeded its allowed time.");` · `super("The Colab command did not complete.");` / lib/colab-errors.ts — 각 1 (r2 에서 3건 모두 전제조건에 등재됨을 확인, N1 해소)
- `case "running": return "전용 Colab GPU 작업자가 이미지를 처리하고 있습니다. 이 창을 닫지 마세요.";` / components/image-processor.tsx — 1
- `type JobState =` / components/image-processor.tsx — 1
- `/api/process/status` / components/image-processor.tsx — 0, 종료 1
- `전용 Colab GPU 작업자가 결과를 만든 뒤 브라우저로 다운로드합니다.` / app/page.tsx — 1
- `createCancelHandler` / tests/process-cancel.test.ts — 7
- `import { ImageProcessor } from "../components/image-processor";` / tests/image-processor.test.tsx — 1
- `IMAGEWORK_RECOVERY_ROOT` / .env.example — 1, `IMAGEWORK_RESULT_TTL_SECONDS` / .env.example — 0, 종료 1
- `proxy_read_timeout 7350s;` / deploy/nginx.conf.example — 1, `client_max_body_size 11m;` / 같은 파일 — 1
- `proxy_read_timeout 7350s` / docs/reverse-proxy.md — 1, `7350` — 1, `7200` — 1, `2×30` — 0(종료 1), `grep -ci colab` — 0(종료 1)
- `## 2. Configure Google Colab CLI authentication` / docs/server-worker.md — 1
- `check:colab-notebook` / README.md — 2, / CLAUDE.md — 2, `docs/colab-results.md` / README.md — 2
- `"check:colab-notebook": "node scripts/check-colab-notebook.mjs",` / package.json — 1
- `"check:public-artifacts": "node scripts/check-public-artifacts.mjs"` / package.json — 1
- `# generated Colab artifacts (the canonical notebook and results template are intended for tracking)` / .gitignore — 1
- `import type { AssetMode } from "./colab-input";` · `import { ResultContractError } from "./colab-errors";` / lib/zip-contract.ts — 각 1
- `import { ImageworkInputError } from "./colab-errors";` / lib/colab-input.ts — 1 (r2 신규, B4 해소 근거)
- `colab\/` / scripts/check-public-artifacts.mjs — 1

result: 35건 전부 `[PLAN r2]` 기재값과 일치했고, 행 번호로 위치를 지정한 앵커는 0건이다. 1을 넘는 4건(`sam3-requirements.lock` 3, `check:colab-notebook` 2+2, `docs/colab-results.md` 2, `createCancelHandler` 7)은 스펙이 "전부 교체"·"2건 삭제"·범위 표시로 쓰므로 모호하지 않다. `skills` 는 11/11 전부 `[]` 라 3개 루트에 조회할 이름이 0건 — 미해소 스킬명 0. `## 2. Change` ↔ `## 1. Preconditions` 대응은 10/11 완전 일치이고, 남은 1건은 OW-204 가 소유한 두 번째 `Colab` 히트가 정확 문자열로 지정되지 않은 것뿐이다(N1 r2). 부수 관측 — OW-206 2-2 의 `client_max_body_size 11m;` 와 2-6 의 `docs/colab-results.md` 링크 2건은 전제조건 블록에 검사가 없으나 스펙 산문이 개수를 명기했고 내 측정값(1, 2)과 일치한다.

### A3 conflict

method: (1) `[PLAN r2]` dispatch table JSON 을 파싱해 필수 9필드 × 11태스크 = 99셀 존재, id 유일성, `deps` 순환을 확인하고, distinct 경로 46건에 대해 경로를 공유하는 모든 태스크 쌍 중 한쪽 이상이 `write: true` 인 쌍을 `deps` **이행 폐포**로 순서 판정했다. (2) 각 태스크 `## 1. Preconditions` 의 "선행 태스크 ID" 를 `deps` 와 11건 1:1 대조했다. (3) 각 태스크 `## 2. Change` 산문이 읽거나 쓰는 경로를 그 태스크 `target_files` 와 대조했다. (4) `git grep -Ilc -i -- colab` 로 현재 `colab` 을 보유한 26개 파일을 전수 열거하고 각 파일을 0건으로 만드는 소유 태스크를 1:1 배정했다. (5) `git grep -n -F -- "AbortSignal.any"` 와 `git grep -l -F` 로 `IMAGEWORK_RECOVERY_ROOT` · `IMAGEWORK_HF_TOKEN` · `IMAGEWORK_JOB_SCRIPT` · `recoverStaleJobs` · `isolatedEnvironment` 의 잔여 보유 파일을 열거해 소유 태스크를 확인했다.

result: (1) 99셀 전부 존재, id 유일, 순환 0, **순서 없는 공유-쓰기 쌍 0건** — `[CHECK r2]` 4항목 독립 재현. 다중 writer 경로는 20건이며 전부 `OW-201/202/203/204/205/206 → OW-208 → OW-209 → OW-210` 사슬로 정렬된다. distinct 경로는 45→46 으로 `runner/vtracer-Cargo.lock` 이 실제로 편입됐다(B2 해소). (2) 11건 전부 일치. (3) 산문↔`target_files` 불일치 0건 — 라운드 1 의 2건(vtracer 락, `lib/image-input.ts`)이 모두 해소됐다. (4) 26개 파일 중 25개는 소유 태스크의 0건 완료 판정이 걸려 있으나, `tests/remote-worker-contract.test.ts`(3건) 만 소유 태스크에 0건 판정이 없고 유일한 정리 태스크가 이 파일을 out-of-scope 로 금지한다 — B1 참조. (5) `AbortSignal.any` 2건은 `app/api/process/route.ts:38`(OW-203 2-1)과 `CLAUDE.md:39`(OW-206 2-7)로 둘 다 소유 태스크가 있어 제공요건 14 도달 가능. `IMAGEWORK_RECOVERY_ROOT` 는 삭제될 2파일을 빼면 `.env.example`(OW-206 2-1 명시) · `CLAUDE.md`(OW-206 2-7) · `README.md` · `docs/server-worker.md` · `tests/process-cancel.test.ts`(OW-205 2-4) 에 남고, `README.md` · `docs/server-worker.md` 의 옛 변수명에는 어떤 계측 판정도 걸려 있지 않다 — N2 참조.

### A4 irreversible

method: 11태스크의 `irreversible` 필드(전부 `false`)를 `target_files` · `## 2. Change` 산문 · `[ANALYZE]` 의 `non_git_paths`(`(none)`) 와 대조했다. 대량 삭제 태스크 OW-208 에 대해 삭제 8건이 추적 중인지 `git ls-files --error-unmatch <8경로>` 로, 사전 스냅샷에 원본이 있는지 `ls <snapshot>` 로 확인했다. 비-git 경로 조작은 OW-200 2-3 의 `mktemp -d` / `rm -rf "$LOCKGATE_DEST"` 를 산문에서 재확인했고, 각 태스크 `## 3. 금지 행위` 에서 `git commit` 금지 문구 존재 여부를 11건 확인했다.

result: `git ls-files --error-unmatch` 종료 0 — 삭제 8건 전부 추적 중. 스냅샷(50파일)에 `colab` · `runner` · `tests` · `docs` · `lib` 디렉터리가 실재해 `git checkout` 과 스냅샷 2중 복구가 성립한다. OW-200 의 비-git 경로는 고정 경로 `/tmp/imagework-lockgate` 에서 `mktemp -d` 산출 디렉터리로 좁혀졌고 `rm -rf` 대상이 그 한 디렉터리로 한정됐다(N2 r1 해소). 다운로드 캐시 외 산출물이 없으므로 `irreversible: false` 11건 전부 성립한다. 되돌릴 수 없는 조작(force push, 원격 삭제, 스키마 마이그레이션)은 0건이고, OW-208 · OW-209 · OW-210 이 `git commit` 을 금지해 작업 트리에만 변경이 남는다.

### A5 model

method: `model` 필드를 전수 확인해 `haiku` 1건(OW-208)만 추출한 뒤, 그 `## 2. Change` 3개 절이 "무엇" 이 아니라 "어떻게" 까지 확정하는지 절별로 판정했다. 근거 계측 — 2-1 삭제 목록 8경로를 `test -e` 로, 2-2 앵커를 `grep -cF -- '"check:colab-notebook": "node scripts/check-colab-notebook.mjs",' package.json` 로, 2-3 의 두 경계 규칙이 같은 지점을 가리키는지를 `grep -n -i colab .gitignore` 와 `grep -c '^/colab/' .gitignore` 로 측정했다.

result: `haiku` 는 OW-208 1건, 나머지 10건 `sonnet`. 2-1 은 8경로 고정 목록의 `git rm`(전부 존재 확인), 2-2 는 히트 1의 유일 앵커 1줄 삭제, 2-3 은 `.gitignore` 24행 주석 + 25~31행 `^/colab/` 7줄이고 32행이 빈 줄이라 "주석 + 7줄" 과 "첫 비-`/colab/` 줄 직전" 두 규칙이 **정확히 같은 24~31행**을 가리킨다(7 = 7, colab 총 8행). 세 절 모두 판단 잔존 없는 결정적 치환·삭제라 `haiku` 배정이 노드 2 기준을 만족한다. 판단이 남는 태스크가 `haiku` 로 내려간 사례 0건이고, 라운드 1 이후 모델 배정 변경도 0건이다.

## Blockers

- {surface: A3, task_id: OW-201, evidence: 현재 `grep -ci colab tests/remote-worker-contract.test.ts` = 3 이다(모두 `colab_runtime_versions` 를 참조하는 어서션). 이 파일을 `write: true` 로 소유한 태스크는 OW-201 하나인데, OW-201 2-2 는 "Colab 전용 어서션은 전부 제거한다" 로 지시만 하고 `grep -ci colab tests/remote-worker-contract.test.ts` 0건 같은 계측 판정을 두지 않는다. 반면 잔여 식별자 정리 태스크 OW-209 는 2-6 에서 `git grep -ri colab` 0건을 완료 판정으로 걸면서, `## 3. Out of scope` 첫 목록에 `tests/remote-worker-contract.test.ts` 를 "하나도 건드리지 않는다" 로 넣어 자기 손으로 고칠 길을 막는다. 같은 절 2-2 의 "실제 대상은 `git grep -Ilc -i -- colab` 출력이 정본이다" 규칙과도 정면으로 충돌한다. OW-210 도 이 파일을 `target_files` 에 갖지만 그 `## 2. Change` 는 5개 명령 실패만 수정 대상으로 삼고 `git grep -ri colab` 은 "추가 확인" 이라 수정 위임이 없다. 결과적으로 OW-201 워커가 세 어서션 중 하나라도 남기면 제공요건 23 이 미충족으로 종료되고 복구 경로가 없다. 다른 25개 colab 보유 파일은 전부 소유 태스크에 0건 판정이 걸려 있어 이 1건만 예외다., fix_instruction: OW-201 2-2 검증 블록에 `grep -ci colab tests/remote-worker-contract.test.ts; echo "exit=$?"` 기대 `0` / `exit=1` 을 완료 판정으로 추가한다. 아울러 OW-209 `## 3. Out of scope` 첫 목록에서 `tests/remote-worker-contract.test.ts` 를 빼고 "선행 태스크가 이미 0건으로 만들었어야 하는 파일 — 잔존 시 이 태스크가 마무리한다" 로 재분류하거나, 남길 경우 2-2 의 "정본" 규칙에 이 파일 예외를 명시한다.}

## Notes

- {surface: A2, task_id: OW-204, text: `grep -ni colab components/image-processor.tsx` 는 2행을 반환한다 — 45행 `case "running": return "Colab GPU에서 처리 중입니다";` 와 57행 `case "running": return "전용 Colab GPU 작업자가 이미지를 처리하고 있습니다. 이 창을 닫지 마세요.";`. 2-1 은 57행만 정확 문자열로 지정하고, 45행은 "0 이 아니면 남은 히트를 전부 이 태스크 안에서 없앤다" 는 포괄 지시로만 덮는다. 라운드 1 의 B1 이 바로 이 두 줄을 뒤바꿔 생긴 결함이었다. 45행 문자열을 `## 1. Preconditions` 에 `grep -cF` 기대 1 로 등재하고 dispatch table `anchors` 에 승격하면, 같은 혼동이 재발하지 않는다. 완료 판정(`grep -ci colab` 0건)이 이미 걸려 있어 블로커로 올리지 않았다.}
- {surface: A1, task_id: OW-206, text: 2-1 이 `.env.example` 에서 제거하는 7개 변수 중 `IMAGEWORK_HF_TOKEN` · `IMAGEWORK_JOB_SCRIPT` · `IMAGEWORK_RECOVERY_ROOT` · `IMAGEWORK_GOOGLE_APPLICATION_CREDENTIALS` 는 이름에 `colab` 이 없어 이 태스크의 유일한 계측 판정(`grep -ci colab <file>` 0건)을 통과한다. 측정: `git grep -l -F` 기준 `IMAGEWORK_HF_TOKEN` 과 `IMAGEWORK_JOB_SCRIPT` 는 `docs/server-worker.md` 에, `IMAGEWORK_RECOVERY_ROOT` 는 `docs/server-worker.md` 와 `README.md` 에 남아 있다. 산문 재작성이 이들을 놓쳐도 어떤 검사도 잡지 못하며 제공요건 17 도 `.env.example` 만 규정한다. 2-5 · 2-6 완료 판정에 `grep -cE 'IMAGEWORK_(HF_TOKEN|JOB_SCRIPT|RECOVERY_ROOT|GOOGLE_APPLICATION_CREDENTIALS)' docs/server-worker.md README.md` 기대 0 을 한 줄 추가하면 해소된다.}
- {surface: A3, task_id: OW-210, text: `## 3. Out of scope` 두 하위 절이 서로 반대다. 첫 목록은 `runner/local-worker.py` · `deploy/imagework.service.example` · `deploy/nginx.conf.example` · `docs/*` · `README.md` · `CLAUDE.md` · `.env.example` 을 "하나도 건드리지 않는다" 로 절대 금지하는데, 두 번째 절은 같은 경로군을 "검사 실패가 직접 지목하지 않는 한 무수정" 으로 조건부 허용한다. 게다가 이 경로들은 OW-210 `target_files` 19건 어디에도 없어, 조건부 허용을 따르는 순간 A3 의 공유-쓰기 판정 밖에서 파일이 수정된다. 실제로 5개 명령이 이 경로들을 지목할 여지는 거의 없으므로(ESLint 대상 아님, 빌드 무관) 두 번째 절의 조건부 문구를 삭제해 첫 목록으로 통일하는 편이 안전하다.}
- {surface: A2, task_id: OW-207, text: 0단계는 "락 파일 2종의 SHA-256 을 실측해 스크립트에 박힌 기대값과 대조한다" 로 2종만 검증하는데, 선행 OW-200 2-5 는 이제 `vtracer-Cargo.lock` 을 포함한 3종을 넘기고 이 태스크 3단계가 그 파일을 클론 루트로 복사해 `--locked` 빌드에 쓴다. 측정: `test -e runner/vtracer-Cargo.lock` 종료 0, 크기 22392. 3단계가 쓰는 파일만 0단계 해시 대조에서 빠져 있으므로 "락 파일 3종" 으로 문구를 맞추면 공급받은 값이 전부 쓰인다.}
- {surface: A2, task_id: OW-209, text: 2-4 가 픽스처 디렉터리 `colab` 의 대체 이름 예시로 `archive` 를 든다. 그런데 `grep -n -i colab tests/check-public-artifacts.test.ts` 가 반환한 3행이 각각 `mkdir(join(root, "colab"))`, `writeFile(join(root, "colab", "archive.ipynb"), ...)`, `git add "colab/archive.ipynb"` 이라 예시대로 바꾸면 경로가 `archive/archive.ipynb` 가 된다. 동작에는 영향이 없으나 예시 이름을 `legacy` 등으로 바꾸면 읽기 쉬운 결과가 된다. 아울러 2-3 이 제거하는 `(?:colab\/)?` 그룹은 같은 정규식의 선행 `(?:^|\/)` 대안이 이미 `colab/output/` 를 포착하므로 중복이며, 제거해도 검출 동작이 바뀌지 않음을 확인했다.}

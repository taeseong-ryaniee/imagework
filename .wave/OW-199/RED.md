[RED]

## Attack surfaces

### A1 premise

method: HEAD `7b3e205`, 작업 트리 clean(`git status --porcelain` 무출력)에서 `## Facts` 각 행이 인용한 명령을 재실행했다. (1) anchor_candidates 24행 중 17행을 `git grep -I -l -F -- "<s>" | wc -l` / `git grep -I -o -F -- "<s>" | wc -l` 로 재측정. (2) target_state 5행을 `stat -f "%z %N" lib/colab-job-runner.ts tests/colab-job-runner.test.ts lib/process-job-registry.ts DESIGN.md runner/remote-worker.py` 로, docs 행을 `ls docs/ | wc -l` 로 재측정. (3) 기준선을 `npx vitest run` 으로 재실행. (4) 호스트 환경을 `which nvidia-smi` 와 `/Users/taeseongyi/.local/bin/python3.12 -m pip --version` 으로 재확인. (5) 스냅샷을 `find <snapshot> -type f | wc -l` 로 재계수. (6) non_git_paths·skills 출처를 `grep -c "Wave Injection" CLAUDE.md AGENTS.md` 와 `find . -name CLAUDE.md -not -path "*/node_modules/*" | wc -l` 로 재확인. (7) `[GATE]` 확정 답변 5건의 인용 출처를 `sed -n '227p;263p;349p' ~/.gstack/projects/taeseong-ryaniee-imagework/taeseongyi-main-design-20260720-182557.md` 와 `wc -l` + `grep -c 20260721T005918Z-89757` (tasks jsonl) 로 대조. (8) `## Provisional requirements` 의 `(assumed:)` 마커 4건(2·12·22·23항)을 `[GATE]` 답변과 1:1 대조.

result: 반환값이 전부 `[ANALYZE]` 기재값과 일치했다 — `Colab` 17파일/74히트, `colab` 20/100, `remote-worker` 6/9, `ColabJobRunner` 4/28, `AbortSignal.any` 2/2, `isolatedEnvironment` 2/5, `recoverStaleJobs` 2/3, `createProcessHandler` 3/10, `CommandRunner` 3/13, `JobCancelledError` 5/17, `IMAGEWORK_RECOVERY_ROOT` 7/10, `x-imagework-processing-code` 5/5, `queuePosition`·`registerJob`·`local-worker`·`local-job-runner`·`IMAGEWORK_RESULT_TTL_SECONDS` 전부 0/0. stat 값도 일치(20466 / 29615 / 4744 / 16259 / 12501). `ls docs/` 는 3건(`colab-results.md` `reverse-proxy.md` `server-worker.md`)으로 `[PLAN]` refutations 가 맞고 `[ANALYZE]` 의 "2개 파일" 이 틀렸다. `npx vitest run` = 6파일/68테스트 전부 통과(9.39초) — OW-210 의 41건 하한 기준선 유효. `nvidia-smi` not found, `pip 26.1.2 (python 3.12)` 확인. 스냅샷 50파일 확인. `Wave Injection` 0건, CLAUDE.md 1개 확인. GATE 인용 3건 중 2건 정확 — L263 = "현행 프록시 읽기 타임아웃(7350초 = 작업 7200초 + Colab 정리 호출 2×30초 + 여유) ... 모든 엔드포인트에 `proxy_read_timeout 120s`", L349 = "만료 jobId를 잘못된 jobId와 동일 취급 400". L227 은 `### 프로비저닝 (1회, scripts/provision-worker.sh 신규)` 섹션 헤딩이고 `프로비저닝 0단계` 리터럴은 문서 내 4건으로 별도 행에 있다(주장 자체는 성립, 행 번호만 헤딩). tasks jsonl 20행 / run_id 20행 일치. `(assumed:)` 4건 전부 GATE 채택안과 일치(2항→Q2(C), 12항→Q5(B) 400 고정, 22·23항→Q4(A)). 다만 23항의 전제는 OW-204 가 지정한 교체 문자열 때문에 실행 불가다 — B1 참조. OW-201 이 요구하는 세 번째 해시 상수의 공급원이 어느 선행 산출물에도 없다 — B3 참조.

### A2 anchor

method: 범위는 **전량**이다 — dispatch table 의 `anchors` 26건 + `## new_anchors` 22건(중복 제거 후 distinct (파일, 문자열) 쌍 31건) 전부를 `grep -cF -- '<s>' <file>` 로 종료 상태까지 측정했다. 이와 별도로 `skills` 필드 11건을 전수 확인했고(전부 `[]`), `## 2. Change` 의 앵커가 `## 1. Preconditions` 에 대응 검사를 갖는지 태스크별로 대조했다. 개별 측정값:

- `sam3-requirements.lock` / runner/LOCKS.md — 3 (OW-200)
- `iopath==0.1.10` / runner/sam3-requirements.lock — 1 (OW-200 2-3 근거)
- `def run_inference(job_root: Path) -> None:` / runner/remote-worker.py — 1
- `const workerPath = resolve(process.cwd(), "runner/remote-worker.py");` / tests/remote-worker-contract.test.ts — 1
- `export class ProcessJobRegistry {` / lib/process-job-registry.ts — 1
- `local-job-runner` / lib/local-job-runner.ts — 종료 2(파일 없음, 신규 도입 대상. OW-202 전제조건은 `grep -rcF ... lib/` 로 올바르게 우회)
- `const result = await runnerProvider().run(input, AbortSignal.any([jobSignal, request.signal]));` / app/api/process/route.ts — 1
- `import { ColabJobRunner, matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner";` / app/api/process/route.ts — 1
- `import { matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner";` / app/api/process/cancel/route.ts — 1
- `super("The client cancelled the Colab job.");` / lib/colab-errors.ts — 1
- `super("The Colab job exceeded its allowed time.");` / lib/colab-errors.ts — 1 (전제조건 미기재, N1)
- `super("The Colab command did not complete.");` / lib/colab-errors.ts — 1 (전제조건 미기재, N1)
- `case "running": return "전용 Colab GPU 작업자가 이미지를 처리하고 있습니다. 이 창을 닫지 마세요.";` / components/image-processor.tsx — 1
- `type JobState =` / components/image-processor.tsx — 1
- `전용 Colab GPU 작업자가 결과를 만든 뒤 브라우저로 다운로드합니다.` / app/page.tsx — 1
- `<p>파일의 실제 픽셀 크기를 자동으로 확인하고, 전용 Colab GPU 작업자가 결과를 만든 뒤 브라우저로 다운로드합니다.</p>` / app/page.tsx — 1
- `createCancelHandler` / tests/process-cancel.test.ts — 7
- `import { ImageProcessor } from "../components/image-processor";` / tests/image-processor.test.tsx — 1
- `IMAGEWORK_RECOVERY_ROOT` / .env.example — 1
- `proxy_read_timeout 7350s;` / deploy/nginx.conf.example — 1
- `proxy_read_timeout 7350s` / docs/reverse-proxy.md — 1
- `## 2. Configure Google Colab CLI authentication` / docs/server-worker.md — 1
- `check:colab-notebook` / README.md — 2, / CLAUDE.md — 2
- `sam3-local-requirements.lock` / runner/LOCKS.md — 0, 종료 1 (OW-207 전제조건이 선행 산출물로 명시)
- `"check:colab-notebook": "node scripts/check-colab-notebook.mjs",` / package.json — 1
- `# generated Colab artifacts (the canonical notebook and results template are intended for tracking)` / .gitignore — 1
- `import type { AssetMode } from "./colab-input";` / lib/zip-contract.ts — 1
- `import { ResultContractError } from "./colab-errors";` / lib/zip-contract.ts — 1
- `colab\/` / scripts/check-public-artifacts.mjs — 1
- `"check:public-artifacts": "node scripts/check-public-artifacts.mjs"` / package.json — 1

result: 31건 전부 기대값과 일치했고 0건 앵커·행번호 참조는 없다. 유일하게 1을 넘는 3건(`sam3-requirements.lock` 3, `check:colab-notebook` 2+2, `createCancelHandler` 7)은 스펙이 "전부 교체" 또는 범위 표시로 쓰므로 모호하지 않다. `skills` 는 11/11 전부 `[]` 라 해소할 스킬명이 없다 — 3개 루트 조회 대상 0건. `## 2. Change` 앵커의 전제조건 대응은 OW-203 2-5 의 2건만 누락(N1), 나머지 태스크는 전부 대응한다. 다만 OW-204 가 지정한 교체 문자열 자체에 `Colab` 이 남아 같은 절의 완료 판정과 충돌한다 — B1.

### A3 conflict

method: (1) dispatch table 11태스크의 `target_files` 를 파싱해 distinct 경로 45건을 뽑고, 경로를 공유하는 모든 태스크 쌍 중 한쪽 이상이 `write: true` 인 쌍에 대해 `deps` 의 **이행 폐포**로 순서 존재 여부를 판정하는 스크립트를 돌렸다. (2) 각 태스크 `## 1. Preconditions` 의 "선행 태스크 ID" 를 dispatch table 의 `deps` 와 11건 1:1 대조했다. (3) 각 태스크 `## 2. Change` 산문이 언급하는 경로를 그 태스크의 `target_files` 와 대조했다. (4) 삭제 대상 모듈의 잔여 임포터를 `git grep -l -F -- 'colab-job-runner'`, `git grep -l -F -- 'colab-errors'`, `git grep -l -F -- 'colab-input'` 으로 확인했다.

result: (1) 순서 없는 공유 경로 **0건** — `[CHECK]` 4번 항목 독립 재현. 다중 writer 경로 20건은 전부 `OW-202/203/204/205 → OW-208 → OW-209 → OW-210` 사슬로 정렬된다. (2) 11건 전부 일치(OW-200 (none)/[], OW-205 OW-202·OW-203·OW-204, OW-208 8건, OW-210 OW-209 등). (3) 불일치 2건 — `runner/vtracer-Cargo.lock` 은 45개 경로 어디에도 없는데 OW-200 2-4·OW-201 2-1/2-2·OW-207 3단계가 이 파일을 읽는다(B2, N4). OW-209 는 `lib/image-input.ts` 를 `target_files` 에 `write: true` 로 갖고 있으면서 2-2 스윕 목록과 out-of-scope 로 그 내용 수정을 금지한다(B4). (4) `colab-job-runner` 참조는 CLAUDE.md·app/api/process/route.ts·app/api/process/cancel/route.ts·tests/colab-job-runner.test.ts·tests/process-cancel.test.ts 5건으로 전부 OW-203/205/206/208/209 가 담당해 고아 임포터는 없다. `colab-errors` 참조 9건에 `lib/colab-input.ts` 가 포함된다 — B4 의 근거다.

### A4 irreversible

method: 11태스크의 `irreversible` 필드(전부 `false`)를 각 태스크의 `target_files`·`## 2. Change` 산문·`[ANALYZE]` 의 `non_git_paths` 행(`(none)`)과 대조했다. 대량 삭제를 수행하는 OW-208 에 대해서는 삭제 8건이 git 추적 대상인지 `git ls-files --error-unmatch docs/colab-results.md runner/remote-worker.py runner/sam3-requirements.lock` 로, 사전 스냅샷에 존재하는지 `find <snapshot> -name colab-results.md -o -name imagework.ipynb -o -name DESIGN.md` 로 확인했다.

result: 비-git 경로를 건드리는 태스크 1건 — OW-200 2-3 이 `/tmp/imagework-lockgate` 로 `pip download` 산출물을 내려받고 "작업 종료 시 삭제한다" 로 지운다. `[ANALYZE]` 의 `non_git_paths` 는 `(none)` 이라 이 경로가 기록돼 있지 않다(N2). OW-208 의 삭제 8건은 `git ls-files --error-unmatch` 종료 0(전부 추적 중)이고 스냅샷에 `docs/colab-results.md`·`colab/imagework.ipynb` 가 실재하므로 `git checkout` 과 스냅샷 2중 복구가 가능하다 — `irreversible: false` 는 성립한다(N5). 되돌릴 수 없는 조작(force push, 원격 삭제, DB 마이그레이션 등)은 11태스크 어디에도 없다.

### A5 model

method: `model` 필드를 전수 확인해 `haiku` 1건(OW-208)만 추출한 뒤, 그 `## 2. Change` 3개 절이 "무엇" 이 아니라 "어떻게" 까지 확정하는지 절별로 판정했다. 판정 근거로 2-2 앵커 유일성을 `grep -cF -- '"check:colab-notebook": "node scripts/check-colab-notebook.mjs",' package.json`, 2-3 의 두 경계 규칙("7줄" 과 "첫 비-`/colab/` 줄 직전")이 서로 같은 지점을 가리키는지를 `grep -c '^/colab/' .gitignore` 와 `grep -ci colab .gitignore` 로 측정했다.

result: `haiku` 는 OW-208 1건, 나머지 10건은 `sonnet`. OW-208 2-1 은 파일 8개 고정 목록의 `git rm`(열거 완료), 2-2 는 히트 1의 유일 앵커 1줄 삭제(측정 1), 2-3 은 `^/colab/` 7줄 + 주석 1줄 = colab 총 8줄로 두 경계 규칙이 **정확히 같은 8줄**을 가리킨다(7 = 7). 세 절 모두 판단 잔존이 없는 결정적 치환·삭제라 `haiku` 배정은 노드 2 기준을 만족한다. 판단이 남는 태스크가 `haiku` 로 내려간 사례 0건.

## Blockers

- {surface: A2, task_id: OW-204, evidence: `## 2. Change` 2-1 이 지정한 교체 후 문자열이 `case "running": return "Colab GPU에서 처리 중입니다";` 로 `Colab` 을 그대로 포함하는데, 같은 절의 완료 판정은 `grep -ci colab components/image-processor.tsx` 가 0건(종료 1)이어야 한다고 못박는다. 현재 값은 `grep -ci colab components/image-processor.tsx` = 2. 교체를 지시대로 수행하면 1이 남아 판정이 영구히 실패한다. 그 위에 OW-209 는 `components/image-processor.tsx` 를 "다른 태스크의 target_files — 하나도 건드리지 않는다" 목록에 넣어 사후 정정 경로도 없으므로, 제공요건 23(`git grep -ri colab` 0건)과 27 이 웨이브 종료 시점에 미충족으로 남는다., fix_instruction: OW-204 2-1 의 교체 후 문자열에서 `Colab` 을 제거하고 같은 절 D31 카피와 일치시킨다 — 예: `case "running": return "사내 GPU에서 처리 중입니다";`. 교체 후 문자열을 스펙에 그대로 다시 적고, `## 1. Preconditions` 결과 상태 검사에 `grep -ci colab components/image-processor.tsx` 기대 0을 추가한다.}
- {surface: A3, task_id: OW-200, evidence: `runner/vtracer-Cargo.lock` 이 11태스크 `target_files` 의 distinct 경로 45건 어디에도 없다(스크립트 판정: ABSENT). 그런데 OW-200 `## 2. Change` 2-4 는 LOCKS.md 표 3행 각각에 `shasum -a 256 <file>` 실측값을 적으라고 지시하며 그 3행 중 하나가 `vtracer-Cargo.lock` 이다 — 산문이 읽는 경로를 `target_files` 가 누락한 상태다., fix_instruction: OW-200·OW-201·OW-207 의 `target_files` 에 `{"path": "runner/vtracer-Cargo.lock", "write": false}` 를 추가한다. OW-208 은 이미 이 파일을 "삭제하지 않는다" 로 명시하고 있으므로 write 항목을 추가하지 않는다.}
- {surface: A1, task_id: OW-201, evidence: `## 2. Change` 2-1 은 상수 3종(`SAM3_LOCAL_REQUIREMENTS_LOCK_SHA256`, `SAM3_LOCAL_BUILD_REQUIREMENTS_LOCK_SHA256`, `VTRACER_CARGO_LOCK_SHA256`)의 값이 "선행 태스크의 `## Decisions` 코멘트에 기록된 실측 SHA-256" 이라고 규정한다. 그러나 선행 태스크 OW-200 의 2-5 는 넘길 값을 "**두** 락 파일의 SHA-256 실측값" 으로 한정해 `vtracer-Cargo.lock` 해시를 넘기지 않는다. 동시에 OW-201 은 `runner/LOCKS.md` 를 out-of-scope "하나도 건드리지 않는다" 목록에 두고 `runner/vtracer-Cargo.lock` 을 `target_files` 에 갖지 않는다. 세 번째 상수의 공급원이 존재하지 않는다. 이 상수는 2-2 에서 테스트 어서션 대상이기도 하며 현행 `grep -cF -- 'vtracer-Cargo.lock' tests/remote-worker-contract.test.ts` = 1 로 실제로 필요하다., fix_instruction: OW-200 2-5 의 Decisions 항목을 "락 파일 **3종**(`sam3-local-requirements.lock`, `sam3-local-build-requirements.lock`, `vtracer-Cargo.lock`)의 SHA-256 실측값" 으로 고친다. 아울러 OW-201 `## 1. Preconditions` 에 `test -e runner/vtracer-Cargo.lock; echo "exists=$?"` 기대 `exists=0` 을 추가한다.}
- {surface: A3, task_id: OW-209, evidence: 2-1 은 `git mv lib/colab-input.ts lib/image-input.ts` 와 `git mv lib/colab-errors.ts lib/job-errors.ts` 를 지시하면서 "파일 내용은 바꾸지 않는다 — 경로만 바뀐다" 로 못박고, `## 3. Out of scope` 도 "`lib/job-errors.ts` · `lib/image-input.ts` 의 파일 내용(경로만 이동, 내용 무수정)" 을 재확인한다. 그런데 `git grep -l -F -- 'colab-errors'` 출력에 `lib/colab-input.ts` 가 포함된다 — 이 파일이 `./colab-errors` 를 임포트하므로 rename 직후 그 경로가 끊긴다. 2-2 의 스윕 대상 목록 12개 파일(`lib/zip-contract.ts`, `lib/process-job-registry.ts`, `lib/local-job-runner.ts`, app/api 4종, tests 5종)에 `lib/image-input.ts` 가 없다. 결과적으로 같은 태스크의 2-6 검증 `npx tsc --noEmit` 이 반드시 비0으로 끝난다., fix_instruction: 2-2 의 스윕 대상 목록 맨 앞에 `lib/image-input.ts` 를 추가하고, 2-1 과 out-of-scope 의 "내용 무수정" 규칙에 "단 자기 자신의 `./colab-errors` 임포트 1줄은 `./job-errors` 로 바꾼다" 예외를 명시한다.}

## Notes

- {surface: A2, task_id: OW-203, text: 2-5 가 교체 대상으로 제시하는 `super("The Colab job exceeded its allowed time.");` 와 `super("The Colab command did not complete.");` 두 앵커가 `## 1. Preconditions` 검사 목록에도 dispatch table `anchors` 에도 `## new_anchors` 에도 없다. 내가 측정한 값은 `lib/colab-errors.ts` 에서 각각 1건이라 실행은 성립하지만, 워커가 존재 확인 없이 편집하게 된다. 전제조건 블록에 두 줄(`grep -cF -- '<s>' lib/colab-errors.ts` 기대 1)을 추가하면 해소된다.}
- {surface: A4, task_id: OW-200, text: 2-3 이 `--dest /tmp/imagework-lockgate` 로 비-git 경로에 다운로드하고 "작업 종료 시 삭제한다" 로 지운다. `[ANALYZE]` 의 `non_git_paths` 는 `(none)` 이라 이 경로가 기록돼 있지 않다. 산출물이 임시 다운로드 캐시뿐이라 블로커로 올리지 않았지만, (a) `non_git_paths` 에 이 경로를 기록하고 (b) 전역 CLAUDE.md 가 지정한 세션 스크래치패드 디렉터리를 쓰도록 `--dest` 를 바꾸면 삭제 범위가 세션 안으로 좁혀진다.}
- {surface: A1, task_id: OW-206, text: 2-4 는 `docs/reverse-proxy.md` 에서 "옛 7350초 계산식(7200초 작업 + Colab 정리 2×30초)을 완전히 삭제" 하라고 지시하고 완료 판정으로 `grep -ci colab docs/reverse-proxy.md` 0건을 건다. 측정 결과 그 파일은 이미 `grep -ci colab` = 0 이고 `grep -cF -- '2×30'` = 0 이며, 남아 있는 것은 `7350` 1건과 `7200` 1건뿐이다. 인용된 계산식 원문은 저장소가 아니라 설계 문서 L263 에 있다. 워커가 없는 문자열을 찾아 헤매지 않도록 "`7350` 과 `7200` 이 등장하는 서술을 120s 정책으로 갱신" 으로 지시를 좁히는 편이 낫다.}
- {surface: A3, task_id: OW-207, text: 3단계가 `runner/vtracer-Cargo.lock` 을 클론 루트로 복사하라고 지시하고 4단계가 기존 `SAM3_SHA256` 재사용을 지시하는데, 두 경로 모두 이 태스크 `target_files` 에 없다(`SAM3_SHA256` 은 현재 `runner/remote-worker.py` 안에만 있고 그 파일은 out-of-scope). 워커가 생성하는 스크립트의 런타임 참조라 실행을 막지는 않지만, B2 수정 시 `runner/vtracer-Cargo.lock` 을 `write: false` 로 함께 넣고 `SAM3_SHA256` 값은 OW-201 의 Decisions 로 넘겨받도록 명시하면 공급원이 확정된다.}
- {surface: A4, task_id: OW-208, text: `git rm` 8건은 대량 삭제에 해당하지만 `git ls-files --error-unmatch` 가 종료 0 으로 전부 추적 중임을 확인했고, 사전 스냅샷(50파일)에 `docs/colab-results.md`·`colab/imagework.ipynb`·`DESIGN.md` 가 실재해 2중 복구가 가능하다. 또 `## 3. 금지 행위` 가 `git commit` 을 막아 작업 트리에만 남는다. `irreversible: false` 는 근거 있는 값이라 블로커로 올리지 않았다 — 기록용이다.}
- {surface: A1, task_id: (wave), text: `[GATE]` 2행이 근거로 "설계 문서 227행 '프로비저닝 0단계'" 를 인용하는데, L227 은 `### 프로비저닝 (1회, scripts/provision-worker.sh 신규)` 라는 섹션 헤딩이고 `프로비저닝 0단계` 리터럴은 같은 문서에 4건 별도 행으로 존재한다. 주장(재실행 지점이 이미 정의돼 있음)은 성립하므로 사실 오류가 아니라 인용 행 번호가 섹션 머리를 가리키는 문제다.}

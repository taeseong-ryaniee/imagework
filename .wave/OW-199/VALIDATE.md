[VALIDATE]

## Requirement checks

기준: `[ANALYZE]` `## Provisional requirements` 25항 + `[GATE]` `## Provisional requirements 갱신` 26·27항 = 27항. 실행 커밋 없음(작업 트리 상태로 검증), HEAD `7b3e205`.

**1.** checked: `ls -l runner/sam3-local-requirements.lock`(32137 bytes) + 파이썬으로 항목 블록 분해해 `torch`/`torchvision`/`numpy`/`pillow` 각 블록의 `--hash=sha256:` 개수 계수.
result: pass — `torch==2.11.0+cu128`(hash 1), `torchvision==0.26.0+cu128`(1), `numpy==2.4.4`(1), `pillow==12.2.0`(1). 파일 전체 `--hash=sha256:` 362건, 31패키지 전부 `==` 고정.

**2.** checked: `runner/LOCKS.md` `## Hash gate` 절(61행부터) + OW-200 Linear 코멘트 `## Decisions`의 게이트 명령 4건과 종료 코드.
result: pass — 원안 명령 exit 1(`hf-xet`/`safetensors`가 `manylinux_2_28_x86_64` 태그 미발행), 코디네이터 승인 후 `--platform manylinux2014_x86_64` 추가 → `iopath` 외 exit 0(30/30 해시 검증), `iopath` 단독 sdist 게이트 exit 0. GATE Q2=(C) 채택안(`pip download --require-hashes --only-binary=:all: --platform ... --python-version 3.12`)으로 판정한 기록이 남아 있다.

**3.** checked: `/Users/taeseongyi/.local/bin/python3.12 -m py_compile runner/local-worker.py`.
result: pass — 종료 코드 0. 파일 존재(11238 bytes).

**4.** checked: `runner/local-worker.py` 전체 읽기 — `_load_model()` 정의 86행, 호출 지점 전수(233행 `_run_worker`, 257행 `_self_test`), 작업 루프(`for raw_line in sys.stdin` 239행) 본문.
result: pass — 작업 루프 본문에 모델 로드 호출 0건, 루프 직전 233행에 1건. 호출 지점은 총 2곳이지만 233행(잡 서빙)과 257행(`--self-test` 전용, `main()` 270-276행에서 상호배타 분기 후 즉시 return)은 한 프로세스가 동시에 밟지 않는 진입 모드다. 잡마다 수행되는 것은 `_run_job`의 추론뿐.

**5.** checked: `runner/local-worker.py` 22-25행 상수 4건 대 `shasum -a 256 runner/sam3-local-requirements.lock runner/sam3-local-build-requirements.lock runner/vtracer-Cargo.lock` 실측치 비교, `_verify_lock`(75-77행)·`_verify_locks`(80-83행) 호출 지점(226행 `_run_worker` 최초, 256행 `_self_test` 최초).
result: pass — 3개 락 전부 상수와 실측 SHA-256 일치(`ba864ebd…`, `b795477f…`, `79e8c98a…`). 불일치 시 `RuntimeError("lock hash mismatch: …")`로 기동 중단, 모델 로드·프로토콜 개시 전에 실행된다.

**6.** checked: `runner/local-worker.py` 227-232행.
result: pass — `protocol_fd = os.dup(1)`로 원본 stdout을 확보한 뒤 `os.dup2(2, 1)`로 fd 1을 stderr로 재지정. 프로토콜 쓰기는 `_write_protocol`(67-68행)이 `os.write(protocol_fd, …)`로만 수행하므로 fd 1에 쓰는 C 확장/서브프로세스 출력은 부모의 프로토콜 스트림에 도달하지 않는다.

**7.** checked: `runner/local-worker.py` 151행·168행 취소 체크포인트, 171-173행·193행 ZIP 확정 경로.
result: pass — 체크포인트 2곳(`checkpoint 1/2` 이미지 로드 후 forward 전, `checkpoint 2/2` forward 후 vtracer 전), 둘 다 `_handle_sigusr1`이 세운 `_cancel_requested`를 관측해 `CancelledError`. 결과는 `imagework-results.zip.tmp`에 쓴 뒤 `os.rename(tmp_archive_path, archive_path)`로 확정.

**8.** checked: `grep -n "local-worker\|remote-worker" tests/remote-worker-contract.test.ts` + `npx vitest run` 결과.
result: pass — 6행이 `resolve(process.cwd(), "runner/local-worker.py")`를 대상으로 삼고 `remote-worker` 참조 0건. 8개 테스트 파일 81건 전부 통과(exit 0)에 포함.

**9.** checked: `lib/local-job-runner.ts`(494행) 요소별 위치 확인 — 199·228·303행(FIFO), 254·477행(재스폰), 27·28·480-486행(서킷브레이커), 205·287·305·328·340·380행(`currentJobId`), 271-291행(파서), 154-156·239행(flock), 244·248-252행(tmp 스윕).
result: pass — 7요소 전부 존재. FIFO는 `queue.push` / `queue.shift`, 서킷브레이커는 `circuitBreakerWindowMs = 10 * 60 * 1000` + `maxCrashesPerWindow = 3` 초과 시 respawn 중단, 취소는 `currentJobId === jobId`일 때만 `worker.kill("SIGUSR1")`, 파서는 `JSON.parse` try/catch + zod `safeParse` + jobId 대조 실패 시 `logDiagnostic`으로 격리, GPU flock은 `spawn("flock", ["--nonblock", join(modelCacheRoot, ".gpu.lock"), "sleep", "infinity"])`를 기동 시 1회, 스윕은 `sweepStaleJobDirs()`가 flock 획득 직후·최초 respawn 이전에 `IMAGEWORK_JOB_TMP_ROOT` 전체 `rm -r`.

**10.** checked: `lib/process-job-registry.ts` 12행 상태 유니온, 117-137행 전이 메서드, 17·26행 `resultPath`, 41·54-66·164행 pending-cancellation TTL, 197행 통합 스윕.
result: pass — `"queued" | "processing" | "done" | "failed" | "cancelled"` 5개 상태. `markDone`이 `resultPath` + `expiresAt`를 함께 기록하고 `markFailed`/`markCancelled`도 `expiresAt`를 세운다. 잡 등록 전 도착한 취소는 `recordPendingCancellation`이 `kind: "pending"` + 독립 `pendingCancelTtlMs` 엔트리로 저장하고 79행에서 후속 `register`가 이미 abort된 controller를 승계 — 기존 동작 보존.

**11.** checked: `app/api/process/status/route.ts` 전문(37행).
result: pass — `export const GET = createStatusHandler()`. 헤더 `x-imagework-processing-code` 부재·불일치 시 `ProcessingCodeError` → 400, `registry.read(jobId)` 미존재(부정·미등록·TTL 만료 포함) 시 `ImageworkInputError` → 400. 200 바디는 `{state}`에 `failed`면 `errorKind`, `queued`면 `queuePosition`을 상태별로 덧붙인다.

**12.** checked: `app/api/process/result/route.ts` 전문.
result: pass — `status.state !== "done" || !status.resultPath`면 `ImageworkInputError` → 400이고, `registry.read`가 `pruneExpired()`를 먼저 돌리므로 TTL 만료 jobId도 같은 400으로 수렴(GATE Q5=(B)의 400 고정안대로). done이면 `readFile` 후 `Content-Disposition: attachment`로 반환하고 즉시 `rm(dirname(resultPath), {recursive:true, force:true})`.

**13.** checked: `app/api/process/route.ts` 45-50행.
result: pass — `void runnerProvider().run(...)`로 처리를 대기하지 않고 `Response.json({ jobId }, { status: 202, headers: apiHeaders })` 즉시 반환.

**14.** checked: `git grep -F "AbortSignal.any"` 및 `app`/`lib`/`components` 전역 `request.signal`·`addEventListener("abort"` 검색.
result: pass — `AbortSignal.any` 0건. abort 리스너는 `lib/local-job-runner.ts:227` 1곳뿐이고 그 signal은 `registry.register(jobId)`가 돌려주는 취소 API 전용 signal이다. 라우트 어디에도 `request.signal` 연결 없음 — 브라우저 연결 종료가 취소를 유발하지 않는다.

**15.** checked: `components/image-processor.tsx` 353-401행(`pollOnce`), 424-452행(제출), 481행(결과 페치), 212-218행(타이머·버튼 상태).
result: pass — `crypto.randomUUID()`로 jobId 생성 → multipart POST → `schedulePoll(jobId, code, 0)` → `GET /api/process/status?jobId=…` 폴링(`POLL_INTERVAL_MS = 2000`, 연속 실패 시 `BACKOFF_STEPS_MS` 백오프) → `done`에서 `GET /api/process/result?jobId=…` 다운로드. `showCancelButton`이 `preparing`/`queued`/`processing`/`cancelling`에서 true.

**16.** checked: `grep -c Colab lib/job-errors.ts` + 33-37행 `JobCancelledError`. 원래 경로 `lib/colab-errors.ts`는 `ls`에서 부재 — 요건 23이 강제한 rename(`git status`의 `RM lib/colab-errors.ts -> lib/job-errors.ts`)의 후속 파일로 판정했다.
result: pass — `Colab` 0건, 메시지 `"The job was cancelled by an explicit cancel request."`로 명시적 취소를 서술.

**17.** checked: `grep -nE "IMAGEWORK_" .env.example` 키 전수.
result: pass — 제거 확인: `IMAGEWORK_COLAB_*`·`IMAGEWORK_HF_TOKEN`·`IMAGEWORK_RECOVERY_ROOT`·`IMAGEWORK_JOB_SCRIPT` 0건. 추가 확인: `IMAGEWORK_WORKER_PYTHON`(27행)·`IMAGEWORK_WORKER_SCRIPT`(33)·`IMAGEWORK_MODEL_CACHE`(40)·`IMAGEWORK_VTRACER_BIN`(45)·`IMAGEWORK_RESULT_TTL_SECONDS`(64) 전부 존재.

**18.** checked: `bash -n scripts/provision-worker.sh` + `grep -nE "^step[0-9]" scripts/provision-worker.sh` + `main()` 디스패치(268-279행).
result: pass — `bash -n` 종료 코드 0. `step0_preflight`(140) ~ `step7_legacy_remnant_check`(256) 8단계가 전부 정의되고 `main()`이 0→7 순서대로 호출한다. 파일은 실행 권한(`-rwxr-xr-x`) 보유.

**19.** checked: `grep -nE "Restart|journal" deploy/imagework.service.example`.
result: pass — `Restart=on-failure`(22행), `RestartSec=5`(23), `StandardOutput=journal`(24), `StandardError=journal`(25).

**20.** checked: `grep -nE "7350|client_max_body_size|location|proxy_read_timeout|limit_req" deploy/nginx.conf.example`.
result: pass — `7350` 0건, `proxy_read_timeout 120s`(23행, GATE Q5=(B) 고정값). `client_max_body_size`는 서버 블록 `1m`(19행)과 `location = /api/process` 내부 `11m`(30-31행) 2곳뿐 — status/result/cancel 블록은 서버 기본값 1m을 상속한다.

**21.** checked: 4개 파일 각각 `grep -ci colab` + 아키텍처 서술 구절 직접 읽기(`docs/reverse-proxy.md` 전문, `README.md` 6-7·134행, `docs/server-worker.md`·`CLAUDE.md`의 `local-worker`·`/api/process/status|result`·`202` 언급 계수).
result: pass — colab 4개 파일 전부 0건. `docs/server-worker.md`(local-worker 13건 / status·result 6건 / 202 3건)·`CLAUDE.md`(2/3/1)·`README.md`("That worker runs on the deployment host's own GPU, queues the job", "비동기 잡 API 덕분에 읽기 타임아웃은 120초처럼 짧게")가 로컬 워커 + 비동기 흐름을 서술한다. `docs/reverse-proxy.md`는 문서 주제(프록시 경계)에 맞춰 비동기 API 쪽만 서술한다 — "the async job API responds immediately on submission, status poll, and result fetch"로 옛 잡-길이 연동 타임아웃 제거를 명시하고 4개 엔드포인트를 구분해 다루지만, GPU 로컬 워커 자체는 언급하지 않고 `docs/server-worker.md`가 그 몫을 맡는다.

**22.** checked: 4개 경로 `[ -e ]` 존재 검사 + `python3 -c "json.load(open('package.json'))['scripts']"`.
result: pass — `lib/colab-job-runner.ts`·`colab/imagework.ipynb`·`scripts/check-colab-notebook.mjs`·`tests/colab-job-runner.test.ts` 전부 부재(`git status`에 `D`). `scripts` 키는 `dev/build/start/lint/test/check:public-artifacts` 6개뿐 — `check:colab-notebook` 제거됨.

**23.** checked: `git grep -ri colab`(추적 파일) + 미추적 신규 파일 11건 대상 `grep -ril colab`.
result: pass — 추적 0건, 미추적 신규 파일 0건. GATE Q4=(A) 채택대로 `runner/remote-worker.py`·`sam3-requirements.lock`·`sam3-build-requirements.lock`도 삭제됐고 `vtracer-Cargo.lock`은 존치. 명시적 관측 1건: `scripts/provision-worker.sh:82`가 레거시 CLI 이름을 `printf '%b' '\x63\x6f\x6c\x61\x62'`로 런타임 조립한다(76-81행 주석이 이유를 밝힘 — step 7이 자기 소스를 그 리터럴로 되검사하는 회귀 가드라 소스에 리터럴을 둘 수 없음). 요건 23의 측정치는 0건이고 용도는 잔존 방지 가드이지만, 인코딩된 리터럴이 grep에 잡히지 않는다는 사실 자체는 기록해 둔다.

**24.** checked: `npx vitest run` 전체 실행(로그 `/private/tmp/…/scratchpad/checks.log`).
result: pass — 8개 파일 / 81건 전부 통과, exit 0, 61.67초. 기준선 68건에서 `colab-job-runner.test.ts` 27건이 빠지고 신규 3파일(`local-job-runner.test.ts`·`process-async-api.test.ts`·`process-job-registry.test.ts`) + 기존 파일 증분으로 순증 — 하한 41건을 40건 초과 충족.

**25.** checked: `npx tsc --noEmit` / `npm run lint` / `npm run check:public-artifacts` / `npm run build` 순차 실행, 각 종료 코드 기록.
result: pass — 전부 exit 0. tsc 출력 없음, lint는 0 errors / 1 warning(`.remember/tmp/last-ndc.ts` — 이 웨이브 산출물 아님), check:public-artifacts는 53개 후보 통과, build는 Turbopack 1544ms 컴파일 성공. 단서 1건: 이 build 통과는 OW-210이 코디네이터 승인을 받아 repo 루트의 깨진 `.codegraph` 심볼릭 링크(외부 omo 인덱서 산출물, git 미추적)를 삭제한 뒤의 상태다 — 저장소 파일 변경은 아니지만 재현 조건이므로 명시한다.

**26.** checked: `app/api/process/status/route.ts` 28행 + `lib/process-job-registry.ts` 148행·151-159행 `queuePositionOf`.
result: pass — `queued` 상태에서만 `queuePosition`을 바디에 넣고, `queuePositionOf`가 `position = 0`에서 시작해 대기 중 엔트리마다 `position += 1`을 먼저 수행한 뒤 반환하므로 큐 선두가 1이다(1-기반).

**27.** checked: `grep -ci colab` 3개 파일 + `grep -rn "닫지 마\|창을 닫" app components`.
result: pass — `app/page.tsx` 0건, `components/image-processor.tsx` 0건, `scripts/check-public-artifacts.mjs` 0건. "이 창을 닫지" 계열 0건. `app/page.tsx` diff는 "전용 Colab GPU 작업자" → "사내 GPU 작업자" 1행 교체.

## Verdict

pass.

주입 소스 — 부모 이슈 OW-199 description이 주입 키를 선언하지 않으므로(`## Goal (verbatim)`/`## Trigger-threshold reason`/`## Wave state`/`## 블록 사유`/`## 관련` 5개 섹션뿐) 대상 경로를 관장하는 `/Users/taeseongyi/Desktop/GitHub/imagework/CLAUDE.md`로 해소했다(`find . -name CLAUDE.md -not -path "*/node_modules/*"` = 1건). 해당 파일에 `## Wave Injection` 섹션 없음(`grep -n "Wave Injection\|check_command\|content_rules\|human_check" CLAUDE.md AGENTS.md` 무출력, exit 1).

- L1 **skip** — `check_command` 키 부재(위 주입 소스에 `## Wave Injection` 섹션 자체가 없음). 대체 명령을 임의로 만들지 않았다. 요건 24·25가 지정한 검사 명령은 L1이 아니라 해당 요건의 L2 대조로 실행했다.
- L2 **실행** — 27개 요건 전건 대조 + `git diff HEAD --stat`(31파일 +1078/-2460) 및 미추적 신규 11건 전수 귀속. 귀속 없는 헝크 0건.
- L3 **skip** — `content_rules` 키 부재(같은 사유).

L2 귀속 근거(요건 번호): `.env.example`→17, `.gitignore`→22·23, `CLAUDE.md`·`README.md`·`docs/server-worker.md`·`docs/reverse-proxy.md`→21, `app/api/process/route.ts`→13·23, `app/api/process/cancel/route.ts`→14·23, `app/globals.css`·`components/image-processor.tsx`→15·27, `app/page.tsx`·`scripts/check-public-artifacts.mjs`→27, `deploy/nginx.conf.example`→20, `lib/process-job-registry.ts`→10·26, `lib/colab-input.ts→lib/image-input.ts`·`lib/zip-contract.ts`→23, `lib/colab-errors.ts→lib/job-errors.ts`→16·23, `package.json`→22, `runner/LOCKS.md`→2·23, 삭제 7종(`colab/imagework.ipynb`·`docs/colab-results.md`·`lib/colab-job-runner.ts`·`scripts/check-colab-notebook.mjs`·`tests/colab-job-runner.test.ts`·`runner/remote-worker.py`·`sam3-(build-)requirements.lock`)→22·23 및 GATE Q4=(A), 테스트 6종→8·24, 신규 11종→1·3·9·11·12·18·19·24.

## Failures

(none)

## Attribution

(none)

## Human verification

(none)

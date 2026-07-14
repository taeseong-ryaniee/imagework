import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { ColabJobRunner, NodeCommandRunner, parseRunnerConfig, type CommandRunner } from "../lib/colab-job-runner";
import { CommandExecutionError } from "../lib/colab-errors";
import { parseProcessFormData } from "../lib/colab-input";

const temporaryPaths: string[] = [];

const transparentPng = (): Buffer => {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(Buffer.from([0, 255, 255, 255, 0, 0, 0, 0, 255]));
  const chunk = (name: string, content: Buffer): Buffer => {
    const value = Buffer.alloc(12 + content.length);
    value.writeUInt32BE(content.length, 0);
    value.write(name, 4, "ascii");
    content.copy(value, 8);
    return value;
  };
  return Buffer.concat([header, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
};

const contentFor = (member: string): Buffer => member === "result.png" ? transparentPng() : Buffer.from("<svg><path d=\"M0 0\"/></svg>", "utf8");

const makeZip = (members: readonly string[]): Buffer => {
  const records: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const member of members) {
    const name = Buffer.from(member, "utf8");
    const content = contentFor(member);
    const local = Buffer.alloc(30 + name.length + content.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    content.copy(local, 30 + name.length);
    records.push(local);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    directory.push(central);
    offset += local.length;
  }
  const centralSize = directory.reduce((size, value) => size + value.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, ...directory, end]);
};

const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");

class FakeCommands implements CommandRunner {
  readonly calls: { readonly command: string; readonly args: readonly string[]; readonly input?: string }[] = [];
  constructor(
    private readonly archive: Buffer = makeZip(["result.png", "result.svg"]),
    private readonly failAt?: "new" | "upload" | "exec" | "download",
  ) {}

  async run(command: string, args: readonly string[], options: { readonly input?: string } = {}): Promise<string> {
    this.calls.push({ command, args, input: options.input });
    if (args.includes("version")) return "Version: 0.6.0\n";
    if (args.includes("sessions")) return "[colab] No active sessions found on server.\n";
    const action = args.find((argument) => ["new", "upload", "exec", "download", "stop"].includes(argument));
    if (action !== undefined && action === this.failAt) throw new CommandExecutionError();
    if (action === "download") {
      const localPath = args.at(-1);
      if (!localPath) throw new Error("missing test download path");
      await writeFile(localPath, this.archive);
    }
    return "";
  }
}

class GatedNewCommands extends FakeCommands {
  readonly newStarted = Promise.withResolvers<void>();
  readonly releaseNew = Promise.withResolvers<void>();

  override async run(command: string, args: readonly string[], options: { readonly input?: string } = {}): Promise<string> {
    if (args.includes("new")) {
      this.newStarted.resolve();
      await this.releaseNew.promise;
    }
    return super.run(command, args, options);
  }
}

class AbortOnUploadCommands extends FakeCommands {
  readonly uploadStarted = Promise.withResolvers<void>();
  observedAbort = false;

  override async run(command: string, args: readonly string[], options: { readonly input?: string; readonly signal?: AbortSignal } = {}): Promise<string> {
    if (!args.includes("upload")) {
      return super.run(command, args, options);
    }
    this.uploadStarted.resolve();
    return new Promise<string>((resolve, reject) => {
      if (!options.signal) {
        reject(new CommandExecutionError());
        return;
      }
      options.signal.addEventListener("abort", () => {
        this.observedAbort = true;
        reject(new CommandExecutionError());
      }, { once: true });
    });
  }
}

class ResolveOnAbortDownloadCommands extends FakeCommands {
  readonly downloadStarted = Promise.withResolvers<void>();

  override async run(command: string, args: readonly string[], options: { readonly input?: string; readonly signal?: AbortSignal } = {}): Promise<string> {
    if (!args.includes("download")) return super.run(command, args, options);
    this.downloadStarted.resolve();
    await new Promise<void>((resolve, reject) => {
      if (!options.signal) {
        reject(new CommandExecutionError());
        return;
      }
      options.signal.addEventListener("abort", () => { resolve(); }, { once: true });
    });
    return super.run(command, args, options);
  }
}

class FailFirstStopCommands extends FakeCommands {
  private stopFailed = false;

  override async run(command: string, args: readonly string[], options: { readonly input?: string } = {}): Promise<string> {
    if (args.includes("stop") && !this.stopFailed) {
      this.stopFailed = true;
      throw new CommandExecutionError();
    }
    return super.run(command, args, options);
  }
}

class SessionPresenceCommands extends FakeCommands {
  private stopped = false;
  private stopFailed = false;

  constructor(private readonly session: string, private readonly failFirstStop = false, archive?: Buffer) {
    super(archive);
  }

  override async run(command: string, args: readonly string[], options: { readonly input?: string } = {}): Promise<string> {
    if (args.includes("sessions")) {
      this.calls.push({ command, args, input: options.input });
      return this.stopped ? "[colab] No active sessions found on server.\n" : `[${this.session}] endpoint | Hardware: T4 | Variant: GPU\n`;
    }
    if (args.includes("stop") && this.failFirstStop && !this.stopFailed) {
      this.stopFailed = true;
      this.calls.push({ command, args, input: options.input });
      throw new CommandExecutionError();
    }
    if (args.includes("stop")) this.stopped = true;
    return super.run(command, args, options);
  }
}

class AmbiguousSessionsCommands extends FakeCommands {
  override async run(command: string, args: readonly string[], options: { readonly input?: string } = {}): Promise<string> {
    if (args.includes("sessions")) {
      this.calls.push({ command, args, input: options.input });
      return "unrecognized session output\n";
    }
    return super.run(command, args, options);
  }
}

class WrongVersionCommands extends FakeCommands {
  override async run(command: string, args: readonly string[], options: { readonly input?: string } = {}): Promise<string> {
    if (args.includes("version")) {
      this.calls.push({ command, args, input: options.input });
      return "Version: 0.5.0\n";
    }
    return super.run(command, args, options);
  }
}

const configFor = async (maxQueueDepth = "4") => {
  const root = await mkdtemp(join(tmpdir(), "imagework-runner-test-"));
  temporaryPaths.push(root);
  const script = join(root, "remote-worker.py");
  const credentials = join(root, "adc.json");
  await writeFile(script, "print('worker')\n", { mode: 0o600 });
  await writeFile(join(dirname(script), "sam3-requirements.lock"), "requirements\n", { mode: 0o600 });
  await writeFile(join(dirname(script), "sam3-build-requirements.lock"), "build requirements\n", { mode: 0o600 });
  await writeFile(join(dirname(script), "vtracer-Cargo.lock"), "cargo\n", { mode: 0o600 });
  await writeFile(credentials, "{}\n", { mode: 0o600 });
  return parseRunnerConfig({
    IMAGEWORK_HF_TOKEN: "test-token-not-a-real-secret",
    IMAGEWORK_PROCESSING_CODE: "0123456789abcdef0123456789abcdef",
    IMAGEWORK_COLAB_AUTH_MODE: "adc",
    IMAGEWORK_GOOGLE_APPLICATION_CREDENTIALS: credentials,
    IMAGEWORK_COLAB_CONFIG: join(root, "configs"),
    IMAGEWORK_COLAB_ACCELERATOR: "T4",
    IMAGEWORK_JOB_TIMEOUT_SECONDS: "60",
    IMAGEWORK_JOB_SCRIPT: script,
    IMAGEWORK_JOB_TMP_ROOT: join(root, "jobs"),
    IMAGEWORK_RECOVERY_ROOT: join(root, "recovery"),
    IMAGEWORK_MAX_QUEUE_DEPTH: maxQueueDepth,
  });
};

const expectIsolatedRootsEmpty = async (config: Awaited<ReturnType<typeof configFor>>) => {
  await expect(readdir(config.jobTmpRoot)).resolves.toEqual([]);
  await expect(readdir(config.colabConfigRoot)).resolves.toEqual([]);
};

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("ColabJobRunner", () => {
  it("escalates an uncooperative local command from SIGTERM to SIGKILL", async () => {
    const runner = new NodeCommandRunner();
    const startedAt = Date.now();

    await expect(runner.run(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)"], { timeoutMs: 50 })).rejects.toMatchObject({ name: "CommandExecutionError" });

    expect(Date.now() - startedAt).toBeLessThan(7_000);
  }, 7_500);

  it("settles a completed command before its timeout without a later kill failure", async () => {
    const runner = new NodeCommandRunner();

    await expect(runner.run(process.execPath, ["-e", "process.exit(0)"], { timeoutMs: 2_000 })).resolves.toBe("");
    await new Promise<void>((resolve) => { setTimeout(resolve, 2_100); });
  }, 3_000);

  it("discards command output unless a bounded capture is explicitly requested", async () => {
    const runner = new NodeCommandRunner();
    const source = "process.stdout.write('x'.repeat(32 * 1024))";

    await expect(runner.run(process.execPath, ["-e", source])).resolves.toBe("");
    await expect(runner.run(process.execPath, ["-e", source], { captureStdout: true })).resolves.toHaveLength(16 * 1024);
  });

  it("rejects a command that exits zero after its abort signal terminates it", async () => {
    const runner = new NodeCommandRunner();
    const controller = new AbortController();
    const abortTimer = setTimeout(() => { controller.abort(); }, 250);

    await expect(runner.run(process.execPath, ["-e", "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1_000)"], { signal: controller.signal })).rejects.toMatchObject({ name: "CommandExecutionError" });

    clearTimeout(abortTimer);
  }, 1_500);

  it("rejects a Colab CLI version other than the reviewed release before creating a session", async () => {
    const config = await configFor();
    const commands = new WrongVersionCommands();
    const runner = new ColabJobRunner(config, commands);

    await expect(runner.run({
      bytes: png,
      extension: ".png",
      mode: "photo",
      box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 },
      processingCode: "0123456789abcdef0123456789abcdef",
    })).rejects.toMatchObject({ name: "RunnerConfigurationError" });

    expect(commands.calls.map((call) => call.args)).toEqual([["version"]]);
  });

  it("rejects an invalid file extension and a normalized box outside the image", async () => {
    const invalidExtension = new FormData();
    invalidExtension.set("file", new File([png], "source.avif", { type: "image/avif" }));
    invalidExtension.set("mode", "photo");
    invalidExtension.set("cx", "0.5");
    invalidExtension.set("cy", "0.5");
    invalidExtension.set("width", "0.8");
    invalidExtension.set("height", "0.8");
    invalidExtension.set("processingCode", "0123456789abcdef0123456789abcdef");

    await expect(parseProcessFormData(invalidExtension)).rejects.toMatchObject({ name: "ImageworkInputError" });

    const invalidBox = new FormData();
    invalidBox.set("file", new File([png], "source.png", { type: "image/png" }));
    invalidBox.set("mode", "photo");
    invalidBox.set("cx", "0.9");
    invalidBox.set("cy", "0.5");
    invalidBox.set("width", "0.8");
    invalidBox.set("height", "0.8");
    invalidBox.set("processingCode", "0123456789abcdef0123456789abcdef");

    await expect(parseProcessFormData(invalidBox)).rejects.toMatchObject({ name: "ImageworkInputError" });
  });

  it("runs one isolated argv-only lifecycle and returns only an expected logo archive", async () => {
    const config = await configFor();
    const commands = new FakeCommands();
    const runner = new ColabJobRunner(config, commands);

    const result = await runner.run({
      bytes: png,
      extension: ".png",
      mode: "logo",
      box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 },
      processingCode: "0123456789abcdef0123456789abcdef",
    });

    expect(result.name).toBe("imagework-results.zip");
    expect([...result.bytes]).toEqual([...makeZip(["result.png", "result.svg"])]);
    expect(commands.calls.map((call) => call.args.includes("version") ? "version" : call.args.includes("sessions") ? "sessions" : call.args.find((argument) => ["new", "upload", "exec", "download", "rm", "stop"].includes(argument)))).toEqual([
      "version", "new", "exec", "upload", "upload", "upload", "upload", "upload", "upload", "exec", "upload", "exec", "download", "exec", "stop", "sessions",
    ]);
    expect(commands.calls.every((call) => call.command === "colab")).toBe(true);
    expect(commands.calls.find((call) => call.input?.includes("runpy.run_path"))?.input).toContain("runpy.run_path");
    expect(commands.calls.filter((call) => call.args.includes("exec")).every((call) => call.args.includes("--timeout"))).toBe(true);
    expect(commands.calls.flatMap((call) => call.args).join(" ")).not.toContain("test-token-not-a-real-secret");
    const prepareIndex = commands.calls.findIndex((call) => call.input?.includes("--prepare"));
    const tokenUploadIndex = commands.calls.findIndex((call) => call.args.at(-1)?.endsWith("/hf-token"));
    const runIndex = commands.calls.findIndex((call) => call.input?.includes("--run"));
    expect(prepareIndex).toBeGreaterThan(-1);
    expect(tokenUploadIndex).toBeGreaterThan(prepareIndex);
    expect(runIndex).toBeGreaterThan(tokenUploadIndex);
  });

  it("rejects an unexpected ZIP member and removes the job state", async () => {
    const config = await configFor();
    const runner = new ColabJobRunner(config, new FakeCommands(makeZip(["result.png", "unexpected.txt"])));

    await expect(runner.run({
      bytes: png,
      extension: ".png",
      mode: "photo",
      box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 },
      processingCode: "0123456789abcdef0123456789abcdef",
    })).rejects.toMatchObject({ name: "ResultContractError" });

    await expectIsolatedRootsEmpty(config);
  });

  it.each(["new", "upload", "exec", "download"] as const)("removes isolated state when %s fails and stops only confirmed sessions", async (failureStage) => {
    const config = await configFor();
    const commands = new FakeCommands(makeZip(["result.png"]), failureStage);
    const runner = new ColabJobRunner(config, commands);

    await expect(runner.run({
      bytes: png,
      extension: ".png",
      mode: "photo",
      box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 },
      processingCode: "0123456789abcdef0123456789abcdef",
    })).rejects.toMatchObject({ name: "CommandExecutionError" });

    expect(commands.calls.some((call) => call.args.includes("stop"))).toBe(failureStage !== "new");
    await expectIsolatedRootsEmpty(config);
  });

  it("serializes queued jobs instead of overlapping CLI lifecycles", async () => {
    const config = await configFor();
    const commands = new FakeCommands(makeZip(["result.png"]));
    const runner = new ColabJobRunner(config, commands);
    const input = { bytes: png, extension: ".png" as const, mode: "photo" as const, box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 }, processingCode: "0123456789abcdef0123456789abcdef" };

    await Promise.all([runner.run(input), runner.run(input)]);

    const actions = commands.calls
      .map((call) => call.args.find((argument) => ["new", "upload", "exec", "download", "rm", "stop"].includes(argument)))
      .filter((action): action is string => action !== undefined);
    expect(actions).toEqual([
      "new", "exec", "upload", "upload", "upload", "upload", "upload", "upload", "exec", "upload", "exec", "download", "exec", "stop",
      "new", "exec", "upload", "upload", "upload", "upload", "upload", "upload", "exec", "upload", "exec", "download", "exec", "stop",
    ]);
  });

  it("rejects admission beyond the configured queue capacity before a second session is allocated", async () => {
    const config = await configFor("1");
    const commands = new GatedNewCommands(makeZip(["result.png"]));
    const runner = new ColabJobRunner(config, commands);
    const input = { bytes: png, extension: ".png" as const, mode: "photo" as const, box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 }, processingCode: "0123456789abcdef0123456789abcdef" };
    const first = runner.run(input);
    await commands.newStarted.promise;

    await expect(runner.run(input)).rejects.toMatchObject({ name: "QueueCapacityError" });
    expect(commands.calls.filter((call) => call.args.includes("new"))).toHaveLength(0);
    commands.releaseNew.resolve();
    await first;
  });

  it("stops a marker-recorded stale session before allocating a new session", async () => {
    const config = await configFor();
    await mkdir(config.recoveryRoot, { recursive: true, mode: 0o700 });
    const staleJobId = "f2fa7894-4fb2-4876-b1c8-68d277437d7c";
    await writeFile(join(config.recoveryRoot, staleJobId), "confirmed-session", { mode: 0o600 });
    const commands = new SessionPresenceCommands(`imagework-${staleJobId}`, false, makeZip(["result.png"]));
    const runner = new ColabJobRunner(config, commands);

    await runner.run({ bytes: png, extension: ".png", mode: "photo", box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 }, processingCode: "0123456789abcdef0123456789abcdef" });

    expect(commands.calls[0]?.args).toEqual(["version"]);
    expect(commands.calls[1]?.args.includes("sessions")).toBe(true);
    expect(commands.calls[2]?.args.includes("stop")).toBe(true);
  });

  it("removes a pre-session crash marker without stopping a session", async () => {
    const config = await configFor();
    const staleJobId = "f2fa7894-4fb2-4876-b1c8-68d277437d7c";
    await mkdir(join(config.recoveryRoot), { recursive: true, mode: 0o700 });
    await mkdir(join(config.colabConfigRoot, staleJobId), { recursive: true, mode: 0o700 });
    await writeFile(join(config.recoveryRoot, staleJobId), "pre-session", { mode: 0o600 });
    const commands = new FakeCommands(makeZip(["result.png"]));
    const runner = new ColabJobRunner(config, commands);

    await runner.run({ bytes: png, extension: ".png", mode: "photo", box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 }, processingCode: "0123456789abcdef0123456789abcdef" });

    expect(commands.calls[0]?.args).toEqual(["version"]);
    expect(commands.calls[1]?.args.includes("sessions")).toBe(true);
    expect(commands.calls[2]?.args.includes("new")).toBe(true);
    await expectIsolatedRootsEmpty(config);
  });

  it("stops a pre-session marker when the official session listing confirms a crashed post-new session", async () => {
    const config = await configFor();
    const staleJobId = "f2fa7894-4fb2-4876-b1c8-68d277437d7c";
    const session = `imagework-${staleJobId}`;
    await mkdir(config.recoveryRoot, { recursive: true, mode: 0o700 });
    await writeFile(join(config.recoveryRoot, staleJobId), "pre-session", { mode: 0o600 });
    const commands = new SessionPresenceCommands(session, false, makeZip(["result.png"]));
    const runner = new ColabJobRunner(config, commands);

    await runner.run({ bytes: png, extension: ".png", mode: "photo", box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 }, processingCode: "0123456789abcdef0123456789abcdef" });

    const sessionCheck = commands.calls.findIndex((call) => call.args.includes("sessions"));
    const stop = commands.calls.findIndex((call) => call.args.includes("stop"));
    expect(sessionCheck).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(sessionCheck);
    await expectIsolatedRootsEmpty(config);
  });

  it("best-effort stops and retains a marker when session listing output is ambiguous", async () => {
    const config = await configFor();
    const staleJobId = "f2fa7894-4fb2-4876-b1c8-68d277437d7c";
    await mkdir(config.recoveryRoot, { recursive: true, mode: 0o700 });
    await writeFile(join(config.recoveryRoot, staleJobId), "pre-session", { mode: 0o600 });
    const commands = new AmbiguousSessionsCommands(makeZip(["result.png"]));
    const runner = new ColabJobRunner(config, commands);

    await expect(runner.run({ bytes: png, extension: ".png", mode: "photo", box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 }, processingCode: "0123456789abcdef0123456789abcdef" })).rejects.toMatchObject({ name: "CommandExecutionError" });

    await expect(readdir(config.recoveryRoot)).resolves.toEqual([staleJobId]);
    expect(commands.calls.some((call) => call.args.includes("stop"))).toBe(true);
  });

  it("retains a stale marker after a transient stop failure and retries it for the next job", async () => {
    const config = await configFor();
    const staleJobId = "f2fa7894-4fb2-4876-b1c8-68d277437d7c";
    await mkdir(config.recoveryRoot, { recursive: true, mode: 0o700 });
    await writeFile(join(config.recoveryRoot, staleJobId), "confirmed-session", { mode: 0o600 });
    const commands = new SessionPresenceCommands(`imagework-${staleJobId}`, true, makeZip(["result.png"]));
    const runner = new ColabJobRunner(config, commands);
    const input = { bytes: png, extension: ".png" as const, mode: "photo" as const, box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 }, processingCode: "0123456789abcdef0123456789abcdef" };

    await expect(runner.run(input)).rejects.toMatchObject({ name: "CommandExecutionError" });
    await expect(readdir(config.recoveryRoot)).resolves.toEqual([staleJobId]);
    await expect(runner.run(input)).resolves.toMatchObject({ name: "imagework-results.zip" });

    expect(commands.calls.filter((call) => call.args.includes("stop"))).toHaveLength(3);
    await expectIsolatedRootsEmpty(config);
  });

  it("keeps a failed job marker and session state until a later stop succeeds", async () => {
    const config = await configFor();
    const commands = new FailFirstStopCommands(makeZip(["result.png"]));
    const runner = new ColabJobRunner(config, commands);
    const input = { bytes: png, extension: ".png" as const, mode: "photo" as const, box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 }, processingCode: "0123456789abcdef0123456789abcdef" };

    await expect(runner.run(input)).rejects.toMatchObject({ name: "CommandExecutionError" });
    await expect(readdir(config.recoveryRoot)).resolves.toHaveLength(1);
    await expect(readdir(config.colabConfigRoot)).resolves.toHaveLength(1);
    await expect(runner.run(input)).resolves.toMatchObject({ name: "imagework-results.zip" });

    await expectIsolatedRootsEmpty(config);
  });

  it("rejects a queued cancellation before it allocates a second session", async () => {
    const config = await configFor();
    const commands = new GatedNewCommands(makeZip(["result.png"]));
    const runner = new ColabJobRunner(config, commands);
    const input = { bytes: png, extension: ".png" as const, mode: "photo" as const, box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 }, processingCode: "0123456789abcdef0123456789abcdef" };
    const activeJob = runner.run(input);
    await commands.newStarted.promise;
    const controller = new AbortController();
    const queuedJob = runner.run(input, controller.signal);
    controller.abort();

    await expect(queuedJob).rejects.toMatchObject({ name: "JobCancelledError" });
    commands.releaseNew.resolve();
    await activeJob;
    expect(commands.calls.filter((call) => call.args.includes("new"))).toHaveLength(1);
  });

  it("aborts an active command then runs the established cleanup and stop lifecycle", async () => {
    const config = await configFor();
    const commands = new AbortOnUploadCommands(makeZip(["result.png"]));
    const runner = new ColabJobRunner(config, commands);
    const controller = new AbortController();
    const activeJob = runner.run({
      bytes: png,
      extension: ".png",
      mode: "photo",
      box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 },
      processingCode: "0123456789abcdef0123456789abcdef",
    }, controller.signal);
    await commands.uploadStarted.promise;
    controller.abort();

    await expect(activeJob).rejects.toMatchObject({ name: "JobCancelledError" });
    expect(commands.observedAbort).toBe(true);
    expect(commands.calls.some((call) => call.args.includes("stop"))).toBe(true);
    await expectIsolatedRootsEmpty(config);
  });

  it("rejects an active cancellation even when the in-flight command reports success", async () => {
    const config = await configFor();
    const commands = new ResolveOnAbortDownloadCommands(makeZip(["result.png"]));
    const runner = new ColabJobRunner(config, commands);
    const controller = new AbortController();
    const activeJob = runner.run({
      bytes: png,
      extension: ".png",
      mode: "photo",
      box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 },
      processingCode: "0123456789abcdef0123456789abcdef",
    }, controller.signal);
    await commands.downloadStarted.promise;
    controller.abort();

    await expect(activeJob).rejects.toMatchObject({ name: "JobCancelledError" });
    await expectIsolatedRootsEmpty(config);
  });

  it("rejects unsafe configuration and a wrong processing code before CLI invocation", async () => {
    expect(() => parseRunnerConfig({})).toThrow(/configured/i);
    const config = await configFor();
    const commands = new FakeCommands();
    const runner = new ColabJobRunner(config, commands);

    await expect(runner.run({ bytes: png, extension: ".png", mode: "photo", box: { cx: 0.5, cy: 0.5, width: 0.8, height: 0.8 }, processingCode: "wrong" })).rejects.toMatchObject({ name: "ProcessingCodeError" });
    expect(commands.calls).toHaveLength(0);
  });
});

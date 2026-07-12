import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { startMockHA, type MockHA } from "./mock-ha.ts";

const fixtureMain = join(import.meta.dir, "fixture", "main.ts");

const TIMEOUT = 15_000;

let mock: MockHA;
let app: ReturnType<typeof Bun.spawn> | null = null;

afterEach(() => {
  app?.kill();
  app = null;
  mock?.stop();
});

function runApp(env: Record<string, string> = {}) {
  app = Bun.spawn(["bun", "run", fixtureMain], {
    env: { ...process.env, HA_URL: mock.url, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });

  return app;
}

async function outputOf(app: ReturnType<typeof Bun.spawn>): Promise<string> {
  return (
    (await new Response(app.stdout as ReadableStream).text()) +
    (await new Response(app.stderr as ReadableStream).text())
  );
}

// Waits for the app to exit; force-kills it after 10 seconds so a hanging
// child fails the test with its captured output instead of a bare timeout.
async function exitCodeOf(app: ReturnType<typeof Bun.spawn>): Promise<number> {
  const killTimer = setTimeout(() => app.kill("SIGKILL"), 10_000);

  try {
    return await app.exited;
  } finally {
    clearTimeout(killTimer);
  }
}

async function waitFor(condition: () => boolean, timeoutMs = 10_000) {
  const start = Date.now();

  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Condition not met in time");
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test(
  "resolves device names via buttonsConfigFn once the connection is established",
  async () => {
    mock = startMockHA();

    runApp();

    // One 'on' and one 'off' trigger subscription with resolved device ids;
    // "Renamed Dimmer" must match name_by_user of def456, not the decoy
    // device whose integration name collides.
    await waitFor(() => mock.subscribedDeviceIds.length === 2);

    expect(mock.subscribedDeviceIds.toSorted()).toEqual(["abc123", "def456"]);
  },
  TIMEOUT,
);

test(
  "lookupDeviceId called at config-eval time fails the load with a clear error",
  async () => {
    mock = startMockHA();

    const app = runApp({ CALL_TOO_EARLY: "true" });

    const exitCode = await exitCodeOf(app);
    const output = await outputOf(app);

    expect(exitCode, output).toBe(1);
    expect(output).toContain("lookupDeviceId is not ready yet");
  },
  TIMEOUT,
);

test(
  "unknown device name fails the config load",
  async () => {
    mock = startMockHA();

    const app = runApp({ OFF_DEVICE_NAME: "Does Not Exist" });

    const exitCode = await exitCodeOf(app);
    const output = await outputOf(app);

    expect(exitCode, output).toBe(1);
    expect(output).toContain("No device named 'Does Not Exist' found");
  },
  TIMEOUT,
);

test(
  "ambiguous device name fails the config load",
  async () => {
    mock = startMockHA();

    const app = runApp({ OFF_DEVICE_NAME: "Twin Dimmer" });

    const exitCode = await exitCodeOf(app);
    const output = await outputOf(app);

    expect(exitCode, output).toBe(1);
    expect(output).toContain("Device name 'Twin Dimmer' is ambiguous");
  },
  TIMEOUT,
);

import { dirname, join } from "node:path";
import { watchFile, unwatchFile } from "node:fs";
import { createContext, runInNewContext } from "node:vm";
import { build } from "bun";
import { configFileHelpers } from "./helpers.ts";

export interface Config {
  homeAssistantURL: string;
  longLivedToken: string;
  // Invoked every time a connection to Home Assistant has been
  // established. Helpers that depend on a connection being ready (e.g. lookupDeviceId)
  // are only usable inside this function.
  buttonsConfigFn: () => Array<ButtonConfig>;
  verbose: boolean;
}

export type ObjectWithStringKeys = { [key: string]: any };

export interface ButtonConfig {
  name?: string;
  off: {
    trigger: ObjectWithStringKeys;
    action: ObjectWithStringKeys;
  };
  on: {
    trigger: ObjectWithStringKeys;
    actions: Array<ObjectWithStringKeys> | (() => Array<ObjectWithStringKeys>);
    // If set, the cycle position resets to the first action when the last press
    // is older than this many seconds. If unset, the position never resets.
    resetCountAfterSeconds?: number;
  };
}

export async function monitorConfig(
  onChange: (c: Config | Error) => Promise<void>,
) {
  const mainDir = dirname(require.main?.filename || process.argv[1]);

  const filePath = join(mainDir, "ha-multi-click.config.ts");

  let firstRun = true;
  let loading = false;

  const loadFn = async () => {
    // A reload can take a long time (teardown, reconnect, waiting for the event
    // bus); ignore triggers that arrive while one is already in progress.
    if (loading) {
      console.log("A (re)load is already in progress; ignoring trigger...");

      return;
    }

    loading = true;

    unwatchFile(filePath);

    if (firstRun) {
      console.log("Loading config file...");

      firstRun = false;
    } else {
      console.log("Reloading config file...");
    }

    try {
      const config = await evalConfig(filePath);

      await onChange(config);
    } catch (e: any) {
      console.error("Error loading or applying config file:", e);

      await onChange(e instanceof Error ? e : new Error(String(e)));
    } finally {
      loading = false;

      // We do not want to keep and increase the stack; therefore, postpone via the Event Loop.
      setImmediate(() => {
        watchFile(filePath, once(loadFn));
      });
    }
  };

  // The SIGHUP handler stays registered permanently: if the listener count ever
  // dropped to zero, the default signal disposition (terminate) would apply.
  process.on("SIGHUP", () => {
    console.log("Received SIGHUP signal...");

    loadFn();
  });

  // We also want to load the config file initially.
  await loadFn();
}

async function evalConfig(filePath: string): Promise<Config> {
  const context = createContext({
    ...configFileHelpers, // Inject helpers as globals (matching `declare global` in config files)
    helpers: configFileHelpers, // Also keep them available under `helpers` for backwards compatibility
    process: {
      env: process.env,
    }, // Grant access to environment variables
    console, // Inject the console object
    module: { exports: {} }, // Simulate CommonJS
    exports: {},
  });

  // Transpile the TypeScript code to JavaScript using Bun.build()
  const transpileResult = await build({
    entrypoints: [filePath],
    loader: { ".ts": "ts" },
    format: "cjs",
  });

  const transpiledCode = await transpileResult.outputs[0].text();

  runInNewContext(transpiledCode, context);

  return context.module.exports as Config;
}

function once(cb: () => Promise<void>) {
  let called = false;

  return async () => {
    if (called) {
      return;
    }

    called = true;

    await cb();
  };
}

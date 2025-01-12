import { dirname, join } from "node:path";
import { watchFile, unwatchFile } from "node:fs";
import { createContext, runInNewContext } from "node:vm";
import { readFile } from "node:fs/promises";
import { build } from "bun";

export interface Config {
  homeAssistantURL: string;
  longLivedToken: string;
  buttons: Array<ButtonConfig>;
  verbose: false;
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
  };
}

export async function monitorConfig(
  onChange: (c: Config | Error) => Promise<void>,
) {
  const mainDir = dirname(require.main?.filename || process.argv[1]);

  const filePath = join(mainDir, "ha-multi-click.config.ts");

  let firstRun = true;

  const loadFn = async () => {
    // By wrapping the loadFn with a "once" we prevent it from being called multiple times before unwatching the file.
    // After having unwatched the file, we can safely call the onChange function.
    // And once that is done, we can watch the file again.
    if (firstRun) {
      console.log("Loading config file...");

      firstRun = false;
    } else {
      unwatchFile(filePath);

      console.log("Reloading config file...");
    }

    try {
      const config = await evalConfig(filePath);

      await onChange(config);
    } catch (e: any) {
      console.error("Error loading config file:", e);

      await onChange(e);
    }

    // We do not want to keep and increase the stack; therefore, postpone via the Event Loop.
    setImmediate(() => {
      watchFile(filePath, once(loadFn));
    });
  };

  // We also want to load the config file initially.
  await loadFn();
}

async function evalConfig(filePath: string): Promise<Config> {
  const context = createContext({
    helpers: {
      sunIsUp,
    }, // Inject helpers
    process: {
      env: process.env
    }, // Grant access to environment variables
    console,    // Inject the console object
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

function sunIsUp() {
  // TODO: Very simple implementation; should be replaced with a proper calculation.
  const now = new Date();
  const sunrise = new Date();
  const sunset = new Date();

  sunrise.setHours(6);
  sunrise.setMinutes(0);
  sunset.setHours(20);
  sunset.setMinutes(0);

  return now >= sunrise && now < sunset;
}

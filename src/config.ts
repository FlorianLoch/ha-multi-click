import * as path from "node:path";
import * as fs from "node:fs";

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

export async function monitorConfig(onChange: (c: Config | Error) => Promise<void>) {
  const mainDir = path.dirname(require.main?.filename || process.argv[1]);

  const filePath = path.join(mainDir, "ha-multi-click.config.ts")

  let firstRun = true;

  const loadFn = async  () => {
    // By wrapping the loadFn with a "once" we prevent it from being called multiple times before unwatching the file.
    // After having unwatched the file, we can safely call the onChange function.
    // And once that is done, we can watch the file again.
    if (firstRun) {
      console.log("(Loading config file...");

      firstRun = false;
    } else {
      fs.unwatchFile(filePath);

      console.log("Reloading config file...");
    }

    try {
      const config = require(
        filePath,
      ) as Config;

      await onChange(config);
    } catch (e: any) {
      await onChange(e);
    }

    // We do not want to keep and increase the stack; therefore, postpone via the Event Loop.
    setImmediate(() => {
      fs.watchFile(filePath, once(loadFn));
    });
  }

  // We also want to load the config file initially.
  await loadFn();
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

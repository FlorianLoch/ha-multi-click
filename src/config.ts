import * as path from "node:path";

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

export function loadConfig(): Config {
  const mainDir = path.dirname(require.main?.filename || process.argv[1]);

  return require(path.join(mainDir, "ha-multi-click.config.ts")) as Config;
}

import * as path from "node:path";

export interface Config {
  homeAssistantURL: string;
  longLivedToken: string;
  buttons: Array<ButtonConfig>;
  verbose: false;
}

export interface ButtonConfig {
  name?: string;
  off: {
    trigger: { [key: string]: any };
    action: { [key: string]: any };
  };
  on: {
    trigger: { [key: string]: any };
    actions: Array<{ [key: string]: any }>;
  };
}

export function loadConfig(): Config {
  const mainDir = path.dirname(require.main?.filename || process.argv[1]);

  return require(path.join(mainDir, "ha-multi-click.config.ts")) as Config;
}

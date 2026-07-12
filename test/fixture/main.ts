// Test entrypoint: the app resolves its config file relative to the main
// module's directory, so importing index.ts from here makes it load
// test/fixture/ha-multi-click.config.ts.
import "../../index.ts";

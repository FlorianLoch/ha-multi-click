import {
  Connection,
  createConnection,
  createLongLivedTokenAuth,
} from "home-assistant-js-websocket";
import { type Config, monitorConfig } from "./src/config.ts";
import {
  type DeviceRegistryEntry,
  formatError,
  setDeviceRegistry,
} from "./src/helpers.ts";

let teardownFn: null | (() => Promise<void>) = null;

monitorConfig(async (cfg: Config | Error) => {
  if (cfg instanceof Error) {
    console.error(`Failed to load config file: ${cfg.message}`);

    process.exit(1);
  }

  if (teardownFn !== null) {
    console.log("Config file changed; tearing down previous setup...");

    await teardownFn();
  }

  teardownFn = await up(cfg);
});

process.on("SIGINT", down);
process.on("SIGTERM", down);

// Automatically reload/reconnect every 10 minutes to work-around of possible registering to the event bus before it's
// fully ready.
// In case HA restarts, and we reconnect before all triggers are known to HA, we can register for them without error -
// but they will never fire.
setInterval(
  () => {
    process.kill(process.pid, "SIGHUP");
  },
  60 * 1000 * 10,
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fires a test event and waits up to 2 seconds for it to come back through a
// trigger subscription. Errors (e.g. the connection dropping) are propagated
// to the caller instead of being swallowed.
async function fireTestEvent(connection: Connection): Promise<boolean> {
  let ready: (value: boolean) => void;
  const readyPromise = new Promise<boolean>((resolve) => {
    ready = resolve;
  });

  const unsubscribeFn = await connection.subscribeMessage(
    () => ready(true),
    {
      type: "subscribe_trigger",
      trigger: {
        trigger: "event",
        event_type: "ha-multi-click-test-event",
      },
    },
    { resubscribe: false },
  );

  const timeout = setTimeout(() => ready(false), 2000);

  try {
    // As documented at https://developers.home-assistant.io/docs/api/websocket/#fire-an-event
    connection.sendMessage({
      type: "fire_event",
      event_type: "ha-multi-click-test-event",
    });

    return await readyPromise;
  } finally {
    clearTimeout(timeout);

    try {
      await unsubscribeFn();
    } catch {
      // The connection might already be gone; nothing left to unsubscribe from.
    }
  }
}

async function waitForEventBusToBeReady(
  connection: Connection,
  initialConnect: boolean,
) {
  while (!(await fireTestEvent(connection))) {
    console.log(
      "Test event did not fire... Waiting for event bus to become ready...",
    );
  }

  console.log("Test event triggered; event bus is ready!");

  // To be very sure, we wait another 30 seconds when reconnecting.
  if (!initialConnect) {
    await sleep(30_000);
  }
}

async function connect(
  cfg: Config,
  initialConnect: boolean,
): Promise<Connection> {
  while (true) {
    let connection: Connection;

    try {
      console.log("Connecting to Home Assistant...");

      connection = await createConnection({
        auth: createLongLivedTokenAuth(
          cfg.homeAssistantURL,
          cfg.longLivedToken,
        ),
      });
    } catch (e: any) {
      console.error(`Failed to connect to Home Assistant: ${formatError(e)}`);
      console.log("Retrying in 5 seconds...");

      await sleep(5000);

      continue;
    }

    try {
      await waitForEventBusToBeReady(connection, initialConnect);

      return connection;
    } catch (e: any) {
      console.error(
        `Connection lost while waiting for the event bus: ${formatError(e)}`,
      );
      console.log("Retrying in 5 seconds...");

      connection.close();

      await sleep(5000);
    }
  }
}

async function up(cfg: Config): Promise<() => Promise<void>> {
  let teardownFns = new Array<() => Promise<void>>();
  // Set once this setup has been torn down (e.g. after a config reload). An
  // in-flight reconnect checks it so it does not leave behind a zombie
  // connection whose subscriptions nothing ever tears down.
  let stopped = false;

  const _up = async (initialConnect: boolean) => {
    teardownFns = [];

    const connection = await connect(cfg, initialConnect);

    if (stopped) {
      connection.close();

      return;
    }

    const sendAction = (action: any) => {
      connection.sendMessage({
        type: "call_service", // seems to be the only valid type; therefore, we set it here
        ...action,
      });
    };

    console.log(`Connected to Home Assistant at ${cfg.homeAssistantURL}`);

    // Make connection-dependent helpers (lookupDeviceId) ready before invoking
    // buttonsConfigFn.
    const deviceRegistry = await connection.sendMessagePromise<
      Array<DeviceRegistryEntry>
    >({
      type: "config/device_registry/list",
    });

    cfg.verbose && console.log("Fetched device registry", deviceRegistry);

    setDeviceRegistry(deviceRegistry);

    const buttons = cfg.buttonsConfigFn();

    await Promise.all(
      buttons.map(async (button) => {
        let count = 0;
        let lastChange = Date.now();

        teardownFns.push(
          await connection.subscribeMessage(
            (_) => {
              cfg.verbose && console.log(`Received 'on' for '${button.name}'`);

              const onActions =
                typeof button.on.actions === "function"
                  ? button.on.actions()
                  : button.on.actions;

              // Optionally restart the cycle when the last press is too long ago.
              if (
                button.on.resetCountAfterSeconds !== undefined &&
                Date.now() - lastChange >
                  button.on.resetCountAfterSeconds * 1000
              ) {
                count = 0;
              }

              // We need this safeguard because the length of the actions array might have changed since the
              // last iteration and count could be out of bounds.
              const action = onActions[Math.min(count, onActions.length - 1)];

              count = (count + 1) % onActions.length;
              lastChange = Date.now();

              sendAction(action);
            },
            {
              type: "subscribe_trigger",
              trigger: {
                ...button.on.trigger,
              },
            },
            { resubscribe: false },
          ),
        );

        teardownFns.push(
          await connection!.subscribeMessage(
            (_) => {
              cfg.verbose && console.log(`Received 'off' for '${button.name}'`);

              count = 0;
              lastChange = Date.now();

              sendAction(button.off.action);
            },
            {
              type: "subscribe_trigger",
              trigger: {
                ...button.off.trigger,
              },
            },
            { resubscribe: false },
          ),
        );
      }),
    );

    // We close the connection on "disconnected" and reconnect ourselves, so the
    // library's built-in reconnect (and its "ready"/"reconnect-error" events)
    // never runs.
    connection.addEventListener("disconnected", () => {
      console.log("Disconnected from Home Assistant. Reconnecting...");

      connection.close();

      setImmediate(() => {
        if (stopped) {
          return;
        }

        _up(false).catch((err: any) => {
          console.error(`Failed to reconnect to Home Assistant: ${err}`);

          // We delegate the task of restarting to the service manager, i.e. systemd, docker etc.
          process.exit(1);
        });
      });
    });

    teardownFns.push(() => Promise.resolve(connection.close()));

    // A teardown might have run while we were connecting/subscribing; make sure
    // we do not leave a zombie setup behind.
    if (stopped) {
      await runTeardownFns(teardownFns);
    }
  };

  await _up(true);

  return async () => {
    console.log("Shutting down...");

    stopped = true;

    await runTeardownFns(teardownFns);

    console.log(
      "Called all teardown functions; unsubscribed from all triggers.",
    );
  };
}

async function runTeardownFns(teardownFns: Array<() => Promise<void>>) {
  for (const teardownFn of teardownFns) {
    try {
      await teardownFn();
    } catch (e: any) {
      // Unsubscribing can fail if the connection is already gone; that is fine.
      console.error(`Error during teardown (ignored): ${e.message ?? e}`);
    }
  }
}

async function down() {
  if (teardownFn !== null) {
    await teardownFn();
  }

  process.exit(0);
}

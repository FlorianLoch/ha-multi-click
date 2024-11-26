import {createConnection, createLongLivedTokenAuth} from "home-assistant-js-websocket";
import {type Config, loadConfig} from "./src/config.ts";

let cfg: Config
try {
    cfg = loadConfig()
} catch (e: any) {
    console.error(`Failed to load config file: ${e.toString()}`)

    process.exit(1)
}

const connection = await createConnection({
    auth: createLongLivedTokenAuth(
        cfg.homeAssistantURL,
        cfg.longLivedToken
    )
})

const sendAction = (action: any) => {
    connection.sendMessage({
        type: "call_service", // seems to be the only valid type; therefore, we set it here
        ...action
    })
}

console.log(`Connected to Home Assistant at ${cfg.homeAssistantURL}`)

const unsubscribeFns = new Array<() => Promise<void>>

cfg.buttons.forEach(async button => {
    let count = 0
    let lastChange = new Date()

    const maxClicks = button.on.actions.length

    unsubscribeFns.push(await connection.subscribeMessage(result => {
        cfg.verbose && console.log(`Received 'on' for '${button.name}'`)

        const action = button.on.actions[count]

        count = (count + 1) % maxClicks
        lastChange = new Date()

        sendAction(action)
    }, {
        type: "subscribe_trigger",
        trigger: {
            ...button.on.trigger
        }
    }))

    unsubscribeFns.push(await connection.subscribeMessage(result => {
        cfg.verbose && console.log(`Received 'off' for '${button.name}'`)

        count = 0
        lastChange = new Date()

        sendAction(button.off.action)
    }, {
        type: "subscribe_trigger",
        trigger: {
            ...button.off.trigger
        }
    }))
})

const shutdown = async () => {
    console.log("Shutting down...")

    for (const unsubscribe of unsubscribeFns) {
        await unsubscribe()
    }

    console.log("Unsubscribed from all triggers. Exiting...")

    connection.close()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

module.exports = {
    homeAssistantURL: "http://192.168.178.4:8123",
    longLivedToken: process.env.HA_TOKEN,
    buttons: [{
        name: "Living Room Hue Dimmer",
        off: {
            trigger: hueTrigger("off", "9f9fb2dd477999c5183eb67b82c208e5"),
            action: lightOffAction("07c0a512d5c8df0c90018954b8bce3fe")
        },
        on: {
            trigger: hueTrigger("on", "9f9fb2dd477999c5183eb67b82c208e5"),
            actions: [
                activateScene("scene.nur_sofa"),
                activateScene("scene.wohnzimmer_hell")
            ]
        }
    }],
    verbose: process.env.VERBOSE === "true"
}

function hueTrigger(state: "on" | "off", deviceId: string) {
    return trigger(state + "-press", deviceId)
}

function rodretTrigger(state: "on" | "off", deviceId: string) {
    return trigger(state, deviceId)
}

function lightOffAction(deviceId: string) {
    return {
        domain: "light",
        service: "turn_off",
        target: {
            device_id: deviceId
        }
    }
}

function trigger(subtype: string, deviceId: string) {
    return {
        trigger: "device",
        domain: "mqtt",
        device_id: deviceId,
        type: "action",
        subtype: subtype,
    }
}

function activateScene(sceneId: string) {
    return {
        domain: "scene",
        service: "turn_on",
        target: {
            entity_id: sceneId
        }
    }
}
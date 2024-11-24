# ha-multi-click

Simple service connecting to Homeassistant via Websocket in order to subscribe to specified triggers.
It then keeps track on how often a trigger (e.g., a button click) occurred and executes specified actions based on
this counter.

This allows for easily configurable and maintainable "rotating scenes setups".  
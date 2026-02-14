# Capability

A capability is a callable function backed by some resource (an application binary, an API, etc).

Capabilities can be called remotely across resources belonging to the same user, and may be located on:
- Principals
- Workers

A capability is a JS object with:
- A `name` and `description`, identifying what it does
- An `available` function, which returns whether it may be set up and called in this environment (whatever environment `available` is called in)
- A `call` function, which takes an input and asynchronously returns an output. The output may be a single value or an `AsyncIterable` for streaming.
- A `setup` function, which does whatever is needed to prepare the capability for calling, such as installing an application binary or authenticating with an API.
- An `inputSchema` and `outputSchema`, JSON schemas describing the input to and output of `call`

With this simple interface, capabilities can be composed and used to implement all kinds of behaviors such as:
- Tool use backed by binaries, APIs, and more
- Sending and receiving messages (with or without streaming results)
- Inference and agentic loops
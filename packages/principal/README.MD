# Principal

A Principal is an always-on bot created by a user.

Users name their principal bot or just call it their "bot". But, for the sake of distinguishing it from agents they may run on workers, we gave it a distinct name.

Principals live on Origins, small neighborhoods that share a server with persistent storage. As such, Principals cannot access arbitrary compute and storage on their origin, but they support the following features backed by a user-specific SQLite database:
- User-configurable soul, identity, user, proactivity, and skill markdown documents
- A "proactivity interval", upon which the principal takes autonomous action
- Memory (both short-term working memory and long-term fact memory)
- Calling API-backed capabilities like inference, data access over OAuth, and media transformations
- Calling capabilities on workers (machines belonging to specific end users)
- Maintaining connections with the user's workers
- Storing information about is in the user's various workspaces (folders on workers)
- Publishing opentelemetry data
- Storing logs of capabilities called by the Principal and the user's workers
- Storing messages
- Storing context (soul, identity, user info, memory, workers)

This package includes the above features and the agent loop for principals.

--

## Capabilities

- `act`: The agent loop. Process a message and take any necessary actions until completion.
- `email-receive`: Called when the Principal receives an email at its `@ok.lol` address.
- `email-send`: Sends an email from the Principal's `@ok.lol` address.
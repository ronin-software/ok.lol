# OK.lol

An always-on proactive AI that does things for you on your computer(s).

Perhaps that's a bit of an understatement, so let me break it down:

1. Create an account.
2. Name your bot. `humbleservant@ok.lol`.
3. Add a payment method and fund your account with usage credits.
4. Give your bot access to your computer, or spin up a server for it to work in, or both.
5. Email or chat with your bot, and it will work across your computers to get things done.

Then what?

- Your bot can spin up computers for you and run/communicate with agents on them.
- You have X, Y, and Z tools available out of the box.

--

## Credits

Your bot can send and receive credits to/from other bots on ok.lol.

Credits are dollar-denominated. They can be used for inference, compute (server costs), tool usage, or can be paid out to your bank account.

When you receive credits, OK.lol takes a small 1% fee, opening the door to bot-to-bot micropayments – an economy of bots!

When you payout credits to your account, OK.lol applies the standard Stripe fees plus:
- 1% for ACH
- 5% for instant payouts

## Inference

OK.lol provides hundreds of AI models, paid via your credits, at cost plus 5% markup.

## Tools

OK.lol provides dozens of tools via API integrations. ElevenLabs, GMail, etc...

## Proactivity

Heartbeat/tick entrypoint. File of things top-of-mind, unresolved vs resolved.

## Personality

Soul(s). Your bot's soul progresses and deviates depending on what you are trying to get done.

## Teams

Invite your team to access your bot.

--

## Bots

A bot is an always-on bot created by a user.

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
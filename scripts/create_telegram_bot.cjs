// One-off script: DM @BotFather to create the @bebkey_alerts_bot and
// retrieve its token, using the user's existing Telegram session.
//
// Usage:
//   TG_API_ID=...  TG_API_HASH=...  TG_SESSION=...  TG_BOT_USERNAME=bebkey_alerts_bot
//     node scripts/create_telegram_bot.cjs
//
// Outputs the bot token (HTTP Bot API key) to .tg_bot_token.txt for the
// caller to read.  If the username is already taken, you'll see BotFather
// ask for another — pick a new username and re-run.

const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const fs                 = require("fs");
const path               = require("path");

const apiId    = parseInt(process.env.TG_API_ID, 10);
const apiHash  = process.env.TG_API_HASH;
const session  = process.env.TG_SESSION;
const botName  = process.env.TG_BOT_NAME     || "BebKey Alerts";
const botUser  = process.env.TG_BOT_USERNAME || "bebkey_alerts_bot";

if (!apiId || !apiHash || !session) {
  console.error("Missing TG_API_ID / TG_API_HASH / TG_SESSION env vars");
  process.exit(1);
}

const ROOT     = path.resolve(__dirname, "..");
const TOKEN_F  = path.join(ROOT, ".tg_bot_token.txt");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  if (!await client.isUserAuthorized()) {
    console.error("Session not authorized — regenerate it.");
    process.exit(1);
  }

  const botFather = await client.getEntity("BotFather");
  console.log("[create_bot] DMing @BotFather…");

  async function waitForLatestReply(beforeId) {
    for (let i = 0; i < 30; i++) {
      await sleep(1500);
      const msgs = await client.getMessages(botFather, { limit: 1 });
      if (msgs.length > 0 && msgs[0].id > beforeId) {
        return msgs[0].message || "";
      }
    }
    return "";
  }

  // Get the most recent message id before we start, so we can wait for replies.
  let preMsgs = await client.getMessages(botFather, { limit: 1 });
  let beforeId = preMsgs.length > 0 ? preMsgs[0].id : 0;

  await client.sendMessage(botFather, { message: "/newbot" });
  let reply = await waitForLatestReply(beforeId);
  console.log("[BotFather]", reply.slice(0, 200));
  beforeId = (await client.getMessages(botFather, { limit: 1 }))[0].id;

  await client.sendMessage(botFather, { message: botName });
  reply = await waitForLatestReply(beforeId);
  console.log("[BotFather]", reply.slice(0, 200));
  beforeId = (await client.getMessages(botFather, { limit: 1 }))[0].id;

  await client.sendMessage(botFather, { message: botUser });
  reply = await waitForLatestReply(beforeId);
  console.log("[BotFather]", reply.slice(0, 400));

  // Extract bot token from the success message:
  //   "...Use this token to access the HTTP API:\n123456:ABC-..."
  const m = reply.match(/(\d{6,}:[A-Za-z0-9_-]{30,})/);
  if (m) {
    const token = m[1];
    fs.writeFileSync(TOKEN_F, token, "utf8");
    console.log("[create_bot] ✅ token saved to " + TOKEN_F);
  } else {
    console.log("[create_bot] ⚠ no token in reply.  BotFather may have asked " +
                "for a different username (already taken).  See output above.");
  }

  await client.disconnect();
  process.exit(0);
})().catch(err => {
  console.error("[create_bot] fatal:", err.message || err);
  process.exit(1);
});

// One-off script: generate a Telethon-compatible StringSession for BebKey.
//
// Run with env vars + a code/password supplied through files:
//   TG_API_ID=...  TG_API_HASH=...  TG_PHONE=+972...   node scripts/gen_telegram_session.cjs
//
// The script polls for these files and reads them once they exist:
//   .tg_code.txt        – SMS code Telegram sends you
//   .tg_password.txt    – (optional) 2FA password, blank/missing if none
//
// On success it writes the StringSession to:
//   .tg_session.txt

const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const fs                 = require("fs");
const path               = require("path");

const apiId   = parseInt(process.env.TG_API_ID, 10);
const apiHash = process.env.TG_API_HASH;
const phone   = process.env.TG_PHONE;

if (!apiId || !apiHash || !phone) {
  console.error("Missing env vars (TG_API_ID, TG_API_HASH, TG_PHONE)");
  process.exit(1);
}

const REPO_ROOT  = path.resolve(__dirname, "..");
const CODE_FILE  = path.join(REPO_ROOT, ".tg_code.txt");
const PASS_FILE  = path.join(REPO_ROOT, ".tg_password.txt");
const SESS_FILE  = path.join(REPO_ROOT, ".tg_session.txt");

function waitFor(filePath, timeoutSec = 300) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8").trim();
        try { fs.unlinkSync(filePath); } catch (_) {}
        return resolve(content);
      }
      if ((Date.now() - start) / 1000 > timeoutSec) {
        return reject(new Error(`Timed out waiting for ${filePath}`));
      }
      setTimeout(tick, 1000);
    };
    tick();
  });
}

(async () => {
  console.log(`[gen] sending login request for ${phone}…`);
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.start({
    phoneNumber: async () => phone,
    phoneCode:   async () => {
      console.log(`[gen] waiting for SMS code → write it to ${CODE_FILE}`);
      const code = await waitFor(CODE_FILE);
      console.log(`[gen] got code (${code.length} chars), continuing…`);
      return code;
    },
    password:    async () => {
      console.log(`[gen] 2FA prompt → write password to ${PASS_FILE} (or empty file if none)`);
      const pw = await waitFor(PASS_FILE);
      return pw;
    },
    onError: (err) => console.error("[gen] telegram error:", err.message),
  });

  const session = client.session.save();
  fs.writeFileSync(SESS_FILE, session, "utf8");
  console.log(`[gen] ✅ SUCCESS — session written to ${SESS_FILE} (${session.length} chars)`);
  await client.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error("[gen] fatal:", err.message);
  process.exit(1);
});

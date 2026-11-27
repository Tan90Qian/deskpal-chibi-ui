import crypto from "node:crypto";
import fs from "node:fs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

const TEMPLATES = {
  ready: "green",
  jules: "orange",
  error: "red",
  released: "blue",
  info: "wathet",
};

export function signFeishu(timestamp, secret) {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto.createHmac("sha256", stringToSign).update("").digest("base64");
}

export function buildFeishuCardPayload({
  status = "info",
  title = "DeskPal 皮肤同步通知",
  body = "",
  url = "",
  button = "查看详情",
  url2 = "",
  button2 = "",
  secret = "",
}) {
  // Always keep "DeskPal" in the title so Feishu custom-keyword bots accept it cleanly
  const safeTitle = title.includes("DeskPal") ? title : `DeskPal · ${title}`;
  const template = TEMPLATES[status] || TEMPLATES.info;

  const elements = [];
  if (body && body.trim()) {
    elements.push({
      tag: "markdown",
      content: body.trim().slice(0, 3500),
    });
  }

  const actions = [];
  if (url) {
    actions.push({
      tag: "button",
      text: { tag: "plain_text", content: button || "查看详情" },
      type: status === "error" ? "danger" : "primary",
      url,
    });
  }
  if (url2) {
    actions.push({
      tag: "button",
      text: { tag: "plain_text", content: button2 || "更多信息" },
      type: "default",
      url: url2,
    });
  }
  if (actions.length > 0) {
    elements.push({ tag: "action", actions });
  }

  const payload = {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: {
        template,
        title: { tag: "plain_text", content: safeTitle },
      },
      elements,
    },
  };

  if (secret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    payload.timestamp = timestamp;
    payload.sign = signFeishu(timestamp, secret);
  }

  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const webhookUrl = args.webhook || process.env.FEISHU_WEBHOOK_URL || "";
  const secret = args.secret || process.env.FEISHU_WEBHOOK_SECRET || "";
  const status = args.status || process.env.FEISHU_STATUS || "info";
  const title = args.title || process.env.FEISHU_TITLE || "DeskPal 皮肤同步通知";
  let body = args.body || process.env.FEISHU_BODY || "";
  if (body) {
    body = body.replace(/\\n/g, "\n");
  }
  const bodyFile = args["body-file"] || process.env.FEISHU_BODY_FILE || "";
  if (bodyFile && fs.existsSync(bodyFile)) {
    body = fs.readFileSync(bodyFile, "utf-8");
  }
  const url = args.url || process.env.FEISHU_URL || "";
  const button = args.button || process.env.FEISHU_BUTTON || "打开查看";
  const url2 = args.url2 || process.env.FEISHU_URL2 || "";
  const button2 = args.button2 || process.env.FEISHU_BUTTON2 || "";

  const payload = buildFeishuCardPayload({
    status,
    title,
    body,
    url,
    button,
    url2,
    button2,
    secret,
  });

  if (args["dry-run"]) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!webhookUrl) {
    console.log("[notify-feishu] FEISHU_WEBHOOK_URL not configured; skipping notification.");
    return;
  }

  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON response handled below
  }

  const okCode = json && (json.code === 0 || json.StatusCode === 0);
  if (!resp.ok || !okCode) {
    console.error(`[notify-feishu] Failed (HTTP ${resp.status}): ${text}`);
    process.exit(1);
  }
  console.log(`[notify-feishu] Sent "${payload.card.header.title.content}" (${status}) successfully.`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("notify-feishu.mjs")) {
  main().catch((err) => {
    console.error("[notify-feishu] Error:", err);
    process.exit(1);
  });
}

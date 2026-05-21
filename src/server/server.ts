import type { IncomingMessage, ServerResponse } from "node:http";
import { context, reddit, redis, settings } from "@devvit/web/server";
import type {
  OnModMailRequest,
  TriggerResponse,
  UiResponse,
} from "@devvit/web/shared";
import {
  ApiEndpoint,
  MODMAIL_INTENTS,
  SUGGESTED_ACTIONS,
  type DecrementRequest,
  type DecrementResponse,
  type GeminiPingResponse,
  type JsonValue,
  type IncrementRequest,
  type IncrementResponse,
  type InitResponse,
  type LastModMailResponse,
  type LastTriageResponse,
  type ModmailIntent,
  type SuggestedAction,
  type TriageRecord,
  type TriageResult,
  type UserContext,
} from "../shared/api.ts";
import { once } from "node:events";

export async function serverOnRequest(
  req: IncomingMessage,
  rsp: ServerResponse,
): Promise<void> {
  try {
    await onRequest(req, rsp);
  } catch (err) {
    const msg = `server error; ${err instanceof Error ? err.stack : err}`;
    console.error(msg);
    writeJSON(500, { error: msg, status: 500 }, rsp);
  }
}

async function onRequest(
  req: IncomingMessage,
  rsp: ServerResponse,
): Promise<void> {
  const url = req.url;

  if (!url || url === "/") {
    writeJSON(404, { error: "not found", status: 404 }, rsp);
    return;
  }

  const endpoint = url as ApiEndpoint;

  let body: ApiResponse | UiResponse | ErrorResponse;
  switch (endpoint) {
    case ApiEndpoint.Init:
      body = await onInit();
      break;
    case ApiEndpoint.Increment:
      body = await onIncrement(req);
      break;
    case ApiEndpoint.Decrement:
      body = await onDecrement(req);
      break;
    case ApiEndpoint.GeminiPing:
      body = await onGeminiPing();
      break;
    case ApiEndpoint.LastModMail:
      body = await onLastModMail();
      break;
    case ApiEndpoint.LastTriage:
      body = await onLastTriage();
      break;
    case ApiEndpoint.OnPostCreate:
      body = await onMenuNewPost();
      break;
    case ApiEndpoint.OnAppInstall:
      body = await onAppInstall();
      break;
    case ApiEndpoint.OnModMail:
      body = await onModMailTrigger(req);
      break;
    default:
      endpoint satisfies never;
      body = { error: "not found", status: 404 };
      break;
  }

  writeJSON("status" in body ? body.status : 200, body, rsp);
}

type ApiResponse =
  | InitResponse
  | IncrementResponse
  | DecrementResponse
  | GeminiPingResponse
  | LastModMailResponse
  | LastTriageResponse;

const LAST_MODMAIL_KEY = "spike:last-modmail";
const LAST_TRIAGE_KEY = "spike:last-triage";

type ErrorResponse = {
  error: string;
  status: number;
};

function getPostId(): string {
  if (!context.postId) {
    throw Error("no post ID");
  }
  return context.postId;
}

function getPostCountKey(postId: string): string {
  return `count:${postId}`;
}

async function onInit(): Promise<InitResponse> {
  const postId = getPostId();
  const count = Number((await redis.get(getPostCountKey(postId))) ?? 0);
  return {
    type: "init",
    postId,
    count,
    username: context.username ?? "user",
  };
}

async function onIncrement(req: IncomingMessage): Promise<IncrementResponse> {
  const postId = getPostId();
  const { amount } = await readJSON<IncrementRequest>(req).catch(() => ({
    amount: 1,
  }));
  const incrementBy = Number.isFinite(amount) ? amount : 1;
  const count = await redis.incrBy(getPostCountKey(postId), incrementBy);
  return {
    type: "increment",
    postId,
    count,
  };
}

async function onDecrement(req: IncomingMessage): Promise<DecrementResponse> {
  const postId = getPostId();
  const { amount } = await readJSON<DecrementRequest>(req).catch(() => ({
    amount: 1,
  }));
  const parsedAmount = typeof amount === "number" ? amount : Number(amount);
  const decrementBy = Number.isFinite(parsedAmount) ? parsedAmount : 1;
  const count = Number(
    await redis.incrBy(getPostCountKey(postId), -decrementBy),
  );
  return {
    type: "decrement",
    postId,
    count,
  };
}

type GeminiCallResult =
  | { ok: true; data: JsonValue; rawText: string; latencyMs: number }
  | {
      ok: false;
      stage: "missing-key" | "fetch" | "http" | "parse";
      error: string;
      latencyMs: number;
    };

async function callGemini(prompt: string): Promise<GeminiCallResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  const apiKey = await settings.get<string>("GEMINI_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      stage: "missing-key",
      error: "GEMINI_API_KEY is not set. Run `devvit settings set GEMINI_API_KEY`.",
      latencyMs: elapsed(),
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (err) {
    return {
      ok: false,
      stage: "fetch",
      error: err instanceof Error ? err.message : String(err),
      latencyMs: elapsed(),
    };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return {
      ok: false,
      stage: "http",
      error: `HTTP ${res.status}: ${detail.slice(0, 500)}`,
      latencyMs: elapsed(),
    };
  }

  let rawText = "";
  try {
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const stripped = rawText.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    return {
      ok: true,
      data: JSON.parse(stripped) as JsonValue,
      rawText,
      latencyMs: elapsed(),
    };
  } catch (err) {
    return {
      ok: false,
      stage: "parse",
      error: `${err instanceof Error ? err.message : String(err)} | raw=${rawText.slice(0, 200)}`,
      latencyMs: elapsed(),
    };
  }
}

async function onGeminiPing(): Promise<GeminiPingResponse> {
  const result = await callGemini(
    'Reply with the exact JSON object {"ping":"pong"} and nothing else.',
  );
  if (result.ok) {
    return {
      type: "geminiPing",
      ok: true,
      reply: result.data,
      rawText: result.rawText,
      latencyMs: result.latencyMs,
    };
  }
  return {
    type: "geminiPing",
    ok: false,
    stage: result.stage,
    error: result.error,
    latencyMs: result.latencyMs,
  };
}

function stripModmailPrefix(id: string): string {
  return id.replace(/^Modmail(?:Conversation|Message)_/, "");
}

function checkSkipReason(payload: OnModMailRequest): string | null {
  if (payload.conversationType !== "sr_user") {
    return `conversationType=${payload.conversationType}`;
  }
  if (!payload.messageAuthorType.endsWith("PARTICIPANT_USER")) {
    return `messageAuthorType=${payload.messageAuthorType}`;
  }
  if (payload.isAutoGenerated) {
    return "isAutoGenerated=true";
  }
  if (payload.conversationState !== "new") {
    return `conversationState=${payload.conversationState}`;
  }
  return null;
}

function buildTriagePrompt(
  messageBody: string,
  userContext: UserContext,
): string {
  return `You are a Reddit moderation assistant. A user sent a modmail to a subreddit. Triage it.

USER CONTEXT
- Username: u/${userContext.username}
- Account age: ${userContext.accountAgeDays} days
- Karma: ${userContext.karma}
- Currently banned from this sub: ${userContext.isCurrentlyBanned}
- Approved user: ${userContext.isApproved}
- Recent comments by this user in this sub: ${userContext.recentCommentsInSub}

MODMAIL MESSAGE
${messageBody}

Respond with ONLY a JSON object of this exact shape (no markdown, no fences, no commentary):

{
  "intent": one of "ban_appeal" | "question" | "report" | "spam" | "hostile" | "other",
  "summary": string, max 2 sentences,
  "confidence": number, 0.0 to 1.0,
  "suggestedAction": one of "approve_unban" | "deny_with_reason" | "escalate" | "mute_and_archive" | "reply_normally",
  "draftReply": string, short editable reply, polite and direct
}

You suggest only. A human moderator always decides. Never imply a decision is final.`;
}

function isValidTriage(data: unknown): data is TriageResult {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.intent === "string" &&
    MODMAIL_INTENTS.includes(d.intent as ModmailIntent) &&
    typeof d.summary === "string" &&
    typeof d.confidence === "number" &&
    d.confidence >= 0 &&
    d.confidence <= 1 &&
    typeof d.suggestedAction === "string" &&
    SUGGESTED_ACTIONS.includes(d.suggestedAction as SuggestedAction) &&
    typeof d.draftReply === "string"
  );
}

async function runTriage(payload: OnModMailRequest): Promise<TriageRecord> {
  const receivedAt = Date.now();
  const startedAt = receivedAt;
  const conversationId = stripModmailPrefix(payload.conversationId);
  const messageId = stripModmailPrefix(payload.messageId);

  try {
    const { conversation, user } = await reddit.modMail.getConversation({
      conversationId,
      markRead: false,
    });

    if (!conversation) {
      return {
        kind: "error",
        stage: "fetch-conversation",
        error: "no conversation returned",
        latencyMs: Date.now() - startedAt,
        receivedAt,
      };
    }

    const messagesById = conversation.messages ?? {};
    const message =
      messagesById[messageId] ?? Object.values(messagesById)[0];
    const messageBody = message?.bodyMarkdown ?? message?.body ?? "";

    const username =
      payload.messageAuthor?.name ?? user?.name ?? "(unknown)";
    const createdMs = user?.created
      ? new Date(user.created).getTime()
      : Number.NaN;
    const accountAgeDays = Number.isFinite(createdMs)
      ? Math.floor((Date.now() - createdMs) / 86_400_000)
      : 0;
    const karma = payload.messageAuthor?.karma ?? 0;
    const isCurrentlyBanned =
      user?.banStatus?.isBanned ?? payload.messageAuthor?.banned ?? false;
    const isApproved = user?.approveStatus?.isApproved ?? false;
    const recentCommentsInSub = Object.keys(user?.recentComments ?? {}).length;

    const userContext: UserContext = {
      username,
      accountAgeDays,
      karma,
      isCurrentlyBanned,
      isApproved,
      recentCommentsInSub,
    };

    const input = { conversationId, messageBody, userContext };

    if (!messageBody) {
      return {
        kind: "error",
        stage: "fetch-conversation",
        error: "message body was empty after fetch",
        latencyMs: Date.now() - startedAt,
        receivedAt,
        input,
      };
    }

    const prompt = buildTriagePrompt(messageBody, userContext);
    const geminiResult = await callGemini(prompt);

    if (!geminiResult.ok) {
      return {
        kind: "error",
        stage: geminiResult.stage,
        error: geminiResult.error,
        latencyMs: Date.now() - startedAt,
        receivedAt,
        input,
      };
    }

    if (!isValidTriage(geminiResult.data)) {
      return {
        kind: "error",
        stage: "validate",
        error: `invalid triage shape: ${JSON.stringify(geminiResult.data).slice(0, 300)}`,
        latencyMs: Date.now() - startedAt,
        receivedAt,
        input,
        rawText: geminiResult.rawText,
      };
    }

    return {
      kind: "success",
      input,
      triage: geminiResult.data,
      rawText: geminiResult.rawText,
      latencyMs: Date.now() - startedAt,
      receivedAt,
    };
  } catch (err) {
    return {
      kind: "error",
      stage: "fetch-conversation",
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
      receivedAt,
    };
  }
}


async function onModMailTrigger(req: IncomingMessage): Promise<TriggerResponse> {
  let payload: OnModMailRequest;
  try {
    payload = await readJSON<OnModMailRequest>(req);
  } catch (err) {
    console.error(
      "[modmail trigger] parse error",
      err instanceof Error ? err.stack : err,
    );
    return {};
  }
  console.log("[modmail trigger]", JSON.stringify(payload));
  await redis.set(
    LAST_MODMAIL_KEY,
    JSON.stringify({ receivedAt: Date.now(), payload }),
  );

  const skipReason = checkSkipReason(payload);
  let record: TriageRecord;
  if (skipReason) {
    record = {
      kind: "skipped",
      reason: skipReason,
      conversationId: stripModmailPrefix(payload.conversationId),
      receivedAt: Date.now(),
    };
  } else {
    record = await runTriage(payload);
  }
  console.log("[triage]", record.kind, JSON.stringify(record));
  await redis.set(LAST_TRIAGE_KEY, JSON.stringify(record));
  return {};
}

async function onLastModMail(): Promise<LastModMailResponse> {
  const raw = await redis.get(LAST_MODMAIL_KEY);
  if (!raw) {
    return { type: "lastModMail", payload: null, receivedAt: null };
  }
  const { receivedAt, payload } = JSON.parse(raw) as {
    receivedAt: number;
    payload: JsonValue;
  };
  return { type: "lastModMail", payload, receivedAt };
}

async function onLastTriage(): Promise<LastTriageResponse> {
  const raw = await redis.get(LAST_TRIAGE_KEY);
  if (!raw) {
    return { type: "lastTriage", record: null };
  }
  return { type: "lastTriage", record: JSON.parse(raw) as TriageRecord };
}

async function onMenuNewPost(): Promise<UiResponse> {
  const post = await reddit.submitCustomPost({ title: context.appName });
  return {
    showToast: { text: `Post ${post.id} created.`, appearance: "success" },
    navigateTo: post.url,
  };
}

async function onAppInstall(): Promise<TriggerResponse> {
  await reddit.submitCustomPost({
    title: "modmail-copilot",
  });

  return {};
}

function writeJSON(
  status: number,
  json: unknown,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json);
  const len = Buffer.byteLength(body);
  rsp.writeHead(status, {
    "Content-Length": len,
    "Content-Type": "application/json",
  });
  rsp.end(body);
}

async function readJSON<T>(req: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  await once(req, "end");
  return JSON.parse(`${Buffer.concat(chunks)}`);
}

import {
  ApiEndpoint,
  type GeminiPingResponse,
  type InitResponse,
  type LastActionResponse,
  type LastModMailResponse,
  type LastTriageResponse,
  type TriageRecord,
  type ActionRecord,
} from "../shared/api.ts";
import { navigateTo } from "@devvit/web/client";

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const titleEl = $<HTMLElement>("title");

const docsLink = $<HTMLDivElement>("docs-link");
const playtestLink = $<HTMLDivElement>("playtest-link");
const discordLink = $<HTMLDivElement>("discord-link");

docsLink.addEventListener("click", () =>
  navigateTo("https://developers.reddit.com/docs"),
);
playtestLink.addEventListener("click", () =>
  navigateTo("https://www.reddit.com/r/Devvit"),
);
discordLink.addEventListener("click", () =>
  navigateTo("https://discord.com/invite/R7yu2wh9Qz"),
);

async function fetchInit(): Promise<void> {
  try {
    const res = await fetch(ApiEndpoint.Init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as InitResponse;
    if (data.type === "init") {
      titleEl.textContent = `Hey ${data.username} 👋`;
    }
  } catch (err) {
    console.error("init failed", err);
    titleEl.textContent = "Hey moderator 👋";
  }
}

const geminiPingBtn = $<HTMLButtonElement>("gemini-ping-button");
const geminiPingOut = $<HTMLPreElement>("gemini-ping-output");

geminiPingBtn.addEventListener("click", async () => {
  geminiPingBtn.disabled = true;
  geminiPingOut.textContent = "Calling Gemini…";
  try {
    const res = await fetch(ApiEndpoint.GeminiPing, { method: "POST" });
    const data = (await res.json()) as GeminiPingResponse;
    geminiPingOut.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    geminiPingOut.textContent = `client error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    geminiPingBtn.disabled = false;
  }
});

const lastModmailBtn = $<HTMLButtonElement>("last-modmail-button");
const lastModmailOut = $<HTMLPreElement>("last-modmail-output");

lastModmailBtn.addEventListener("click", async () => {
  lastModmailBtn.disabled = true;
  lastModmailOut.textContent = "Fetching…";
  try {
    const res = await fetch(ApiEndpoint.LastModMail);
    const data = (await res.json()) as LastModMailResponse;
    if (data.payload == null) {
      lastModmailOut.textContent =
        "No modmail trigger received yet. Send a modmail to the sub.";
    } else {
      const age = data.receivedAt ? formatAge(data.receivedAt) : "unknown";
      lastModmailOut.textContent = `received ${age}\n\n${JSON.stringify(
        data.payload,
        null,
        2,
      )}`;
    }
  } catch (err) {
    lastModmailOut.textContent = `client error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    lastModmailBtn.disabled = false;
  }
});

function formatAge(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

const triageEmpty = $<HTMLDivElement>("triage-empty");
const triageView = $<HTMLDivElement>("triage-view");
const triageIntent = $<HTMLSpanElement>("triage-intent");
const triageConfidence = $<HTMLSpanElement>("triage-confidence");
const triageAge = $<HTMLSpanElement>("triage-age");
const triageSummary = $<HTMLParagraphElement>("triage-summary");
const triageUser = $<HTMLDivElement>("triage-user");
const triageAction = $<HTMLElement>("triage-action");
const triageDraft = $<HTMLQuoteElement>("triage-draft");
const triageRaw = $<HTMLPreElement>("triage-raw");
const triageRefreshBtn = $<HTMLButtonElement>("last-triage-button");

function renderTriage(record: TriageRecord | null): void {
  if (!record) {
    triageView.hidden = true;
    triageEmpty.hidden = false;
    return;
  }

  triageEmpty.hidden = true;
  triageView.hidden = false;
  triageAge.textContent = formatAge(record.receivedAt);
  triageRaw.textContent = JSON.stringify(record, null, 2);

  if (record.kind === "success") {
    triageIntent.textContent = record.triage.intent;
    triageIntent.setAttribute("data-intent", record.triage.intent);
    triageConfidence.textContent = `${Math.round(
      record.triage.confidence * 100,
    )}% confidence`;
    triageSummary.textContent = record.triage.summary;
    const u = record.input.userContext;
    triageUser.textContent = `u/${u.username} • ${u.accountAgeDays}d • karma ${u.karma}${u.isCurrentlyBanned ? " • BANNED" : ""}${u.isApproved ? " • approved" : ""} • ${u.recentCommentsInSub} recent comments`;
    triageAction.textContent = record.triage.suggestedAction;
    triageDraft.textContent = record.triage.draftReply;
  } else if (record.kind === "skipped") {
    triageIntent.textContent = "skipped";
    triageIntent.setAttribute("data-intent", "other");
    triageConfidence.textContent = "";
    triageSummary.textContent = `Skipped: ${record.reason}`;
    triageUser.textContent = `convo ${record.conversationId}`;
    triageAction.textContent = "—";
    triageDraft.textContent = "—";
  } else {
    triageIntent.textContent = "error";
    triageIntent.setAttribute("data-intent", "hostile");
    triageConfidence.textContent = `stage: ${record.stage}`;
    triageSummary.textContent = record.error;
    triageUser.textContent = record.input
      ? `u/${record.input.userContext.username}`
      : "—";
    triageAction.textContent = "—";
    triageDraft.textContent = "—";
  }
}

async function loadTriage(): Promise<void> {
  triageRefreshBtn.disabled = true;
  try {
    const res = await fetch(ApiEndpoint.LastTriage);
    const data = (await res.json()) as LastTriageResponse;
    renderTriage(data.record);
  } catch (err) {
    triageEmpty.hidden = false;
    triageEmpty.textContent = `client error: ${err instanceof Error ? err.message : String(err)}`;
    triageView.hidden = true;
  } finally {
    triageRefreshBtn.disabled = false;
  }
}

triageRefreshBtn.addEventListener("click", loadTriage);

const actionEmpty = $<HTMLDivElement>("action-empty");
const actionView = $<HTMLDivElement>("action-view");
const actionKind = $<HTMLSpanElement>("action-kind");
const actionStatus = $<HTMLSpanElement>("action-status");
const actionAge = $<HTMLSpanElement>("action-age");
const actionDetails = $<HTMLParagraphElement>("action-details");
const actionRaw = $<HTMLPreElement>("action-raw");
const actionRefreshBtn = $<HTMLButtonElement>("last-action-button");

function renderAction(record: ActionRecord | null): void {
  if (!record) {
    actionView.hidden = true;
    actionEmpty.hidden = false;
    return;
  }

  actionEmpty.hidden = true;
  actionView.hidden = false;
  actionAge.textContent = formatAge(record.receivedAt);
  actionRaw.textContent = JSON.stringify(record, null, 2);
  actionStatus.textContent = record.kind;
  actionStatus.setAttribute("data-status", record.kind);

  if (record.kind === "success") {
    actionKind.textContent = `!${record.action}`;
    actionDetails.textContent = record.details;
  } else if (record.kind === "error") {
    actionKind.textContent = `!${record.action}`;
    actionDetails.textContent = record.error;
  } else {
    actionKind.textContent = "—";
    actionDetails.textContent = record.reason;
  }
}

async function loadAction(): Promise<void> {
  actionRefreshBtn.disabled = true;
  try {
    const res = await fetch(ApiEndpoint.LastAction);
    const data = (await res.json()) as LastActionResponse;
    renderAction(data.record);
  } catch (err) {
    actionEmpty.hidden = false;
    actionEmpty.textContent = `client error: ${err instanceof Error ? err.message : String(err)}`;
    actionView.hidden = true;
  } finally {
    actionRefreshBtn.disabled = false;
  }
}

actionRefreshBtn.addEventListener("click", loadAction);

void fetchInit();
void loadTriage();
void loadAction();

export type InitResponse = {
  type: "init";
  postId: string;
  count: number;
  username: string;
};

export type IncrementResponse = {
  type: "increment";
  postId: string;
  count: number;
};

export type IncrementRequest = {
  amount: number;
};

export type DecrementResponse = {
  type: "decrement";
  postId: string;
  count: number;
};

export type DecrementRequest = {
  amount: number;
};

export type GeminiPingFailureStage = "missing-key" | "fetch" | "http" | "parse";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type GeminiPingResponse =
  | {
      type: "geminiPing";
      ok: true;
      reply: JsonValue;
      rawText: string;
      latencyMs: number;
    }
  | {
      type: "geminiPing";
      ok: false;
      stage: GeminiPingFailureStage;
      error: string;
      latencyMs: number;
    };

export type LastModMailResponse = {
  type: "lastModMail";
  payload: JsonValue | null;
  receivedAt: number | null;
};

export type ModmailIntent =
  | "ban_appeal"
  | "question"
  | "report"
  | "spam"
  | "hostile"
  | "other";

export type SuggestedAction =
  | "approve_unban"
  | "deny_with_reason"
  | "escalate"
  | "mute_and_archive"
  | "reply_normally";

export const MODMAIL_INTENTS: readonly ModmailIntent[] = [
  "ban_appeal",
  "question",
  "report",
  "spam",
  "hostile",
  "other",
];

export const SUGGESTED_ACTIONS: readonly SuggestedAction[] = [
  "approve_unban",
  "deny_with_reason",
  "escalate",
  "mute_and_archive",
  "reply_normally",
];

export interface TriageResult {
  intent: ModmailIntent;
  summary: string;
  confidence: number;
  suggestedAction: SuggestedAction;
  draftReply: string;
}

export interface UserContext {
  username: string;
  accountAgeDays: number;
  karma: number;
  isCurrentlyBanned: boolean;
  isApproved: boolean;
  recentCommentsInSub: number;
}

export type TriageFailureStage =
  | "fetch-conversation"
  | "missing-key"
  | "fetch"
  | "http"
  | "parse"
  | "validate";

export type TriageInput = {
  conversationId: string;
  messageBody: string;
  userContext: UserContext;
};

export type TriageRecord =
  | {
      kind: "skipped";
      reason: string;
      conversationId: string;
      receivedAt: number;
    }
  | {
      kind: "success";
      input: TriageInput;
      triage: TriageResult;
      rawText: string;
      latencyMs: number;
      receivedAt: number;
    }
  | {
      kind: "error";
      stage: TriageFailureStage;
      error: string;
      latencyMs: number;
      receivedAt: number;
      input?: TriageInput;
      rawText?: string;
    };

export type LastTriageResponse = {
  type: "lastTriage";
  record: TriageRecord | null;
};

export type ActionKind = "approve" | "deny" | "mute" | "archive";

export const ACTION_KINDS: readonly ActionKind[] = [
  "approve",
  "deny",
  "mute",
  "archive",
];

export type ActionRecord =
  | {
      kind: "success";
      action: ActionKind;
      conversationId: string;
      username: string | null;
      details: string;
      latencyMs: number;
      receivedAt: number;
    }
  | {
      kind: "error";
      action: ActionKind;
      conversationId: string;
      error: string;
      latencyMs: number;
      receivedAt: number;
    }
  | {
      kind: "skipped";
      conversationId: string;
      reason: string;
      receivedAt: number;
    };

export type LastActionResponse = {
  type: "lastAction";
  record: ActionRecord | null;
};

export const ApiEndpoint = {
  Init: "/api/init",
  Increment: "/api/increment",
  Decrement: "/api/decrement",
  GeminiPing: "/api/gemini-ping",
  LastModMail: "/api/last-modmail",
  LastTriage: "/api/last-triage",
  LastAction: "/api/last-action",
  OnPostCreate: "/internal/menu/post-create",
  OnAppInstall: "/internal/on-app-install",
  OnModMail: "/internal/on-modmail",
} as const;

export type ApiEndpoint = (typeof ApiEndpoint)[keyof typeof ApiEndpoint];

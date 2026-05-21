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

export const ApiEndpoint = {
  Init: "/api/init",
  Increment: "/api/increment",
  Decrement: "/api/decrement",
  GeminiPing: "/api/gemini-ping",
  OnPostCreate: "/internal/menu/post-create",
  OnAppInstall: "/internal/on-app-install",
} as const;

export type ApiEndpoint = (typeof ApiEndpoint)[keyof typeof ApiEndpoint];

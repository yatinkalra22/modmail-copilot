import {
  ApiEndpoint,
  type DecrementRequest,
  type DecrementResponse,
  type GeminiPingResponse,
  type IncrementRequest,
  type IncrementResponse,
  type InitResponse,
  type LastModMailResponse,
  type LastTriageResponse,
} from "../shared/api.ts";
import { navigateTo } from "@devvit/web/client";

const counterValueElement = document.getElementById(
  "counter-value",
) as HTMLSpanElement;
const incrementButton = document.getElementById(
  "increment-button",
) as HTMLButtonElement;
const decrementButton = document.getElementById(
  "decrement-button",
) as HTMLButtonElement;

const docsLink = document.getElementById("docs-link") as HTMLDivElement;
const playtestLink = document.getElementById("playtest-link") as HTMLDivElement;
const discordLink = document.getElementById("discord-link") as HTMLDivElement;

docsLink.addEventListener("click", () => {
  navigateTo("https://developers.reddit.com/docs");
});

playtestLink.addEventListener("click", () => {
  navigateTo("https://www.reddit.com/r/Devvit");
});

discordLink.addEventListener("click", () => {
  navigateTo("https://discord.com/invite/R7yu2wh9Qz");
});

const titleElement = document.getElementById("title") as HTMLHeadingElement;

let currentPostId: string | null = null;
const incrementAmount = 1;
const decrementAmount = 1;

async function fetchInitialCount() {
  try {
    const response = await fetch(ApiEndpoint.Init);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = (await response.json()) as InitResponse;
    if (data.type === "init") {
      counterValueElement.textContent = data.count.toString();
      currentPostId = data.postId; // Store postId for later use
      titleElement.textContent = `Hey ${data.username} 👋`;
    } else {
      console.error(`Invalid response type from ${ApiEndpoint.Init}`, data);
      counterValueElement.textContent = "Error";
    }
  } catch (error) {
    console.error("Error fetching initial count:", error);
    counterValueElement.textContent = "Error";
  }
}

async function updateCounter(action: "increment" | "decrement", amount = 1) {
  if (!currentPostId) {
    console.error("Cannot update counter: postId is not initialized.");
    // Optionally, you could try to re-initialize or show an error to the user.
    return;
  }

  const body =
    action === "increment"
      ? JSON.stringify({ amount } satisfies IncrementRequest)
      : JSON.stringify({ amount } satisfies DecrementRequest);
  try {
    const response = await fetch(
      action === "increment" ? ApiEndpoint.Increment : ApiEndpoint.Decrement,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // The server uses request context for post ID; amount comes from the body.
        body,
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = (await response.json()) as
      | IncrementResponse
      | DecrementResponse;
    counterValueElement.textContent = data.count.toString();
  } catch (error) {
    console.error(`Error ${action}ing count:`, error);
    // Optionally, display an error message to the user in the UI
  }
}

incrementButton.addEventListener("click", () =>
  updateCounter("increment", incrementAmount),
);
decrementButton.addEventListener("click", () =>
  updateCounter("decrement", decrementAmount),
);

const geminiPingButton = document.getElementById(
  "gemini-ping-button",
) as HTMLButtonElement;
const geminiPingOutput = document.getElementById(
  "gemini-ping-output",
) as HTMLPreElement;

geminiPingButton.addEventListener("click", async () => {
  geminiPingButton.disabled = true;
  geminiPingOutput.textContent = "Calling Gemini…";
  try {
    const response = await fetch(ApiEndpoint.GeminiPing, { method: "POST" });
    const data = (await response.json()) as GeminiPingResponse;
    geminiPingOutput.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    geminiPingOutput.textContent = `client error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    geminiPingButton.disabled = false;
  }
});

const lastModmailButton = document.getElementById(
  "last-modmail-button",
) as HTMLButtonElement;
const lastModmailOutput = document.getElementById(
  "last-modmail-output",
) as HTMLPreElement;

lastModmailButton.addEventListener("click", async () => {
  lastModmailButton.disabled = true;
  lastModmailOutput.textContent = "Fetching…";
  try {
    const response = await fetch(ApiEndpoint.LastModMail);
    const data = (await response.json()) as LastModMailResponse;
    if (data.payload == null) {
      lastModmailOutput.textContent =
        "No modmail trigger received yet. Send a modmail to the sub.";
    } else {
      const age = data.receivedAt
        ? `${Math.round((Date.now() - data.receivedAt) / 1000)}s ago`
        : "unknown";
      lastModmailOutput.textContent = `received ${age}\n\n${JSON.stringify(data.payload, null, 2)}`;
    }
  } catch (err) {
    lastModmailOutput.textContent = `client error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    lastModmailButton.disabled = false;
  }
});

const lastTriageButton = document.getElementById(
  "last-triage-button",
) as HTMLButtonElement;
const lastTriageOutput = document.getElementById(
  "last-triage-output",
) as HTMLPreElement;

lastTriageButton.addEventListener("click", async () => {
  lastTriageButton.disabled = true;
  lastTriageOutput.textContent = "Fetching…";
  try {
    const response = await fetch(ApiEndpoint.LastTriage);
    const data = (await response.json()) as LastTriageResponse;
    const record = data.record;
    if (record == null) {
      lastTriageOutput.textContent =
        "No triage yet. Send a modmail from a non-mod account.";
    } else {
      const age = `${Math.round((Date.now() - record.receivedAt) / 1000)}s ago`;
      lastTriageOutput.textContent = `received ${age} (kind=${record.kind})\n\n${JSON.stringify(record, null, 2)}`;
    }
  } catch (err) {
    lastTriageOutput.textContent = `client error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    lastTriageButton.disabled = false;
  }
});

// Fetch the initial count when the page loads
fetchInitialCount();

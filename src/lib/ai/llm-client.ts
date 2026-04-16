// ─── LLM Client — OpenAI-compatible wrapper ────────────────────────────────
// Supports: gptoss, ollama, vllm, openai, or any OpenAI-compatible endpoint
// Fallback: rule-based response when no LLM_API_URL configured

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
}

export interface LLMToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface LLMResponse {
  content: string | null;
  toolCalls: LLMToolCall[];
  finishReason: string;
}

const LLM_API_URL = process.env.LLM_API_URL || "";
const LLM_MODEL = process.env.LLM_MODEL || "gptoss-20b-latest";
const LLM_API_KEY = process.env.LLM_API_KEY || "";

export function isLLMConfigured(): boolean {
  return LLM_API_URL.length > 0;
}

export async function callLLM(
  messages: LLMMessage[],
  tools?: LLMToolDef[],
): Promise<LLMResponse> {
  if (!isLLMConfigured()) {
    throw new Error("LLM_NOT_CONFIGURED");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (LLM_API_KEY) {
    headers["Authorization"] = `Bearer ${LLM_API_KEY}`;
  }

  const body: Record<string, unknown> = {
    model: LLM_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(LLM_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM_API_ERROR: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error("LLM_EMPTY_RESPONSE");

  const msg = choice.message;
  return {
    content: msg.content ?? null,
    toolCalls: msg.tool_calls ?? [],
    finishReason: choice.finish_reason ?? "stop",
  };
}

// ─── Prompt-based tool call fallback ────────────────────────────────────────
// When the model doesn't support native tool calling, parse [ACTION: {...}] from text

const ACTION_RE = /\[ACTION:\s*(\{.*?\})\]/g;

export function parsePromptToolCalls(text: string): LLMToolCall[] {
  const calls: LLMToolCall[] = [];
  let match;
  let idx = 0;
  while ((match = ACTION_RE.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool && parsed.params) {
        calls.push({
          id: `prompt_tc_${idx++}`,
          type: "function",
          function: {
            name: parsed.tool,
            arguments: JSON.stringify(parsed.params),
          },
        });
      }
    } catch { /* skip malformed */ }
  }
  return calls;
}

// ─── Fallback tool instruction (appended to system prompt) ──────────────────
export const TOOL_CALL_FALLBACK_INSTRUCTION = `
액션이 필요하면 반드시 다음 JSON 형식을 텍스트에 포함하세요:
[ACTION: {"tool": "toolName", "params": {"key": "value"}}]
여러 액션이 필요하면 각각 별도의 [ACTION: ...] 블록으로 작성하세요.
`;

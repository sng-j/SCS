import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// ─── Rate limiting (in-memory, per-user) ────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// ─── System prompt for maritime cybersecurity context ────────────────────────

const SYSTEM_PROMPT = `You are a maritime cybersecurity expert specializing in IACS UR E26/E27 compliance. You help Ship Equipment Cybersecurity Compliance Assessment System engineers, shipyards, and equipment makers with:

1. IACS UR E27 Security Configuration checks (SC-1 through SC-13):
   - SC-1: Password Policy
   - SC-2: Account Security
   - SC-3: Access Control
   - SC-4: Data Integrity
   - SC-5: Network Security
   - SC-6: Remote Access (RDP) Security
   - SC-7: Audit Logging
   - SC-8: Communication Integrity
   - SC-9: Resource Availability
   - SC-10: Screen Lock
   - SC-11: Malware Protection
   - SC-12: Physical Security
   - SC-13: Patch Management

2. IACS UR E26 Ship Cyber Resilience requirements:
   - Asset identification and network topology
   - Zone and Conduit definitions
   - Risk assessment
   - Design verification and security testing

Important rules:
- NEVER recommend network scanning PLC/sensors (availability risk in maritime OT environments)
- "Install SBOM" means installed executables only, not development-stage dependencies
- Document output should be suitable for classification society submission (KR, LR, DNV, ABS, BV, CCS)
- Be practical and provide actionable remediation steps
- When the user writes in Korean, respond in Korean. When in English, respond in English.
- Reference specific IACS UR requirements when applicable.`;

// ─── POST: Proxy to Claude/Anthropic API ────────────────────────────────────

interface MessageInput {
  role: string;
  content: string;
}

interface RequestBody {
  messages?: MessageInput[];
  projectId?: string;
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  // Rate limit check
  if (!checkRateLimit(user.id)) {
    return apiError("Rate limit exceeded. Max 10 requests per minute.", 429);
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { messages, projectId } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return apiError("messages array is required and must not be empty", 400);
  }

  // Validate message format
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return apiError("Each message must have role and content", 400);
    }
    if (!["user", "assistant"].includes(msg.role)) {
      return apiError("Message role must be 'user' or 'assistant'", 400);
    }
  }

  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Graceful fallback when API key is not configured
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const isKorean = lastUserMessage
      ? /[\uac00-\ud7af]/.test(lastUserMessage.content)
      : false;

    const fallbackContent = isKorean
      ? "Claude AI API 키가 아직 구성되지 않았습니다.\n\n" +
      "관리자에게 ANTHROPIC_API_KEY 환경 변수 설정을 요청해 주세요.\n\n" +
      "그 동안 프로젝트 내 'AI 보안 어시스턴트' 페이지의 규칙 기반 응답 시스템을 이용하실 수 있습니다. " +
      "SC-1부터 SC-13까지의 보안 구성 점검 가이드를 제공합니다."
      : "The Claude AI API key has not been configured yet.\n\n" +
      "Please ask your administrator to set the ANTHROPIC_API_KEY environment variable.\n\n" +
      "In the meantime, you can use the rule-based response system in the project's 'AI Security Assistant' page. " +
      "It provides guidance for security configuration checks SC-1 through SC-13.";

    // Save the conversation even for fallback
    const savedMessages = await prisma.$transaction([
      prisma.aiConversation.create({
        data: {
          userId: user.id,
          projectId: projectId ?? null,
          role: "user",
          content: lastUserMessage?.content ?? "",
          intent: "claude_proxy",
          confidence: null,
        },
      }),
      prisma.aiConversation.create({
        data: {
          userId: user.id,
          projectId: projectId ?? null,
          role: "assistant",
          content: fallbackContent,
          intent: "api_key_missing",
          confidence: null,
        },
      }),
    ]);

    return NextResponse.json({
      id: savedMessages[1].id,
      role: "assistant",
      content: fallbackContent,
      intent: "api_key_missing",
      fallback: true,
    });
  }

  // Forward to Anthropic API
  try {
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!anthropicResponse.ok) {
      // Log the error server-side but don't expose details to the client
      const errorData = await anthropicResponse.text();
      console.error("Anthropic API error:", anthropicResponse.status, errorData.slice(0, 500));
      return apiError("AI service temporarily unavailable", 502);
    }

    const data = await anthropicResponse.json();

    // Extract text content from Anthropic response
    const assistantContent =
      data.content
        ?.filter((block: { type: string }) => block.type === "text")
        .map((block: { text: string }) => block.text)
        .join("\n") ?? "";

    // Save conversation to database
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const savedMessages = await prisma.$transaction([
      prisma.aiConversation.create({
        data: {
          userId: user.id,
          projectId: projectId ?? null,
          role: "user",
          content: lastUserMessage?.content ?? "",
          intent: "claude_proxy",
          confidence: null,
        },
      }),
      prisma.aiConversation.create({
        data: {
          userId: user.id,
          projectId: projectId ?? null,
          role: "assistant",
          content: assistantContent,
          intent: "claude_proxy",
          confidence: null,
        },
      }),
    ]);

    return NextResponse.json({
      id: savedMessages[1].id,
      role: "assistant",
      content: assistantContent,
      intent: "claude_proxy",
      usage: data.usage,
    });
  } catch (err) {
    console.error("Anthropic API connection error:", err instanceof Error ? err.message : err);
    return apiError("AI service temporarily unavailable", 502);
  }
}

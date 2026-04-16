// ─── AI Orchestration API ───────────────────────────────────────────────────
// POST: message + context → context build → LLM call → tool loop → response
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { buildContext, type PageContext } from "@/lib/ai/context-builder";
import {
  callLLM,
  isLLMConfigured,
  parsePromptToolCalls,
  TOOL_CALL_FALLBACK_INSTRUCTION,
  type LLMMessage,
  type LLMToolCall,
} from "@/lib/ai/llm-client";
import { AI_TOOLS, executeTool } from "@/lib/ai/tools";
import { safeError } from "@/lib/safe-log";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_TOOL_ITERATIONS = 5;

const SYSTEM_PROMPT_BASE = `당신은 SCS(Ship Equipment Cybersecurity Compliance Assessment System System)의 AI 어시스턴트입니다.
IACS UR E26/E27 해양 사이버보안 인증을 돕는 전문가로, 한국어와 영어를 모두 지원합니다.

역할:
- 프로젝트와 기자재의 현재 상태를 파악하고 다음 단계를 안내합니다
- 하드웨어/소프트웨어 등록, DFD 생성, 보안 평가 등을 직접 수행할 수 있습니다
- SC-1~SC-13 보안 요구사항에 대해 설명하고 평가를 도와줍니다
- 조선소/관리자에게는 벤더별 기자재 진행 현황, 프로젝트 전체 현황을 제공합니다

기자재 상태별 안내 규칙:
- PENDING: 아직 작업이 시작되지 않았습니다. 자산 등록부터 시작하세요.
- IN_PROGRESS: 작업 진행 중입니다. 미완료 항목(HW/SW/DFD/평가/문서)을 확인하고 안내하세요.
- SUBMITTED: 조선소에 제출 완료되었습니다. 벤더는 "검토 대기 중"이라고 안내하세요. 추가 작업이 불필요합니다.
- APPROVED: 승인 완료! 인증이 완료되었습니다. "모든 절차가 완료되었습니다"라고 안내하세요. 제출하라고 하지 마세요.
- REVISION_REQUESTED: 조선소에서 수정을 요청했습니다. 수정 사항을 확인하고 다시 제출하도록 안내하세요.

역할별 안내:
- 벤더: 자산등록 → 보안평가 → 문서생성 → 제출 워크플로우를 안내합니다. 승인된 기자재는 수정 불가합니다.
- 조선소: 벤더가 제출한 기자재 검토, 승인/반려, 프로젝트 관리, E26 문서 생성을 안내합니다.
- 관리자: 전체 시스템 관리, 사용자 관리, CVE 관리를 안내합니다.

중요 규칙:
- 사용자의 언어에 맞춰 응답합니다 (한국어 질문 → 한국어 답변)
- 간결하고 실용적으로 답변합니다
- 컨텍스트에 기자재 상태 정보가 있으면, 그 상태에 맞는 안내를 하세요
- equipmentId가 제공된 경우, 사용자는 특정 기자재 페이지에 있습니다. 프로젝트 전체가 아닌 해당 기자재에 대해서만 답변하세요
- 내부 도구/함수 이름을 절대 응답에 포함하지 마세요
- 도구 호출이 필요하면 사용자에게 제안하지 말고 직접 실행하세요
- 백틱(\`)으로 도구 이름을 감싸서 보여주는 것도 금지입니다
- projectId를 사용자에게 묻지 마세요. 컨텍스트에 projectId가 있으면 바로 사용하고, 없으면 전체 프로젝트를 조회하세요
- "벤더 현황", "기자재 진행 상황", "프로젝트 현황" 등의 질문에는 바로 조회 도구를 호출하세요`;

interface RequestBody {
  message: string;
  context: {
    path: string;
    projectId?: string;
    equipmentId?: string;
    pageType?: string;
    pageFormData?: Record<string, unknown>;
  };
  history?: { role: "user" | "assistant"; content: string }[];
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, context: reqCtx, history = [] } = body;
  if (!message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const startTime = Date.now();

  // 1. Build page context
  const pageCtx: PageContext = {
    path: reqCtx.path || "/",
    projectId: reqCtx.projectId,
    equipmentId: reqCtx.equipmentId,
    pageType: reqCtx.pageType || "",
    pageFormData: reqCtx.pageFormData,
    userRole: user.role,
    userId: user.id,
    shipyardId: user.shipyardId,
  };
  const ctxResult = await buildContext(pageCtx);

  // 2. Check LLM availability
  if (!isLLMConfigured()) {
    const fallbackResponse = buildFallbackResponse(message, ctxResult.summary, ctxResult.pageType);
    const elapsed = Date.now() - startTime;
    const convId = await saveConversation(user.id, reqCtx.projectId, message, fallbackResponse.text, "fallback");
    await saveNlpLog(message, "fallback", 0.5, elapsed);
    return NextResponse.json({
      response: fallbackResponse.text,
      actions: [],
      context: { banner: ctxResult.bannerKo, pageType: ctxResult.pageType },
      source: "fallback",
      conversationId: convId,
    });
  }

  // 3. Build messages for LLM
  const idContext: string[] = [];
  if (reqCtx.projectId) idContext.push(`현재 projectId: "${reqCtx.projectId}"`);
  if (reqCtx.equipmentId) idContext.push(`현재 equipmentId: "${reqCtx.equipmentId}"`);

  const systemPrompt = [
    SYSTEM_PROMPT_BASE,
    "",
    ...(idContext.length > 0 ? [
      "현재 세션 정보 (도구 호출 시 이 ID를 사용하세요):",
      ...idContext,
      "",
    ] : []),
    "현재 페이지 컨텍스트:",
    ctxResult.summary || "(없음)",
  ].join("\n");

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history (last 10 turns)
  for (const h of history.slice(-10)) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: "user", content: message });

  // 4. LLM call with tool loop
  const actions: { tool: string; result: unknown; label?: string }[] = [];

  try {
    // Filter tools to only those relevant to current project
    const availableTools = reqCtx.projectId ? AI_TOOLS : AI_TOOLS.filter((t) =>
      ["getProjectSummary", "getReadiness"].includes(t.function.name),
    );

    let iterations = 0;
    let finalContent = "";

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      let response;
      try {
        response = await callLLM(messages, availableTools);
      } catch (err) {
        // If native tool calling fails, retry without tools + fallback instruction
        if (iterations === 1 && availableTools.length > 0) {
          messages[0] = {
            role: "system",
            content: systemPrompt + "\n\n" + TOOL_CALL_FALLBACK_INSTRUCTION +
              "\n\n사용 가능한 도구:\n" + availableTools.map((t) =>
                `- ${t.function.name}: ${t.function.description}`,
              ).join("\n"),
          };
          response = await callLLM(messages);
        } else {
          throw err;
        }
      }

      // Check for tool calls (native or parsed from text)
      let toolCalls: LLMToolCall[] = response.toolCalls;
      if (toolCalls.length === 0 && response.content) {
        toolCalls = parsePromptToolCalls(response.content);
      }

      if (toolCalls.length === 0) {
        finalContent = response.content || "";
        break;
      }

      // Execute tool calls
      messages.push({
        role: "assistant",
        content: response.content || "",
      });

      for (const tc of toolCalls) {
        const params = JSON.parse(tc.function.arguments);
        // Inject projectId if missing
        if (reqCtx.projectId && !params.projectId) {
          params.projectId = reqCtx.projectId;
        }
        if (reqCtx.equipmentId && !params.equipmentId) {
          params.equipmentId = reqCtx.equipmentId;
        }
        // Inject user context for role-filtered tools
        params._userRole = user.role;
        params._userId = user.id;
        params._shipyardId = user.shipyardId || "";

        const result = await executeTool(tc.function.name, params);
        actions.push({
          tool: tc.function.name,
          result: result.data,
          label: result.actionLabel,
        });

        messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: tc.id,
        });
      }

      // If last iteration, force stop
      if (iterations >= MAX_TOOL_ITERATIONS) {
        finalContent = "도구 호출이 최대 횟수에 도달했습니다. 결과를 확인해주세요.";
        break;
      }
    }

    // 5. Strip leaked tool names from response
    const TOOL_NAMES = ["getProjectSummary", "getHardwareList", "getSoftwareList", "addHardware", "addSoftware", "generateDFD", "getAssessmentStatus", "setAssessmentResult", "generateDocument", "getReadiness", "getVendorEquipmentStatus", "getProjectList"];
    for (const name of TOOL_NAMES) {
      // Remove backtick-wrapped, bold-wrapped, and plain occurrences
      finalContent = finalContent.replace(new RegExp(`\\*\\*${name}\\*\\*`, "g"), "");
      finalContent = finalContent.replace(new RegExp(`\`${name}\``, "g"), "");
      finalContent = finalContent.replace(new RegExp(name, "g"), "");
    }
    // Also strip any [ACTION: ...] blocks that might have leaked
    finalContent = finalContent.replace(/\[ACTION:\s*\{[^}]*\}\s*\]/g, "");
    // Clean up leftover empty formatting and excess whitespace
    finalContent = finalContent.replace(/\*\*\s*\*\*/g, "");
    finalContent = finalContent.replace(/`\s*`/g, "");
    finalContent = finalContent.replace(/\n{3,}/g, "\n\n").trim();

    // 6. Save conversation + NLP log
    const elapsed = Date.now() - startTime;
    const convId = await saveConversation(user.id, reqCtx.projectId, message, finalContent, "llm");
    await saveNlpLog(message, "llm", 1.0, elapsed);

    return NextResponse.json({
      response: finalContent,
      actions,
      context: { banner: ctxResult.bannerKo, pageType: ctxResult.pageType },
      source: "llm",
      conversationId: convId,
    });
  } catch (err) {
    safeError("AI Orchestrate", err);

    // Fallback on LLM error
    const fallbackResponse = buildFallbackResponse(message, ctxResult.summary, ctxResult.pageType);
    const elapsed = Date.now() - startTime;
    const convId = await saveConversation(user.id, reqCtx.projectId, message, fallbackResponse.text, "error_fallback");
    await saveNlpLog(message, "error_fallback", 0, elapsed);
    return NextResponse.json({
      response: fallbackResponse.text,
      actions: [],
      context: { banner: ctxResult.bannerKo, pageType: ctxResult.pageType },
      source: "fallback",
      conversationId: convId,
      error: err instanceof Error ? err.message : "LLM error",
    });
  }
}

// ─── Conversation persistence ───────────────────────────────────────────────

async function saveConversation(
  userId: string,
  projectId: string | undefined,
  userMsg: string,
  assistantMsg: string,
  intent: string,
): Promise<string | null> {
  try {
    const [, assistant] = await prisma.$transaction([
      prisma.aiConversation.create({
        data: { userId, projectId: projectId || null, role: "user", content: userMsg, intent, confidence: null },
      }),
      prisma.aiConversation.create({
        data: { userId, projectId: projectId || null, role: "assistant", content: assistantMsg, intent, confidence: null },
      }),
    ]);
    return assistant.id;
  } catch { return null; }
}

async function saveNlpLog(input: string, intent: string, confidence: number, latencyMs: number) {
  try {
    await prisma.aiNlpLog.create({
      data: { input: input.slice(0, 2000), intent, confidence, latencyMs },
    });
  } catch { /* non-blocking */ }
}

// ─── Rule-based fallback ────────────────────────────────────────────────────

interface FallbackResult {
  text: string;
}

function buildFallbackResponse(message: string, contextSummary: string, pageType: string): FallbackResult {
  const msg = message.toLowerCase();

  // SC check queries
  const scMatch = /sc[-\s]?(\d{1,2})/i.exec(msg);
  if (scMatch) {
    const scId = `SC-${scMatch[1]}`;
    return {
      text: `${scId} 요구사항에 대해 안내드리겠습니다.\n\n` +
        `SC-1: 사용자 인증 및 비밀번호 정책\nSC-2: 계정 관리 및 접근 통제\nSC-5: 네트워크 보안\n` +
        `SC-6: 통신 암호화\nSC-7: 감사 로그\nSC-10: 소프트웨어 무결성\nSC-11: 물리적 보안\nSC-13: 시스템 가용성\n\n` +
        `현재 LLM이 연결되어 있지 않아 상세 설명은 제한적입니다. LLM 설정 후 더 자세한 안내가 가능합니다.`,
    };
  }

  // Status queries
  if (msg.includes("현황") || msg.includes("상태") || msg.includes("status") || msg.includes("summary")) {
    if (contextSummary) {
      return { text: `현재 상태입니다:\n\n${contextSummary}\n\n더 자세한 분석은 LLM 연결 후 가능합니다.` };
    }
    return { text: "프로젝트를 선택하면 상세 현황을 확인할 수 있습니다." };
  }

  // Next step queries
  if (msg.includes("다음") || msg.includes("뭘 해") || msg.includes("what should") || msg.includes("next")) {
    const guide: Record<string, string> = {
      inventory: "현재 인벤토리 페이지입니다. 하드웨어와 소프트웨어를 등록하고 DFD를 생성하세요.\n\n다음 단계: 보안 평가 (Assessment) 페이지로 이동하여 SC 체크를 진행합니다.",
      assess: "현재 보안 평가 페이지입니다. 각 하드웨어에 대해 SC-1~SC-13 체크를 수행하세요.\n\n다음 단계: 모든 평가 완료 후 문서 생성 페이지로 이동합니다.",
      document: "현재 문서 페이지입니다. E27/E26 문서를 생성하세요.\n\n다음 단계: 모든 문서 생성 후 제출 페이지에서 최종 확인합니다.",
      submit: "현재 제출 페이지입니다. 모든 체크항목이 완료되었는지 확인 후 제출하세요.",
    };
    return { text: guide[pageType] || "E27 워크플로우: 1.자산등록 → 2.보안평가 → 3.문서생성 → 4.제출\n\n프로젝트를 선택하고 인벤토리 등록부터 시작하세요." };
  }

  // Default
  return {
    text: "안녕하세요! SCS AI 어시스턴트입니다. 다음과 같은 작업을 도와드릴 수 있습니다:\n\n" +
      "• 프로젝트 현황 조회\n• 하드웨어/소프트웨어 등록\n• DFD 자동 생성\n• 보안 평가 안내 (SC-1~SC-13)\n• 문서 생성\n• 제출 준비 상태 확인\n\n" +
      "무엇을 도와드릴까요?",
  };
}

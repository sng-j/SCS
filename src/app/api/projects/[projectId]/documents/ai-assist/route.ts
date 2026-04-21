import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyProjectAccess, apiError, isWriteRole } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ projectId: string }>;
}

const SYSTEM_PROMPT = `You are a maritime cybersecurity documentation expert specializing in IACS UR E26/E27 compliance documents.

Your task: Improve and expand the given document section content for classification society submission.

Rules:
- Write professional, technical documentation suitable for KR, LR, DNV, ABS, BV, CCS review
- Include specific references to IACS UR E27 security checks (SC-1 to SC-13) when relevant
- Use actual project data provided in the context
- Maintain the existing section structure but make content more detailed and specific
- Output clean HTML (h2, h3, p, ul/li, ol/li, strong, em, table) — no markdown
- When the user writes in Korean, respond in Korean. When in English, respond in English.
- Keep content factual and compliance-oriented — avoid marketing language
- If the input is empty or very short, generate appropriate initial content based on the document type and context`;

/** POST /api/projects/[projectId]/documents/ai-assist — AI-assisted content improvement */
export async function POST(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  const { projectId } = await params;
  const hasAccess = await verifyProjectAccess(user.id, projectId, user.role, user.shipyardId);
  if (!hasAccess) return apiError("Forbidden", 403);
  if (!isWriteRole(user.role)) return apiError("Read-only role cannot modify this resource", 403);

  const body = await request.json();
  const { content, docType, title, action } = body as {
    content: string;
    docType: string;
    title: string;
    action: "improve" | "expand" | "translate-ko" | "translate-en";
  };

  if (!docType || !title) return apiError("docType and title are required", 400);

  // Fetch project context for data-driven suggestions
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { vesselName: true, classification: true, systemName: true, shipowner: true },
  });

  const [hwCount, swCount, assessCount] = await Promise.all([
    prisma.hardware.count({ where: { projectId } }),
    prisma.software.count({ where: { projectId } }),
    prisma.assessment.count({ where: { hardware: { projectId } } }),
  ]);

  const actionPrompts: Record<string, string> = {
    improve: "Improve the following document section: make it more detailed, professional, and compliance-ready. Fix any vague or placeholder text with specific, actionable content.",
    expand: "Expand the following document section with additional detail: add sub-sections, specific procedures, data references, and compliance requirements. At least double the content depth.",
    "translate-ko": "Translate the following document section to Korean. Maintain technical terminology and document structure. Use formal Korean (합쇼체).",
    "translate-en": "Translate the following document section to English. Maintain technical terminology and document structure. Use formal technical English.",
  };

  const userMessage = `Project context:
- Vessel: ${project?.vesselName || "Unknown"}
- Classification: ${project?.classification || "TBD"}
- System: ${project?.systemName || "TBD"}
- Ship Owner: ${project?.shipowner || "TBD"}
- Hardware assets: ${hwCount}
- Software components: ${swCount}
- Assessment checks: ${assessCount}

Document: ${docType} — ${title}

${actionPrompts[action] || actionPrompts.improve}

Current content:
${content || "(Empty — generate initial content for this document type)"}`;

  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const isKorean = /[\uac00-\ud7af]/.test(content || title);
    return NextResponse.json({
      content: isKorean
        ? `<p><strong>AI 어시스트를 사용하려면 ANTHROPIC_API_KEY 환경 변수를 설정해야 합니다.</strong></p>
<p>관리자에게 API 키 설정을 요청해 주세요. 그 동안 직접 문서를 편집할 수 있습니다.</p>`
        : `<p><strong>To use AI Assist, the ANTHROPIC_API_KEY environment variable must be configured.</strong></p>
<p>Please ask your administrator to set up the API key. In the meantime, you can edit documents manually.</p>`,
      fallback: true,
    });
  }

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
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return apiError(`AI API error: ${anthropicResponse.status} — ${errText.slice(0, 200)}`, 502);
    }

    const data = await anthropicResponse.json();
    const assistantContent =
      data.content
        ?.filter((block: { type: string }) => block.type === "text")
        .map((block: { text: string }) => block.text)
        .join("\n") ?? "";

    return NextResponse.json({
      content: assistantContent,
      usage: data.usage,
      fallback: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return apiError(`AI request failed: ${message}`, 502);
  }
}

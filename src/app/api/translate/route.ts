import { NextResponse } from "next/server";
import { callLLM, isLLMConfigured } from "@/lib/ai/llm-client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, apiError } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/** POST /api/translate — translate text using LLM with DB cache */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);

  if (!isLLMConfigured()) {
    return apiError("Translation service not available", 503);
  }

  try {
    const { texts, targetLang } = await request.json() as { texts: string[]; targetLang: string };

    if (!texts?.length || !targetLang) {
      return apiError("texts and targetLang required", 400);
    }

    const batch = texts.slice(0, 20);
    const translated: string[] = [];
    const toTranslate: { idx: number; text: string }[] = [];

    // Check DB cache first
    for (let i = 0; i < batch.length; i++) {
      const cacheKey = `translate:${targetLang}:${batch[i].substring(0, 200)}`;
      const cached = await prisma.cveCache.findUnique({ where: { query: cacheKey } });
      if (cached && cached.expiresAt > new Date()) {
        translated[i] = cached.result;
      } else {
        translated[i] = batch[i]; // placeholder
        toTranslate.push({ idx: i, text: batch[i] });
      }
    }

    // Only call LLM for uncached texts
    if (toTranslate.length > 0) {
      const numbered = toTranslate.map((t, i) => `[${i + 1}] ${t.text}`).join("\n");

      const response = await callLLM([
        {
          role: "system",
          content: `You are a translator. Translate each numbered line to ${targetLang}. Keep the [number] prefix. Only output translations, nothing else. If text is already in ${targetLang}, return it as-is.`,
        },
        { role: "user", content: numbered },
      ]);

      const content = response.content || "";
      for (let i = 0; i < toTranslate.length; i++) {
        const regex = new RegExp(`\\[${i + 1}\\]\\s*(.+?)(?=\\[${i + 2}\\]|$)`, "s");
        const match = content.match(regex);
        const result = match ? match[1].trim() : toTranslate[i].text;
        translated[toTranslate[i].idx] = result;

        // Cache for 7 days
        const cacheKey = `translate:${targetLang}:${toTranslate[i].text.substring(0, 200)}`;
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await prisma.cveCache.upsert({
          where: { query: cacheKey },
          update: { result, expiresAt },
          create: { query: cacheKey, result, expiresAt },
        }).catch(() => {});
      }
    }

    return NextResponse.json({ translated });
  } catch {
    return apiError("Translation failed", 500);
  }
}

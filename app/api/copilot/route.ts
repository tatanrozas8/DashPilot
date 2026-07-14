import { NextResponse } from "next/server";
import { datasetProfileSchema, dashboardSpecSchema, presentationSpecSchema } from "@/lib/validation/schemas";
import { buildCopilotPrompt, copilotOutputJsonSchema, createMockCopilotResponse, parseCopilotProviderOutput, type CopilotRequestContext } from "@/lib/ai/copilot-service";

function outputText(payload: unknown) {
  if (typeof payload !== "object" || !payload) return null;
  if ("output_text" in payload && typeof payload.output_text === "string") return payload.output_text;
  const output = "output" in payload && Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = typeof item === "object" && item && "content" in item && Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (typeof part === "object" && part && "text" in part && typeof part.text === "string") return part.text;
    }
  }
  return null;
}

function parseContext(raw: unknown): CopilotRequestContext | null {
  if (typeof raw !== "object" || !raw) return null;
  const input = raw as Record<string, unknown>;
  const datasetProfile = datasetProfileSchema.safeParse(input.datasetProfile);
  const dashboardSpec = dashboardSpecSchema.safeParse(input.dashboardSpec);
  const presentationSpec = input.presentationSpec ? presentationSpecSchema.safeParse(input.presentationSpec) : null;
  if (!datasetProfile.success || !dashboardSpec.success || typeof input.prompt !== "string" || typeof input.semanticModel !== "object" || !input.semanticModel || typeof input.viewState !== "object" || !input.viewState) {
    return null;
  }
  return {
    prompt: input.prompt,
    datasetProfile: datasetProfile.data,
    semanticModel: input.semanticModel as CopilotRequestContext["semanticModel"],
    dashboardSpec: dashboardSpec.data,
    viewState: input.viewState as CopilotRequestContext["viewState"],
    presentationSpec: presentationSpec?.success ? presentationSpec.data : undefined,
    messages: Array.isArray(input.messages) ? input.messages as CopilotRequestContext["messages"] : undefined,
    copilotContext: typeof input.copilotContext === "object" && input.copilotContext ? input.copilotContext as CopilotRequestContext["copilotContext"] : undefined,
    rows: Array.isArray(input.rows) ? input.rows as CopilotRequestContext["rows"] : undefined
  };
}

export async function POST(request: Request) {
  const context = parseContext(await request.json().catch(() => null));
  if (!context) return NextResponse.json({ reply: "Solicitud invalida.", action: null }, { status: 400 });

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return NextResponse.json(createMockCopilotResponse(context));

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? "gpt-5.5",
        input: buildCopilotPrompt(context),
        text: {
          format: {
            type: "json_schema",
            name: "dashpilot_copilot_action",
            schema: copilotOutputJsonSchema,
            strict: true
          }
        }
      })
    });
    if (!response.ok) return NextResponse.json(createMockCopilotResponse(context));
    const providerPayload = await response.json();
    const text = outputText(providerPayload);
    const parsed = text ? JSON.parse(text) : providerPayload;
    return NextResponse.json(parseCopilotProviderOutput(parsed, context));
  } catch {
    return NextResponse.json(createMockCopilotResponse(context));
  }
}

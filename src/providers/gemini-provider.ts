import { GoogleGenAI } from "@google/genai";
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  LLMProvider,
  ToolCall,
  ToolSpec,
} from "./types.js";

function toGeminiFunctionDeclaration(tool: ToolSpec) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();

    // Build the prompt string from messages
    // Gemini's generateContent accepts a single `contents` string or structured parts;
    // we join system + user messages into a single formatted prompt.
    const systemParts = req.messages
      .filter((m): m is ChatMessage & { role: "system" } => m.role === "system")
      .map((m) => m.content);

    const conversationParts = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
      .join("\n\n");

    const fullPrompt = [
      systemParts.length > 0
        ? `SYSTEM INSTRUCTIONS:\n${systemParts.join("\n")}`
        : null,
      conversationParts || null,
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const config: Record<string, unknown> = {
      temperature: req.temperature ?? 0.2,
      maxOutputTokens: req.maxOutputTokens ?? 4096,
    };

    if (req.json) {
      config["responseMimeType"] = "application/json";
    }

    if (req.tools && req.tools.length > 0) {
      config["tools"] = [
        {
          functionDeclarations: req.tools.map(toGeminiFunctionDeclaration),
        },
      ];
    }

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: fullPrompt,
      config,
    });

    const latencyMs = Date.now() - start;

    const text = response.text?.trim() ?? "";

    // Extract tool calls from function call parts if present
    const toolCalls: ToolCall[] = [];
    const candidates = response.candidates ?? [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts ?? [];
      for (const part of parts) {
        if (part.functionCall) {
          toolCalls.push({
            id: `${part.functionCall.name ?? "fn"}-${Date.now()}`,
            name: part.functionCall.name ?? "",
            args: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    const usage = {
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };

    return { text, toolCalls, usage, model: this.model, latencyMs };
  }
}

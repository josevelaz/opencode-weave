export const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

export interface OpenRouterResponse {
  content: string
  durationMs: number
}

function extractContent(content: unknown): string {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part
      }

      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text
      }

      return ""
    })
    .join("")
}

export async function callOpenRouter(
  systemPrompt: string,
  userMessage: string,
  model: string,
  apiKey: string,
): Promise<OpenRouterResponse> {
  const start = Date.now()
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-OpenRouter-Title": "Weave Agent Evals",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      max_tokens: 1024,
      stream: false,
    }),
  })

  if (!response.ok) {
    const body = (await response.text()).slice(0, 500)
    throw new Error(`OpenRouter API error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const content = extractContent(data.choices?.[0]?.message?.content)
  return { content, durationMs: Date.now() - start }
}

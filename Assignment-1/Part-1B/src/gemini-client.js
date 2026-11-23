"use strict";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/";

function createGeminiClient({
  apiKey,
  model,
  timeoutMs = 30000,
  fetchImpl = fetch,
} = {}) {
  return {
    async complete({ system, user }) {
      if (
        typeof apiKey !== "string" ||
        apiKey.length === 0 ||
        typeof model !== "string" ||
        model.length === 0
      ) {
        throw new Error("Gemini client configuration is missing.");
      }
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error("Gemini client timeout is invalid.");
      }
      if (typeof fetchImpl !== "function") {
        throw new Error("Gemini HTTP transport is unavailable.");
      }

      let response;
      try {
        response = await fetchImpl(
          `${ENDPOINT}${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts: [{ text: user }] }],
              generationConfig: {
                temperature: 0,
                responseMimeType: "application/json",
              },
            }),
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
      } catch {
        throw new Error("Gemini request failed.");
      }

      if (!response || !response.ok) {
        throw new Error("Gemini request failed.");
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error("Gemini response was invalid.");
      }

      const text = payload?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter((part) => typeof part === "string")
        .join("");
      if (typeof text !== "string" || text.length === 0) {
        throw new Error("Gemini response contained no result.");
      }
      return text;
    },
  };
}

module.exports = { createGeminiClient };

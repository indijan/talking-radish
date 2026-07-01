export const RADISH_SYSTEM_PROMPT = `You are Radley, a friendly talking radish.
You always speak in first person as the radish.
Never say you are an AI or language model.
Your default language is English, but always answer in the language used by the user.
You only answer questions related to radishes.
This includes growing, nutrition, recipes, gardening, farming, history, biology, health benefits, cooking, varieties, storage, children's education and fun facts.
If the user asks anything unrelated to radishes, politely redirect the conversation back to radishes.
Be warm, cheerful, playful and suitable for families.
Keep responses concise at 2 to 6 sentences.`;

export type RadishState = "idle" | "listening" | "thinking" | "speaking";

export type RadishEvent =
  | "start-listening"
  | "stop-listening"
  | "start-speaking"
  | "finish-speaking"
  | "reset";

export function transitionRadishState(
  current: RadishState,
  event: RadishEvent
): RadishState {
  switch (current) {
    case "idle":
      return event === "start-listening" ? "listening" : current;
    case "listening":
      if (event === "stop-listening") return "thinking";
      return event === "reset" ? "idle" : current;
    case "thinking":
      if (event === "start-speaking") return "speaking";
      return event === "reset" ? "idle" : current;
    case "speaking":
      return event === "finish-speaking" || event === "reset" ? "idle" : current;
    default:
      return current;
  }
}

export type RadishReplyPayload = {
  transcript: string;
  reply: string;
  language: string;
  audio?: {
    base64: string;
    mimeType: string;
  };
};

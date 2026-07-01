import "server-only";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { RADISH_SYSTEM_PROMPT } from "@/lib/radish";

type TextApi = "responses" | "chat" | "realtime";

type ReplyInput = {
  transcript: string;
};

type SpeechOutput = {
  base64: string;
  mimeType: string;
};

type ConversationClient = {
  reply(input: ReplyInput): Promise<string>;
};

type TranscriptionResult = {
  text: string;
  language?: string;
};

class ResponsesConversationClient implements ConversationClient {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string
  ) {}

  async reply({ transcript }: ReplyInput) {
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        { role: "system", content: RADISH_SYSTEM_PROMPT },
        { role: "user", content: transcript }
      ]
    });

    return response.output_text.trim();
  }
}

class ChatConversationClient implements ConversationClient {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string
  ) {}

  async reply({ transcript }: ReplyInput) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: RADISH_SYSTEM_PROMPT },
        { role: "user", content: transcript }
      ]
    });

    return response.choices[0]?.message.content?.trim() || "";
  }
}

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  return new OpenAI({ apiKey });
}

function getConversationClient(): ConversationClient {
  const client = getClient();
  const api = (process.env.OPENAI_TEXT_API || "responses") as TextApi;
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";

  switch (api) {
    case "chat":
      return new ChatConversationClient(client, model);
    case "realtime":
      throw new Error(
        "Realtime text generation is not wired into the HTTP route yet. Switch OPENAI_TEXT_API to responses or chat."
      );
    case "responses":
    default:
      return new ResponsesConversationClient(client, model);
  }
}

export async function transcribeAudio(file: File): Promise<TranscriptionResult> {
  const client = getClient();
  const upload = await toFile(
    Buffer.from(await file.arrayBuffer()),
    file.name || "radish-recording.webm",
    { type: file.type || "audio/webm" }
  );

  const result = await client.audio.transcriptions.create({
    file: upload,
    model: process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",
    response_format: "verbose_json"
  });

  return {
    text: result.text,
    language: "language" in result ? result.language : undefined
  };
}

export async function generateRadishReply(input: ReplyInput) {
  return getConversationClient().reply(input);
}

export async function synthesizeRadishSpeech(
  input: ReplyInput & { reply: string; language: string }
): Promise<SpeechOutput | null> {
  const client = getClient();
  try {
    const response = await client.audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: process.env.OPENAI_TTS_VOICE || "coral",
      input: input.reply,
      response_format: "mp3",
      speed: 0.94,
      instructions: `You are Radley, a cheerful talking radish for children.
Speak warmly, clearly, and naturally.
Keep a playful educational tone.
Match the language of this reply: ${input.language}.`
    });

    const bytes = Buffer.from(await response.arrayBuffer());

    return {
      base64: bytes.toString("base64"),
      mimeType: "audio/mpeg"
    };
  } catch {
    return null;
  }
}

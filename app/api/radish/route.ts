import { NextResponse } from "next/server";
import {
  generateRadishReply,
  synthesizeRadishSpeech,
  transcribeAudio
} from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let transcript = "";
    let language = "same language as the reply";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { prompt?: string };
      transcript = body.prompt?.trim() || "";
    } else {
      const formData = await request.formData();
      const audio = formData.get("audio");

      if (!(audio instanceof File) || audio.size === 0) {
        return NextResponse.json(
          { error: "Please send an audio recording." },
          { status: 400 }
        );
      }

      const transcription = await transcribeAudio(audio);
      transcript = transcription.text.trim();
      language = transcription.language || language;
    }

    if (!transcript) {
      return NextResponse.json(
        { error: "Please ask a radish question first." },
        { status: 400 }
      );
    }

    const reply = await generateRadishReply({ transcript });
    const speech = await synthesizeRadishSpeech({ transcript, reply, language });

    return NextResponse.json({
      transcript,
      reply,
      language,
      audio: speech
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The radish got tangled up.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

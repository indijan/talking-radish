import { NextResponse } from "next/server";
import {
  generateRadishReply,
  synthesizeRadishSpeech,
  transcribeAudio
} from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json(
        { error: "Please send an audio recording." },
        { status: 400 }
      );
    }

    const transcription = await transcribeAudio(audio);
    const transcript = transcription.text.trim();

    if (!transcript) {
      return NextResponse.json(
        { error: "I couldn't hear a radish question in that recording." },
        { status: 400 }
      );
    }

    const reply = await generateRadishReply({ transcript });
    const language = transcription.language || "en";
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

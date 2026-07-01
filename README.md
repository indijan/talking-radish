# Talking Radish

A small Next.js MVP for a procedural talking radish.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set `OPENAI_API_KEY`.
4. Run `npm run dev`.

## Notes

- The UI uses a four-state client state machine: `idle`, `listening`, `thinking`, `speaking`.
- The mouth animation only reacts to `speaking`.
- OpenAI text generation is adapter-based through `OPENAI_TEXT_API`, so swapping `responses` and `chat` is only an environment change plus the shared contract in `lib/openai.ts`.
- Voice playback now uses OpenAI TTS instead of browser speech synthesis, configured by `OPENAI_TTS_MODEL` and `OPENAI_TTS_VOICE`.
- The caption card highlights spoken words progressively during the `speaking` state.

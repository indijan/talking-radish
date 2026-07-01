# Talking Radish MVP – Technical Specification

## Goal

Build a very lightweight Next.js application featuring a single animated cartoon radish that acts as an AI conversation partner.

The purpose is not to build a realistic avatar or lip-sync system. The experience should feel playful, responsive and smooth.

---

# Tech Stack

- Next.js 15 (App Router)
- React
- TypeScript
- Framer Motion (or CSS animations)
- SVG graphics (preferred)
- OpenAI API
- Browser MediaRecorder OR OpenAI Realtime API (preferred if implemented)
- Web Audio API (for playback state only)

---

# UI

The page should contain nothing except:

- centered radish character
- plain light background
- optional subtle shadow under the radish

No buttons except:

- microphone button
- speaking indicator

---

# Radish Character

The character should be drawn as SVG.

Components:

- body
- two eyes
- eyebrows (optional)
- sinusoidal mouth
- leaves

No bitmap graphics.

Everything should scale responsively.

---

# Idle Animation

The radish should never be completely still.

Implement several independent animations:

## Body

Very gentle floating.

Example:

- translateY ±3px
- rotation ±2°

using sine curves or Framer Motion.

---

## Eyes

Every few seconds:

- randomly look left
- right
- up
- center

Movement should be subtle.

Occasionally blink.

Blink interval:

2–6 seconds random.

---

## Leaves

Very small continuous sway.

---

# Mouth

The mouth is NOT lip synced.

It is simply a sinusoidal SVG path.

States:

Idle

Very small wave.

Speaking

Increase:

- amplitude
- frequency
- animation speed

When playback finishes:

Return smoothly to idle.

No phoneme animation required.

---

# Conversation Flow

User presses microphone.

↓

Speech captured.

↓

Speech converted to text.

↓

Text sent to OpenAI.

↓

Receive answer.

↓

Convert answer to speech.

↓

Play speech.

↓

While speech plays:

mouth animation switches to Speaking mode.

After playback:

return to Idle mode.

---

# AI Personality

The character is a talking radish.

It always speaks in first person.

Examples:

"I grow underground."

"I love healthy soil."

"I contain lots of vitamin C."

"I become sweeter after cold weather."

Never describes itself as an AI.

---

# Language Behaviour

Default language:

English.

If the user speaks another language:

Reply entirely in that language.

No explicit language switching is needed.

The LLM should infer the language.

---

# Knowledge Scope

The assistant answers only questions related to radishes.

Allowed examples:

- growing
- nutrition
- recipes
- farming
- varieties
- history
- health benefits
- fun facts
- cooking
- storage
- gardening
- vitamins
- children's questions
- jokes about radishes

If unrelated questions are asked:

Politely redirect.

Example:

"I'm only a radish, but I'd love to tell you more about radishes!"

Do not answer politics, coding, finance, etc.

---

# Personality

Friendly.

Funny.

Curious.

Optimistic.

Suitable for children.

Never sarcastic.

Never offensive.

Keep answers concise.

Target length:

2–6 sentences.

---

# OpenAI System Prompt

You are Radley, a friendly talking radish.

You always speak in first person as the radish.

Never say you are an AI or language model.

Your default language is English, but always answer in the language used by the user.

You only answer questions related to radishes.

This includes:

- growing
- nutrition
- recipes
- gardening
- farming
- history
- biology
- health benefits
- cooking
- varieties
- storage
- children's education
- fun facts

If the user asks anything unrelated to radishes, politely redirect the conversation back to radishes.

Be warm, cheerful, playful and suitable for families.

Keep responses concise.

---

# State Machine

States:

Idle

Listening

Thinking

Speaking

Transitions:

Idle

↓

Listening

↓

Thinking

↓

Speaking

↓

Idle

Animations should react only to the current state.

---

# Future Extensions (not part of MVP)

- Better character design
- Multiple vegetables
- Emotion system
- Eye tracking
- Lip sync
- Streaming responses
- Animated background
- Mini educational games
- Multiple voice options

Do NOT implement these now.

Focus only on the MVP described above.
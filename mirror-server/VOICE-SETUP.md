# Jarvis Voice And Test Flow

The mirror uses one provider-swappable LLM pipeline:

1. Jarvis routes the user message to one intent.
2. The mirror tool executes and returns JSON data.
3. Jarvis receives the tool JSON, full memory, current mirror context, and chat history.
4. Jarvis writes the final short spoken response.

Switch the LLM with:

```bash
LLM_PROVIDER=groq
```

Supported LLM providers are configured in `src/llm/client.js`: `groq`, `sambanova`, `openai`, `openrouter`, and `cerebras`.

Speech-to-text is separate from the LLM. Deepgram is recommended for the Pi voice loop:

```bash
STT_PROVIDER=deepgram
DEEPGRAM_API_KEY=
```

ElevenLabs Scribe is still supported:

```bash
STT_PROVIDER=elevenlabs
ELEVENLABS_STT_MODEL=scribe_v2
```

The local realtime Vosk interim transcript path is disabled for the tuned Pi flow. The UI now animates from voice state and final STT only.

## Test Jarvis

Text:

```bash
npm run test:jarvis -- --text "what's the weather in Tokyo"
```

Interactive text:

```bash
npm run test:jarvis
```

Wake-word voice conversation:

```bash
npm run test:jarvis -- --voice
```

The Pi command uses the same runner:

```bash
npm run voice
```

The runner waits for the configured openWakeWord model and keeps a short rolling audio buffer, so one-shot commands like "hey Jarvis, what's the weather" are captured as the first conversation turn. It returns to wake-word listening after a goodbye/done phrase or the silence buffer.

Voice without wake-word gating:

```bash
npm run test:jarvis -- --voice --no-wake
```

Voice without playback:

```bash
npm run test:jarvis -- --voice --no-play
```

Try Inworld streaming TTS playback:

```bash
INWORLD_API_KEY=your_key npm run test:jarvis -- --voice --tts inworld --voice-id Dennis
```

You can also set `TTS_PROVIDER=inworld` and `INWORLD_VOICE_ID=Dennis` in `.env`. Optional Inworld TTS settings are `INWORLD_TTS_MODEL_ID`, `INWORLD_TTS_DELIVERY_MODE`, `INWORLD_TTS_AUDIO_ENCODING`, `INWORLD_TTS_SAMPLE_RATE`, and `INWORLD_TTS_BIT_RATE`.

The root package exposes the same runner:

```bash
npm run test:jarvis -- --text "next song"
```

Run integration checks separately:

```bash
npm run integrations
```

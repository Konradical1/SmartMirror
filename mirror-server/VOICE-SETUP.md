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

Speech-to-text is separate from the LLM. The default is ElevenLabs Scribe:

```bash
STT_PROVIDER=elevenlabs
ELEVENLABS_STT_MODEL=scribe_v2
```

## Test Jarvis

Text:

```bash
npm run test:jarvis -- --text "what's the weather in Tokyo"
```

Interactive text:

```bash
npm run test:jarvis
```

Continuous voice:

```bash
npm run test:jarvis -- --voice
```

Voice without playback:

```bash
npm run test:jarvis -- --voice --no-play
```

The root package exposes the same runner:

```bash
npm run test:jarvis -- --text "next song"
```

Run integration checks separately:

```bash
npm run integrations
```

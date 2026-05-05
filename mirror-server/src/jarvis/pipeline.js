import { handleIntent } from '../intentRouter.js';
import { llmJson, llmText } from '../llm/client.js';
import { logger } from '../utils/logger.js';
import { broadcastOverlay } from '../websocket.js';
import { buildJarvisContext } from './context.js';
import { responsePrompt, routerPrompt } from './prompts.js';

export async function routeJarvisIntent(input, history = []) {
  const routed = await llmJson({
    purpose: 'intent',
    maxTokens: Number(process.env.JARVIS_ROUTER_MAX_TOKENS || 220),
    temperature: Number(process.env.JARVIS_ROUTER_TEMPERATURE || process.env.LLM_TEMPERATURE || 0.2),
    messages: [
      { role: 'system', content: routerPrompt },
      ...historyToMessages(history).slice(-12),
      { role: 'user', content: input },
    ],
  });

  return {
    intent: routed.intent || 'DISPLAY_MESSAGE',
    params: routed.params || {},
  };
}

export async function runJarvisTurn(input, {
  history = [],
  route = null,
  broadcast = true,
} = {}) {
  const userInput = String(input || '').trim();
  const routed = route || await routeJarvisIntent(userInput, history);
  logger.info(`Intent: ${routed.intent}`);
  logger.info(`Params: ${JSON.stringify(routed.params || {})}`);

  const toolResult = await handleIntent(routed.intent, routed.params || {});
  const context = buildJarvisContext();
  const speech = await composeJarvisResponse({
    userInput,
    route: routed,
    toolResult,
    context,
    history,
  });

  if (broadcast) broadcastOverlay(speech);

  return {
    ok: true,
    input: userInput,
    route: routed,
    intent: routed.intent,
    params: routed.params || {},
    data: toolResult.data ?? null,
    ui: toolResult.ui ?? null,
    speech,
  };
}

export async function composeJarvisResponse({
  userInput = '',
  route,
  toolResult,
  context = buildJarvisContext(),
  history = [],
} = {}) {
  try {
    const payload = {
      userInput,
      route,
      toolResult,
      context,
      responseRequirements: responseRequirements(route, toolResult),
    };

    let content = await llmText({
      purpose: 'response',
      maxTokens: Number(process.env.JARVIS_RESPONSE_MAX_TOKENS || 120),
      temperature: Number(process.env.JARVIS_RESPONSE_TEMPERATURE || 0.8),
      messages: [
        { role: 'system', content: responsePrompt },
        ...historyToMessages(history).slice(-10),
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
    });

    let speech = cleanSpeech(content);
    if (!speechIsValid(speech, route, toolResult)) {
      content = await llmText({
        purpose: 'response-retry',
        maxTokens: Number(process.env.JARVIS_RESPONSE_MAX_TOKENS || 120),
        temperature: Number(process.env.JARVIS_RESPONSE_TEMPERATURE || 0.8),
        messages: [
          { role: 'system', content: `${responsePrompt}\n\nYour previous response missed required tool facts. Rewrite it and satisfy responseRequirements exactly.` },
          {
            role: 'user',
            content: JSON.stringify({
              ...payload,
              invalidResponse: speech,
            }),
          },
        ],
      });
      speech = cleanSpeech(content);
    }

    if (!speechIsValid(speech, route, toolResult)) throw new Error('Jarvis response failed validation.');
    if (!speech) throw new Error('Empty Jarvis response.');
    return speech;
  } catch (error) {
    logger.error(`Jarvis response failed: ${error.message}`);
    return 'Jarvis response failed.';
  }
}

function responseRequirements(route = {}, toolResult = {}) {
  const intent = route.intent;
  const data = toolResult.data || {};

  if (intent === 'SHOW_WEATHER' && data.weather) {
    return [
      `Mention location: ${data.weather.location}`,
      `Mention current temperature: ${data.weather.temperature}`,
      `Mention condition: ${data.weather.condition}`,
      `Mention high: ${data.weather.forecast?.[0]?.high}`,
      `Mention low: ${data.weather.forecast?.[0]?.low}`,
      'Do not mention unrelated personal activities.',
    ];
  }

  if (intent === 'SHOW_SPOTIFY' || intent === 'SPOTIFY_NEXT' || intent === 'SPOTIFY_PREVIOUS') {
    return [
      'Mention the track title and artist if present.',
      'Do not mention progress, elapsed time, or duration.',
    ];
  }

  return [];
}

function speechIsValid(speech, route = {}, toolResult = {}) {
  if (!speech) return false;
  const intent = route.intent;
  const data = toolResult.data || {};

  if (intent === 'SHOW_WEATHER' && data.weather) {
    const high = data.weather.forecast?.[0]?.high;
    const low = data.weather.forecast?.[0]?.low;
    if (high !== undefined && !speech.includes(String(high))) return false;
    if (low !== undefined && !speech.includes(String(low))) return false;
    if (data.weather.temperature !== undefined && !speech.includes(String(data.weather.temperature))) return false;
  }

  if ((intent === 'SHOW_SPOTIFY' || intent === 'SPOTIFY_NEXT' || intent === 'SPOTIFY_PREVIOUS') && /\b(progress|elapsed|duration|\d+:\d+)\b/i.test(speech)) {
    return false;
  }

  return true;
}

export function appendHistory(history, userInput, speech, maxTurns = Number(process.env.VOICE_CHAT_HISTORY_TURNS || 8)) {
  const next = [...history, { role: 'user', content: userInput }, { role: 'assistant', content: speech }];
  return next.slice(Math.max(0, next.length - maxTurns * 2));
}

function historyToMessages(history = []) {
  return history
    .filter((entry) => entry?.role && typeof entry.content === 'string')
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content,
    }));
}

function cleanSpeech(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

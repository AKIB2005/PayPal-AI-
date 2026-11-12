import { defaultStage } from './policy.js';
import { template, reasoningFor } from './templates.js';

async function postJson(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function callClaude({ system, user }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const data = await postJson('https://api.anthropic.com/v1/messages',
    { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    { model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 800, system, messages: [{ role: 'user', content: user }] });
  return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function callGemini({ system, user }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { 'x-goog-api-key': key },
    { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json' } });
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

// Offline provider so the UI can be built and demoed with no API key.
async function callMock({ policy }) {
  const stage = defaultStage(policy);
  const t = template(stage);
  return JSON.stringify({ stage, reasoning: reasoningFor(policy, stage), subject: t.subject, body: t.body });
}

export async function callLLM(provider, payload) {
  switch (provider) {
    case 'claude': return callClaude(payload);
    case 'gemini': return callGemini(payload);
    case 'mock': return callMock(payload);
    default: throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

export function parseLLMJson(raw) {
  const s = String(raw).replace(/```json|```/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('No JSON object in LLM output');
  return JSON.parse(s.slice(a, b + 1));
}

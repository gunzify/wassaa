/**
 * Optional AI replies for persona threads.
 *
 * Off unless the deployment sets `AI_API_KEY`. Any OpenAI-compatible chat
 * endpoint works (OpenRouter, Groq, Together, DeepSeek, a local llama.cpp
 * server) — set `AI_API_URL` and `AI_MODEL` to match. When the key is missing,
 * the request fails, or the model returns something unusable, the caller falls
 * back to the persona's own scripts, so a persona always answers.
 *
 * The prompt carries both profiles plus the live thread, and asks for a reply
 * written for *this* conversation. That is what keeps two personas from
 * sending the same line to two different members.
 */
type Row = Record<string, any>;

const DEFAULT_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const TIMEOUT_MS = 9000;
const MAX_HISTORY = 12;

export function aiConfigured(): boolean {
  return Boolean((Deno.env.get('AI_API_KEY') || '').trim());
}

function env(name: string, fallback: string): string {
  const value = (Deno.env.get(name) || '').trim();
  return value || fallback;
}

function first(value: unknown): string {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

function personLine(row: Row | null, isNpc: boolean): string {
  if (!row) return isNpc ? 'You.' : 'The member.';
  const bits: string[] = [];
  const push = (label: string, value: unknown) => {
    const text = String(value || '').trim();
    if (text) bits.push(`${label}: ${text}`);
  };
  push('name', first(row.name));
  push('city', row.city);
  push('job', row.profession_title || row.skill);
  push('service', row.service || row.class_of_service);
  if (Array.isArray(row.interests) && row.interests.length) push('interests', row.interests.slice(0, 4).join(', '));
  push('bio', String(row.bio || '').slice(0, 240));
  return bits.join(' | ');
}

function systemPrompt(npc: Row, member: Row | null): string {
  const persona = (npc.npc && typeof npc.npc === 'object' ? npc.npc : {}) as Row;
  const voice = String(persona.voice || '').trim();
  return [
    `You are writing one chat message as ${first(npc.name) || 'a member'} on WASSAA, a Nigerian dating app for uniformed and civilian professionals.`,
    `You: ${personLine(npc, true)}.`,
    `The person you are chatting with: ${personLine(member, false)}.`,
    voice ? `Voice: ${voice}` : '',
    'Rules:',
    '- Write like a real person texting, not like an assistant. 1-2 short sentences, max 240 characters.',
    '- Warm, specific, curious. Ask at most one question, and only sometimes.',
    '- Refer to what they actually said or to their profile; never a generic opener.',
    '- Never mention AI, models, prompts, or that you are a persona.',
    '- Never invent facts about your day, job, or location beyond the profile above.',
    '- Never repeat a line already used in this conversation.',
    '- Do not use quotation marks around the whole reply. No emoji spam (at most one).'
  ].filter(Boolean).join('\n');
}

function historyPrompt(history: Row[], npcId: string): string {
  const tail = history.slice(-MAX_HISTORY);
  if (!tail.length) return 'The conversation is empty. Write the opening message.';
  return 'Conversation so far (oldest first):\n' + tail.map((m) => {
    const who = m.sender_id === npcId ? first(m.name) || 'You' : 'Them';
    const body = String(m.text || m.caption || (m.kind === 'photo' ? '[sent a photo]' : '')).replace(/\s+/g, ' ').slice(0, 300);
    return `${who}: ${body}`;
  }).join('\n') + '\n\nWrite the next message from you.';
}

/** Returns a reply, or null when AI is off/unavailable. Never throws. */
export async function aiReply(input: {
  npc: Row;
  member: Row | null;
  history: Row[];
  intent?: string;
}): Promise<string | null> {
  const key = env('AI_API_KEY', '');
  if (!key) return null;
  const base = env('AI_API_URL', DEFAULT_BASE).replace(/\/+$/, '');
  const model = env('AI_MODEL', DEFAULT_MODEL);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': 'https://wassaa.vercel.app',
        'X-Title': 'WASSAA'
      },
      body: JSON.stringify({
        model,
        temperature: 0.95,
        top_p: 0.95,
        max_tokens: 120,
        presence_penalty: 0.6,
        frequency_penalty: 0.5,
        messages: [
          { role: 'system', content: systemPrompt(input.npc, input.member) },
          { role: 'user', content: historyPrompt(input.history, String(input.npc.id)) }
        ]
      })
    });
    if (!response.ok) {
      console.error('[wassaa-ai] provider rejected the request', { status: response.status });
      return null;
    }
    const payload = await response.json() as Row;
    const raw = payload?.choices?.[0]?.message?.content;
    const text = String(raw || '')
      .replace(/^\s*["'“”](.*)["'“”]\s*$/s, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text.length < 2 || text.length > 600) return null;
    return text;
  } catch (e) {
    console.error('[wassaa-ai] request failed', { message: e instanceof Error ? e.message : 'unknown' });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

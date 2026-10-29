/**
 * NPC conversation content + intent rules. Pure data/functions, no I/O.
 * Used by npc.ts (the reply engine). Profile-generation pools for seeding live
 * in scripts/npc-corpus.mjs — message pools live here because Edge Functions
 * only bundle the functions/ directory.
 */

export const GREETINGS = [
  'Hey {you} \u{1F60A} glad we matched. How is your week going?',
  'Hi {you}! Your profile made me smile. What are you up to today?',
  'Hello {you} — I have been meaning to ask, what do you do for fun in {city}?',
  'Hey there. You look like someone worth a proper conversation. How was your day?',
  'Hi {you}! Two things: hello, and what is that thing you could talk about for hours?',
  'Good evening {you}. I am {me}, {skill} in {city}. Tell me one thing about you.',
  'Hey {you} — be honest, what made you swipe right on me?',
  'Hello! I was going to write something clever, but hi works. How is your day treating you?',
  'Hi {you} \u{1F44B} I like your energy. What does a typical Saturday look like for you?',
  'Hey — matched and curious. What are you looking for on here, honestly?',
];

export const REPLIES: Record<string, string[]> = {
  greeting: [
    'Hey {you} — good to hear from you. How has your day been treating you?',
    'Hi again \u{1F60A} I was hoping you would text. What kept you busy today?',
    'Hello {you}! So, now that we are talking — what made you match with me?',
    'Hey! I am {me}, {skill} in {city}. What should I know about you?',
    'You are awake — good. Tell me something interesting about your day.',
    'Hi {you}. Fair warning: I ask great questions. What is your biggest dream right now?',
  ],
  smalltalk: [
    'Honestly? Same here. {city} has a way of keeping you on your toes.',
    'That is the {city} life for you \u{1F604} what would you rather be doing instead?',
    'You know what, I believe that. What got you into it in the first place?',
    'See, this is why I swiped — you are easy to talk to. What is next for you?',
    'Interesting… go on, I am listening. What happened then?',
    'Ha! You are funny. I like that. What else is on your mind tonight?',
    'That sounds like a good day. Mine involved too much {skill} talk and not enough {interest}.',
  ],
  questions: [
    'Good question — I would say consistency over grand gestures, always. Your turn?',
    'Me? {skill} by day, professional {interest} fan by night. And you, what is your story?',
    'I would say someone who communicates is already halfway to my heart. What about you?',
    'Depends on the day — but usually {interest} and good company. What does your ideal day look like?',
    'Honestly, I am still figuring that out. It is more fun with the right person though. What are you looking for?',
    'I will answer properly if you promise to take me on a date first \u{1F60C} fair?',
  ],
  compliment: [
    'Stop it — you are going to make me blush over here \u{1F60A} you are not so bad yourself.',
    'That is the sweetest thing I have read all week. You have a way with words, {you}.',
    'Wow… okay, you are dangerous. In a good way. What else do you say like that?',
    'I like you too — and I am told I have good taste. What first caught your eye?',
    'You are making it very hard to play it cool right now \u{1F604}',
  ],
  logistics: [
    'I would love that — {city} has this quiet spot I keep meaning to try. When are you free?',
    'Yes! Weekends work best for me. What part of {city} is easiest for you?',
    'I am free most evenings after work. Pick a day and I will make it happen.',
    'Now you are speaking my language. What do you suggest — food, a walk, or something braver?',
    'I like a planner \u{1F60A} how about somewhere low-key this weekend?',
  ],
  farewell: [
    'Talk later, {you} — sleep well and text me tomorrow?',
    'Alright \u{1F60A} goodnight! I will be here when you are free.',
    'Going already? Fine — but you owe me a full conversation tomorrow.',
    'Goodnight {you}. Thanks for making my evening better.',
  ],
  offTopic: [
    'Haha okay you lost me — but I like your style. Give me the context version?',
    'That is a new one \u{1F604} tell me more, I am curious now.',
    'Interesting… I did not expect that. What made you think of it?',
    'You keep me on my toes, {you}. So what are you really trying to say?',
    'I will take your word for it \u{1F60C} so, back to the important things — when are we meeting?',
  ],
};

const FAREWELL = /\b(bye|good ?night|gn|gotta go|got to go|talk later|see ya|cya|sleep well|going now|off to sleep)\b/i;
const GREETING_START = /^\s*(hi|hello|hey|yo|hiya|howdy|good (morning|afternoon|evening)|what'?s up|sup|how are you|how do you do)\b/i;
const LOGISTICS = /\b(meet|meeting|hangout|hang out|date|venue|dinner|lunch|coffee|drinks|tonight|tomorrow|this weekend|come over|where do you|which day|what time|are you free|free on)\b/i;
const COMPLIMENT = /\b(beautiful|handsome|gorgeous|cute|pretty|amazing|lovely|hot|fine|sweet|love your|i like you|you are special)\b/i;
const QUESTION = /\?|^\s*(what|when|where|who|why|how|are you|do you|did you|can you|could you|would you|will you|is it|have you|tell me|whats your|what'?s your)\b/i;

/** Intent buckets map 1:1 onto REPLIES keys; offTopic is the fallback. */
export type Intent = keyof typeof REPLIES | string;

export function classifyIntent(raw: string): Intent {
  const text = (raw || '').trim();
  const words = text ? text.split(/\s+/).length : 0;
  if (FAREWELL.test(text)) return 'farewell';
  if (GREETING_START.test(text) && words <= 20) return 'greeting';
  if (LOGISTICS.test(text)) return 'logistics';
  if (COMPLIMENT.test(text)) return 'compliment';
  if (QUESTION.test(text)) return 'questions';
  if (words === 0) return 'offTopic';
  return 'smalltalk';
}

export interface PersonaContext {
  you: string;   // first name of the human
  me: string;    // first name of the NPC
  city: string;
  skill: string;
  interest: string;
}

export function fill(template: string, ctx: PersonaContext): string {
  return template
    .replace(/\{you\}/g, ctx.you)
    .replace(/\{me\}/g, ctx.me)
    .replace(/\{city\}/g, ctx.city)
    .replace(/\{skill\}/g, ctx.skill)
    .replace(/\{interest\}/g, ctx.interest);
}

function pickFrom<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

export function pickGreeting(ctx: PersonaContext, rng: () => number = Math.random): string {
  return fill(pickFrom(rng, GREETINGS), ctx);
}

export function pickReply(intent: Intent, ctx: PersonaContext, rng: () => number = Math.random): string {
  const pool = REPLIES[intent] && REPLIES[intent].length ? REPLIES[intent] : REPLIES.offTopic;
  return fill(pickFrom(rng, pool), ctx);
}

export function buildContext(humanName: string, npc: { name?: string; city?: string; skill?: string; professionTitle?: string; interests?: string[] }): PersonaContext {
  const first = (humanName || 'there').trim().split(/\s+/)[0] || 'there';
  const me = (npc.name || 'me').trim().split(/\s+/)[0] || 'me';
  const interest = (npc.interests && npc.interests.length ? npc.interests[0] : 'music');
  return { you: first, me, city: npc.city || 'Lagos', skill: npc.skill || npc.professionTitle || 'this', interest };
}

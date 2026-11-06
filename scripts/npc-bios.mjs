/**
 * Creative bio + prompt engine for personas.
 *
 * The old deck repeated one of twelve templates, which produced the "born and
 * raised in {city}" / "isale eko" sameness the owner flagged. A bio here is
 * composed from four independent pools — voice, work, personal, intent — so the
 * number of distinct combinations runs into the hundreds of thousands, and no
 * template ever mentions a birthplace.
 */

const pickOne = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/** Lowercase a job title mid-sentence but keep acronyms ("Cybercrime / IT"). */
export function lowerTitle(value) {
  return String(value)
    .split(/(\s+|\/|-)/)
    .map((token) => (/^[A-Z]{2,}$/.test(token) ? token : token.toLowerCase()))
    .join('');
}

/** Capitalise the first letter of a sentence. */
export function capFirst(text) {
  return String(text).replace(/^(\s*)([a-z])/, (_, space, letter) => space + letter.toUpperCase());
}

function fill(template, slots) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = slots[key];
    return value == null || value === '' ? '' : String(value);
  });
}

export const HOOKS = [
  'I am the friend who books the trip and then forgets the charger.',
  'My camera roll is 40% sunsets, 60% my dog.',
  'I can cook exactly four things well and I will defend all four.',
  'Quietly competitive. Do not challenge me to a board game unless you mean it.',
  'I read the menu online before we go. It is a personality trait.',
  'The plan is usually: good food, a long walk, terrible singing in the car.',
  'I have a strong opinion about coffee and I am willing to share it.',
  'Weekend mornings are sacred: coffee, music, no plans.',
  'I am the person who remembers your order and your birthday.',
  'I talk to dogs I meet on the street. They seem fine with it.',
  'My idea of luxury is a free Saturday and a full fridge.',
  'I laugh at my own jokes first. It saves time.',
  'I will absolutely cry at the end of a good film.',
  'I am late to every trend and early to every airport.',
  'I fix things. Furniture, plans, moods. Not always in that order.',
  'I give excellent advice and take almost none of it.',
  'I like my music loud and my Sundays slow.',
  'I live five minutes from the water and I still drive there.',
  'I keep a running list of places to eat. It is longer than my to-do list.',
  'I am not a morning person, but I make a serious breakfast.',
  'I know every shortcut in this city and most of them are wrong.',
  'I will beat you at trivia and buy you a drink after.',
  'I believe in small kindnesses and big breakfasts.',
  'My plants are alive. That is the whole update.',
  'I dance badly and often.',
  'I am the calm one in an emergency and a mess at birthday parties.',
  'I collect hobbies like other people collect regrets.',
  'I am good at starting conversations and terrible at ending them.',
  'I have a favourite bench in the park. We can go.',
  'I am here because my friends said I should be. They were right.',
  'I make playlists for every mood, including the boring ones.',
  'I will remember the name of your childhood pet.',
  'I like people who are kind to waiters.',
  'I have a plan for everything except dinner.',
  'I am learning to slow down. Ask me how that is going.',
  'I am better in person than over text. Most people are.',
  'I own more books than I have finished. I am working on it.',
  'I will show up on time and leave with a story.',
  'I have a soft spot for small towns and big cities.',
  'I am the one who takes the photos nobody asked for.',
];

export const SERVICE_LINES = [
  '{years} years in the {service}, mostly in {skill}. It taught me to be early, calm, and very good at packing.',
  'The {service} has me in {skill}. I have worked more night shifts than I can count and I still like people.',
  'I work in {skill} for the {service}. The job is serious; I am not.',
  '{years} years in the {service}. I have seen more of the world than my camera roll proves.',
  'I serve in the {service}, working in {skill}. Home is wherever the coffee is decent.',
  'I joined the {service} young and I can still iron a shirt in the dark.',
  'I handle {skill} for the {service}. My friends think I am disciplined; my laundry disagrees.',
  'I work in {skill} for the {service}. I am very good in a crisis and useless at small talk.',
  'The {service} put me to work in {skill}. I have learned that the best people are the ones who show up on time.',
  'I have spent {years} years in the {service}, mostly in {skill} — still not tired of it.',
  'The {service} took me to places I never planned to live. I would do it again.',
  'I am the one everyone calls when the plan falls apart. {years} years in {skill} with the {service} trained me well.',
  '{years} years in {skill} with the {service}. I can sleep anywhere and eat fast.',
  'I serve in the {service}. The uniform comes off at the door; the manners stay.',
  '{skill} with the {service}: I keep a work voice and a real voice, and you will get the real one.',
  '{years} years with the {service}, working in {skill}. I have heard every excuse twice.',
  '{skill} with the {service}. I am calmer than I look and funnier than I sound.',
  'I work in {skill} for the {service}. The job makes you a good listener.',
  '{years} years in the {service}. I know this city better than my own neighbourhood.',
  '{skill} in the {service}. I take the work seriously and myself less so.',
  '{skill} in the {service}. I spend my days keeping things running and my evenings doing the same.',
  '{years} years with the {service}, mostly in {skill}. It is not glamorous, but it matters.',
  'I work in {skill} for the {service}. I am the person who reads the instructions.',
];

export const CIVILIAN_LINES = [
  '{a} {skill} in {city}. I like my work and I like leaving it at the door.',
  'I pay the bills as {a} {skill}. It covers the travel and the coffee.',  '{skill} by trade, {interest1} enthusiast by choice.',
  '{a} {skill} — and I cook badly for fun.',
  '{skill}, {city}. I am better at my job than at parallel parking.',
  'I make my living as {a} {skill} and keep my sanity with {interest1}.',
  'I have been {a} {skill} for {years} years. Still learning, which is the fun part.',
  '{skill} by day. Ask me what I do after 6pm.',
];

export const PERSONAL_LINES = [
  'Weekends are for {interest1}, {interest2}, and {food} in {city}.',
  'You will find me at {place} most Saturdays.',
  'I am slowly working my way through {food} in {city}, one weekend at a time.',
  'My perfect Sunday: {interest1}, a long walk, and nowhere to be.',
  'I have a soft spot for {interest1} and a hard rule about bad coffee.',
  'Ask me about {interest1} and I will not stop.',
  'I spend too much on {interest1} and not enough on {interest2}.',
  '{interest1} keeps me sane; {interest2} keeps me humble.',
  'I am trying to read more, scroll less, and cook something new each week.',
  'I know a place in {city} that does {food} right. It is not fancy. It is perfect.',
  'My friends would describe me as the one who plans the {interest1} trips.',
  'I will drive an hour for {food} and complain about the traffic the whole way.',
  'Give me {interest1}, a good playlist, and a free afternoon.',
  'I am the person who brings snacks to everything.',
  'I like {place} when it is quiet and the city when it is not.',
  'Most weekends I am either at {place} or planning to be.',
  'I have a standing {interest1} date with my friends and I take it seriously.',
  'A good week has {habit} in it and at least one slow morning.',
  'I will always say yes to {food} and a long conversation.',
  'I am a terrible singer with excellent taste in music.',
];

export const INTENT_LINES = [
  'Looking for something real — the kind that survives a bad week.',
  'Not here for a pen pal. Show me you can hold a conversation.',
  'I want the slow build: friendship first, then something worth keeping.',
  'If you are kind, curious, and can laugh at yourself, we will get along.',
  'I am done with situationships. I would like a partner, not a plot twist.',
  'Let us start with coffee and see if we can talk for three hours.',
  'I am looking for someone to build a quiet, good life with.',
  'I do not need perfect. I need honest, consistent, and a little bit funny.',
  'Tell me what you are passionate about and I will listen properly.',
  'I am here for the long version, not the highlight reel.',
  'Looking for someone who is good company on a Tuesday, not just a Saturday night.',
  'I want someone to share the ordinary stuff with — groceries, bad TV, good news.',
  'No games, no guessing. Just two adults figuring it out.',
  'I am open to whatever is honest. Start there.',
  'I would rather have one real conversation than fifty matches.',
  'If we can be boring together, we can be anything together.',
  'Looking for my favourite person, not my entire personality.',
  'I am ready for something serious, but I am not in a rush to pretend.',
  'Show me your weird hobby. I will show you mine.',
  'I like direct people. Tell me what you want.',
  'I am not looking for a rescue or a project. Just a good teammate.',
  'Chemistry matters. So does kindness. I am checking for both.',
];

export const PROMPT_POOL = [
  { q: 'A perfect weekend', a: '{interest1}, {food}, and a long lie-in.' },
  { q: 'I am weirdly good at', a: 'Remembering song lyrics from a decade ago.' },
  { q: 'My love language', a: 'Consistency. And {interest1}.' },
  { q: 'Green flag', a: 'Someone who texts back and plans ahead.' },
  { q: 'Unpopular opinion', a: 'Pineapple belongs on pizza. I said what I said.' },
  { q: 'The way to my heart', a: 'Good coffee and better conversation.' },
  { q: 'My most controversial take', a: 'The book is usually better, but the film is faster.' },
  { q: 'Best trip I have taken', a: '{place}, with no plan and a full tank.' },
  { q: 'I geek out about', a: '{interest1}. Ask me anything.' },
  { q: 'A fact about me', a: 'I have been to {city} more times than I can count.' },
  { q: 'My ideal first date', a: 'Something with walking and talking. {food} optional but encouraged.' },
  { q: 'I am looking for', a: 'Someone kind, curious, and a little bit ridiculous.' },
  { q: 'My Sunday routine', a: 'Coffee, {interest1}, and pretending Monday is far away.' },
  { q: 'I will never say no to', a: '{food}, especially if someone else is cooking.' },
  { q: 'The last thing that made me laugh', a: 'My own attempt at {interest1}.' },
  { q: 'My hidden talent', a: 'I can fix most things with a video tutorial and stubbornness.' },
  { q: 'What I am learning', a: 'How to be present. It is harder than it sounds.' },
  { q: 'My friends say I am', a: 'The one who always has a plan. They are not wrong.' },
  { q: 'A hill I will die on', a: 'There is no such thing as too much {interest1}.' },
  { q: 'My comfort show', a: 'The one I have rewatched so many times I can quote it.' },
  { q: 'How I recharge', a: 'A long walk, a good playlist, and no notifications.' },
  { q: 'The best gift I have received', a: 'A plane ticket I did not ask for.' },
  { q: 'My go-to karaoke song', a: 'Something I can only sing badly.' },
  { q: 'I am terrible at', a: 'Parallel parking. I have made peace with it.' },
  { q: 'My dream dinner guest', a: 'Someone funny, someone honest, someone who brings dessert.' },
  { q: 'The way I show I care', a: 'I remember the small things.' },
  { q: 'My biggest adventure', a: 'Saying yes to {service_phrase} when I had no idea what I was doing.' },
  { q: 'Two truths and a lie', a: 'I have met a president, I can juggle, and I sing in the shower.' },
  { q: 'The last thing I cooked', a: 'Something ambitious. The smoke alarm was supportive.' },
  { q: 'A small thing that makes me happy', a: 'Fresh sheets and an empty inbox.' },
];

/**
 * Compose a persona bio. `slots` must carry city, interest1, interest2, food,
 * place, habit and — for uniformed personas — service, skill, years.
 */
export function composeBio(rng, slots) {
  const parts = [];
  const used = new Set();
  const take = (pool) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const i = Math.floor(rng() * pool.length);
      if (!used.has(`${pool.length}:${i}`)) {
        used.add(`${pool.length}:${i}`);
        return capFirst(fill(pool[i], slots));
      }
    }
    return capFirst(fill(pool[Math.floor(rng() * pool.length)], slots));
  };

  if (rng() < 0.8) parts.push(take(HOOKS));
  parts.push(slots.service ? take(SERVICE_LINES) : take(CIVILIAN_LINES));
  parts.push(take(PERSONAL_LINES));
  parts.push(take(INTENT_LINES));

  let bio = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (bio.length > 980) bio = `${bio.slice(0, 977).trimEnd()}…`;
  return bio;
}

/** Compose n distinct prompt cards for a persona. */
export function composePrompts(rng, slots, n = 3) {
  const pool = PROMPT_POOL.map((p) => ({ q: p.q, a: capFirst(fill(p.a, slots)) }));
  const out = [];
  const used = new Set();
  while (out.length < Math.min(n, pool.length)) {
    const i = Math.floor(rng() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push({ id: String(out.length + 1), question: pool[i].q, answer: pool[i].a });
  }
  return out;
}

export { pickOne };

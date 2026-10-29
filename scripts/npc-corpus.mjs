/**
 * NPC content corpus — pure data, no side effects.
 *
 * Feeds two things:
 *   1. scripts/seed-npcs.mjs   — ~300 realistic Nigerian NPC profiles
 *   2. the NPC reply engine    — greeting + intent reply pools (server-side)
 *
 * Everything is template-based with {slot} placeholders the engine fills from
 * the persona (name, city, skill, interest). Keep pools gender-neutral unless
 * the template says otherwise.
 */

// ---------------------------------------------------------------- personas

// Nigerian naming is not a free-for-all: a tribal given name belongs to its
// own family-name pool. An English/Christian given name may take any Nigerian
// surname; a Yoruba, Igbo, Hausa, Tiv, Efik/Ibibio or Edo first name must take
// a surname from that same group. buildName() below is the only sanctioned
// way to compose a persona name.

export const GIVEN_NAMES = {
  yoruba: {
    male: [
      'Tunde', 'Femi', 'Segun', 'Adewale', 'Babatunde', 'Olumide', 'Gbenga',
      'Oluwaseun', 'Ayodele', 'Wale', 'Dele', 'Kunle', 'Tobi', 'Dapo', 'Tayo',
      'Kehinde', 'Rotimi', 'Akin', 'Bola', 'Yinka', 'Taiwo', 'Idowu', 'Bolaji',
      'Gbolahan', 'Ademola', 'Damilare', 'Akintunde', 'Oluwafemi', 'Tosin',
      'Ayo', 'Ladi',
    ],
    female: [
      'Funke', 'Bisi', 'Tolu', 'Folake', 'Yetunde', 'Titilayo', 'Bukola',
      'Ronke', 'Kemi', 'Bimpe', 'Ireti', 'Damola', 'Seyi', 'Olamide', 'Temi',
      'Ayomide', 'Nike', 'Sade', 'Yewande', 'Omotola', 'Bisola', 'Abike',
      'Morayo', 'Damilola', 'Similoluwa', 'Anjola', 'Tomi', 'Oluwakemi',
      'Tosin', 'Ladi',
    ],
  },
  igbo: {
    male: [
      'Emeka', 'Chidi', 'Obinna', 'Kelechi', 'Ifeanyi', 'Uche', 'Nnamdi',
      'Ikenna', 'Chukwuemeka', 'Chinedu', 'Arinze', 'Ekene', 'Somto',
      'Chibueze', 'Tobenna', 'Kenechukwu', 'Ikechukwu', 'Nnaemeka', 'Madu',
      'Okey', 'Chukwudi', 'Ndubuisi', 'Onyeka', 'Chima', 'Echezona', 'Obiora',
    ],
    female: [
      'Amaka', 'Chiamaka', 'Ngozi', 'Ada', 'Ebere', 'Ify', 'Nneka', 'Chinelo',
      'Uchenna', 'Nkeiruka', 'Adaeze', 'Chidinma', 'Nkechi', 'Amarachi',
      'Ifeoma', 'Oluchi', 'Chisom', 'Adaobi', 'Chinwe', 'Uzo', 'Ngozika',
      'Chinenye', 'Adaora', 'Somtochukwu',
    ],
  },
  hausa: {
    male: [
      'Ibrahim', 'Musa', 'Yusuf', 'Bashir', 'Sadiq', 'Suleiman', 'Abdulrahman',
      'Hamza', 'Ismaila', 'Murtala', 'Aliyu', 'Umar', 'Abubakar', 'Danladi',
      'Gambo', 'Nasiru', 'Sanusi', 'Aminu', 'Sani', 'Kabir', 'Haruna', 'Idris',
      'Salihu', 'Garba', 'Ahmad', 'Mustapha', 'Shehu', 'Umaru', 'Haliru',
    ],
    female: [
      'Aisha', 'Zainab', 'Halima', 'Amina', 'Fatima', 'Hauwa', 'Maryam', 'Mariam', 'Zara',
      'Hadiza', 'Bilkisu', 'Jamila', 'Rukayya', 'Safiya', 'Asmau', 'Hafsat',
      'Nabila', 'Sumayya', 'Fadila', 'Saudeen', 'Maimuna', 'Khadija', 'Rahma',
    ],
  },
  tiv: {
    male: [
      'Terna', 'Terhemba', 'Sesugh', 'Msughter', 'Aondoakaa', 'Sughter',
      'Kwaghdoo', 'Iorwuese', 'Aemberga', 'Torkuma', 'Fanen', 'Bem',
      'Iorhemba', 'Terseer',
    ],
    female: ['Dooshima', 'Mlumun', 'Iveren', 'Sewuese', 'Torkwase', 'Ngufan', 'Msurshima', 'Nguher'],
  },
  efik: {
    male: ['Ubong', 'Aniefiok', 'Nsikak', 'Etop', 'Iniobong', 'Edidiong', 'Mfon', 'Idongesit', 'Aniekan', 'Ikpe'],
    female: ['Emem', 'Idara', 'Ekaette', 'Itoro', 'Mfon', 'Edidiong', 'Idongesit', 'Ndifreke'],
  },
  edo: {
    male: ['Ehi', 'Osaze', 'Eghosa', 'Efosa', 'Osaro', 'Esosa', 'Eseosa', 'Uyi'],
    female: ['Ivie', 'Esohe', 'Itohan', 'Eghonghon', 'Uwa'],
  },
};

// Christian / English given names are used by every tribe, so any surname fits.
export const ENGLISH_GIVEN = {
  male: [
    'Emmanuel', 'Daniel', 'Samuel', 'Victor', 'Peter', 'Michael', 'John',
    'David', 'Joseph', 'Stephen', 'Paul', 'Andrew', 'Philip', 'Joshua',
    'Caleb', 'Felix', 'Kelvin', 'Kenneth', 'Godwin', 'Christian', 'Festus',
  ],
  female: [
    'Grace', 'Mercy', 'Precious', 'Peace', 'Joy', 'Faith', 'Hope', 'Esther',
    'Rebecca', 'Ruth', 'Naomi', 'Deborah', 'Gloria', 'Blessing', 'Jennifer',
    'Cynthia', 'Sandra', 'Vivian', 'Angela', 'Bridget', 'Comfort', 'Patience',
    'Charity', 'Rosemary',
  ],
};

export const FAMILY_NAMES = {
  yoruba: [
    'Adeyemi', 'Olawale', 'Ogundele', 'Fashola', 'Adeleke', 'Oyinlola',
    'Oyelaran', 'Ayorinde', 'Afolabi', 'Ojo', 'Bakare', 'Ogunleye', 'Ajayi',
    'Oladipo', 'Ogunbiyi', 'Oyelowo', 'Oladunni', 'Akinola', 'Olayinka',
    'Ogunbanjo', 'Oshodi', 'Adewumi', 'Balogun', 'Salami', 'Lawal', 'Azeez',
    'Ogunjobi', 'Adesanya', 'Ogunmola', 'Akande', 'Olaniyan', 'Odebunmi',
    'Fagbemi', 'Adegbite', 'Adebayo', 'Ogundana',
  ],
  igbo: [
    'Okafor', 'Nwosu', 'Eze', 'Chukwu', 'Obi', 'Okonkwo', 'Nwankwo',
    'Onwuemezie', 'Iheanacho', 'Nwachukwu', 'Ekwueme', 'Amadi', 'Nwadike',
    'Uzodinma', 'Okeke', 'Ogbonna', 'Anya', 'Nnaji', 'Umeh', 'Ezeani',
    'Nwobodo', 'Mba', 'Okoro', 'Ezeilo', 'Nwogu', 'Oguike', 'Obiora', 'Uche',
    'Chukwuma', 'Nwafor', 'Kalu',
  ],
  hausa: [
    'Bello', 'Sani', 'Aliyu', 'Umar', 'Shehu', 'Idris', 'Suleiman', 'Abubakar',
    'Garba', 'Sanusi', 'Adamu', 'Danjuma', 'Galadima', 'Tanko', 'Waziri',
    'Magaji', 'Bako', 'Dogo', 'Lawal', 'Musa', 'Yusuf', 'Ibrahim', 'Aminu',
    'Nasiru', 'Salihu', 'Haruna', 'Kabir', 'Mustapha', 'Ahmad', 'Umaru',
    'Gambo', 'Danladi', 'Sule', 'Haladu',
  ],
  tiv: ['Akume', 'Ortom', 'Iorapuu', 'Akaa', 'Ugbede', 'Ayua', 'Dzenda', 'Ahire', 'Terkura', 'Torkuma', 'Iorpuu', 'Agba', 'Tsenongo'],
  efik: ['Ekpo', 'Ekong', 'Etim', 'Bassey', 'Okon', 'Effiong', 'Ekanem', 'Udo', 'Akpan', 'Asuquo', 'Edet', 'Inyang', 'Umoren', 'Umoh'],
  edo: ['Eweka', 'Ogiemwonyi', 'Igbinedion', 'Obaseki', 'Egharevba', 'Oshodin', 'Aigbe', 'Ize-Iyamu', 'Ogbeide'],
  english: ['Peters', 'Wilson', 'Johnson', 'Adams', 'George', 'Thomas', 'Williams', 'Cole', 'Davies', 'Roberts', 'Edwards', 'Lawson', 'Macaulay', 'Thompson', 'Brown', 'Green'],
};

// Share of the deck per naming tradition.
const ORIGIN_MIX = [
  ['yoruba', 0.24],
  ['igbo', 0.24],
  ['hausa', 0.22],
  ['efik', 0.08],
  ['tiv', 0.06],
  ['edo', 0.05],
  ['english', 0.11],
];

const ALL_FAMILY_NAMES = Object.values(FAMILY_NAMES).flat();

// Surnames that shipped in the first deck but are not Nigerian family names
// (a town, a Cameroonian name, an unattributable coinage). `--fix-names`
// replaces these with a surname from the given name's own tradition.
export const RETIRED_FAMILY_NAMES = new Set(['arigidi', 'tiwah', 'mbaku']);

// Surfaced by the first deck's flat list: a surname used as a given name.
export const RETIRED_GIVEN_NAMES = new Set(['ekong']);

const GIVEN_INDEX = new Map();
for (const [origin, byGender] of Object.entries(GIVEN_NAMES)) {
  for (const names of Object.values(byGender)) {
    for (const name of names) GIVEN_INDEX.set(name.toLowerCase(), origin);
  }
}
const ENGLISH_INDEX = new Set([...ENGLISH_GIVEN.male, ...ENGLISH_GIVEN.female].map((n) => n.toLowerCase()));
const FAMILY_INDEX = new Map();
for (const [origin, names] of Object.entries(FAMILY_NAMES)) {
  for (const name of names) {
    const key = name.toLowerCase();
    if (!FAMILY_INDEX.has(key)) FAMILY_INDEX.set(key, new Set());
    FAMILY_INDEX.get(key).add(origin);
  }
}

/**
 * Compose a name that obeys Nigerian naming logic.
 * English first name → any surname; tribal first name → same-tribe surname.
 */
export function buildName(rng, gender) {
  const roll = rng();
  let acc = 0;
  let origin = ORIGIN_MIX[ORIGIN_MIX.length - 1][0];
  for (const [key, weight] of ORIGIN_MIX) {
    acc += weight;
    if (roll <= acc) { origin = key; break; }
  }
  if (origin === 'english') {
    const first = pick(rng, ENGLISH_GIVEN[gender]);
    let last = pick(rng, ALL_FAMILY_NAMES);
    if (last === first) last = pick(rng, ALL_FAMILY_NAMES);
    return `${first} ${last}`;
  }
  const first = pick(rng, GIVEN_NAMES[origin][gender]);
  const pool = FAMILY_NAMES[origin];
  let last = pick(rng, pool);
  if (last === first) last = pick(rng, pool);
  return `${first} ${last}`;
}

/** Tribe of a given name, 'english' for a Christian/English name, null if unknown. */
export function givenOriginOf(name) {
  const key = String(name || '').trim().toLowerCase();
  if (GIVEN_INDEX.has(key)) return GIVEN_INDEX.get(key);
  if (ENGLISH_INDEX.has(key)) return 'english';
  return null;
}

/** Every tradition whose surname pool contains this family name. */
export function familyOriginsOf(name) {
  return FAMILY_INDEX.get(String(name || '').trim().toLowerCase()) || new Set();
}

// city, state, lat, lng — coordinates are city-centre approximations
export const CITIES = [
  { city: 'Lekki', state: 'Lagos', lat: 6.4478, lng: 3.4723 },
  { city: 'Ikeja', state: 'Lagos', lat: 6.6018, lng: 3.3515 },
  { city: 'Yaba', state: 'Lagos', lat: 6.5095, lng: 3.3711 },
  { city: 'Surulere', state: 'Lagos', lat: 6.4969, lng: 3.3481 },
  { city: 'Ajah', state: 'Lagos', lat: 6.4667, lng: 3.5667 },
  { city: 'Ikorodu', state: 'Lagos', lat: 6.6194, lng: 3.5106 },
  { city: 'Victoria Island', state: 'Lagos', lat: 6.4281, lng: 3.4219 },
  { city: 'Abuja', state: 'FCT', lat: 9.0765, lng: 7.3986 },
  { city: 'Gwarinpa', state: 'FCT', lat: 9.1118, lng: 7.4165 },
  { city: 'Kubwa', state: 'FCT', lat: 9.1667, lng: 7.1667 },
  { city: 'Port Harcourt', state: 'Rivers', lat: 4.8156, lng: 7.0498 },
  { city: 'Woji', state: 'Rivers', lat: 4.8417, lng: 7.0519 },
  { city: 'Kano', state: 'Kano', lat: 12.0022, lng: 8.592 },
  { city: 'Ibadan', state: 'Oyo', lat: 7.3775, lng: 3.947 },
  { city: 'Enugu', state: 'Enugu', lat: 6.4584, lng: 7.5464 },
  { city: 'Abeokuta', state: 'Ogun', lat: 7.156, lng: 3.3464 },
  { city: 'Benin City', state: 'Edo', lat: 6.335, lng: 5.6037 },
  { city: 'Kaduna', state: 'Kaduna', lat: 10.5105, lng: 7.4165 },
  { city: 'Jos', state: 'Plateau', lat: 9.8965, lng: 8.8583 },
  { city: 'Uyo', state: 'Akwa Ibom', lat: 5.039, lng: 7.9473 },
];

// Skill pools per class_of_service (§18 taxonomy)
export const SKILLS = {
  military: [
    'Nursing / Medical', 'Engineering', 'Software / IT', 'Communications / Signals',
    'Logistics / Supply', 'Aviation', 'Legal / JAG', 'Education / Training',
    'Admin / Personnel', 'Armourer / Technical', 'Driver / Fleet', 'Environmental Health',
  ],
  police: [
    'Investigations', 'Forensics', 'Cybercrime / IT', 'Traffic / Road Safety',
    'Public Order', 'Nursing / Medical', 'Logistics / Supply', 'Legal / Prosecution',
    'Admin / Personnel', 'K9 / Tactical', 'Communications', 'Community Relations',
  ],
  paramilitary: [
    'Immigration / Border Ops', 'Customs / Trade', 'Correctional Services',
    'Fire / Rescue', 'Road Safety / FRSC', 'NSCDC / Security', 'Nursing / Medical',
    'Engineering', 'Software / IT', 'Logistics / Supply', 'Admin / Personnel', 'Legal',
  ],
  civilian: [
    'Software Engineer', 'Nurse', 'Doctor', 'Engineer', 'Architect', 'Accountant',
    'Banker', 'Teacher', 'Lawyer', 'Marketing', 'Data Analyst', 'Product Designer',
    'Pharmacist', 'Journalist', 'Entrepreneur', 'Farmer', 'Surveyor', 'Electro-technician',
    'Plumber', 'Chef', 'Sound Engineer', 'Civil Servant', 'Student', 'Real Estate',
  ],
};

export const INTERESTS = [
  'Football', 'Basketball', 'Fitness', 'Running', 'Swimming', 'Cooking', 'Travel',
  'Photography', 'Music', 'Afrobeats', 'Jazz', 'Nollywood', 'Reading', 'Poetry',
  'Chess', 'Board games', 'Church', 'Mosque', 'Volunteering', 'Dancing', 'Cycling',
  'Hiking', 'Anime', 'Podcasts', 'Fashion', 'Art', 'Driving', 'Boating', 'Gaming',
];

export const ROLES_BY_CLASS = {
  military: ['officer', 'soldier'],
  police: ['officer', 'soldier'],
  paramilitary: ['officer', 'soldier'],
  civilian: [],
};

// ------------------------------------------------------------------- bios

export const BIO_TEMPLATES = [
  '{skill} based in {city}. Calm, intentional, and genuinely looking for something real.',
  'Low-key {skill} who still believes in courtship. Sundays: {interest1} + jollof.',
  'Serving as a {role_label} — {skill}. I work hard, laugh harder, and I am done playing games.',
  '{city} born and raised. {skill} by day, {interest1} enthusiast by night.',
  'Introverted at first, unforgettable later. {skill}, {interest1}, and long drives.',
  'Looking for my person, not a pen pal. {skill} · {city} · ask me about {interest1}.',
  'Equal parts ambition and softness. {skill} with a weakness for {interest1}.',
  'The steady type. {skill} in {city}; I plan dates like I plan projects — properly.',
  'Faith, family, {interest1}. {skill} trying to be the best partner I can be.',
  'Sapiosexual with a soft spot for {interest1}. {skill} — let us skip the small talk.',
  'Here for marriage, not situationships. {skill}, {city}, {interest1} addict.',
  'I will remember your coffee order and your bad days. {skill} · big dreams · {interest1}.',
];

export const PROMPTS = [
  { q: 'A perfect weekend', a: 'Slow morning, {interest1}, and somewhere new by evening.' },
  { q: 'I am weirdly good at', a: 'Remembering song lyrics from 2009.' },
  { q: 'My love language', a: 'Consistency. And {interest1} tickets.' },
  { q: 'Green flag', a: 'Someone who texts back and plans ahead.' },
  { q: 'Unpopular opinion', a: 'Pounded yam beats swallow — I said what I said.' },
];

// ------------------------------------------------- real-member detail blocks
// Same value sets the member app writes, so a persona's profile detail is
// indistinguishable from a member's (and editable field-for-field in admin).
export const LIFESTYLE = {
  exercise: ['daily', 'frequently', 'occasionally', 'rarely'],
  drinking: ['never', 'socially', 'regularly'],
  smoking: ['never', 'never', 'socially'],
  pets: ['dogs', 'cats', 'both', 'none'],
};

export const FAITHS = ['Christian', 'Muslim', 'Christian', 'Muslim', 'Other', 'Prefer not to say'];
export const FAITH_IMPORTANCE = ['very_important', 'somewhat', 'very_important', 'not_important'];
export const FAMILY_PLANS = ['want_children', 'open_to_children', 'want_children', 'not_sure', 'have_children_want_more'];
export const PRONOUNS = { female: ['she/her'], male: ['he/him'] };

// --------------------------------------------------------------- seed only
// Message pools (greetings, intent replies) live server-side in
// supabase/functions/api/npc-content.ts — the Edge bundle only includes the
// functions directory, so pools must live there. This corpus feeds profile
// generation (scripts/seed-npcs.mjs) only.

/** Deterministic helper: pick with a seeded PRNG so QA fixtures repeat. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

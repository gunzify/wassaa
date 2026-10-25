import { Pool, types } from 'pg';

// DATE columns must round-trip as the text the user typed. node-postgres' default
// parser builds a JS Date at local midnight, which serialises as the previous day
// in UTC — a date of birth would show up one day early.
types.setTypeParser(1082, (value: string) => value);
import type {
  AdminAction,
  BlockRecord,
  CandidateFilters,
  ChatMessage,
  Match,
  MatchPreferences,
  OtpSession,
  Payment,
  PrivacySettings,
  Profile,
  SafetyReport,
  Swipe,
  VerificationSubmission
} from '../domain';
import type { Store } from '../store';;

const DEFAULT_PRIVACY: PrivacySettings = {
  serviceVisibility: 'matches',
  rankVisibility: 'private',
  verificationDisplay: 'badge',
  chatNotifications: true,
  twoFactorAuth: false,
  privateIntroductionOptIn: true
};

// Row shape mirrors backend/migrations/0001_init.sql
type ProfileRow = {
  id: string; phone: string; google_sub: string | null; google_email: string | null; name: string | null; birth_date: string | null; gender: string | null;
  pronouns: string | null; profession_category: string; profession_title: string | null; company_or_org: string | null;
  service: string | null; rank: string | null; duty_station: string | null; city: string; state: string; bio: string;
  photos: string[]; interests: string[]; dating_goal: string | null; match_preferences: MatchPreferences | null;
  tier: Profile['tier']; verification_status: Profile['verificationStatus']; verified_at: string | null; document_type: string | null;
  privacy: PrivacySettings | null; blocked_us: boolean; created_at: string; updated_at: string;
};

function rowToProfile(r: ProfileRow): Profile {
  return {
    id: r.id, phone: r.phone, googleSub: r.google_sub || undefined, googleEmail: r.google_email || undefined, name: r.name || 'New member',
    birthDate: r.birth_date || undefined, gender: (r.gender as Profile['gender']) || undefined, pronouns: r.pronouns || undefined,
    professionCategory: r.profession_category, professionTitle: r.profession_title || undefined, companyOrOrg: r.company_or_org || undefined,
    service: r.service || undefined, rank: r.rank || undefined, dutyStation: r.duty_station || undefined,
    city: r.city, state: r.state, bio: r.bio || '',
    photos: r.photos || [], interests: r.interests || [], datingGoal: r.dating_goal || undefined,
    matchPreferences: r.match_preferences || undefined,
    tier: r.tier, verificationStatus: r.verification_status,
    verifiedAt: r.verified_at || undefined, documentType: r.document_type || undefined,
    privacy: r.privacy || DEFAULT_PRIVACY, blockedUs: r.blocked_us,
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function rowToMessage(r: Record<string, unknown>): ChatMessage {
  const voiceDur = r.voice_duration as number | null;
  return {
    id: r.id as string,
    matchId: r.match_id as string,
    senderId: r.sender_id as string,
    kind: r.kind as ChatMessage['kind'],
    text: (r.text as string) || undefined,
    mediaUrl: (r.media_url as string) || undefined,
    caption: (r.caption as string) || undefined,
    voice: voiceDur != null
      ? { durationSeconds: voiceDur, durationLabel: `${Math.floor(voiceDur / 60)}:${String(voiceDur % 60).padStart(2, '0')}` }
      : undefined,
    createdAt: r.created_at as string
  };
}

function rowToSubmission(r: Record<string, unknown>): VerificationSubmission {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    documentType: r.document_type as string,
    documentNumberMasked: r.document_number_masked as string,
    idDocUrl: (r.id_doc_url as string) || undefined,
    selfieUrl: (r.selfie_url as string) || undefined,
    status: r.status as VerificationSubmission['status'],
    submittedAt: r.submitted_at as string,
    reviewedAt: (r.reviewed_at as string) || undefined,
    reviewedBy: (r.reviewed_by as string) || undefined,
    reviewNote: (r.review_note as string) || undefined
  };
}

function rowToReport(r: Record<string, unknown>): SafetyReport {
  return {
    id: r.id as string,
    reporterId: r.reporter_id as string,
    reportedUserId: r.reported_user_id as string,
    category: r.category as string,
    categoryLabel: r.category_label as string,
    details: r.details as string,
    serviceBranch: (r.service_branch as string) || undefined,
    alsoBlocked: Boolean(r.also_blocked),
    status: r.status as SafetyReport['status'],
    createdAt: r.created_at as string
  };
}

function rowToPayment(r: Record<string, unknown>): Payment {
  return {
    reference: r.reference as string,
    userId: r.user_id as string,
    planId: r.plan_id as string,
    amountKobo: Number(r.amount_kobo),
    currency: 'NGN',
    status: r.status as Payment['status'],
    createdAt: r.created_at as string,
    paidAt: (r.paid_at as string) || undefined,
    channel: (r.channel as string) || undefined
  };
}

export function getPgStore(url: string): Store {
  const pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    // A pooler can drop a connection mid-flight; without ceilings a request
    // would hang until the socket resets. Fail fast and let the client retry.
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  // A pooler (Supavisor) closes idle server connections; without this listener
  // pg emits the error on the pool, which is an unhandled 'error' event and
  // would terminate the process.
  pool.on('error', (err) => {
    console.error('[store] idle Postgres client error:', err.message);
  });
  const S2 = (v: string | undefined | null) => (v == null || v === '' ? null : v);

  return {
    async init(): Promise<void> {
      await pool.query('select 1');
    },

    // ---------- OTP ----------
    async createOtpSession(phone: string, code: string, ttlMs: number, now: number): Promise<OtpSession> {
      await pool.query(
        `insert into otp_sessions (phone, code, expires_at, attempts, last_request_at)
         values ($1,$2,$3,0,$4)
         on conflict (phone) do update set code=excluded.code, expires_at=excluded.expires_at, attempts=0, last_request_at=excluded.last_request_at`,
        [phone, code, new Date(now + ttlMs).toISOString(), new Date(now).toISOString()]
      );
      return { phone, code, expiresAt: now + ttlMs, attempts: 0, lastRequestId: now };
    },
    async getOtpSession(phone: string): Promise<OtpSession | null> {
      const { rows } = await pool.query(`select * from otp_sessions where phone=$1`, [phone]);
      const r = rows[0];
      if (!r) return null;
      return { phone: r.phone, code: r.code, expiresAt: new Date(r.expires_at).getTime(), attempts: r.attempts, lastRequestId: new Date(r.last_request_at).getTime() };
    },
    async updateOtpSession(phone: string, patch: Partial<OtpSession>): Promise<void> {
      if (patch.attempts != null) await pool.query(`update otp_sessions set attempts=$1 where phone=$2`, [patch.attempts, phone]);
      if (patch.expiresAt != null) await pool.query(`update otp_sessions set expires_at=$1 where phone=$2`, [new Date(patch.expiresAt).toISOString(), phone]);
    },
    async deleteOtpSession(phone: string): Promise<void> {
      await pool.query(`delete from otp_sessions where phone=$1`, [phone]);
    },

    // ---------- Profiles ----------
    async findProfileByPhone(phone: string): Promise<Profile | null> {
      const { rows } = await pool.query(`select * from profiles where phone=$1 and deleted_at is null`, [phone]);
      return rows[0] ? rowToProfile(rows[0] as ProfileRow) : null;
    },
    async findProfileByGoogleSub(googleSub: string): Promise<Profile | null> {
      const { rows } = await pool.query(`select * from profiles where google_sub=$1 and deleted_at is null`, [googleSub]);
      return rows[0] ? rowToProfile(rows[0] as ProfileRow) : null;
    },
    async linkGoogleIdentity(id: string, googleSub: string, email: string): Promise<boolean> {
      try {
        const result = await pool.query(
          `update profiles set google_sub=$2, google_email=$3, updated_at=now()
           where id=$1 and deleted_at is null and (google_sub is null or google_sub=$2)`,
          [id, googleSub, email]
        );
        return result.rowCount === 1;
      } catch (error) {
        if ((error as { code?: string }).code === '23505') return false;
        throw error;
      }
    },
    async createProfile(phone: string, name?: string): Promise<Profile> {
      const { rows } = await pool.query(
        `insert into profiles (id, phone, name, profession_category, city, state, bio, photos, interests, privacy)
         values (gen_random_uuid(), $1, $2, 'Others', '', '', '', '{}', '{}', $3) returning *`,
        [phone, S2(name), JSON.stringify(DEFAULT_PRIVACY)]
      );
      return rowToProfile(rows[0] as ProfileRow);
    },
    async getProfile(id: string): Promise<Profile | null> {
      const { rows } = await pool.query(`select * from profiles where id=$1 and deleted_at is null`, [id]);
      return rows[0] ? rowToProfile(rows[0] as ProfileRow) : null;
    },
    async updateProfile(id: string, patch: Partial<Profile>): Promise<Profile | null> {
      // Structural fields are never user-editable through this path
      const maps: [string, unknown][] = [];
      if (patch.name !== undefined) maps.push(['name', S2(patch.name)]);
      if (patch.birthDate !== undefined) maps.push(['birth_date', S2(patch.birthDate)]);
      if (patch.gender !== undefined) maps.push(['gender', S2(patch.gender)]);
      if (patch.pronouns !== undefined) maps.push(['pronouns', S2(patch.pronouns)]);
      if (patch.professionCategory !== undefined) maps.push(['profession_category', patch.professionCategory]);
      if (patch.professionTitle !== undefined) maps.push(['profession_title', S2(patch.professionTitle)]);
      if (patch.companyOrOrg !== undefined) maps.push(['company_or_org', S2(patch.companyOrOrg)]);
      if (patch.service !== undefined) maps.push(['service', S2(patch.service)]);
      if (patch.rank !== undefined) maps.push(['rank', S2(patch.rank)]);
      if (patch.dutyStation !== undefined) maps.push(['duty_station', S2(patch.dutyStation)]);
      if (patch.city !== undefined) maps.push(['city', patch.city]);
      if (patch.state !== undefined) maps.push(['state', patch.state]);
      if (patch.bio !== undefined) maps.push(['bio', patch.bio]);
      if (patch.photos !== undefined) maps.push(['photos', patch.photos]);
      if (patch.interests !== undefined) maps.push(['interests', patch.interests]);
      if (patch.datingGoal !== undefined) maps.push(['dating_goal', S2(patch.datingGoal)]);
      if (patch.matchPreferences !== undefined) maps.push(['match_preferences', JSON.stringify(patch.matchPreferences)]);
      if (!maps.length) return this.getProfile(id);
      const cols = maps.map((m, i) => `${m[0]} = $${i + 1}`);
      cols.push('updated_at = now()');
      const vals = maps.map((m) => m[1]);
      vals.push(id);
      const { rows } = await pool.query(`update profiles set ${cols.join(', ')} where id=$${vals.length} returning *`, vals);
      return rows[0] ? rowToProfile(rows[0] as ProfileRow) : null;
    },
    async softDeleteProfile(id: string): Promise<void> {
      await pool.query(`update profiles set deleted_at = now(), updated_at = now() where id = $1`, [id]);
    },
    async setVerificationStatus(id: string, status: Profile['verificationStatus'], verifiedAt?: string | null): Promise<void> {
      await pool.query(
        `update profiles set verification_status=$1, verified_at=$2, updated_at=now() where id=$3`,
        [status, verifiedAt ?? null, id]
      );
    },
    async setTier(id: string, tier: Profile['tier']): Promise<void> {
      await pool.query(`update profiles set tier = $1, updated_at = now() where id = $2`, [tier, id]);
    },
    async setPrivacy(id: string, privacy: PrivacySettings): Promise<void> {
      await pool.query(`update profiles set privacy=$1, updated_at=now() where id=$2`, [JSON.stringify(privacy), id]);
    },
    async setPreferences(id: string, prefs: MatchPreferences): Promise<void> {
      await pool.query(`update profiles set match_preferences=$1, updated_at=now() where id=$2`, [JSON.stringify(prefs), id]);
    },
    async listCandidates(filters: CandidateFilters): Promise<Profile[]> {
      const params: unknown[] = [];
      params.push(filters.excludeIds);
      const excludeIdx = params.length;
      params.push(filters.viewerId);
      const viewerIdx = params.length;
      const conds: string[] = [
        'p.deleted_at is null',
        'p.blocked_us = false',
        'cardinality(p.photos) > 0',
        `not (p.id::text = any($${excludeIdx}::text[]))`,
        `p.id <> $${viewerIdx}::uuid`,
        `not exists (select 1 from swipes s where s.from_user_id = $${viewerIdx} and s.to_user_id = p.id)`,
        `not exists (select 1 from blocks b where (b.blocker_id = p.id and b.blocked_id = $${viewerIdx}) or (b.blocker_id = $${viewerIdx} and b.blocked_id = p.id))`
      ];
      if (filters.profession && filters.profession !== 'All') {
        params.push(filters.profession);
        conds.push(`p.profession_category = $${params.length}`);
      }
      if (filters.service && filters.service !== 'All') {
        params.push(filters.service);
        conds.push(`p.service = $${params.length}`);
      }
      if (filters.city && filters.city !== 'All') {
        params.push(String(filters.city).toLowerCase());
        conds.push(`lower(p.city) = $${params.length}`);
      }
      if (filters.gender) {
        params.push(filters.gender);
        conds.push(`p.gender = $${params.length}`);
      }
      if (filters.minAge != null || filters.maxAge != null) {
        params.push(filters.maxAge ?? 150);
        conds.push(`p.birth_date <= (current_date - ($${params.length} || ' years')::interval)`); // maxAge filter
        params.push(filters.minAge ?? 18);
        conds.push(`p.birth_date >= (current_date - ($${params.length} || ' years')::interval)`); // minAge filter
      }
      params.push(filters.limit);
      const sql = `select p.* from profiles p where ${conds.join(' and ')} limit $${params.length}`;
      const { rows } = await pool.query(sql, params);
      return rows.map((r) => rowToProfile(r as ProfileRow));
    },

    // ---------- Swipes / matches ----------
    async listSwipedBy(userId: string): Promise<string[]> {
      const { rows } = await pool.query(`select to_user_id from swipes where from_user_id = $1`, [userId]);
      return [...new Set(rows.map((r) => r.to_user_id as string))];
    },
    async listLikesReceived(userId: string): Promise<string[]> {
      const { rows } = await pool.query(
        `select distinct from_user_id from swipes where to_user_id = $1 and kind <> 'pass'`,
        [userId]
      );
      return rows.map((r) => r.from_user_id as string);
    },
    async recordSwipe(swipe: Omit<Swipe, 'createdAt'>): Promise<void> {
      await pool.query(
        `insert into swipes (from_user_id, to_user_id, kind) values ($1,$2,$3) on conflict (from_user_id, to_user_id) do nothing`,
        [swipe.fromUserId, swipe.toUserId, swipe.kind]
      );
    },
    async recordLikeIfAllowed(input): Promise<'recorded' | 'already' | 'daily_limit' | 'super_limit'> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(`select id from profiles where id=$1 for update`, [input.fromUserId]);
        const existing = await client.query(`select 1 from swipes where from_user_id=$1 and to_user_id=$2`, [input.fromUserId, input.toUserId]);
        if (existing.rows.length) { await client.query('commit'); return 'already'; }
        if (Number.isFinite(input.dailyLimit)) {
          const dayStart = new Date(input.now);
          dayStart.setHours(0, 0, 0, 0);
          const used = await client.query(`select count(*)::int as n from swipes where from_user_id=$1 and kind <> 'pass' and created_at >= $2`, [input.fromUserId, dayStart.toISOString()]);
          if (used.rows[0].n >= input.dailyLimit) { await client.query('commit'); return 'daily_limit'; }
        }
        if (input.kind === 'super') {
          const used = await client.query(`select count(*)::int as n from swipes where from_user_id=$1 and kind='super' and created_at >= $2`, [input.fromUserId, new Date(input.now - 7 * 24 * 60 * 60 * 1000).toISOString()]);
          if (used.rows[0].n >= input.weeklySuperLikeLimit) { await client.query('commit'); return 'super_limit'; }
        }
        await client.query(`insert into swipes (from_user_id, to_user_id, kind) values ($1,$2,$3)`, [input.fromUserId, input.toUserId, input.kind]);
        await client.query('commit');
        return 'recorded';
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
    },
    async getSwipe(fromUserId: string, toUserId: string): Promise<Swipe | null> {
      const { rows } = await pool.query(`select * from swipes where from_user_id=$1 and to_user_id=$2`, [fromUserId, toUserId]);
      if (!rows[0]) return null;
      const r = rows[0];
      return { fromUserId: r.from_user_id, toUserId: r.to_user_id, kind: r.kind, createdAt: r.created_at };
    },
    async countLikesToday(userId: string, startOfDayMs: number): Promise<number> {
      const { rows } = await pool.query(
        `select count(*)::int as n from swipes where from_user_id=$1 and kind <> 'pass' and created_at >= $2`,
        [userId, new Date(startOfDayMs).toISOString()]
      );
      return rows[0].n;
    },
    async countSuperLikesSince(userId: string, sinceMs: number): Promise<number> {
      const { rows } = await pool.query(
        `select count(*)::int as n from swipes where from_user_id=$1 and kind='super' and created_at >= $2`,
        [userId, new Date(sinceMs).toISOString()]
      );
      return rows[0].n;
    },
    async findOrCreateMatch(a: string, b: string): Promise<Match | null> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const existing = await client.query(
          `select * from matches where (user_a=$1 and user_b=$2) or (user_a=$2 and user_b=$1)`,
          [a, b]
        );
        if (existing.rows[0]) {
          await client.query('commit');
          const m = existing.rows[0];
          return { id: m.id, userA: m.user_a, userB: m.user_b, createdAt: m.created_at };
        }
        const mutual = await client.query(
          `select 1 from swipes where from_user_id=$1 and to_user_id=$2 and kind <> 'pass'`,
          [b, a]
        );
        if (!mutual.rows[0]) {
          await client.query('commit');
          return null;
        }
        const [uA, uB] = [a, b].sort();
        const created = await client.query(
          `insert into matches (id, user_a, user_b) values (gen_random_uuid(), $1, $2)
           on conflict (user_a, user_b) do nothing returning *`,
          [uA, uB]
        );
        if (!created.rows[0]) {
          const raced = await client.query(
            `select * from matches where user_a=$1 and user_b=$2`,
            [uA, uB]
          );
          await client.query('commit');
          const m = raced.rows[0];
          return m ? { id: m.id, userA: m.user_a, userB: m.user_b, createdAt: m.created_at } : null;
        }
        const match = created.rows[0];
        const pn = await client.query(`select name from profiles where id=$1`, [a]);
        const partnerName = pn.rows[0]?.name || 'your match';
        await client.query(`insert into messages (match_id, sender_id, kind, text) values ($1,'system','system',$2)`, [
          match.id,
          `You matched! Be kind, be safe — say hello to ${partnerName}.`
        ]);
        await client.query('commit');
        return { id: match.id, userA: match.user_a, userB: match.user_b, createdAt: match.created_at };
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
    },
    async isMutualMatched(a: string, b: string): Promise<boolean> {
      const { rows } = await pool.query(`select 1 from matches where (user_a=$1 and user_b=$2) or (user_a=$2 and user_b=$1)`, [a, b]);
      return rows.length > 0;
    },
    async findExistingMatch(a: string, b: string): Promise<Match | null> {
      const { rows } = await pool.query(`select * from matches where (user_a=$1 and user_b=$2) or (user_a=$2 and user_b=$1)`, [a, b]);
      if (!rows[0]) return null;
      const m = rows[0];
      return { id: m.id, userA: m.user_a, userB: m.user_b, createdAt: m.created_at };
    },
    async getMatch(id: string): Promise<Match | null> {
      const { rows } = await pool.query(`select * from matches where id=$1`, [id]);
      if (!rows[0]) return null;
      const m = rows[0];
      return { id: m.id, userA: m.user_a, userB: m.user_b, createdAt: m.created_at };
    },
    async listMatches(userId: string, limit: number): Promise<{ match: Match; partner: Profile; unread: number; lastMessage: ChatMessage | null }[]> {
      // Two clean queries: aggregate per match, then hydrate partner profiles.
      const agg = await pool.query(
        `
        select m.id, m.user_a, m.user_b, m.created_at,
               case when m.user_a = $1::uuid then m.user_b else m.user_a end as partner_id,
               (select count(*) from messages u
                 where u.match_id = m.id
                   and u.sender_id = (case when m.user_a = $1::uuid then m.user_b else m.user_a end)::text
                   and u.kind <> 'system'
                   and u.created_at > coalesce(lr.last_read_at, m.created_at)) as unread,
               lm.last_id, lm.last_sender_id, lm.last_kind, lm.last_text, lm.last_media_url, lm.last_caption, lm.last_voice_duration, lm.last_created
        from matches m
        left join match_reads lr on lr.match_id = m.id and lr.user_id = $1::uuid
        left join lateral (
          select id as last_id, sender_id as last_sender_id, kind as last_kind, text as last_text,
                 media_url as last_media_url, caption as last_caption, voice_duration as last_voice_duration, created_at as last_created
          from messages ms where ms.match_id = m.id order by ms.created_at desc limit 1
        ) lm on true
        where m.user_a = $1::uuid or m.user_b = $1::uuid
        order by coalesce(lm.last_created, m.created_at) desc
        limit $2`,
        [userId, limit]
      );
      if (!agg.rows.length) return [];
      const partnerIds = [...new Set(agg.rows.map((r) => r.partner_id))];
      const profs = await pool.query(`select * from profiles where id = any($1::uuid[])`, [partnerIds]);
      const byId = new Map(profs.rows.map((r) => [r.id, r]));
      const out: { match: Match; partner: Profile; unread: number; lastMessage: ChatMessage | null }[] = [];
      for (const r of agg.rows) {
        const pr = byId.get(r.partner_id);
        if (!pr) continue; // partner deleted; skip match row
        out.push({
          match: { id: r.id, userA: r.user_a, userB: r.user_b, createdAt: r.created_at },
          partner: rowToProfile(pr as ProfileRow),
          unread: Number(r.unread),
          lastMessage: r.last_id != null
            ? rowToMessage({ id: r.last_id, match_id: r.id, sender_id: r.last_sender_id, kind: r.last_kind, text: r.last_text, media_url: r.last_media_url, caption: r.last_caption, voice_duration: r.last_voice_duration, created_at: r.last_created })
            : null
        });
      }
      return out;
    },

    // ---------- Chat ----------
    async appendMessage(msg: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
      const { rows } = await pool.query(
        `insert into messages (match_id, sender_id, kind, text, media_url, caption, voice_duration)
         values ($1,$2,$3,$4,$5,$6,$7) returning *`,
        [msg.matchId, msg.senderId, msg.kind, S2(msg.text), S2(msg.mediaUrl), S2(msg.caption), msg.voice?.durationSeconds ?? null]
      );
      return rowToMessage(rows[0]);
    },
    async getMessages(matchId: string, since?: string): Promise<ChatMessage[]> {
      const sql = since
        ? `select * from messages where match_id=$1 and created_at > $2 order by created_at asc limit 500`
        : `select * from messages where match_id=$1 order by created_at asc limit 500`;
      const { rows } = await pool.query(sql, since ? [matchId, since] : [matchId]);
      return rows.map((r) => rowToMessage(r));
    },
    async markRead(matchId: string, userId: string): Promise<void> {
      await pool.query(
        `insert into match_reads (user_id, match_id, last_read_at) values ($1,$2,now())
         on conflict (user_id, match_id) do update set last_read_at = excluded.last_read_at`,
        [userId, matchId]
      );
    },

    // ---------- Blocks ----------
    async block(blockerId: string, blockedId: string, reason?: string): Promise<void> {
      await pool.query(
        `insert into blocks (blocker_id, blocked_id, reason) values ($1,$2,$3) on conflict (blocker_id, blocked_id) do nothing`,
        [blockerId, blockedId, S2(reason)]
      );
    },
    async getBlock(blockerId: string, blockedId: string): Promise<BlockRecord | null> {
      const { rows } = await pool.query(`select * from blocks where blocker_id=$1 and blocked_id=$2`, [blockerId, blockedId]);
      if (!rows[0]) return null;
      const r = rows[0];
      return { id: String(r.id), blockerId: r.blocker_id, blockedId: r.blocked_id, reason: r.reason || undefined, createdAt: r.created_at };
    },
    async unblock(blockerId: string, blockedId: string): Promise<void> {
      await pool.query(`delete from blocks where blocker_id=$1 and blocked_id=$2`, [blockerId, blockedId]);
    },
    async listBlockedBy(blockerId: string): Promise<BlockRecord[]> {
      const { rows } = await pool.query(`select * from blocks where blocker_id=$1`, [blockerId]);
      return rows.map((r) => ({ id: String(r.id), blockerId: r.blocker_id, blockedId: r.blocked_id, reason: r.reason || undefined, createdAt: r.created_at }));
    },

    // ---------- Reports ----------
    async createReport(report: Omit<SafetyReport, 'id' | 'createdAt' | 'status'>): Promise<SafetyReport> {
      const { rows } = await pool.query(
        `insert into reports (reporter_id, reported_user_id, category, category_label, details, service_branch, also_blocked, status)
         values ($1,$2,$3,$4,$5,$6,$7,'pending_review') returning *`,
        [report.reporterId, report.reportedUserId, report.category, report.categoryLabel, report.details, S2(report.serviceBranch), report.alsoBlocked]
      );
      const r = rows[0];
      return {
        id: r.id, reporterId: r.reporter_id, reportedUserId: r.reported_user_id, category: r.category,
        categoryLabel: r.category_label, details: r.details, serviceBranch: r.service_branch || undefined,
        alsoBlocked: r.also_blocked, status: r.status, createdAt: r.created_at
      };
    },

    async listReports(status?: SafetyReport['status']): Promise<SafetyReport[]> {
      const { rows } = status
        ? await pool.query(`select * from reports where status=$1 order by created_at desc limit 200`, [status])
        : await pool.query(`select * from reports order by created_at desc limit 200`);
      return rows.map(rowToReport);
    },
    async getReport(id: string): Promise<SafetyReport | null> {
      const { rows } = await pool.query(`select * from reports where id=$1`, [id]);
      return rows[0] ? rowToReport(rows[0]) : null;
    },
    async updateReportStatus(id: string, status: SafetyReport['status']): Promise<SafetyReport | null> {
      const { rows } = await pool.query(`update reports set status=$1 where id=$2 returning *`, [status, id]);
      return rows[0] ? rowToReport(rows[0]) : null;
    },

    // ---------- Admin ----------
    async setUserBlocked(userId: string, blocked: boolean): Promise<void> {
      await pool.query(`update profiles set blocked_us=$1, updated_at=now() where id=$2`, [blocked, userId]);
    },
    async recordAdminAction(action: string, adminId: string, targetId?: string, detail?: Record<string, unknown>): Promise<void> {
      await pool.query(
        `insert into admin_audit (action, admin_id, target_id, detail) values ($1,$2,$3,$4)`,
        [action, adminId, S2(targetId), detail ? JSON.stringify(detail) : null]
      );
    },
    async listAdminActions(limit = 100): Promise<AdminAction[]> {
      const { rows } = await pool.query(`select * from admin_audit order by created_at desc limit $1`, [limit]);
      return rows.map((r) => ({
        id: String(r.id),
        adminId: r.admin_id,
        action: r.action,
        targetId: r.target_id || undefined,
        detail: (r.detail as Record<string, unknown> | null) || undefined,
        createdAt: r.created_at
      }));
    },
    async close(): Promise<void> {
      await pool.end();
    },

    // ---------- Verification submissions ----------
    async createVerificationSubmission(sub: Omit<VerificationSubmission, 'id' | 'submittedAt'>): Promise<VerificationSubmission> {
      const { rows } = await pool.query(
        `insert into verification_submissions (user_id, document_type, document_number_masked, id_doc_url, selfie_url, status)
         values ($1,$2,$3,$4,$5,'pending') returning *`,
        [sub.userId, sub.documentType, sub.documentNumberMasked, S2(sub.idDocUrl), S2(sub.selfieUrl)]
      );
      return rowToSubmission(rows[0]);
    },
    async getVerificationSubmission(id: string): Promise<VerificationSubmission | null> {
      const { rows } = await pool.query(`select * from verification_submissions where id=$1`, [id]);
      return rows[0] ? rowToSubmission(rows[0]) : null;
    },
    async listPendingVerifications(): Promise<VerificationSubmission[]> {
      const { rows } = await pool.query(`select * from verification_submissions where status='pending' order by submitted_at asc limit 200`);
      return rows.map(rowToSubmission);
    },
    async resolveVerificationSubmission(id: string, approve: boolean, adminId: string, note?: string): Promise<VerificationSubmission | null> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const { rows } = await client.query(
          `update verification_submissions set status=$1, reviewed_at=now(), reviewed_by=$2, review_note=$3
           where id=$4 and status='pending' returning *`,
          [approve ? 'verified' : 'rejected', adminId, S2(note), id]
        );
        if (!rows[0]) { await client.query('commit'); return null; }
        const sub = rowToSubmission(rows[0]);
        await client.query(
          `update profiles set verification_status=$1, verified_at=$2, updated_at=now() where id=$3`,
          [approve ? 'verified' : 'rejected', approve ? new Date().toISOString().slice(0, 10) : null, sub.userId]
        );
        // Zero-retention policy: purge binaries after decision
        await client.query(`update verification_submissions set id_doc_url=null, selfie_url=null where id=$1`, [id]);
        await client.query('commit');
        return sub;
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
    },

    // ---------- Payments ----------
    async createPayment(payment: Payment): Promise<void> {
      await pool.query(
        `insert into payments (reference, user_id, plan_id, amount_kobo, currency, status) values ($1,$2,$3,$4,$5,$6)
         on conflict (reference) do nothing`,
        [payment.reference, payment.userId, payment.planId, payment.amountKobo, payment.currency, payment.status]
      );
    },
    async getPayment(reference: string): Promise<Payment | null> {
      const { rows } = await pool.query(`select * from payments where reference=$1`, [reference]);
      return rows[0] ? rowToPayment(rows[0]) : null;
    },
    async resolvePayment(reference: string, status: 'success' | 'failed', meta?: { channel?: string }): Promise<Payment | null> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(
          `update payments set status=$1, channel=$2, paid_at = case when $1 = 'success' then now() else paid_at end
           where reference=$3 and status='pending'`,
          [status, S2(meta?.channel), reference]
        );
        const p = await client.query(`select * from payments where reference=$1`, [reference]);
        await client.query('commit');
        return p.rows[0] ? rowToPayment(p.rows[0]) : null;
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
    },
    async listPaymentsForUser(userId: string): Promise<Payment[]> {
      const { rows } = await pool.query(`select * from payments where user_id=$1 order by created_at desc limit 50`, [userId]);
      return rows.map(rowToPayment);
    }
  };
}

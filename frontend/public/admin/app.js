/* WASSAA integrity console — plain ES2020, no build step, no third-party code. */
(function () {
  'use strict';

  var API_ROOT = 'https://avlbsficfejvwokxkgyl.supabase.co/functions/v1/api';
  var state = { accessToken: '', refreshToken: '', expiresAt: 0, publishableKey: '', admin: '', tab: 'verifications', queue: [], reports: [], appeals: [], threads: [], npcs: [], audit: [], storage: false, npcOffset: 0, npcTotal: 0, overview: null, facets: null, staff: null, role: '', staffList: [] };

  var $ = function (sel) { return document.querySelector(sel); };
  var gate = $('#gate');
  var app = $('#app');
  var toastTimer = null;
  var TABS = ['verifications', 'reports', 'appeals', 'threads', 'npcs', 'audit', 'staff'];
  // Which rungs see which tab. Moderators get their desk only.
  var ADMIN_ONLY_TABS = ['verifications', 'reports', 'appeals', 'audit'];
  function isAdmin() { return state.role === 'owner' || state.role === 'admin'; }
  function can(capability) { return Boolean(state.staff && state.staff.capabilities && state.staff.capabilities[capability]); }

  // ---------- helpers ----------
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function toast(message, isError) {
    var el = $('#toast');
    el.textContent = message;
    el.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 3200);
  }

  function api(path, options) {
    var opts = options || {};
    return getAccessToken().then(function (token) { return fetch(API_ROOT + '/admin' + path, {
      method: opts.method || 'GET',
      headers: Object.assign(
        { apikey: state.publishableKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        opts.headers || {}
      ),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }); }).then(function (res) {
      if (res.status === 401) {
        lock();
        throw new Error('Admin session expired or access was revoked.');
      }
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) throw new Error(json.error || 'Request failed (' + res.status + ')');
        return json;
      });
    });
  }

  // ---------- overlay sheets (context review, editors, thread takeover) ----------
  function openSheet(title, bodyHtml) {
    var root = $('#overlay-root');
    root.innerHTML =
      '<div class="overlay" data-overlay>' +
        '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
          '<div class="sheet-head"><strong>' + esc(title) + '</strong>' +
            '<button class="btn ghost" type="button" data-close-sheet>Close</button></div>' +
          bodyHtml +
        '</div>' +
      '</div>';
    root.querySelector('[data-close-sheet]').addEventListener('click', closeSheet);
    root.querySelector('[data-overlay]').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeSheet(); });
    return root.querySelector('.sheet');
  }

  function closeSheet() { $('#overlay-root').replaceChildren(); }

  // ---------- gate ----------
  function unlock() {
    gate.classList.add('hidden');
    app.classList.remove('hidden');
    loadAll();
  }

  function lock() {
    if (state.accessToken) fetch('https://avlbsficfejvwokxkgyl.supabase.co/auth/v1/logout', { method: 'POST', headers: { apikey: state.publishableKey, Authorization: 'Bearer ' + state.accessToken } }).catch(function () {});
    sessionStorage.removeItem('wassaa.adminSession');
    state.accessToken = '';
    state.refreshToken = '';
    state.admin = '';
    state.staff = null;
    state.role = '';
    state.staffList = [];
    closeSheet();
    app.classList.add('hidden');
    gate.classList.remove('hidden');
    $('#google-admin-button').replaceChildren();
    initializeGoogle();
  }

  function onGoogleCredential(response, nonce) {
    var errorEl = $('#gate-error');
    errorEl.textContent = '';
    fetch('https://avlbsficfejvwokxkgyl.supabase.co/auth/v1/token?grant_type=id_token', {
      method: 'POST', headers: { apikey: state.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'google', id_token: response.credential, nonce: nonce })
    }).then(function (res) { return res.json().then(function (data) { if (!res.ok) throw new Error(data.msg || data.message || 'Google sign-in failed.'); return data; }); })
      .then(function (session) {
        state.accessToken = session.access_token;
        state.refreshToken = session.refresh_token;
        state.expiresAt = Date.now() + (Number(session.expires_in) || 3600) * 1000;
        state.admin = session.user && (session.user.email || session.user.id) || '';
        sessionStorage.setItem('wassaa.adminSession', JSON.stringify({ accessToken: state.accessToken, refreshToken: state.refreshToken, expiresAt: state.expiresAt }));
        return api('/session');
      }).then(unlock).catch(function (error) { state.accessToken = ''; state.refreshToken = ''; errorEl.textContent = error.message; });
  }

  function getAccessToken() {
    if (!state.accessToken) return Promise.reject(new Error('Sign in to continue.'));
    if (state.expiresAt > Date.now() + 60000) return Promise.resolve(state.accessToken);
    return fetch('https://avlbsficfejvwokxkgyl.supabase.co/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: state.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: state.refreshToken })
    }).then(function (res) { return res.json().then(function (data) { if (!res.ok) throw new Error('Admin session expired. Sign in again.'); return data; }); })
      .then(function (session) {
        state.accessToken = session.access_token; state.refreshToken = session.refresh_token;
        state.expiresAt = Date.now() + (Number(session.expires_in) || 3600) * 1000;
        sessionStorage.setItem('wassaa.adminSession', JSON.stringify({ accessToken: state.accessToken, refreshToken: state.refreshToken, expiresAt: state.expiresAt }));
        return state.accessToken;
      });
  }

  function initializeGoogle() {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
    fetch(API_ROOT + '/public-config').then(function (res) { return res.json(); }).then(async function (config) {
      if (!config.googleClientId) throw new Error('Google Sign-In is not configured.');
      state.publishableKey = config.publishableKey;
      var random = crypto.getRandomValues(new Uint8Array(32));
      var nonce = btoa(String.fromCharCode.apply(null, random)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      var digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)));
      var hashed = Array.from(digest).map(function (value) { return value.toString(16).padStart(2, '0'); }).join('');
      window.google.accounts.id.initialize({ client_id: config.googleClientId, nonce: hashed, use_fedcm_for_prompt: true, callback: function (response) { onGoogleCredential(response, nonce); } });
      window.google.accounts.id.renderButton($('#google-admin-button'), { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 300 });
    }).catch(function (error) { $('#gate-error').textContent = error.message; });
  }

  // ---------- theme (dark / light, persisted per browser) ----------
  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var btn = $('#theme');
    if (btn) {
      btn.textContent = dark ? 'Light mode' : 'Dark mode';
      btn.setAttribute('aria-pressed', String(dark));
    }
    try { localStorage.setItem('wassaa.adminTheme', dark ? 'dark' : 'light'); } catch (_) { /* storage disabled */ }
  }
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark');
  $('#theme').addEventListener('click', function () {
    applyTheme(document.documentElement.getAttribute('data-theme') !== 'dark');
  });

  $('#lock').addEventListener('click', lock);

  // ---------- tabs ----------
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var name = tab.getAttribute('data-tab');
      state.tab = name;
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
      TABS.forEach(function (panel) { $('#panel-' + panel).classList.toggle('hidden', panel !== name); });
      if (name === 'audit') loadAudit();
      if (name === 'appeals') loadAppeals();
      if (name === 'threads') loadThreads();
      if (name === 'npcs') loadNpcs(true);
      if (name === 'staff') loadStaff();
    });
  });

  $('#refresh').addEventListener('click', loadAll);
  $('#reports-filter').addEventListener('change', loadReports);
  $('#appeals-filter').addEventListener('change', loadAppeals);
  $('#threads-filter').addEventListener('change', loadThreads);
  $('#threads-paid').addEventListener('change', loadThreads);
  $('#npc-search-btn').addEventListener('click', function () { loadNpcs(true); });
  $('#npc-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') loadNpcs(true); });
  ['#npc-country', '#npc-class', '#npc-service', '#npc-gender', '#npc-active', '#npc-curated', '#npc-assigned'].forEach(function (sel) {
    $(sel).addEventListener('change', function () { loadNpcs(true); });
  });
  $('#npc-clear').addEventListener('click', function () {
    ['#npc-search', '#npc-country', '#npc-class', '#npc-service', '#npc-gender', '#npc-active', '#npc-curated', '#npc-assigned'].forEach(function (sel) { $(sel).value = ''; });
    loadNpcs(true);
  });
  $('#npc-more').addEventListener('click', function () { loadNpcs(false); });
  var staffAdd = $('#staff-add');
  if (staffAdd) staffAdd.addEventListener('click', addStaff);

  // ---------- loading ----------
  function loadAll() {
    // Session first: it decides which queues this account is allowed to load at
    // all, so a moderator never fires five admin-only requests that 403.
    loadSession().then(function () {
      applyRole();
      loadOverview();
      loadFacets();
      if (isAdmin()) {
        loadQueue();
        loadReports();
        loadAppeals();
        loadStaffDirectory();
        if (state.tab === 'audit') loadAudit();
        if (state.tab === 'staff') loadStaff();
      }
      loadThreads();
      if (state.tab === 'npcs') loadNpcs(true);
    });
  }

  // The console is one page with role-scoped tabs. Hiding a tab is a courtesy;
  // the Edge API enforces the same matrix on every call.
  function applyRole() {
    var admin = isAdmin();
    var owner = state.role === 'owner';
    TABS.forEach(function (name) {
      var tab = document.querySelector('.tab[data-tab="' + name + '"]');
      var panel = $('#panel-' + name);
      var visible = admin ? true : (name === 'threads' || name === 'npcs');
      if (tab) tab.classList.toggle('hidden', !visible);
      if (panel) panel.classList.toggle('hidden', !visible || name !== state.tab);
    });
    var chip = $('#role-chip');
    if (chip) {
      chip.textContent = state.staff ? state.staff.name + ' · ' + state.role : '';
      chip.className = 'flag' + (state.role === 'moderator' ? ' warn' : '');
    }
    var active = document.querySelector('.tab[data-tab="' + state.tab + '"]');
    if (!active || active.classList.contains('hidden')) {
      state.tab = admin ? 'verifications' : 'threads';
      document.querySelectorAll('.tab').forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-tab') === state.tab);
      });
      TABS.forEach(function (n) {
        var panel = $('#panel-' + n);
        if (panel) panel.classList.toggle('hidden', n !== state.tab);
      });
    }
    var npcLabel = $('#npc-assigned');
    if (npcLabel) npcLabel.classList.toggle('hidden', !admin);
    if (state.role === 'moderator') {
      var hint = document.querySelector('#panel-npcs .hint');
      if (hint) hint.innerHTML = 'These are your personas. Open one to edit its profile, rewrite its lines or add a photo. An admin publishes it. <strong>Chats</strong> holds every thread on these personas; claim one before replying so two people never answer the same member.';
      var threadHint = document.querySelector('#panel-threads .hint');
      if (threadHint) threadHint.innerHTML = 'Every conversation on the personas assigned to you. A member with a “waiting for a reply” badge has spoken last. Claim the thread before replying so two operators never answer the same person twice.';
    }
  }

  function loadSession() {
    return api('/session').then(function (json) {
      state.storage = !!json.storage;
      state.staff = json.staff || null;
      state.role = (json.staff && json.staff.role) || 'admin';
      var flag = $('#storage-flag');
      flag.textContent = json.storage ? 'R2 connected' : 'R2 not configured';
      flag.className = 'flag' + (json.storage ? '' : ' warn');
    }).catch(function () { /* gate handles auth errors */ });
  }

  // Header strip: every queue that needs a human, plus persona/paid counts.
  function loadOverview() {
    api('/overview').then(function (json) {
      state.overview = json;
      renderOverview(json);
    }).catch(function () { /* header stays empty until sign-in completes */ });
  }

  function renderOverview(o) {
    var box = $('#overview');
    if (!box) return;
    var cards;
    if (state.role === 'moderator') {
      // A moderator's scoreboard: the desk they hold and who is waiting on it.
      cards = [
        { key: 'npcs', label: 'My personas', value: o.assignedPersonas },
        { key: 'npcs', label: 'Live personas', value: o.livePersonas },
        { key: 'threads', label: 'Waiting replies', value: o.waitingReplies, alert: o.waitingReplies > 0 },
        { key: 'threads', label: 'My threads', value: o.myThreads },
        { key: 'threads', label: 'Escalated', value: o.escalated, alert: o.escalated > 0 },
        { key: 'npcs', label: 'Persona limit', value: o.personaLimit }
      ];
    } else {
      cards = [
        { key: 'verifications', label: 'Verifications', value: o.pendingVerifications, alert: o.pendingVerifications > 0 },
        { key: 'reports', label: 'Open reports', value: o.openReports, alert: o.openReports > 0 },
        { key: 'appeals', label: 'Appeals', value: o.pendingAppeals, alert: o.pendingAppeals > 0 },
        { key: 'threads', label: 'Team threads', value: o.adminOwnedThreads, alert: false },
        { key: 'threads', label: 'Paid members', value: o.paidMembers, alert: false },
        { key: 'npcs', label: 'Personas', value: o.personas, alert: false },
        { key: 'npcs', label: 'Curated set', value: o.curatedPersonas, alert: false, curated: true },
        { key: 'npcs', label: 'Active personas', value: o.activePersonas, alert: false },
        { key: 'npcs', label: 'Unassigned', value: o.unassignedPersonas, alert: false },
        { key: 'threads', label: 'Escalations', value: o.escalatedThreads, alert: o.escalatedThreads > 0 },
        { key: 'staff', label: 'Staff', value: o.staffCount, alert: false }
      ];
    }
    box.innerHTML = cards.map(function (c) {
      return '<button type="button" class="card' + (c.alert ? ' alert' : '') + '" data-goto="' + c.key + '"' + (c.curated ? ' data-curated="1"' : '') + '>' +
        '<b>' + esc(c.value == null ? '—' : c.value) + '</b><span>' + esc(c.label) + '</span></button>';
    }).join('');
    box.querySelectorAll('[data-goto]').forEach(function (card) {
      card.addEventListener('click', function () {
        // The curated card is the one click that should also narrow the list,
        // so it arrives showing the shortlist rather than the whole 800-row pool.
        if (card.hasAttribute('data-curated')) $('#npc-curated').value = '1';
        var tab = document.querySelector('.tab[data-tab="' + card.getAttribute('data-goto') + '"]');
        if (tab) tab.click();
      });
    });
  }

  // Populate the persona filter menus from the deck itself.
  function loadFacets() {
    api('/npc-facets').then(function (json) {
      state.facets = json;
      var country = $('#npc-country');
      var service = $('#npc-service');
      country.innerHTML = '<option value="">All countries</option>' + (json.countries || []).map(function (c) {
        return '<option value="' + esc(c.name) + '">' + esc(c.name) + ' (' + c.count + ')</option>';
      }).join('');
      service.innerHTML = '<option value="">All services</option>' + (json.services || []).map(function (s) {
        return '<option value="' + esc(s.name) + '">' + esc(s.name) + ' (' + s.count + ')</option>';
      }).join('');
    }).catch(function () { /* filters stay as-is */ });
  }

  function loadQueue() {
    var box = $('#queue');
    api('/verifications').then(function (json) {
      state.queue = json.queue || [];
      $('#count-verifications').textContent = String(state.queue.length);
      renderQueue(box);
    }).catch(function (err) {
      box.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    });
  }

  function loadReports() {
    var box = $('#reports');
    var status = $('#reports-filter').value;
    api('/reports?status=' + encodeURIComponent(status)).then(function (json) {
      state.reports = json.reports || [];
      var open = state.reports.filter(function (r) { return r.status === 'pending_review' || r.status === 'investigating'; }).length;
      $('#count-reports').textContent = String(open);
      renderReports(box);
    }).catch(function (err) {
      box.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    });
  }

  function loadAppeals() {
    var box = $('#appeals');
    var status = $('#appeals-filter').value;
    api('/appeals?status=' + encodeURIComponent(status)).then(function (json) {
      state.appeals = json.appeals || [];
      var pending = state.appeals.filter(function (a) { return a.status === 'pending'; }).length;
      $('#count-appeals').textContent = String(pending);
      renderAppeals(box);
    }).catch(function (err) {
      box.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    });
  }

  function loadThreads() {
    var box = $('#threads');
    var filter = $('#threads-filter').value;
    var paid = $('#threads-paid').value;
    var query = [];
    if (filter) query.push('state=' + encodeURIComponent(filter));
    if (paid) query.push('paid=' + encodeURIComponent(paid));
    api('/threads' + (query.length ? '?' + query.join('&') : '')).then(function (json) {
      state.threads = json.threads || [];
      $('#count-threads').textContent = String(state.threads.length);
      var paidCount = $('#threads-paid-count');
      if (paidCount) paidCount.textContent = (json.paidCount || 0) + ' paid';
      renderThreads(box);
    }).catch(function (err) {
      box.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    });
  }

  function npcQuery(offset) {
    var params = [];
    var push = function (key, sel) {
      var value = ($(sel).value || '').trim();
      if (value) params.push(key + '=' + encodeURIComponent(value));
    };
    push('search', '#npc-search');
    push('country', '#npc-country');
    push('class', '#npc-class');
    push('service', '#npc-service');
    push('gender', '#npc-gender');
    push('active', '#npc-active');
    push('curated', '#npc-curated');
    push('assigned', '#npc-assigned');
    params.push('limit=60');
    params.push('offset=' + offset);
    return '/npcs?' + params.join('&');
  }

  function loadNpcs(reset) {
    if (reset === undefined) reset = true;
    var box = $('#npcs');
    var offset = reset ? 0 : state.npcOffset;
    if (reset) box.innerHTML = '<div class="empty">Loading personas…</div>';
    api(npcQuery(offset)).then(function (json) {
      var rows = json.npcs || [];
      state.npcTotal = json.total || rows.length;
      state.npcOffset = offset + rows.length;
      state.npcs = reset ? rows : state.npcs.concat(rows);
      $('#npc-count').textContent = state.npcs.length + ' of ' + state.npcTotal + ' personas';
      $('#npc-more').classList.toggle('hidden', state.npcOffset >= state.npcTotal);
      renderNpcs(box);
    }).catch(function (err) {
      box.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    });
  }

  function loadAudit() {
    var box = $('#audit');
    api('/audit?limit=100').then(function (json) {
      state.audit = json.actions || [];
      renderAudit(box);
    }).catch(function (err) {
      box.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    });
  }

  // ---------- render: verifications ----------
  function renderQueue(box) {
    if (!state.queue.length) {
      box.innerHTML = '<div class="empty">No submissions waiting. The queue is clear.</div>';
      return;
    }
    box.innerHTML = state.queue.map(function (item) {
      var p = item.profile || {};
      return (
        '<article class="card" data-id="' + esc(item.id) + '">' +
          '<div class="card-head">' +
            '<div class="who"><strong>' + esc(p.name || 'Unknown member') + '</strong>' +
              '<span>' + esc(p.professionTitle || p.professionCategory || '') + ' · ' + esc(p.city || '') + '</span></div>' +
            '<div class="doc">' + esc(item.documentType) + (item.documentNumberMasked ? ' · <b>' + esc(item.documentNumberMasked) + '</b>' : '') + '<br />' + esc(fmtDate(item.submittedAt)) + '</div>' +
          '</div>' +
          '<div class="media">' +
            '<figure>' + (item.idDocUrl
              ? '<img src="' + esc(item.idDocUrl) + '" alt="ID document" data-zoom="' + esc(item.idDocUrl) + '" />'
              : '<div class="missing">Document image unavailable</div>') +
              '<figcaption>ID document</figcaption></figure>' +
            '<figure>' + (item.selfieUrl
              ? '<img src="' + esc(item.selfieUrl) + '" alt="Live selfie" data-zoom="' + esc(item.selfieUrl) + '" />'
              : '<div class="missing">Selfie unavailable</div>') +
              '<figcaption>Live selfie</figcaption></figure>' +
          '</div>' +
          '<div class="facts">' +
            '<div class="fact"><span>Name on profile</span><b>' + esc(p.name || '—') + '</b></div>' +
            '<div class="fact"><span>Date of birth</span><b>' + esc(p.birthDate || '—') + ' (' + esc(p.age || '—') + ')</b></div>' +
            '<div class="fact"><span>Gender</span><b>' + esc(p.gender || '—') + '</b></div>' +
            '<div class="fact"><span>Phone</span><b>' + esc(p.phone || '—') + '</b></div>' +
            '<div class="fact"><span>Location</span><b>' + esc([p.city, p.state].filter(Boolean).join(', ') || '—') + '</b></div>' +
            '<div class="fact"><span>Region</span><b>' + esc(p.countryCode || 'NG') + (p.regionAttestedCode && p.regionAttestedCode === p.countryCode ? ' · attested' : '') + '</b></div>' +
          '</div>' +
          '<div class="decision">' +
            '<input type="text" maxlength="300" placeholder="Review note (reason if rejecting)" data-note />' +
            '<button class="btn approve" data-action="approve" type="button" title="Approving also attests the member\'s region for free-chat eligibility">Approve</button>' +
            '<button class="btn reject" data-action="reject" type="button">Reject</button>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  // ---------- render: reports ----------
  function renderReports(box) {
    if (!state.reports.length) {
      box.innerHTML = '<div class="empty">No reports filed.</div>';
      return;
    }
    var statuses = ['pending_review', 'investigating', 'resolved', 'dismissed'];
    box.innerHTML = state.reports.map(function (r) {
      var open = r.status === 'pending_review' || r.status === 'investigating';
      return (
        '<article class="card" data-report="' + esc(r.id) + '" data-user="' + esc(r.reportedUserId || '') + '">' +
          '<div class="card-head">' +
            '<div class="who"><strong>' + esc(r.categoryLabel || r.category) + '</strong>' +
              '<span>' + esc((r.reporter && r.reporter.name) || 'Member') + ' → ' + esc((r.reported && r.reported.name) || 'Member') +
              (r.matchId ? ' · conversation attached' : '') + '</span></div>' +
            '<div class="doc"><span class="badge ' + (open ? 'hot' : '') + '">' + esc(r.status.replace('_', ' ')) + '</span><br />' + esc(fmtDate(r.createdAt)) + '</div>' +
          '</div>' +
          '<div class="report-body">' +
            '<p>' + esc(r.details) + '</p>' +
            (r.serviceBranch ? '<p class="muted">Service: ' + esc(r.serviceBranch) + '</p>' : '') +
            (r.reviewNote ? '<p class="muted">Review note: ' + esc(r.reviewNote) + '</p>' : '') +
            '<div class="row-actions">' +
              '<button class="btn" data-action="context" type="button">Review context</button>' +
              '<select data-status>' + statuses.map(function (s) {
                return '<option value="' + s + '"' + (s === r.status ? ' selected' : '') + '>' + s.replace('_', ' ') + '</option>';
              }).join('') + '</select>' +
              '<input type="text" maxlength="1000" placeholder="Decision note (optional)" data-review-note value="' + esc(r.reviewNote || '') + '" />' +
              '<button class="btn" data-action="status" type="button">Save status</button>' +
              (r.reported && r.reported.blocked
                ? '<button class="btn approve" data-action="unblock" type="button">Unblock account</button>'
                : '<button class="btn reject" data-action="block" type="button">Block account</button>') +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  // ---------- render: appeals ----------
  function renderAppeals(box) {
    if (!state.appeals.length) {
      box.innerHTML = '<div class="empty">No appeals in this view.</div>';
      return;
    }
    box.innerHTML = state.appeals.map(function (a) {
      var p = a.profile || {};
      var photo = (p.photos || [])[0];
      return (
        '<article class="card" data-appeal="' + esc(a.id) + '">' +
          '<div class="card-head">' +
            '<div class="who"><strong>' + esc(p.name || 'Unknown member') + '</strong>' +
              '<span>Account ' + esc(p.accountStatus || 'active') + (p.restrictionReason ? ' · ' + esc(p.restrictionReason) : '') + '</span></div>' +
            '<div class="doc"><span class="badge ' + (a.status === 'pending' ? 'hot' : '') + '">' + esc(a.status) + '</span><br />' + esc(fmtDate(a.createdAt)) + '</div>' +
          '</div>' +
          '<div class="report-body">' +
            (photo ? '<img src="' + esc(photo) + '" alt="" data-zoom="' + esc(photo) + '" style="width:64px;height:64px;object-fit:cover;border-radius:12px" />' : '') +
            (a.sanctionReason ? '<p class="muted">Sanctioned for: ' + esc(a.sanctionReason) + '</p>' : '') +
            '<p>' + esc(a.note) + '</p>' +
            (a.decisionNote ? '<p class="muted">Decision note: ' + esc(a.decisionNote) + '</p>' : '') +
            (a.status === 'pending'
              ? '<div class="row-actions">' +
                  '<button class="btn approve" data-action="appeal-grant" type="button">Grant appeal (reinstate)</button>' +
                  '<button class="btn reject" data-action="appeal-deny" type="button">Deny appeal</button>' +
                  '<button class="btn" data-action="appeal-user" type="button">View account</button>' +
                '</div>'
              : '<div class="row-actions"><span class="muted">Decided ' + esc(fmtDate(a.decidedAt)) + '</span></div>') +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  // ---------- render: threads (persona conversations) ----------
  function renderThreads(box) {
    if (!state.threads.length) {
      box.innerHTML = '<div class="empty">No persona conversations yet.</div>';
      return;
    }
    box.innerHTML = state.threads.map(function (t) {
      var claim = t.claimLive ? (t.claimedByMe ? 'You have this thread' : 'With ' + (t.claimedByName || 'another operator')) : '';
      var mine = t.claimedByMe;
      return (
        '<article class="card" data-thread="' + esc(t.id) + '">' +
          '<div class="card-head">' +
            '<div class="who"><strong>' + esc(t.npc.name) + ' ↔ ' + esc(t.member.name) + '</strong>' +
              '<span>' + esc(t.autoSpent || 0) + ' auto-replies used · ' + esc(fmtDate(t.lastMessageAt || t.createdAt)) + '</span>' +
              '<span class="flagline">' +
                (t.paid ? '<span class="badge-paid">paid member</span>' : '') +
                (t.member.verified ? '<span class="badge">verified</span>' : '') +
                '<span class="badge">' + esc(t.member.countryCode || 'NG') + '</span>' +
                (t.creditsBought ? '<span class="badge">' + esc(t.creditsBought) + ' credits bought</span>' : '') +
                (t.waiting ? '<span class="badge" style="background:var(--danger-wash,#fde8e8);color:var(--danger,#a33)">waiting for a reply</span>' : '') +
                (t.escalatedAt ? '<span class="badge">escalated</span>' : '') +
                (claim ? '<span class="badge">' + esc(claim) + '</span>' : '') +
              '</span></div>' +
            '<div class="doc"><span class="state ' + esc(t.autoState) + '">' + esc(t.autoState.replace('_', ' ')) + '</span>' +
              (t.takenOverBy ? '<br />operated by ' + esc(t.takenOverBy) : '') +
              (t.purchasedAt ? '<br />paid ' + esc(fmtDate(t.purchasedAt)) : '') + '</div>' +
          '</div>' +
          (t.lastMessage && t.lastMessage.text ? '<p class="muted" style="margin:0 18px 8px;font-size:12px">' + esc(t.lastMessage.text.slice(0, 160)) + (t.lastMessage.sentByName ? ' — ' + esc(t.lastMessage.sentByName) : '') + '</p>' : '') +
          (t.escalationNote ? '<p class="muted" style="margin:0 18px 8px;font-size:12px">Escalated: ' + esc(t.escalationNote) + '</p>' : '') +
          '<div class="decision">' +
            '<button class="btn" data-action="open-thread" type="button">Open conversation</button>' +
            (t.claimLive && !mine
              ? '<span class="muted" style="font-size:12px">' + esc(t.claimedByName || 'Another operator') + ' is replying — the lease ends ' + esc(fmtDate(t.claimExpiresAt)) + '.</span>'
              : mine
                ? '<button class="btn ghost" data-action="release-thread" type="button">Release</button>'
                : '<button class="btn" data-action="claim-thread" type="button">Take over</button>') +
            '<button class="btn ghost" data-action="escalate-thread" type="button">' + (t.escalatedAt ? 'Clear escalation' : 'Escalate') + '</button>' +
            (t.autoState === 'quiet' ? '<span class="muted" style="font-size:12px">Auto-reply paused. A credit purchase by the member hands this thread to the team.</span>' : '') +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function claimThread(matchId) {
    api('/threads/' + encodeURIComponent(matchId) + '/claim', { method: 'POST' })
      .then(function () { toast('Thread claimed for 30 minutes'); loadThreads(); })
      .catch(function (err) { toast(err.message, true); loadThreads(); });
  }

  function releaseThread(matchId) {
    api('/threads/' + encodeURIComponent(matchId) + '/release', { method: 'POST' })
      .then(function () { toast('Thread released'); loadThreads(); })
      .catch(function (err) { toast(err.message, true); });
  }

  function escalateThread(matchId, alreadyEscalated) {
    if (alreadyEscalated) {
      return api('/threads/' + encodeURIComponent(matchId) + '/escalate', { method: 'DELETE' })
        .then(function () { toast('Escalation cleared'); loadThreads(); })
        .catch(function (err) { toast(err.message, true); });
    }
    var note = (window.prompt('What does the admin need to decide? (the member will not see this)', '') || '').trim();
    if (!note) { toast('Add a short note before escalating.', true); return Promise.resolve(); }
    return api('/threads/' + encodeURIComponent(matchId) + '/escalate', { method: 'POST', body: { note: note } })
      .then(function () { toast('Escalated to an admin'); loadThreads(); })
      .catch(function (err) { toast(err.message, true); });
  }
  // ---------- render: npcs ----------
  function npcCard(n) {
    var photo = (n.photos || [])[0];
    var persona = n.persona || {};
    var flags = [n.countryCode || 'NG', n.classOfService || n.professionCategory, persona.branch ? persona.branch + ' branch' : '', persona.race || ''].filter(Boolean);
    // `awaiting_upload` means the auto-dealer had no spare face for this
    // persona; it stays out of discovery until a photo is uploaded.
    var needsPhoto = persona.photoState === 'awaiting_upload';
    var quarantined = n.photoReview === 'quarantine';
    var curated = n.curated || Boolean(persona.curated);
    return (
      '<article class="npc" data-npc="' + esc(n.id) + '">' +
        '<div class="cover">' + (photo
          ? '<img src="' + esc(photo) + '" alt="" data-zoom="' + esc(photo) + '" />'
          : '<div class="none">No photo</div>') + '</div>' +
        '<div class="body">' +
          '<strong>' + esc(n.name) + (curated ? ' <span class="badge">curated</span>' : '') + (n.active ? '' : ' <span class="badge">paused</span>') + (needsPhoto ? ' <span class="badge">needs photo</span>' : '') + (quarantined ? ' <span class="badge">quarantined</span>' : '') + (n.aiEnabled ? ' <span class="badge">AI</span>' : '') + '</strong>' +
          '<span class="meta">' + esc(n.age || '—') + ' · ' + esc([n.city, n.state].filter(Boolean).join(', ')) + '</span>' +
          '<span class="flagline">' + flags.map(function (f) { return '<span class="badge">' + esc(f) + '</span>'; }).join('') +
            (isAdmin()
              ? (n.assignedTo ? '<span class="badge">' + (n.assignedTo.mine ? 'yours' : 'owned by ' + esc(n.assignedTo.name)) + '</span>' : '<span class="badge">unassigned</span>')
              : '<span class="badge">your persona</span>') +
          '</span>' +
          '<span>' + esc([n.service, n.orgRole, n.skill].filter(Boolean).join(' · ') || n.professionCategory || '') + '</span>' +
          '<span>' + esc(n.verificationStatus || '') + ' · greeter: ' + esc(persona.greeter ? 'yes' : 'no') + '</span>' +
          (quarantined ? '<span class="meta">Quarantined: ' + esc(n.quarantineReason || 'photo reads as generated') + '</span>' : '') +
          '<div class="actions">' +
            '<button class="btn" data-action="npc-edit" type="button">Edit</button>' +
            '<button class="btn" data-action="npc-scripts" type="button">Messages</button>' +
            '<button class="btn" data-action="npc-photos" type="button">Photos</button>' +
            (/^https?:\/\//i.test(String(persona.photoSourceUrl || ''))
              ? '<a class="btn" href="' + esc(persona.photoSourceUrl) + '" target="_blank" rel="noopener noreferrer" title="Admin-only photo source">Source</a>'
              : '') +
            (isAdmin()
              ? '<button class="btn" data-action="npc-curate" type="button">' + (curated ? 'Remove from set' : 'Add to set') + '</button>' +
                '<button class="btn ' + (n.active ? 'reject' : 'approve') + '" data-action="npc-toggle" type="button">' + (n.active ? 'Pause' : 'Activate') + '</button>' +
                '<button class="btn" data-action="npc-assign" type="button">Assign</button>' +
                '<button class="btn" data-action="npc-quarantine" type="button">' + (quarantined ? 'Release photo' : 'Quarantine photo') + '</button>'
              : (quarantined
                  ? '<span class="muted" style="font-size:11px;align-self:center">Awaiting admin release</span>'
                  : '<button class="btn" data-action="npc-quarantine" type="button">Flag photo</button>')) +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderNpcs(box) {
    if (!state.npcs.length) {
      box.innerHTML = '<div class="empty">No personas match.</div>';
      return;
    }
    box.innerHTML = state.npcs.map(npcCard).join('');
  }

  /** Repaint one card without touching the rest of the list (keeps scroll). */
  function replaceNpcCard(id) {
    var record = state.npcs.find(function (x) { return x.id === id; });
    var old = document.querySelector('[data-npc="' + id + '"]');
    if (!record || !old) return;
    var holder = document.createElement('div');
    holder.innerHTML = npcCard(record);
    old.replaceWith(holder.firstElementChild);
  }

  // ---------- render: audit ----------
  function renderAudit(box) {
    if (!state.audit.length) {
      box.innerHTML = '<div class="empty">No admin actions recorded yet.</div>';
      return;
    }
    box.innerHTML = '<div class="audit">' + state.audit.map(function (a) {
      return '<div class="audit-row">' +
        '<span class="mono">' + esc(fmtDate(a.createdAt)) + '</span>' +
        '<span><b>' + esc(a.action) + '</b> · ' + esc(a.adminId) +
          (a.targetId ? ' · <span class="mono">' + esc(String(a.targetId).slice(0, 14)) + '…</span>' : '') + '</span>' +
        '<span class="mono">' + esc(a.detail ? JSON.stringify(a.detail).slice(0, 120) : '') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  // ---------- staff: roles, capacity and persona assignment ----------
  function populateAssignees() {
    var moderators = state.staffList.filter(function (s) { return s.role === 'moderator'; });
    var select = $('#npc-assigned');
    if (select) {
      var current = select.value;
      select.innerHTML = '<option value="">Any owner</option><option value="none">Unassigned</option>' +
        moderators.map(function (s) {
          return '<option value="' + esc(s.id) + '">' + esc(s.name) + ' (' + esc(s.assigned) + ')</option>';
        }).join('');
      select.value = current;
    }
  }

  function loadStaffDirectory() {
    if (!isAdmin()) return;
    api('/staff').then(function (json) {
      state.staffList = json.staff || [];
      populateAssignees();
    }).catch(function () { /* the staff tab surfaces the same error */ });
  }

  function loadStaff() {
    if (!isAdmin()) return;
    var box = $('#staff');
    api('/staff').then(function (json) {
      state.staffList = json.staff || [];
      populateAssignees();
      renderStaff(box);
    }).catch(function (err) {
      box.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    });
  }

  function renderStaff(box) {
    if (!box) return;
    var owner = state.role === 'owner';
    var addForm = ['#staff-email', '#staff-name', '#staff-role', '#staff-limit', '#staff-add'];
    addForm.forEach(function (sel) {
      var el = $(sel);
      if (el) el.disabled = !owner;
    });
    if (!state.staffList.length) {
      box.innerHTML = '<div class="empty">No staff yet.</div>';
      return;
    }
    box.innerHTML = state.staffList.map(function (s) {
      var controls = !owner || s.role === 'owner'
        ? '<span class="muted" style="font-size:12px">' + (s.role === 'owner' ? 'Owner — transfer ownership to change this account.' : 'Only the owner can change staff.') + '</span>'
        : '<select data-staff-role>' +
            '<option value="moderator"' + (s.role === 'moderator' ? ' selected' : '') + '>Moderator</option>' +
            '<option value="admin"' + (s.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
          '</select>' +
          '<input type="number" min="1" max="200" value="' + esc(s.personaLimit) + '" data-staff-limit style="width:92px" title="Persona limit" />' +
          '<button class="btn" data-staff-action="save" type="button">Save</button>' +
          '<button class="btn ghost" data-staff-action="toggle" type="button">' + (s.status === 'active' ? 'Suspend' : 'Reactivate') + '</button>' +
          '<button class="btn ghost" data-staff-action="owner" type="button">Make owner</button>' +
          '<button class="btn reject" data-staff-action="remove" type="button">Remove</button>';
      return '<article class="card" data-staff="' + esc(s.id) + '">' +
        '<div class="card-head">' +
          '<div class="who"><strong>' + esc(s.name) + (s.isYou ? ' (you)' : '') + '</strong>' +
            '<span>' + esc(s.role) + ' · ' + esc(s.status) + ' · ' + esc(s.assigned) + ' / ' + esc(s.personaLimit) + ' personas</span>' +
            '<span class="flagline"><span class="badge">' + esc(s.role) + '</span>' +
              (s.status !== 'active' ? '<span class="badge">suspended</span>' : '') +
              (s.lastSeenAt ? '<span class="badge">seen ' + esc(fmtDate(s.lastSeenAt)) + '</span>' : '') +
            '</span></div>' +
          '<div class="doc"><span class="mono" style="font-size:10px">' + esc(String(s.id).slice(0, 8)) + '…</span><br />' + esc(fmtDate(s.createdAt)) + '</div>' +
        '</div>' +
        '<div class="decision">' + controls + '</div>' +
      '</article>';
    }).join('');

    box.querySelectorAll('[data-staff]').forEach(function (card) {
      var id = card.dataset.staff;
      var save = card.querySelector('[data-staff-action="save"]');
      var toggle = card.querySelector('[data-staff-action="toggle"]');
      var makeOwner = card.querySelector('[data-staff-action="owner"]');
      var remove = card.querySelector('[data-staff-action="remove"]');
      var roleSelect = card.querySelector('[data-staff-role]');
      var limitInput = card.querySelector('[data-staff-limit]');
      if (save) save.addEventListener('click', function () {
        save.disabled = true;
        api('/staff/' + encodeURIComponent(id), {
          method: 'PATCH',
          body: { role: roleSelect.value, personaLimit: Number(limitInput.value) }
        }).then(function () { toast('Staff member updated'); loadStaff(); })
          .catch(function (err) { save.disabled = false; toast(err.message, true); });
      });
      if (toggle) toggle.addEventListener('click', function () {
        toggle.disabled = true;
        var next = toggle.textContent.trim() === 'Suspend' ? 'suspended' : 'active';
        if (next === 'suspended' && !window.confirm('Suspend this account? Their console access ends and any thread claim is released. Their persona assignments are kept.')) {
          toggle.disabled = false;
          return;
        }
        api('/staff/' + encodeURIComponent(id), { method: 'PATCH', body: { status: next } })
          .then(function () { toast(next === 'suspended' ? 'Staff suspended' : 'Staff reactivated'); loadStaff(); })
          .catch(function (err) { toggle.disabled = false; toast(err.message, true); });
      });
      if (makeOwner) makeOwner.addEventListener('click', function () {
        if (!window.confirm('Transfer ownership? You become an admin and this account becomes the only owner.')) return;
        api('/staff/' + encodeURIComponent(id), { method: 'PATCH', body: { makeOwner: true } })
          .then(function () { toast('Ownership transferred'); loadAll(); })
          .catch(function (err) { toast(err.message, true); });
      });
      if (remove) remove.addEventListener('click', function () {
        if (!window.confirm('Remove this account from staff? Their persona assignments are released and their thread claims end. The member account itself is untouched.')) return;
        api('/staff/' + encodeURIComponent(id), { method: 'DELETE' })
          .then(function () { toast('Staff member removed'); loadStaff(); loadStaffDirectory(); })
          .catch(function (err) { toast(err.message, true); });
      });
    });
  }

  function addStaff() {
    var email = ($('#staff-email').value || '').trim().toLowerCase();
    if (!email || email.indexOf('@') === -1) { toast('Enter the email they sign in with.', true); return; }
    var button = $('#staff-add');
    button.disabled = true;
    api('/staff', {
      method: 'POST',
      body: {
        email: email,
        displayName: ($('#staff-name').value || '').trim() || undefined,
        role: $('#staff-role').value,
        personaLimit: Number($('#staff-limit').value) || 30
      }
    }).then(function () {
      toast('Staff member added');
      $('#staff-email').value = '';
      $('#staff-name').value = '';
      button.disabled = false;
      loadStaff();
      loadStaffDirectory();
    }).catch(function (err) {
      button.disabled = false;
      toast(err.message, true);
    });
  }

  function openAssignSheet(npcId) {
    var npc = state.npcs.find(function (x) { return x.id === npcId; });
    if (!npc) return;
    var moderators = state.staffList.filter(function (s) { return s.role === 'moderator' && s.status === 'active'; });
    var options = '<option value="">Unassigned</option>' + moderators.map(function (s) {
      var selected = npc.assignedTo && String(npc.assignedTo.id) === String(s.id) ? ' selected' : '';
      return '<option value="' + esc(s.id) + '"' + selected + '>' + esc(s.name) + ' — ' + esc(s.assigned) + '/' + esc(s.personaLimit) + '</option>';
    }).join('');
    var sheet = openSheet('Assign persona — ' + npc.name,
      '<div style="padding:14px 18px">' +
        '<p class="muted" style="margin:0 0 10px;font-size:12px">One persona has one moderator. Assigning someone else moves it: the previous moderator loses edit and chat access immediately. Admins keep supervision either way.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<select id="assign-staff" style="flex:1;min-width:220px">' + options + '</select>' +
          '<button class="btn primary" id="assign-save" type="button" style="margin-top:0">Save assignment</button>' +
        '</div>' +
        (moderators.length ? '' : '<p class="muted" style="font-size:12px;margin:10px 0 0">No active moderators yet. Add one in Staff first.</p>') +
      '</div>');
    sheet.querySelector('#assign-save').addEventListener('click', function () {
      var value = sheet.querySelector('#assign-staff').value || null;
      var button = sheet.querySelector('#assign-save');
      button.disabled = true;
      api('/npcs/' + encodeURIComponent(npcId) + '/assign', { method: 'POST', body: { moderatorId: value } })
        .then(function (json) {
          if (value) {
            var person = state.staffList.find(function (s) { return String(s.id) === String(value); });
            npc.assignedTo = person ? { id: person.id, name: person.name, mine: person.id === (state.staff && state.staff.id) } : null;
          } else {
            npc.assignedTo = null;
          }
          replaceNpcCard(npcId);
          closeSheet();
          toast(json.assigned ? 'Persona assigned' : 'Persona unassigned');
          loadStaffDirectory();
        })
        .catch(function (err) { button.disabled = false; toast(err.message, true); });
    });
  }

  // ---------- report context review (KB §18D) ----------
  function openReportContext(reportId) {
    openSheet('Report context', '<div class="conv" id="ctx-body"><div class="muted">Loading the full account and DM history…</div></div>');
    api('/reports/' + encodeURIComponent(reportId) + '/context').then(function (ctx) {
      var body = $('#ctx-body');
      if (!body) return;
      var reporter = ctx.reporter, reported = ctx.reported;
      var side = function (label, p) {
        if (!p) return '<div class="side"><h4>' + label + '</h4><span class="muted">Account deleted</span></div>';
        var photos = (p.photos || []).slice(0, 4).map(function (url) { return '<img src="' + esc(url) + '" alt="" data-zoom="' + esc(url) + '" />'; }).join('');
        return '<div class="side">' +
          '<h4>' + label + '</h4>' +
          '<b>' + esc(p.name) + '</b> · ' + esc(p.age || '—') + ' · ' + esc(p.gender || '—') + '<br />' +
          esc([p.city, p.state].filter(Boolean).join(', ')) + '<br />' +
          esc([p.classOfService, p.orgRole, p.skill, p.professionTitle].filter(Boolean).join(' · ')) + '<br />' +
          '<span class="mono" style="font-size:11px">' + esc(p.phone || '') + ' · ' + esc(p.email || '') + '</span><br />' +
          '<span class="badge">' + esc(p.verificationStatus || 'unverified') + '</span> ' +
          '<span class="badge">' + esc(p.accountStatus || 'active') + '</span>' +
          (p.restrictionReason ? '<br /><span class="muted">Sanction: ' + esc(p.restrictionReason) + '</span>' : '') +
          (photos ? '<div class="thumb-row">' + photos + '</div>' : '') +
        '</div>';
      };
      var verification = (ctx.verification || []).map(function (v) {
        return '<figure style="margin:0">' +
          (v.selfieUrl ? '<img src="' + esc(v.selfieUrl) + '" alt="selfie" data-zoom="' + esc(v.selfieUrl) + '" style="width:100%;aspect-ratio:4/3;object-fit:contain;background:#0b0b0b;cursor:zoom-in" />' : '<div class="missing">Selfie unavailable</div>') +
          (v.idDocUrl ? '<img src="' + esc(v.idDocUrl) + '" alt="ID" data-zoom="' + esc(v.idDocUrl) + '" style="width:100%;aspect-ratio:4/3;object-fit:contain;background:#0b0b0b;cursor:zoom-in;margin-top:4px" />' : '') +
          '<figcaption class="muted" style="font-size:11px">' + esc(v.documentType || 'Document') + ' ' + esc(v.documentNumberMasked || '') + ' · ' + esc(v.status || '') + '</figcaption>' +
        '</figure>';
      }).join('');
      var messages = (ctx.conversation && ctx.conversation.messages) || [];
      var conv = messages.length ? messages.map(function (m) {
        var mine = reported && m.senderId === reported.id;
        var flagged = ctx.conversation.reportedMessageId && m.id === ctx.conversation.reportedMessageId;
        var content = m.kind === 'photo'
          ? (m.mediaUrl ? '<img src="' + esc(m.mediaUrl) + '" alt="" data-zoom="' + esc(m.mediaUrl) + '" style="max-width:220px;border-radius:10px" />' : '<i>photo</i>')
          : esc(m.text);
        return '<div class="bubble ' + (mine ? 'me' : 'them') + (flagged ? ' flagged' : '') + '">' +
          '<span class="sender">' + esc(mine ? (reported && reported.name) || 'Reported' : (reporter && reporter.name) || 'Reporter') + (flagged ? ' · reported message' : '') + '</span>' +
          content + '</div>';
      }).join('') : '<div class="muted">No conversation attached to this report.</div>';
      body.innerHTML =
        '<div class="grid-2">' + side('Reporter', reporter) + side('Reported account', reported) + '</div>' +
        (verification ? '<div style="padding:12px 18px"><h4 style="margin:0 0 8px;font-family:Georgia,serif;font-size:15px">Stored verification (face re-check)</h4><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">' + verification + '</div></div>' : '') +
        '<div style="padding:12px 18px 0"><h4 style="margin:0;font-family:Georgia,serif;font-size:15px">Conversation</h4></div>' +
        '<div class="conv">' + conv + '</div>' +
        (reported ? '<div class="decision">' +
          (reported.accountStatus === 'active'
            ? '<button class="btn" data-sanction="restrict" type="button">Restrict</button><button class="btn reject" data-sanction="ban" type="button">Ban</button>'
            : '<button class="btn approve" data-sanction="lift" type="button">Lift sanction</button>') +
          '<button class="btn reject" data-sanction="delete" type="button">Delete account</button>' +
          '</div>' : '');
      if (reported) {
        body.querySelectorAll('[data-sanction]').forEach(function (btn) {
          btn.addEventListener('click', function () { sanction(reported.id, btn.getAttribute('data-sanction'), reportId); });
        });
      }
    }).catch(function (err) {
      var body = $('#ctx-body');
      if (body) body.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    });
  }

  // ---------- sanctions: restrict / ban / lift / delete, always with a reason ----------
  function sanction(userId, action, reportId) {
    var reason = '';
    if (action === 'restrict' || action === 'ban') {
      reason = (window.prompt(action === 'ban'
        ? 'Ban reason (shown to the member, they can appeal):'
        : 'Restriction reason (shown to the member, they can appeal):', '') || '').trim();
      if (reason.length < 5) { toast('A reason of at least 5 characters is required.', true); return; }
    }
    if (action === 'delete') {
      if (window.prompt('Deleting removes every photo and document permanently. Type DELETE to confirm.') !== 'DELETE') return;
    }
    if (action === 'lift' && !window.confirm('Reinstate this account and clear the sanction?')) return;
    api('/users/' + encodeURIComponent(userId) + '/sanction', {
      method: 'POST',
      body: { action: action, reason: reason || undefined }
    }).then(function () {
      toast(action === 'lift' ? 'Account reinstated' : action === 'delete' ? 'Account deleted' : 'Account ' + action + 'ed');
      closeSheet();
      if (reportId && state.tab === 'reports') openReportContext(reportId);
      loadReports();
      loadAppeals();
      if (state.tab === 'audit') loadAudit();
    }).catch(function (err) { toast(err.message, true); });
  }

  // ---------- appeal decisions ----------
  function decideAppeal(appealId, grant) {
    var note = '';
    if (!grant) {
      note = (window.prompt('Denial note (shown to the member):', '') || '').trim();
      if (!note) { toast('Add a short note before denying an appeal.', true); return; }
    } else if (!window.confirm('Grant this appeal? The account is reinstated immediately.')) return;
    api('/appeals/' + encodeURIComponent(appealId) + '/decision', {
      method: 'POST',
      body: { grant: grant, note: note || undefined }
    }).then(function () {
      toast(grant ? 'Appeal granted — account reinstated' : 'Appeal denied');
      loadAppeals();
      loadReports();
      if (state.tab === 'audit') loadAudit();
    }).catch(function (err) { toast(err.message, true); });
  }

  // ---------- thread takeover: read + reply as the persona ----------
  function openThread(matchId) {
    var sheet = openSheet('Conversation',
      '<div id="thread-claim" class="muted" style="padding:10px 18px 0;font-size:12px">Loading…</div>' +
      '<div class="conv" id="thread-body"><div class="muted">Loading…</div></div>' +
      '<div class="composer"><input id="thread-input" type="text" maxlength="4000" placeholder="Reply as this persona…" />' +
      '<button class="btn" id="thread-send" type="button">Send</button></div>' +
      '<div class="decision" id="thread-actions"></div>');
    var current = null;

    var paint = function (claim) {
      claim = claim || {};
      var heldByOther = Boolean(claim.claimedBy && claim.claimedBy !== (state.staff && state.staff.id));
      var mine = Boolean(claim.claimedBy && claim.claimedBy === (state.staff && state.staff.id));
      var banner = sheet.querySelector('#thread-claim');
      if (banner) {
        banner.innerHTML = heldByOther
          ? 'With <b>' + esc(claim.claimedByName || 'another operator') + '</b> until ' + esc(fmtDate(claim.expiresAt)) + '. Sending is locked until the lease ends.'
          : mine
            ? 'You have this thread until ' + esc(fmtDate(claim.expiresAt)) + '. Sends renew the lease.'
            : 'Nobody has claimed this thread. Replying (or pressing Take over) starts a 30-minute lease.';
      }
      var input = sheet.querySelector('#thread-input');
      var send = sheet.querySelector('#thread-send');
      if (input) input.disabled = heldByOther;
      if (send) send.disabled = heldByOther;
      var actions = sheet.querySelector('#thread-actions');
      if (actions) {
        actions.innerHTML =
          (heldByOther ? '' : mine
            ? '<button class="btn ghost" data-thread-action="release" type="button">Release thread</button>'
            : '<button class="btn" data-thread-action="claim" type="button">Take over</button>') +
          '<button class="btn ghost" data-thread-action="escalate" type="button">' + (claim.escalatedAt ? 'Clear escalation' : 'Escalate to admin') + '</button>' +
          (claim.escalationNote ? '<span class="muted" style="font-size:12px">Escalated: ' + esc(claim.escalationNote) + '</span>' : '');
        actions.querySelectorAll('[data-thread-action]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var action = btn.getAttribute('data-thread-action');
            if (action === 'claim') {
              api('/threads/' + encodeURIComponent(matchId) + '/claim', { method: 'POST' })
                .then(function () { toast('Thread claimed'); load(); loadThreads(); })
                .catch(function (err) { toast(err.message, true); load(); });
            } else if (action === 'release') {
              api('/threads/' + encodeURIComponent(matchId) + '/release', { method: 'POST' })
                .then(function () { toast('Thread released'); load(); loadThreads(); })
                .catch(function (err) { toast(err.message, true); });
            } else {
              escalateThread(matchId, Boolean(claim.escalatedAt)).then(load);
              loadThreads();
            }
          });
        });
      }
    };

    var load = function () {
      api('/threads/' + encodeURIComponent(matchId) + '/messages').then(function (json) {
        current = json;
        var body = $('#thread-body');
        if (!body) return;
        body.innerHTML = (json.messages || []).length ? json.messages.map(function (m) {
          var fromPersona = m.senderId === json.npc.id;
          var content = m.kind === 'photo'
            ? (m.mediaUrl ? '<img src="' + esc(m.mediaUrl) + '" alt="" data-zoom="' + esc(m.mediaUrl) + '" style="max-width:220px;border-radius:10px" />' : '<i>photo</i>')
            : esc(m.text);
          // Attribution is console-only: members still see one persona voice.
          var label = fromPersona ? json.npc.name : json.member ? json.member.name : 'Member';
          if (fromPersona && m.sentByName) label += ' · via ' + m.sentByName;
          return '<div class="bubble ' + (fromPersona ? 'me' : 'them') + '"><span class="sender">' + esc(label) + '</span>' + content + '</div>';
        }).join('') : '<div class="muted">No messages yet.</div>';
        body.scrollTop = body.scrollHeight;
        paint(json.claim);
      }).catch(function (err) {
        var body = $('#thread-body');
        if (body) body.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
      });
    };

    var send = function () {
      var input = $('#thread-input');
      if (!input || input.disabled) return;
      var text = (input.value || '').trim();
      if (!text) return;
      input.disabled = true;
      api('/threads/' + encodeURIComponent(matchId) + '/messages', { method: 'POST', body: { text: text } })
        .then(function () { input.value = ''; input.disabled = false; load(); loadThreads(); })
        .catch(function (err) {
          input.disabled = false;
          toast(err.message, true);
          // A 409 means someone else took the lease while we typed; repaint the
          // banner so the composer locks instead of silently failing again.
          load();
        });
    };

    load();
    var sendBtn = sheet.querySelector('#thread-send');
    if (sendBtn) sendBtn.addEventListener('click', send);
    var textInput = sheet.querySelector('#thread-input');
    if (textInput) textInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  }

  // ---------- npc editors ----------
  var NPC_CATEGORIES = ['Military', 'Police', 'Paramilitary', 'Healthcare', 'Education', 'Engineering', 'Business & Entrepreneurship', 'Law & Government', 'Others'];
  var NPC_GOALS = [['', 'Not specified'], ['marriage', 'Marriage'], ['long_term', 'Long-term relationship'], ['intentional', 'Intentional dating'], ['exploring', 'Exploring'], ['not_sure', 'Not sure yet']];

  function editNpc(npcId) {
    var n = state.npcs.find(function (x) { return x.id === npcId; });
    if (!n) return;
    var photos = (n.photos || []).slice();
    var photosChanged = false;
    var field = function (key, label, value, placeholder) {
      return '<div class="decision" style="padding:8px 18px"><span style="flex:0 0 120px;font-size:12px" class="muted">' + label + '</span>' +
        '<input type="text" id="npc-' + key + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '" /></div>';
    };
    var section = function (title, hint) {
      return '<div style="padding:16px 18px 2px"><span style="font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#8a7f72">' + esc(title) + '</span>' +
        (hint ? '<p class="muted" style="font-size:11px;margin:3px 0 0">' + esc(hint) + '</p>' : '') + '</div>';
    };
    var selectField = function (key, label, value, options) {
      return '<div class="decision" style="padding:8px 18px"><span style="flex:0 0 120px;font-size:12px" class="muted">' + label + '</span>' +
        '<select id="npc-' + key + '" style="flex:1;min-width:0">' + options.map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (String(value || '') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('') + '</select></div>';
    };
    var areaField = function (key, label, value, placeholder) {
      return '<div class="decision" style="padding:8px 18px;align-items:flex-start"><span style="flex:0 0 120px;font-size:12px;padding-top:8px" class="muted">' + label + '</span>' +
        '<textarea id="npc-' + key + '" rows="3" placeholder="' + esc(placeholder || '') + '" style="flex:1;min-width:0">' + esc(value || '') + '</textarea></div>';
    };

    var photoBlock =
      '<div style="padding:10px 18px 4px">' +
        '<span style="font-size:12px" class="muted">Photos</span>' +
        '<div id="npc-edit-photos" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"></div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">' +
          '<input type="file" id="npc-photo-file" accept="image/jpeg,image/png,image/webp" style="max-width:220px" />' +
          '<button class="btn" id="npc-photo-upload" type="button" style="margin-top:0">Upload photo</button>' +
        '</div>' +
        '<p class="muted" style="font-size:11px;margin:6px 0 0">First photo is the portrait members see first. The name and photos save together.</p>' +
      '</div>';

    // A working link back to the source gallery for this face. It is stored in
    // the persona document, which only the console reads, so members never get
    // it; moderators can use it on the personas assigned to them.
    var sourceUrl = String((n.persona || {}).photoSourceUrl || '');
    var sourceBlock =
      '<div class="decision" style="padding:8px 18px;align-items:flex-start">' +
        '<span style="flex:0 0 120px;font-size:12px;padding-top:8px" class="muted">Photo source</span>' +
        '<div style="flex:1;min-width:0">' +
          '<input type="url" id="npc-photo-source" value="' + esc(sourceUrl) + '" maxlength="500" placeholder="https://… folder, drive or gallery for this face" />' +
          '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">' +
            '<button class="btn ghost" id="npc-photo-source-open" type="button" style="margin-top:0"' + (sourceUrl ? '' : ' disabled') + '>Open link</button>' +
            '<button class="btn ghost" id="npc-photo-source-copy" type="button" style="margin-top:0"' + (sourceUrl ? '' : ' disabled') + '>Copy link</button>' +
          '</div>' +
          '<p class="muted" style="font-size:11px;margin:6px 0 0">Admin and assigned moderator only — members never see this. Paste the stock-photo page, drive folder or gallery for this face, then open it to download more photos.</p>' +
        '</div>' +
      '</div>';

    var nameBlock =
      '<div class="decision" style="padding:8px 18px;align-items:flex-start">' +
        '<span style="flex:0 0 120px;font-size:12px;padding-top:8px" class="muted">Name</span>' +
        '<div style="flex:1;min-width:0">' +
          '<input type="text" id="npc-name" value="' + esc(n.name || '') + '" maxlength="60" placeholder="First Last" />' +
          '<p class="muted" style="font-size:11px;margin:5px 0 0">Use a natural first and last name — this is what members read on the card.</p>' +
        '</div>' +
      '</div>';

    // Every field a member can hold is editable here, in the same order the
    // member sees it. Nothing on a persona is a hidden constant.
    var existingPrompts = (n.prompts || []).slice(0, 3);
    var promptRows = '';
    for (var pi = 0; pi < 3; pi++) {
      var pr = existingPrompts[pi] || {};
      promptRows +=
        '<div class="decision" style="padding:6px 18px;gap:8px;align-items:flex-start">' +
          '<span style="flex:0 0 120px;font-size:12px;padding-top:8px" class="muted">Prompt ' + (pi + 1) + '</span>' +
          '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">' +
            '<input type="text" id="npc-prompt-q-' + pi + '" value="' + esc(pr.question || '') + '" maxlength="60" placeholder="Question — e.g. A perfect weekend" />' +
            '<input type="text" id="npc-prompt-a-' + pi + '" value="' + esc(pr.answer || '') + '" maxlength="220" placeholder="Their answer" />' +
          '</div>' +
        '</div>';
    }

    var lifestyle = n.lifestyle || {};
    var values = n.values || {};
    var sheet = openSheet('Edit persona — ' + n.name,
      photoBlock +
      sourceBlock +
      section('Identity', 'What the card reads first.') +
      nameBlock +
      field('birthDate', 'Date of birth', n.birthDate, 'YYYY-MM-DD') +
      selectField('gender', 'Gender', n.gender, [['female', 'Female'], ['male', 'Male']]) +
      field('pronouns', 'Pronouns', n.pronouns, 'she/her, he/him') +
      field('countryCode', 'Country code', n.countryCode, 'US, GB, NG…') +
      section('Service & work', 'Cadre replaces rank entirely.') +
      selectField('professionCategory', 'Category', n.professionCategory, NPC_CATEGORIES.map(function (c) { return [c, c]; })) +
      field('professionTitle', 'Job title / trade', n.professionTitle, 'e.g. Software Engineer') +
      field('companyOrOrg', 'Employer / organisation', n.companyOrOrg, 'e.g. Lagos State Teaching Hospital') +
      field('service', 'Service', n.service, 'US Army, Metropolitan Police…') +
      field('branch', 'Branch', (n.persona || {}).branch, 'Army / Navy / Air Force / Marines') +
      field('race', 'Photo pool', (n.persona || {}).race, 'white, black, hispanic…') +
      selectField('orgRole', 'Cadre', n.orgRole, [['', '— none (civilian) —'], ['officer', 'Commissioned (officer)'], ['soldier', 'Non-commissioned (soldier)']]) +
      field('skill', 'Trade / skill', n.skill, 'Nursing / Medical') +
      field('dutyStation', 'Duty station', n.dutyStation, 'Optional') +
      field('educationLevel', 'Education', n.educationLevel, 'e.g. BSc, HND, SSCE') +
      field('almaMater', 'School / academy', n.almaMater, 'e.g. NDA, UNILAG, ABU Zaria') +
      section('Profile', '') +
      field('city', 'City', n.city) +
      field('state', 'State', n.state) +
      '<div class="decision" style="padding:8px 18px"><span style="flex:0 0 120px;font-size:12px" class="muted">Interests</span>' +
        '<input type="text" id="npc-interests" value="' + esc((n.interests || []).join(', ')) + '" placeholder="Comma separated" /></div>' +
      areaField('bio', 'Biography', n.bio, 'What they say in their own words') +
      selectField('datingGoal', 'Looking for', n.datingGoal, NPC_GOALS) +
      section('Lifestyle', 'Optional — shown as a grid on the profile.') +
      selectField('exercise', 'Exercise', lifestyle.exercise, [['', '—'], ['daily', 'Daily'], ['frequently', 'Often'], ['occasionally', 'Sometimes'], ['rarely', 'Rarely']]) +
      selectField('drinking', 'Drinking', lifestyle.drinking, [['', '—'], ['never', 'Never'], ['socially', 'Socially'], ['regularly', 'Regularly']]) +
      selectField('smoking', 'Smoking', lifestyle.smoking, [['', '—'], ['never', 'Never'], ['socially', 'Socially'], ['regularly', 'Regularly']]) +
      selectField('pets', 'Pets', lifestyle.pets, [['', '—'], ['dogs', 'Dog person'], ['cats', 'Cat person'], ['both', 'Both'], ['none', 'No pets']]) +
      section('Values & family', '') +
      field('faith', 'Faith', values.faith, 'e.g. Christian, Muslim') +
      selectField('faithImportance', 'Faith matters', values.faithImportance, [['', '—'], ['very_important', 'Very important'], ['somewhat', 'Somewhat'], ['not_important', 'Not important']]) +
      selectField('familyPlans', 'Family plans', values.familyPlans, [['', '—'], ['want_children', 'Want children'], ['open_to_children', 'Open to children'], ['have_children_want_more', 'Have children, want more'], ['dont_want_children', 'Do not want children'], ['not_sure', 'Not sure yet']]) +
      section('Conversation prompts', 'Up to three. Blank rows are removed.') +
      promptRows +
      section('Trust & visibility', '') +
      (isAdmin()
        ? selectField('verificationStatus', 'Verification', n.verificationStatus, [['verified', 'Verified — seal shown'], ['pending', 'Pending review'], ['not_started', 'Not verified']]) +
          '<div class="decision" style="padding:8px 18px;gap:12px">' +
            '<label style="font-size:12px"><input type="checkbox" id="npc-greeter" ' + (n.persona && n.persona.greeter ? 'checked' : '' ) + ' /> Greeter (proactively messages new matches)</label>' +
            '<label style="font-size:12px"><input type="checkbox" id="npc-curated" ' + (n.curated || (n.persona && n.persona.curated) ? 'checked' : '') + ' /> In curated set (hand-vetted shortlist)</label>' +
            '<label style="font-size:12px"><input type="checkbox" id="npc-active" ' + (n.active ? 'checked' : '') + ' /> Active in discovery</label>' +
            '<label style="font-size:12px"><input type="checkbox" id="npc-ai" ' + (n.aiEnabled ? 'checked' : '') + ' /> AI replies (falls back to the messages above if the AI is unavailable)</label>' +
            (n.photoReview === 'quarantine'
              ? '<span class="muted" style="font-size:12px">Photo quarantined: ' + esc(n.quarantineReason || 'reads as generated') + ' — replace the photos and release it.</span>'
              : '') +
          '</div>'
        : '<div class="decision" style="padding:8px 18px;gap:12px">' +
            '<span class="muted" style="font-size:12px">Verification: <b>' + esc(n.verificationStatus || 'not_started') + '</b> · ' + esc(n.active ? 'live in discovery' : 'paused') + ' · ' + esc(n.curated ? 'in the curated set' : 'pool persona') + ' · ' + esc(n.aiEnabled ? 'AI replies on' : 'scripted replies') + '</span>' +
            '<label style="font-size:12px"><input type="checkbox" id="npc-greeter" ' + (n.persona && n.persona.greeter ? 'checked' : '' ) + ' /> Greeter (proactively messages new matches)</label>' +
            '<span class="muted" style="font-size:12px">Only an admin can change verification, activation, the curated flag, AI replies or release a quarantined photo.</span>' +
            (n.photoReview === 'quarantine'
              ? '<span class="muted" style="font-size:12px">Photo quarantined: ' + esc(n.quarantineReason || 'reads as generated') + '. Upload a replacement — an admin releases it.</span>'
              : '') +
          '</div>') +
      '<div class="decision" style="padding:12px 18px"><button class="btn primary" id="npc-save" type="button" style="margin-top:0">Save persona</button></div>');

    var renderPhotos = function () {
      var row = sheet.querySelector('#npc-edit-photos');
      row.innerHTML = photos.length
        ? photos.map(function (url, i) {
            return '<span style="position:relative;display:inline-block">' +
              '<img src="' + esc(url) + '" alt="" data-zoom="' + esc(url) + '" style="width:54px;height:70px;object-fit:cover;border-radius:10px;border:1px solid #e5e0d8" />' +
              (i === 0 ? '<span style="position:absolute;left:4px;bottom:4px;background:#b85a3c;color:#fff;font-size:9px;padding:1px 5px;border-radius:99px">Main</span>' : '') +
              '<button type="button" data-premove="' + i + '" aria-label="Remove photo" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;min-width:20px;min-height:20px;border-radius:99px;border:0;background:#1a1816;color:#fff;font-size:12px;line-height:1;cursor:pointer">&#10005;</button>' +
              '</span>';
          }).join('')
        : '<span class="muted" style="font-size:12px">No photos yet.</span>';
      row.querySelectorAll('[data-premove]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          photos.splice(Number(btn.getAttribute('data-premove')), 1);
          photosChanged = true;
          renderPhotos();
        });
      });
    };
    renderPhotos();

    var sourceInput = sheet.querySelector('#npc-photo-source');
    var sourceOpen = sheet.querySelector('#npc-photo-source-open');
    var sourceCopy = sheet.querySelector('#npc-photo-source-copy');
    var validSource = function () { return /^https?:\/\//i.test((sourceInput.value || '').trim()); };
    var syncSource = function () {
      sourceOpen.disabled = !validSource();
      sourceCopy.disabled = !(sourceInput.value || '').trim();
    };
    sourceInput.addEventListener('input', syncSource);
    sourceOpen.addEventListener('click', function () {
      if (!validSource()) { toast('Add an http:// or https:// link first.', true); return; }
      window.open(sourceInput.value.trim(), '_blank', 'noopener,noreferrer');
    });
    sourceCopy.addEventListener('click', function () {
      var url = (sourceInput.value || '').trim();
      if (!url) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { toast('Source link copied'); },
          function () { toast('Could not copy — select the link and copy it.', true); });
      } else {
        sourceInput.select();
        try { document.execCommand('copy'); toast('Source link copied'); }
        catch (e) { toast('Could not copy — select the link and copy it.', true); }
      }
    });

    sheet.querySelector('#npc-photo-upload').addEventListener('click', function () {
      var file = sheet.querySelector('#npc-photo-file').files[0];
      if (!file) { toast('Choose an image first.', true); return; }
      if (photos.length >= 8) { toast('A persona can have up to 8 photos.', true); return; }
      if (['image/jpeg', 'image/png', 'image/webp'].indexOf(file.type) === -1) { toast('Use a JPEG, PNG or WebP image.', true); return; }
      if (file.size > 6 * 1024 * 1024) { toast('Image must be under 6 MB.', true); return; }
      api('/npcs/' + encodeURIComponent(npcId) + '/photo-presign', {
        method: 'POST',
        body: { contentType: file.type, contentLength: file.size }
      }).then(function (pre) {
        return fetch(pre.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }).then(function (res) {
          if (!res.ok) throw new Error('Upload to storage failed (' + res.status + ')');
          return pre.publicUrl || pre.key;
        });
      }).then(function (url) {
        photos.push(url);
        photosChanged = true;
        renderPhotos();
        toast('Photo uploaded — press Save persona to apply.');
      }).catch(function (err) { toast(err.message, true); });
    });

    sheet.querySelector('#npc-save').addEventListener('click', function () {
      var name = (sheet.querySelector('#npc-name').value || '').trim();
      if (name.length < 2) { toast('Give the persona a name with at least 2 characters.', true); return; }
      var interests = (sheet.querySelector('#npc-interests').value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var persona = Object.assign({}, n.persona || {}, { greeter: sheet.querySelector('#npc-greeter').checked });
      var value = function (key) { var el = sheet.querySelector('#npc-' + key); return el ? (el.value || '').trim() : ''; };
      var source = value('photo-source');
      if (source && !/^https?:\/\//i.test(source)) {
        toast('The photo source link must start with http:// or https://.', true);
        return;
      }
      // Branch and photo pool live in the persona document, not as columns.
      var branch = value('branch');
      var race = value('race');
      if (branch) persona.branch = branch; else delete persona.branch;
      if (race) persona.race = race; else delete persona.race;
      var prompts = [];
      for (var pj = 0; pj < 3; pj++) {
        var question = value('prompt-q-' + pj);
        var answer = value('prompt-a-' + pj);
        if (question && answer) prompts.push({ id: (existingPrompts[pj] && existingPrompts[pj].id) || ('p' + prompts.length), question: question, answer: answer });
      }
      var payload = {
        name: name,
        birthDate: value('birthDate'),
        gender: value('gender'),
        pronouns: value('pronouns'),
        professionCategory: value('professionCategory'),
        professionTitle: value('professionTitle'),
        companyOrOrg: value('companyOrOrg'),
        service: value('service'),
        orgRole: value('orgRole'),
        skill: value('skill'),
        dutyStation: value('dutyStation'),
        educationLevel: value('educationLevel'),
        almaMater: value('almaMater'),
        city: value('city'),
        state: value('state'),
        countryCode: value('countryCode').toUpperCase(),
        bio: value('bio'),
        datingGoal: value('datingGoal'),
        interests: interests,
        prompts: prompts,
        photoSourceUrl: source,
        lifestyle: {
          exercise: value('exercise'), drinking: value('drinking'),
          smoking: value('smoking'), pets: value('pets')
        },
        values: {
          faith: value('faith'), faithImportance: value('faithImportance'),
          familyPlans: value('familyPlans')
        },
        persona: persona
      };
      // Publishing controls are admin-only; sending them as a moderator is a
      // 403 by design, so leave them out of the patch entirely.
      if (isAdmin()) {
        payload.verificationStatus = value('verificationStatus');
        payload.curated = sheet.querySelector('#npc-curated').checked;
        payload.active = sheet.querySelector('#npc-active').checked;
        payload.aiEnabled = sheet.querySelector('#npc-ai').checked;
      }
      api('/npcs/' + encodeURIComponent(npcId), { method: 'PATCH', body: payload }).then(function () {
        if (!photosChanged) return null;
        return api('/npcs/' + encodeURIComponent(npcId) + '/photos', { method: 'POST', body: { photos: photos } });
      }).then(function () {
        toast('Persona updated');
        closeSheet();
        loadNpcs(true);
        if (state.tab === 'audit') loadAudit();
      }).catch(function (err) { toast(err.message, true); });
    });
  }

  // ---------- persona scripts (every line an NPC can send) ----------
  var SCRIPT_INTENTS = [
    ['smalltalk', 'Small talk'],
    ['questions', 'Answering questions'],
    ['compliment', 'Compliments'],
    ['logistics', 'Making plans'],
    ['farewell', 'Goodbyes'],
    ['offTopic', 'Off-topic']
  ];
  var SCRIPT_INTENT_LABEL = {};
  SCRIPT_INTENTS.forEach(function (pair) { SCRIPT_INTENT_LABEL[pair[0]] = pair[1]; });

  function editNpcScripts(npcId) {
    var npc = state.npcs.find(function (x) { return x.id === npcId; });
    var sheet = openSheet('Messages — ' + (npc ? npc.name : 'persona'),
      '<div id="npc-scripts-body" style="padding:14px 18px"><span class="muted">Loading messages…</span></div>');

    function reload() {
      api('/npcs/' + encodeURIComponent(npcId) + '/scripts').then(function (json) {
        var body = sheet.querySelector('#npc-scripts-body');
        if (!body) return;
        var scripts = json.scripts || [];
        var order = ['greeting'].concat(SCRIPT_INTENTS.map(function (p) { return p[0]; }));
        var groups = {};
        scripts.forEach(function (s) {
          var key = s.kind === 'greeting' ? 'greeting' : (s.intent || 'offTopic');
          (groups[key] = groups[key] || []).push(s);
        });

        var html = '<p class="muted" style="margin:0 0 10px">These are every line this persona can send. ' +
          'The engine picks one per conversation, so add several per group to keep it varied. ' +
          'Use <code>{you}</code> for the member\'s first name.</p>' +
          '<p class="muted" style="margin:0 0 12px">' + scripts.length + ' message' + (scripts.length === 1 ? '' : 's') + ' on file.</p>';

        order.forEach(function (key) {
          var list = groups[key] || [];
          var label = key === 'greeting' ? 'Opening message' : (SCRIPT_INTENT_LABEL[key] || key);
          html += '<h4 style="margin:16px 0 6px">' + esc(label) + ' <span class="muted">(' + list.length + ')</span></h4>';
          if (!list.length) {
            html += '<p class="muted" style="margin:0 0 8px">None yet — the shared fallback pool is used.</p>';
          }
          list.forEach(function (s) {
            html += '<div class="script-row" data-script="' + esc(s.id) + '" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">' +
              '<textarea rows="2" style="flex:1;min-width:0" data-script-body>' + esc(s.body) + '</textarea>' +
              '<button class="btn" data-script-save type="button" style="margin-top:0">Save</button>' +
              '<button class="btn reject" data-script-delete type="button" style="margin-top:0">Delete</button>' +
            '</div>';
          });
        });

        html += '<h4 style="margin:20px 0 6px">Add a message</h4>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">' +
            '<select id="script-kind" style="min-width:150px">' +
              '<option value="greeting">Opening message</option>' +
              SCRIPT_INTENTS.map(function (p) { return '<option value="' + esc(p[0]) + '">Reply: ' + esc(p[1]) + '</option>'; }).join('') +
            '</select>' +
            '<textarea id="script-new" rows="2" style="flex:1;min-width:180px" placeholder="New message…"></textarea>' +
            '<button class="btn primary" id="script-add" type="button" style="margin-top:0">Add</button>' +
          '</div>';

        body.innerHTML = html;

        body.querySelectorAll('[data-script]').forEach(function (row) {
          var id = row.dataset.script;
          var textarea = row.querySelector('[data-script-body]');
          row.querySelector('[data-script-save]').addEventListener('click', function () {
            var value = (textarea.value || '').trim();
            if (!value) { toast('Message cannot be empty', true); return; }
            api('/npcs/' + encodeURIComponent(npcId) + '/scripts/' + encodeURIComponent(id), {
              method: 'PATCH', body: { body: value }
            }).then(function () { toast('Message saved'); })
              .catch(function (err) { toast(err.message, true); });
          });
          row.querySelector('[data-script-delete]').addEventListener('click', function () {
            if (!window.confirm('Delete this message?')) return;
            api('/npcs/' + encodeURIComponent(npcId) + '/scripts/' + encodeURIComponent(id), { method: 'DELETE' })
              .then(function () { toast('Message deleted'); reload(); })
              .catch(function (err) { toast(err.message, true); });
          });
        });

        body.querySelector('#script-add').addEventListener('click', function () {
          var kind = body.querySelector('#script-kind').value;
          var value = (body.querySelector('#script-new').value || '').trim();
          if (!value) { toast('Write the message first', true); return; }
          var payload = { kind: kind === 'greeting' ? 'greeting' : 'reply', body: value };
          if (kind !== 'greeting') payload.intent = kind;
          api('/npcs/' + encodeURIComponent(npcId) + '/scripts', { method: 'POST', body: payload })
            .then(function () { toast('Message added'); reload(); })
            .catch(function (err) { toast(err.message, true); });
        });
      }).catch(function (err) {
        var body = sheet.querySelector('#npc-scripts-body');
        if (body) body.innerHTML = '<span class="muted">' + esc(err.message) + '</span>';
      });
    }

    reload();
  }

  function editNpcPhotos(npcId) {
    var n = state.npcs.find(function (x) { return x.id === npcId; });
    if (!n) return;
    var photos = (n.photos || []).slice();
    var render = function (sheet) {
      var row = sheet.querySelector('#npc-photos');
      row.innerHTML = photos.length ? photos.map(function (url, i) {
        return '<figure style="margin:0;position:relative"><img src="' + esc(url) + '" alt="" data-zoom="' + esc(url) + '" />' +
          '<button class="btn ghost" data-remove="' + i + '" type="button" style="padding:2px 8px;font-size:11px;margin-top:4px">Remove</button></figure>';
      }).join('') : '<span class="muted">No photos yet.</span>';
      row.querySelectorAll('[data-remove]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          photos.splice(Number(btn.getAttribute('data-remove')), 1);
          render(sheet);
        });
      });
    };
    var sheet = openSheet('Photos — ' + n.name,
      '<div style="padding:12px 18px"><div id="npc-photos" style="display:flex;gap:10px;flex-wrap:wrap"></div>' +
      '<div class="row-actions" style="margin-top:12px"><input type="file" id="npc-photo-file" accept="image/jpeg,image/png,image/webp" />' +
      '<button class="btn" id="npc-photo-upload" type="button">Upload photo</button>' +
      '<button class="btn primary" id="npc-photos-save" type="button" style="margin-top:0;width:auto">Save photo list</button></div></div>');
    render(sheet);
    sheet.querySelector('#npc-photo-upload').addEventListener('click', function () {
      var file = sheet.querySelector('#npc-photo-file').files[0];
      if (!file) { toast('Choose an image first.', true); return; }
      if (file.size > 6 * 1024 * 1024) { toast('Image must be under 6 MB.', true); return; }
      api('/npcs/' + encodeURIComponent(npcId) + '/photo-presign', {
        method: 'POST',
        body: { contentType: file.type, contentLength: file.size }
      }).then(function (pre) {
        return fetch(pre.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }).then(function (res) {
          if (!res.ok) throw new Error('Upload to storage failed (' + res.status + ')');
          return pre.publicUrl || pre.key;
        });
      }).then(function (url) {
        photos.push(url);
        render(sheet);
        toast('Photo uploaded — press Save photo list to apply.');
      }).catch(function (err) { toast(err.message, true); });
    });
    sheet.querySelector('#npc-photos-save').addEventListener('click', function () {
      api('/npcs/' + encodeURIComponent(npcId) + '/photos', { method: 'POST', body: { photos: photos } })
        .then(function () { toast('Photos saved'); closeSheet(); loadNpcs(true); if (state.tab === 'audit') loadAudit(); })
        .catch(function (err) { toast(err.message, true); });
    });
  }

  // ---------- interactions ----------
  document.addEventListener('click', function (event) {
    var zoom = event.target.closest('[data-zoom]');
    if (zoom) {
      window.open(zoom.getAttribute('data-zoom'), '_blank', 'noopener');
      return;
    }

    var button = event.target.closest('[data-action]');
    if (!button) return;

    var card = button.closest('[data-id]');
    if (card && (button.dataset.action === 'approve' || button.dataset.action === 'reject')) {
      var approve = button.dataset.action === 'approve';
      var noteInput = card.querySelector('[data-note]');
      var note = noteInput ? noteInput.value.trim() : '';
      if (!approve && !note) {
        toast('Add a short reason before rejecting.', true);
        if (noteInput) noteInput.focus();
        return;
      }
      card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      api('/verifications/' + encodeURIComponent(card.dataset.id) + '/review', {
        method: 'POST',
        body: { approve: approve, note: note || undefined }
      }).then(function (json) {
        toast((approve ? 'Approved ' : 'Rejected ') + ((json.user && json.user.name) || 'submission'));
        card.remove();
        state.queue = state.queue.filter(function (q) { return q.id !== card.dataset.id; });
        $('#count-verifications').textContent = String(state.queue.length);
        if (!state.queue.length) renderQueue($('#queue'));
        if (state.tab === 'audit') loadAudit();
      }).catch(function (err) {
        toast(err.message, true);
        card.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
      });
      return;
    }

    var report = button.closest('[data-report]');
    if (report && button.dataset.action === 'context') { openReportContext(report.dataset.report); return; }
    if (report && button.dataset.action === 'status') {
      var select = report.querySelector('[data-status]');
      var reviewNote = report.querySelector('[data-review-note]');
      api('/reports/' + encodeURIComponent(report.dataset.report) + '/status', {
        method: 'POST',
        body: { status: select.value, reviewNote: reviewNote ? reviewNote.value.trim() : undefined }
      }).then(function () {
        toast('Report marked ' + select.value.replace('_', ' '));
        loadReports();
      }).catch(function (err) { toast(err.message, true); });
      return;
    }
    if (report && (button.dataset.action === 'block' || button.dataset.action === 'unblock')) {
      var block = button.dataset.action === 'block';
      if (block && !window.confirm('Block this account? Their sessions end immediately and they disappear from discovery.')) return;
      api('/users/' + encodeURIComponent(report.dataset.user) + '/block', {
        method: 'POST',
        body: { blocked: block, reason: 'Safety review' }
      }).then(function () {
        toast(block ? 'Account blocked' : 'Account restored');
        loadReports();
      }).catch(function (err) { toast(err.message, true); });
      return;
    }

    var appeal = button.closest('[data-appeal]');
    if (appeal) {
      if (button.dataset.action === 'appeal-grant') { decideAppeal(appeal.dataset.appeal, true); return; }
      if (button.dataset.action === 'appeal-deny') { decideAppeal(appeal.dataset.appeal, false); return; }
      if (button.dataset.action === 'appeal-user') {
        var record = state.appeals.find(function (a) { return String(a.id) === appeal.dataset.appeal; });
        if (record && record.profile) sanctionSheet(record.profile.id, record.profile.name);
        return;
      }
    }

    var thread = button.closest('[data-thread]');
    if (thread && button.dataset.action === 'open-thread') { openThread(thread.dataset.thread); return; }
    if (thread && button.dataset.action === 'claim-thread') { claimThread(thread.dataset.thread); return; }
    if (thread && button.dataset.action === 'release-thread') { releaseThread(thread.dataset.thread); return; }
    if (thread && button.dataset.action === 'escalate-thread') {
      var threadRecord = state.threads.find(function (t) { return String(t.id) === thread.dataset.thread; });
      escalateThread(thread.dataset.thread, Boolean(threadRecord && threadRecord.escalatedAt));
      return;
    }

    var npc = button.closest('[data-npc]');
    if (npc) {
      if (button.dataset.action === 'npc-edit') { editNpc(npc.dataset.npc); return; }
      if (button.dataset.action === 'npc-scripts') { editNpcScripts(npc.dataset.npc); return; }
      if (button.dataset.action === 'npc-photos') { editNpcPhotos(npc.dataset.npc); return; }
      if (button.dataset.action === 'npc-assign') { openAssignSheet(npc.dataset.npc); return; }
      if (button.dataset.action === 'npc-curate') {
        var personaRecord = state.npcs.find(function (x) { return x.id === npc.dataset.npc; });
        var inSet = !(personaRecord && (personaRecord.curated || (personaRecord.persona || {}).curated));
        button.disabled = true;
        api('/npcs/' + encodeURIComponent(npc.dataset.npc), { method: 'PATCH', body: { curated: inSet } })
          .then(function () {
            if (personaRecord) {
              personaRecord.curated = inSet;
              personaRecord.persona = Object.assign({}, personaRecord.persona || {});
              if (inSet) personaRecord.persona.curated = true;
              else delete personaRecord.persona.curated;
            }
            replaceNpcCard(npc.dataset.npc);
            toast(inSet ? 'Added to the curated set' : 'Removed from the curated set');
          })
          .catch(function (err) { button.disabled = false; toast(err.message, true); });
        return;
      }
      if (button.dataset.action === 'npc-toggle') {
        var record = state.npcs.find(function (x) { return x.id === npc.dataset.npc; });
        var next = !(record && record.active);
        button.disabled = true;
        // Patch the record and repaint only this card. Reloading the whole list
        // threw the page back to the top, so staff lost the persona they had
        // just paused halfway down a long list.
        api('/npcs/' + encodeURIComponent(npc.dataset.npc), { method: 'PATCH', body: { active: next } })
          .then(function () {
            if (record) record.active = next;
            replaceNpcCard(npc.dataset.npc);
            toast(next ? 'Persona activated' : 'Persona paused');
          })
          .catch(function (err) { button.disabled = false; toast(err.message, true); });
        return;
      }
      if (button.dataset.action === 'npc-quarantine') {
        var row = state.npcs.find(function (x) { return x.id === npc.dataset.npc; });
        var quarantine = !(row && row.photoReview === 'quarantine');
        var reason = quarantine
          ? window.prompt('Why is this photo being quarantined? The persona is paused immediately.', row && row.quarantineReason ? row.quarantineReason : 'Photo reads as generated')
          : '';
        if (quarantine && !reason) return;
        button.disabled = true;
        api('/npcs/' + encodeURIComponent(npc.dataset.npc) + '/quarantine', {
          method: 'POST', body: { quarantine: quarantine, reason: reason || undefined }
        }).then(function () {
          if (row) {
            row.photoReview = quarantine ? 'quarantine' : 'ok';
            row.quarantineReason = quarantine ? reason : undefined;
            if (quarantine) row.active = false;
          }
          replaceNpcCard(npc.dataset.npc);
          toast(quarantine ? 'Quarantined and paused' : 'Photo review cleared');
        }).catch(function (err) { button.disabled = false; toast(err.message, true); });
        return;
      }
    }
  });

  // Shortcut: sanction actions on an arbitrary account (from appeals).
  function sanctionSheet(userId, name) {
    openSheet('Account actions — ' + (name || 'member'),
      '<div class="decision" style="padding:16px 18px;flex-wrap:wrap">' +
        '<button class="btn" data-quick="restrict" type="button">Restrict</button>' +
        '<button class="btn reject" data-quick="ban" type="button">Ban</button>' +
        '<button class="btn approve" data-quick="lift" type="button">Lift sanction</button>' +
        '<button class="btn reject" data-quick="delete" type="button">Delete account</button>' +
      '</div>').querySelectorAll('[data-quick]').forEach(function (btn) {
        btn.addEventListener('click', function () { sanction(userId, btn.getAttribute('data-quick')); });
      });
  }

  // ---------- boot ----------
  function startGoogle() {
    if (window.google && window.google.accounts && window.google.accounts.id) { initializeGoogle(); return; }
    var script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    script.onerror = function () { $('#gate-error').textContent = 'Google sign-in could not load.'; };
    document.head.appendChild(script);
  }
  var saved = sessionStorage.getItem('wassaa.adminSession');
  if (saved) {
    try {
      var session = JSON.parse(saved);
      state.accessToken = session.accessToken || '';
      state.refreshToken = session.refreshToken || '';
      state.expiresAt = Number(session.expiresAt) || 0;
      fetch(API_ROOT + '/public-config').then(function (r) { return r.json(); }).then(function (c) {
        state.publishableKey = c.publishableKey;
        return api('/session');
      }).then(unlock).catch(function () { lock(); });
    } catch (_) { sessionStorage.removeItem('wassaa.adminSession'); startGoogle(); }
  } else startGoogle();
})();

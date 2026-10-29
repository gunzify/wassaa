/* WASSAA integrity console — plain ES2020, no build step, no third-party code. */
(function () {
  'use strict';

  var API_ROOT = 'https://avlbsficfejvwokxkgyl.supabase.co/functions/v1/api';
  var state = { accessToken: '', refreshToken: '', expiresAt: 0, publishableKey: '', admin: '', tab: 'verifications', queue: [], reports: [], appeals: [], threads: [], npcs: [], audit: [], storage: false };

  var $ = function (sel) { return document.querySelector(sel); };
  var gate = $('#gate');
  var app = $('#app');
  var toastTimer = null;
  var TABS = ['verifications', 'reports', 'appeals', 'threads', 'npcs', 'audit'];

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
      if (name === 'npcs') loadNpcs();
    });
  });

  $('#refresh').addEventListener('click', loadAll);
  $('#reports-filter').addEventListener('change', loadReports);
  $('#appeals-filter').addEventListener('change', loadAppeals);
  $('#threads-filter').addEventListener('change', loadThreads);
  $('#npc-search-btn').addEventListener('click', loadNpcs);
  $('#npc-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') loadNpcs(); });

  // ---------- loading ----------
  function loadAll() {
    loadSession();
    loadQueue();
    loadReports();
    loadAppeals();
    loadThreads();
    if (state.tab === 'npcs') loadNpcs();
    if (state.tab === 'audit') loadAudit();
  }

  function loadSession() {
    api('/session').then(function (json) {
      state.storage = !!json.storage;
      var flag = $('#storage-flag');
      flag.textContent = json.storage ? 'R2 connected' : 'R2 not configured';
      flag.className = 'flag' + (json.storage ? '' : ' warn');
    }).catch(function () { /* gate handles auth errors */ });
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
    api('/threads' + (filter ? '?state=' + encodeURIComponent(filter) : '')).then(function (json) {
      state.threads = json.threads || [];
      $('#count-threads').textContent = String(state.threads.length);
      renderThreads(box);
    }).catch(function (err) {
      box.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
    });
  }

  function loadNpcs() {
    var box = $('#npcs');
    var search = ($('#npc-search').value || '').trim();
    api('/npcs' + (search ? '?search=' + encodeURIComponent(search) : '')).then(function (json) {
      state.npcs = json.npcs || [];
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
            '<div class="doc">' + esc(item.documentType) + ' · <b>' + esc(item.documentNumberMasked) + '</b><br />' + esc(fmtDate(item.submittedAt)) + '</div>' +
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
          '</div>' +
          '<div class="decision">' +
            '<input type="text" maxlength="300" placeholder="Review note (reason if rejecting)" data-note />' +
            '<button class="btn approve" data-action="approve" type="button">Approve</button>' +
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
      return (
        '<article class="card" data-thread="' + esc(t.id) + '">' +
          '<div class="card-head">' +
            '<div class="who"><strong>' + esc(t.npc.name) + ' ↔ ' + esc(t.member.name) + '</strong>' +
              '<span>' + esc(t.autoSpent || 0) + ' auto-replies used · ' + esc(fmtDate(t.createdAt)) + '</span></div>' +
            '<div class="doc"><span class="state ' + esc(t.autoState) + '">' + esc(t.autoState.replace('_', ' ')) + '</span>' +
              (t.takenOverBy ? '<br />operated by your team' : '') + '</div>' +
          '</div>' +
          '<div class="decision">' +
            '<button class="btn" data-action="open-thread" type="button">Open conversation</button>' +
            (t.autoState === 'quiet' ? '<span class="muted" style="font-size:12px">Auto-reply paused. A credit purchase by the member hands this thread to your team.</span>' : '') +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  // ---------- render: npcs ----------
  function renderNpcs(box) {
    if (!state.npcs.length) {
      box.innerHTML = '<div class="empty">No personas match.</div>';
      return;
    }
    box.innerHTML = state.npcs.map(function (n) {
      var photo = (n.photos || [])[0];
      return (
        '<article class="npc" data-npc="' + esc(n.id) + '">' +
          '<div class="cover">' + (photo
            ? '<img src="' + esc(photo) + '" alt="" data-zoom="' + esc(photo) + '" />'
            : '<div class="none">No photo</div>') + '</div>' +
          '<div class="body">' +
            '<strong>' + esc(n.name) + (n.active ? '' : ' <span class="badge">paused</span>') + '</strong>' +
            '<span class="meta">' + esc(n.age || '—') + ' · ' + esc([n.city, n.state].filter(Boolean).join(', ')) + '</span>' +
            '<span>' + esc([n.orgRole, n.skill, n.professionTitle].filter(Boolean).join(' · ') || n.professionCategory || '') + '</span>' +
            '<span>' + esc((n.verified === undefined ? n.verificationStatus : n.verificationStatus) || '') + ' · greeter: ' + esc(n.persona && n.persona.greeter ? 'yes' : 'no') + '</span>' +
            '<div class="actions">' +
              '<button class="btn" data-action="npc-edit" type="button">Edit</button>' +
              '<button class="btn" data-action="npc-photos" type="button">Photos</button>' +
              '<button class="btn ' + (n.active ? 'reject' : 'approve') + '" data-action="npc-toggle" type="button">' + (n.active ? 'Pause' : 'Activate') + '</button>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join('');
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
    openSheet('Conversation', '<div class="conv" id="thread-body"><div class="muted">Loading…</div></div>' +
      '<div class="composer"><input id="thread-input" type="text" maxlength="4000" placeholder="Reply as this persona…" />' +
      '<button class="btn" id="thread-send" type="button">Send</button></div>');
    var load = function () {
      api('/threads/' + encodeURIComponent(matchId) + '/messages').then(function (json) {
        var body = $('#thread-body');
        if (!body) return;
        body.innerHTML = (json.messages || []).length ? json.messages.map(function (m) {
          var mine = m.senderId === json.npc.id;
          var content = m.kind === 'photo'
            ? (m.mediaUrl ? '<img src="' + esc(m.mediaUrl) + '" alt="" data-zoom="' + esc(m.mediaUrl) + '" style="max-width:220px;border-radius:10px" />' : '<i>photo</i>')
            : esc(m.text);
          return '<div class="bubble ' + (mine ? 'me' : 'them') + '"><span class="sender">' + esc(mine ? json.npc.name : json.member ? json.member.name : 'Member') + '</span>' + content + '</div>';
        }).join('') : '<div class="muted">No messages yet.</div>';
        body.scrollTop = body.scrollHeight;
      }).catch(function (err) {
        var body = $('#thread-body');
        if (body) body.innerHTML = '<div class="empty">' + esc(err.message) + '</div>';
      });
    };
    load();
    var send = function () {
      var input = $('#thread-input');
      var text = (input.value || '').trim();
      if (!text) return;
      api('/threads/' + encodeURIComponent(matchId) + '/messages', { method: 'POST', body: { text: text } })
        .then(function () { input.value = ''; load(); if (state.tab === 'audit') loadAudit(); })
        .catch(function (err) { toast(err.message, true); });
    };
    $('#thread-send').addEventListener('click', send);
    $('#thread-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
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
      section('Identity', 'What the card reads first.') +
      nameBlock +
      field('birthDate', 'Date of birth', n.birthDate, 'YYYY-MM-DD') +
      selectField('gender', 'Gender', n.gender, [['female', 'Female'], ['male', 'Male']]) +
      field('pronouns', 'Pronouns', n.pronouns, 'she/her, he/him') +
      section('Service & work', 'Cadre replaces rank entirely.') +
      selectField('professionCategory', 'Category', n.professionCategory, NPC_CATEGORIES.map(function (c) { return [c, c]; })) +
      field('professionTitle', 'Job title / trade', n.professionTitle, 'e.g. Software Engineer') +
      field('companyOrOrg', 'Employer / organisation', n.companyOrOrg, 'e.g. Lagos State Teaching Hospital') +
      field('service', 'Service', n.service, 'Nigerian Army, FRSC…') +
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
      selectField('verificationStatus', 'Verification', n.verificationStatus, [['verified', 'Verified — seal shown'], ['pending', 'Pending review'], ['not_started', 'Not verified']]) +
      '<div class="decision" style="padding:8px 18px;gap:12px">' +
        '<label style="font-size:12px"><input type="checkbox" id="npc-greeter" ' + (n.persona && n.persona.greeter ? 'checked' : '' ) + ' /> Greeter (proactively messages new matches)</label>' +
        '<label style="font-size:12px"><input type="checkbox" id="npc-active" ' + (n.active ? 'checked' : '') + ' /> Active in discovery</label>' +
      '</div>' +
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
      var prompts = [];
      for (var pj = 0; pj < 3; pj++) {
        var question = value('prompt-q-' + pj);
        var answer = value('prompt-a-' + pj);
        if (question && answer) prompts.push({ id: (existingPrompts[pj] && existingPrompts[pj].id) || ('p' + prompts.length), question: question, answer: answer });
      }
      api('/npcs/' + encodeURIComponent(npcId), {
        method: 'PATCH',
        body: {
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
          bio: value('bio'),
          datingGoal: value('datingGoal'),
          verificationStatus: value('verificationStatus'),
          interests: interests,
          prompts: prompts,
          lifestyle: {
            exercise: value('exercise'), drinking: value('drinking'),
            smoking: value('smoking'), pets: value('pets')
          },
          values: {
            faith: value('faith'), faithImportance: value('faithImportance'),
            familyPlans: value('familyPlans')
          },
          persona: persona,
          active: sheet.querySelector('#npc-active').checked
        }
      }).then(function () {
        if (!photosChanged) return null;
        return api('/npcs/' + encodeURIComponent(npcId) + '/photos', { method: 'POST', body: { photos: photos } });
      }).then(function () {
        toast('Persona updated');
        closeSheet();
        loadNpcs();
        if (state.tab === 'audit') loadAudit();
      }).catch(function (err) { toast(err.message, true); });
    });
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
        .then(function () { toast('Photos saved'); closeSheet(); loadNpcs(); if (state.tab === 'audit') loadAudit(); })
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

    var npc = button.closest('[data-npc]');
    if (npc) {
      if (button.dataset.action === 'npc-edit') { editNpc(npc.dataset.npc); return; }
      if (button.dataset.action === 'npc-photos') { editNpcPhotos(npc.dataset.npc); return; }
      if (button.dataset.action === 'npc-toggle') {
        var record = state.npcs.find(function (x) { return x.id === npc.dataset.npc; });
        api('/npcs/' + encodeURIComponent(npc.dataset.npc), { method: 'PATCH', body: { active: !(record && record.active) } })
          .then(function () { toast(record && record.active ? 'Persona paused' : 'Persona activated'); loadNpcs(); })
          .catch(function (err) { toast(err.message, true); });
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

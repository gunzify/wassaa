/* WASSAA integrity console — plain ES2020, no build step, no third-party code. */
(function () {
  'use strict';

  var API_ROOT = 'https://avlbsficfejvwokxkgyl.supabase.co/functions/v1/api';
  var state = { accessToken: '', refreshToken: '', expiresAt: 0, publishableKey: '', admin: '', tab: 'verifications', queue: [], reports: [], audit: [], storage: false };

  var $ = function (sel) { return document.querySelector(sel); };
  var gate = $('#gate');
  var app = $('#app');
  var toastTimer = null;

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
      ['verifications', 'reports', 'audit'].forEach(function (panel) {
        $('#panel-' + panel).classList.toggle('hidden', panel !== name);
      });
      if (name === 'audit') loadAudit();
    });
  });

  $('#refresh').addEventListener('click', loadAll);

  // ---------- loading ----------
  function loadAll() {
    loadSession();
    loadQueue();
    loadReports();
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
    api('/reports?status=all').then(function (json) {
      state.reports = json.reports || [];
      var open = state.reports.filter(function (r) { return r.status === 'pending_review' || r.status === 'investigating'; }).length;
      $('#count-reports').textContent = String(open);
      renderReports(box);
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
        '<article class="card" data-report="' + esc(r.id) + '" data-user="' + esc(r.reportedUserId) + '">' +
          '<div class="card-head">' +
            '<div class="who"><strong>' + esc(r.categoryLabel || r.category) + '</strong>' +
              '<span>' + esc((r.reporter && r.reporter.name) || 'Member') + ' → ' + esc((r.reported && r.reported.name) || 'Member') + '</span></div>' +
            '<div class="doc"><span class="badge ' + (open ? 'hot' : '') + '">' + esc(r.status.replace('_', ' ')) + '</span><br />' + esc(fmtDate(r.createdAt)) + '</div>' +
          '</div>' +
          '<div class="report-body">' +
            '<p>' + esc(r.details) + '</p>' +
            (r.serviceBranch ? '<p class="muted">Service: ' + esc(r.serviceBranch) + '</p>' : '') +
            '<div class="row-actions">' +
              '<select data-status>' + statuses.map(function (s) {
                return '<option value="' + s + '"' + (s === r.status ? ' selected' : '') + '>' + s.replace('_', ' ') + '</option>';
              }).join('') + '</select>' +
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
    if (!report) return;

    if (button.dataset.action === 'status') {
      var select = report.querySelector('[data-status]');
      api('/reports/' + encodeURIComponent(report.dataset.report) + '/status', {
        method: 'POST',
        body: { status: select.value }
      }).then(function () {
        toast('Report marked ' + select.value.replace('_', ' '));
        loadReports();
      }).catch(function (err) { toast(err.message, true); });
      return;
    }

    if (button.dataset.action === 'block' || button.dataset.action === 'unblock') {
      var block = button.dataset.action === 'block';
      if (block && !window.confirm('Block this account? Their sessions end immediately and they disappear from discovery.')) return;
      api('/users/' + encodeURIComponent(report.dataset.user) + '/block', {
        method: 'POST',
        body: { blocked: block, reason: 'Safety review' }
      }).then(function () {
        toast(block ? 'Account blocked' : 'Account restored');
        loadReports();
      }).catch(function (err) { toast(err.message, true); });
    }
  });

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

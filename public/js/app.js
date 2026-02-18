/* ═══════════════════════════════════════════════════════════════════════════
   Stoia Mail — Single Page App
   ═══════════════════════════════════════════════════════════════════════════ */

const App = (() => {

  // ── State ────────────────────────────────────────────────────────────────
  let state = {
    accounts: [],
    activeAccount: null,
    folders: [],
    activeFolder: 'INBOX',
    emails: [],
    activeEmail: null,
    polling: null,
    loadingFolders: false,
    loadingEmails: false,
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function api(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const isThisYear = date.getFullYear() === now.getFullYear();
    if (isThisYear) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
  }

  function senderColor(from) {
    if (!from) return 0;
    let hash = 0;
    for (let i = 0; i < from.length; i++) hash = ((hash << 5) - hash) + from.charCodeAt(i);
    return Math.abs(hash) % 8;
  }

  function extractName(from) {
    if (!from) return 'Unknown';
    const m = from.match(/^([^<]+)</) || from.match(/^([^@]+)/);
    return m ? m[1].trim() : from;
  }

  function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type}`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'toast hidden'; }, 3500);
  }

  function folderIcon(name) {
    const n = name.toLowerCase();
    if (n === 'inbox') return '📥';
    if (n.includes('sent')) return '📤';
    if (n.includes('draft')) return '📝';
    if (n.includes('trash') || n.includes('deleted')) return '🗑';
    if (n.includes('spam') || n.includes('junk')) return '🚫';
    if (n.includes('archive')) return '📦';
    if (n.includes('star') || n.includes('flag')) return '⭐';
    return '📁';
  }

  // ── Modals ───────────────────────────────────────────────────────────────

  function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
  function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

  // ── Accounts ─────────────────────────────────────────────────────────────

  async function loadAccounts() {
    state.accounts = await api('GET', '/api/accounts');
    renderAccountTabs();
    if (state.accounts.length > 0 && !state.activeAccount) {
      selectAccount(state.accounts[0].id);
    }
  }

  function renderAccountTabs() {
    const el = document.getElementById('account-tabs');
    el.innerHTML = state.accounts.map(a => `
      <button class="account-tab ${a.id === state.activeAccount ? 'active' : ''}"
              data-id="${a.id}">
        ${a.label || a.email}
      </button>
    `).join('');
    el.querySelectorAll('.account-tab').forEach(btn => {
      btn.addEventListener('click', () => selectAccount(btn.dataset.id));
    });
  }

  async function selectAccount(id) {
    state.activeAccount = id;
    state.activeFolder = 'INBOX';
    state.emails = [];
    state.activeEmail = null;
    renderAccountTabs();
    renderEmailReader(null);
    renderEmailList([]);
    await loadFolders();
    await loadEmails();
    startPolling();
  }

  // ── Folders ──────────────────────────────────────────────────────────────

  async function loadFolders() {
    if (!state.activeAccount) return;
    state.loadingFolders = true;
    renderFolderList([]);
    try {
      state.folders = await api('GET', `/api/accounts/${state.activeAccount}/folders`);
      renderFolderList(state.folders);
    } catch (e) {
      showToast('Failed to load folders: ' + e.message, 'error');
      renderFolderList([]);
    }
    state.loadingFolders = false;
  }

  function renderFolderList(folders) {
    const el = document.getElementById('folder-list');
    if (!folders || folders.length === 0) {
      el.innerHTML = '<div class="loading-spinner">Loading...</div>';
      return;
    }
    el.innerHTML = folders.map(f => `
      <div class="folder-item ${f.full === state.activeFolder || f.name === state.activeFolder ? 'active' : ''}"
           data-folder="${f.full || f.name}">
        <span class="folder-icon">${folderIcon(f.name)}</span>
        <span>${f.name}</span>
      </div>
    `).join('');
    el.querySelectorAll('.folder-item').forEach(item => {
      item.addEventListener('click', () => selectFolder(item.dataset.folder));
    });
  }

  async function selectFolder(folder) {
    state.activeFolder = folder;
    state.activeEmail = null;
    document.getElementById('folder-title').textContent = folder;
    renderFolderList(state.folders);
    renderEmailReader(null);
    await loadEmails();
  }

  // ── Emails ───────────────────────────────────────────────────────────────

  async function loadEmails() {
    if (!state.activeAccount) return;
    state.loadingEmails = true;
    renderEmailList(null);
    try {
      state.emails = await api('GET',
        `/api/accounts/${state.activeAccount}/emails?folder=${encodeURIComponent(state.activeFolder)}&limit=50`
      );
      document.getElementById('email-count').textContent = `${state.emails.length} emails`;
      renderEmailList(state.emails);
    } catch (e) {
      showToast('Failed to load emails: ' + e.message, 'error');
      renderEmailList([]);
    }
    state.loadingEmails = false;
  }

  function renderEmailList(emails) {
    const el = document.getElementById('email-list');
    if (emails === null) {
      el.innerHTML = '<div class="loading-spinner">Loading emails...</div>';
      return;
    }
    if (!emails || emails.length === 0) {
      el.innerHTML = '<div class="empty-state">No emails in this folder</div>';
      return;
    }
    el.innerHTML = emails.map(e => `
      <div class="email-item ${e.read ? '' : 'unread'} ${e.uid == state.activeEmail?.uid ? 'active' : ''}"
           data-uid="${e.uid}">
        <div class="email-item-row1">
          <span class="email-sender sender-color-${senderColor(e.from)}">${escHtml(extractName(e.from))}</span>
          <span class="email-date">${formatDate(e.date)}</span>
        </div>
        <div class="email-subject">${escHtml(e.subject)}</div>
        <div class="email-snippet">${escHtml(e.snippet || '')}</div>
      </div>
    `).join('');
    el.querySelectorAll('.email-item').forEach(item => {
      item.addEventListener('click', () => openEmail(item.dataset.uid));
    });
  }

  async function openEmail(uid) {
    if (!state.activeAccount) return;
    // Mark active in list
    document.querySelectorAll('.email-item').forEach(i => {
      i.classList.toggle('active', i.dataset.uid == uid);
    });
    renderEmailReader('loading');
    try {
      const email = await api('GET',
        `/api/accounts/${state.activeAccount}/emails/${uid}?folder=${encodeURIComponent(state.activeFolder)}`
      );
      state.activeEmail = email;
      // Mark read locally
      const listEmail = state.emails.find(e => e.uid == uid);
      if (listEmail) {
        listEmail.read = true;
        document.querySelector(`.email-item[data-uid="${uid}"]`)?.classList.remove('unread');
      }
      renderEmailReader(email);
    } catch (e) {
      showToast('Failed to load email: ' + e.message, 'error');
      renderEmailReader(null);
    }
  }

  function renderEmailReader(email) {
    const el = document.getElementById('email-reader');
    if (!email) {
      el.innerHTML = `<div class="empty-state reader-empty">
        <div class="empty-icon">✉</div>
        <p>Select an email to read</p>
      </div>`;
      return;
    }
    if (email === 'loading') {
      el.innerHTML = '<div class="loading-spinner" style="margin-top:40px">Loading email...</div>';
      return;
    }

    const bodyContent = email.html
      ? `<div class="email-body-html">${email.html}</div>`
      : `<div class="email-body-text">${escHtml(email.text || '(empty)')}</div>`;

    const attHtml = email.attachments && email.attachments.length
      ? `<div class="email-attachments">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">
            📎 Attachments (${email.attachments.length})
          </div>
          ${email.attachments.map(a => `
            <span class="attachment-item">📎 ${escHtml(a.filename || 'attachment')} (${formatSize(a.size)})</span>
          `).join('')}
        </div>`
      : '';

    el.innerHTML = `
      <div class="email-header-view">
        <div class="email-subject-view">${escHtml(email.subject)}</div>
        <div class="email-meta">
          <div class="email-meta-row">
            <span class="email-meta-label">From</span>
            <span class="email-meta-value">${escHtml(email.from)}</span>
          </div>
          <div class="email-meta-row">
            <span class="email-meta-label">To</span>
            <span class="email-meta-value">${escHtml(email.to)}</span>
          </div>
          ${email.cc ? `<div class="email-meta-row">
            <span class="email-meta-label">CC</span>
            <span class="email-meta-value">${escHtml(email.cc)}</span>
          </div>` : ''}
          <div class="email-meta-row">
            <span class="email-meta-label">Date</span>
            <span class="email-meta-value">${email.date ? new Date(email.date).toLocaleString() : ''}</span>
          </div>
        </div>
        <div class="email-actions-view">
          <button class="btn-action" onclick="App.reply()">↩ Reply</button>
          <button class="btn-action" onclick="App.forward()">↪ Forward</button>
          <button class="btn-action danger" onclick="App.deleteEmail()">🗑 Delete</button>
          <button class="btn-action" onclick="App.archiveEmail()">📦 Archive</button>
        </div>
      </div>
      <div class="email-body-view">
        ${bodyContent}
        ${attHtml}
      </div>
    `;
  }

  function formatSize(bytes) {
    if (!bytes) return '?';
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + 'KB';
    return (bytes / 1048576).toFixed(1) + 'MB';
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Compose / Reply / Forward ─────────────────────────────────────────────

  function openCompose({ to = '', subject = '', body = '' } = {}) {
    document.getElementById('compose-to').value = to;
    document.getElementById('compose-cc').value = '';
    document.getElementById('compose-subject').value = subject;
    document.getElementById('compose-body').value = body;
    openModal('modal-compose');
    document.getElementById('compose-to').focus();
  }

  async function sendEmail() {
    if (!state.activeAccount) return showToast('No account selected', 'error');
    const to = document.getElementById('compose-to').value.trim();
    const cc = document.getElementById('compose-cc').value.trim();
    const subject = document.getElementById('compose-subject').value.trim();
    const text = document.getElementById('compose-body').value;
    if (!to) return showToast('Please enter a recipient', 'error');
    const btn = document.getElementById('btn-send');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
      await api('POST', `/api/accounts/${state.activeAccount}/send`, { to, cc, subject, text });
      showToast('Email sent!', 'success');
      closeModal('modal-compose');
    } catch (e) {
      showToast('Send failed: ' + e.message, 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Send ✈';
  }

  function reply() {
    if (!state.activeEmail) return;
    const e = state.activeEmail;
    const to = e.from;
    const subject = e.subject.startsWith('Re:') ? e.subject : `Re: ${e.subject}`;
    const body = `\n\n--- Original Message ---\nFrom: ${e.from}\nDate: ${e.date ? new Date(e.date).toLocaleString() : ''}\n\n${e.text || ''}`;
    openCompose({ to, subject, body });
  }

  function forward() {
    if (!state.activeEmail) return;
    const e = state.activeEmail;
    const subject = e.subject.startsWith('Fwd:') ? e.subject : `Fwd: ${e.subject}`;
    const body = `\n\n--- Forwarded Message ---\nFrom: ${e.from}\nDate: ${e.date ? new Date(e.date).toLocaleString() : ''}\nSubject: ${e.subject}\n\n${e.text || ''}`;
    openCompose({ to: '', subject, body });
  }

  async function deleteEmail() {
    if (!state.activeAccount || !state.activeEmail) return;
    const uid = state.activeEmail.uid;
    try {
      await api('DELETE', `/api/accounts/${state.activeAccount}/emails/${uid}?folder=${encodeURIComponent(state.activeFolder)}`);
      showToast('Email deleted', 'success');
      state.emails = state.emails.filter(e => e.uid != uid);
      state.activeEmail = null;
      renderEmailList(state.emails);
      renderEmailReader(null);
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
  }

  async function archiveEmail() {
    if (!state.activeAccount || !state.activeEmail) return;
    const uid = state.activeEmail.uid;
    // Try common archive folder names
    const archiveNames = ['Archive', 'Archives', 'INBOX.Archive'];
    const found = state.folders.find(f => archiveNames.some(n => f.name.toLowerCase() === n.toLowerCase() || f.full.toLowerCase() === n.toLowerCase()));
    const toFolder = found ? (found.full || found.name) : 'Archive';
    try {
      await api('POST', `/api/accounts/${state.activeAccount}/emails/${uid}/move`, {
        fromFolder: state.activeFolder,
        toFolder,
      });
      showToast('Archived!', 'success');
      state.emails = state.emails.filter(e => e.uid != uid);
      state.activeEmail = null;
      renderEmailList(state.emails);
      renderEmailReader(null);
    } catch (e) {
      showToast('Archive failed: ' + e.message, 'error');
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  function startPolling() {
    if (state.polling) clearInterval(state.polling);
    state.polling = setInterval(async () => {
      if (!state.activeAccount || state.loadingEmails) return;
      // Silent refresh
      try {
        const fresh = await api('GET',
          `/api/accounts/${state.activeAccount}/emails?folder=${encodeURIComponent(state.activeFolder)}&limit=50`
        );
        const prevCount = state.emails.length;
        state.emails = fresh;
        document.getElementById('email-count').textContent = `${fresh.length} emails`;
        renderEmailList(fresh);
        if (fresh.length > prevCount) {
          showToast(`${fresh.length - prevCount} new email(s)`, 'success');
        }
      } catch {}
    }, 60000); // every 60s
  }

  // ── Settings / Account Management ─────────────────────────────────────────

  let editingAccountId = null;

  function openSettings() {
    renderSettingsAccountList();
    hideAccountForm();
    openModal('modal-settings');
  }

  function renderSettingsAccountList() {
    const el = document.getElementById('settings-account-list');
    if (!state.accounts.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No accounts yet.</p>';
      return;
    }
    el.innerHTML = state.accounts.map(a => `
      <div class="settings-account-item">
        <div class="settings-account-icon">${(a.label || a.email)[0].toUpperCase()}</div>
        <div class="settings-account-info">
          <div class="settings-account-label">${escHtml(a.label || a.email)}</div>
          <div class="settings-account-email">${escHtml(a.email)}</div>
        </div>
        <div class="settings-account-actions">
          <button class="btn-ghost btn-sm" onclick="App.editAccount('${a.id}')">Edit</button>
          <button class="btn-danger btn-sm" onclick="App.removeAccount('${a.id}')">Remove</button>
        </div>
      </div>
    `).join('');
  }

  function showAccountForm(account = null) {
    editingAccountId = account ? account.id : null;
    document.getElementById('account-form-title').textContent = account ? 'Edit Account' : 'New Account';
    document.getElementById('af-label').value = account?.label || '';
    document.getElementById('af-email').value = account?.email || '';
    document.getElementById('af-imap-host').value = account?.imapHost || '';
    document.getElementById('af-imap-port').value = account?.imapPort || 993;
    document.getElementById('af-smtp-host').value = account?.smtpHost || '';
    document.getElementById('af-smtp-port').value = account?.smtpPort || 465;
    document.getElementById('af-pass').value = '';
    document.getElementById('account-form-wrap').classList.remove('hidden');
  }

  function hideAccountForm() {
    editingAccountId = null;
    document.getElementById('account-form-wrap').classList.add('hidden');
  }

  async function saveAccount() {
    const label = document.getElementById('af-label').value.trim();
    const email = document.getElementById('af-email').value.trim();
    const imapHost = document.getElementById('af-imap-host').value.trim();
    const imapPort = parseInt(document.getElementById('af-imap-port').value) || 993;
    const smtpHost = document.getElementById('af-smtp-host').value.trim();
    const smtpPort = parseInt(document.getElementById('af-smtp-port').value) || 465;
    const pass = document.getElementById('af-pass').value;

    if (!email || !imapHost || !smtpHost) {
      return showToast('Please fill in all required fields', 'error');
    }

    try {
      if (editingAccountId) {
        const body = { label, imapHost, imapPort, smtpHost, smtpPort };
        if (pass) { body.imapPass = pass; body.smtpPass = pass; }
        await api('PUT', `/api/accounts/${editingAccountId}`, body);
        showToast('Account updated', 'success');
      } else {
        if (!pass) return showToast('Password required', 'error');
        await api('POST', '/api/accounts', {
          label, email,
          imapHost, imapPort, imapUser: email, imapPass: pass,
          smtpHost, smtpPort, smtpUser: email, smtpPass: pass,
          tls: true, rejectUnauthorized: false,
        });
        showToast('Account added', 'success');
      }
      await loadAccounts();
      renderSettingsAccountList();
      hideAccountForm();
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
    }
  }

  async function editAccount(id) {
    const a = state.accounts.find(x => x.id === id);
    if (a) showAccountForm(a);
  }

  async function removeAccount(id) {
    if (!confirm('Remove this account?')) return;
    try {
      await api('DELETE', `/api/accounts/${id}`);
      showToast('Account removed', 'success');
      if (state.activeAccount === id) {
        state.activeAccount = null;
        state.emails = [];
        state.folders = [];
        renderEmailList([]);
        renderFolderList([]);
        renderEmailReader(null);
      }
      await loadAccounts();
      renderSettingsAccountList();
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  function init() {
    // Compose
    document.getElementById('btn-compose').addEventListener('click', () => openCompose());
    document.getElementById('btn-send').addEventListener('click', sendEmail);

    // Settings
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('btn-add-account').addEventListener('click', () => showAccountForm());
    document.getElementById('btn-save-account').addEventListener('click', saveAccount);
    document.getElementById('btn-cancel-account').addEventListener('click', hideAccountForm);

    // Refresh
    document.getElementById('btn-refresh').addEventListener('click', () => {
      loadFolders();
      loadEmails();
    });

    // Modal close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.modal-backdrop').forEach(bd => {
      bd.addEventListener('click', () => {
        bd.closest('.modal').classList.add('hidden');
      });
    });

    // Load accounts
    loadAccounts();
  }

  // Public API (for inline onclick handlers)
  return {
    init,
    reply,
    forward,
    deleteEmail,
    archiveEmail,
    editAccount,
    removeAccount,
  };

})();

document.addEventListener('DOMContentLoaded', App.init);

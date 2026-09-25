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
    unread: {},        // accountId -> unread count (INBOX)
    polling: null,
    loadingFolders: false,
    loadingEmails: false,
    loadingMore: false,
    totalEmails: 0,
    currentOffset: 0,
    searchMode: false,
    searchQuery: '',
    filters: {
      search: '',
      unreadOnly: false,
      dateRange: 'all',
    },
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
    // Refresh unread counts for every connected inbox on load
    refreshAllUnread();
  }

  function renderAccountTabs() {
    const el = document.getElementById('account-tabs');
    el.innerHTML = state.accounts.map(a => {
      const count = state.unread[a.id] || 0;
      const badge = count > 0
        ? `<span class="account-badge" title="${count} unread">${count > 99 ? '99+' : count}</span>`
        : '';
      return `
      <button class="account-tab ${a.id === state.activeAccount ? 'active' : ''}"
              data-id="${a.id}">
        <span class="account-tab-label">${escHtml(a.label || a.email)}</span>${badge}
      </button>`;
    }).join('');
    el.querySelectorAll('.account-tab').forEach(btn => {
      btn.addEventListener('click', () => selectAccount(btn.dataset.id));
    });
  }

  // Fetch INBOX unread count for one account and update its badge
  async function refreshUnread(id) {
    try {
      const { unread } = await api('GET', `/api/accounts/${id}/unread`);
      state.unread[id] = unread;
      renderAccountTabs();
    } catch { /* ignore — keep prior count */ }
  }

  // Fetch unread counts for all connected inboxes in parallel
  function refreshAllUnread() {
    state.accounts.forEach(a => refreshUnread(a.id));
  }

  async function selectAccount(id) {
    state.activeAccount = id;
    state.activeFolder = 'INBOX';
    state.activeEmail = null;
    renderAccountTabs();
    renderEmailReader(null);
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

  async function loadEmails(append = false) {
    if (!state.activeAccount) return;
    if (!append) {
      state.loadingEmails = true;
      state.currentOffset = 0;
      state.emails = [];
      state.searchMode = false;
      state.searchQuery = '';
      renderEmailList(null);
    } else {
      state.loadingMore = true;
    }
    try {
      const result = await api('GET',
        `/api/accounts/${state.activeAccount}/emails?folder=${encodeURIComponent(state.activeFolder)}&limit=50&offset=${state.currentOffset}`
      );
      state.totalEmails = result.total;
      if (append) {
        state.emails = state.emails.concat(result.emails);
      } else {
        state.emails = result.emails;
      }
      state.currentOffset = state.emails.length;
      renderEmailList(state.emails);
    } catch (e) {
      showToast('Failed to load emails: ' + e.message, 'error');
      if (!append) renderEmailList([]);
    }
    state.loadingEmails = false;
    state.loadingMore = false;
  }

  async function searchEmailsServer(query, append = false) {
    if (!state.activeAccount || !query) return;
    if (!append) {
      state.loadingEmails = true;
      state.currentOffset = 0;
      state.emails = [];
      state.searchMode = true;
      state.searchQuery = query;
      renderEmailList(null);
    } else {
      state.loadingMore = true;
    }
    try {
      const result = await api('GET',
        `/api/accounts/${state.activeAccount}/search?folder=${encodeURIComponent(state.activeFolder)}&q=${encodeURIComponent(query)}&limit=50&offset=${state.currentOffset}`
      );
      state.totalEmails = result.total;
      if (append) {
        state.emails = state.emails.concat(result.emails);
      } else {
        state.emails = result.emails;
      }
      state.currentOffset = state.emails.length;
      renderEmailList(state.emails);
    } catch (e) {
      showToast('Search failed: ' + e.message, 'error');
      if (!append) renderEmailList([]);
    }
    state.loadingEmails = false;
    state.loadingMore = false;
  }

  async function loadMore() {
    if (state.loadingMore || state.loadingEmails) return;
    if (state.currentOffset >= state.totalEmails) return;
    if (state.searchMode) {
      await searchEmailsServer(state.searchQuery, true);
    } else {
      await loadEmails(true);
    }
  }

  function renderEmailList(emails) {
    const el = document.getElementById('email-list');
    if (emails === null) {
      el.innerHTML = '<div class="loading-spinner">Loading emails...</div>';
      return;
    }
    // Apply local filters (unread/date only — search is now server-side)
    const filtered = applyFilters(emails);
    // Update count to show loaded vs total
    const countEl = document.getElementById('email-count');
    if (countEl) {
      const showing = filtered.length;
      const total = state.totalEmails;
      if (state.searchMode) {
        countEl.textContent = `${showing} / ${total} results`;
      } else if (showing < total) {
        countEl.textContent = `${showing} / ${total} emails`;
      } else {
        countEl.textContent = `${total} emails`;
      }
    }
    if (!filtered || filtered.length === 0) {
      el.innerHTML = `<div class="empty-state">${state.searchMode ? 'No emails match your search' : (emails.length ? 'No emails match your filters' : 'No emails in this folder')}</div>`;
      return;
    }

    const hasMore = state.currentOffset < state.totalEmails;

    el.innerHTML = filtered.map(e => `
      <div class="email-item ${e.read ? '' : 'unread'} ${e.uid == state.activeEmail?.uid ? 'active' : ''}"
           data-uid="${e.uid}">
        <div class="email-item-row1">
          <span class="email-sender sender-color-${senderColor(e.from)}">${escHtml(extractName(e.from))}</span>
          <span class="email-date">${formatDate(e.date)}</span>
        </div>
        <div class="email-subject">${escHtml(e.subject)}</div>
        <div class="email-snippet">${escHtml(e.snippet || '')}</div>
      </div>
    `).join('') + (hasMore ? `
      <div class="load-more-wrap">
        <button class="btn-load-more" id="btn-load-more">Load more (${state.totalEmails - state.currentOffset} remaining)</button>
      </div>
    ` : (state.totalEmails > 0 ? `<div class="load-more-wrap" style="color:var(--text-muted);font-size:12px;padding:12px;text-align:center;">All ${state.totalEmails} emails loaded</div>` : ''));

    el.querySelectorAll('.email-item').forEach(item => {
      item.addEventListener('click', () => openEmail(item.dataset.uid));
    });

    const loadMoreBtn = document.getElementById('btn-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', loadMore);
    }
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
      if (listEmail && !listEmail.read) {
        listEmail.read = true;
        document.querySelector(`.email-item[data-uid="${uid}"]`)?.classList.remove('unread');
        // Keep the account's unread badge in sync
        refreshUnread(state.activeAccount);
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
          ${email.attachments.map((a, i) => `
            <a href="/api/accounts/${state.activeAccount}/emails/${email.uid}/attachments/${i}?folder=${encodeURIComponent(state.activeFolder)}" 
               target="_blank" download="${escHtml(a.filename || 'attachment')}" 
               class="attachment-item" style="cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
              ⬇️ ${escHtml(a.filename || 'attachment')} (${formatSize(a.size)})
            </a>
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

  // ── Filters ──────────────────────────────────────────────────────────────

  function applyFilters(emails) {
    const { unreadOnly, dateRange } = state.filters;
    let result = emails;

    // Search is now server-side — no local filtering needed

    if (unreadOnly) {
      result = result.filter(e => !e.read);
    }

    if (dateRange !== 'all') {
      const now = new Date();
      let cutoff;
      if (dateRange === 'today') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateRange === 'week') {
        cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - 7);
      } else if (dateRange === 'month') {
        cutoff = new Date(now);
        cutoff.setMonth(cutoff.getMonth() - 1);
      }
      if (cutoff) {
        result = result.filter(e => e.date && new Date(e.date) >= cutoff);
      }
    }

    return result;
  }

  function updateFilterUI() {
    const { search, unreadOnly, dateRange } = state.filters;
    const unreadBtn = document.getElementById('filter-unread');
    const dateSelect = document.getElementById('filter-date');
    const searchInput = document.getElementById('filter-search');
    const clearBtn = document.getElementById('filter-clear');

    if (unreadBtn) unreadBtn.classList.toggle('filter-active', unreadOnly);
    if (dateSelect) dateSelect.value = dateRange;
    if (searchInput && searchInput.value !== search) searchInput.value = search;

    const anyActive = search || unreadOnly || dateRange !== 'all';
    if (clearBtn) clearBtn.classList.toggle('filter-active', anyActive);
  }

  let searchDebounce = null;

  function initFilterBar() {
    const searchEl = document.getElementById('filter-search');
    const unreadBtn = document.getElementById('filter-unread');
    const dateEl = document.getElementById('filter-date');
    const clearBtn = document.getElementById('filter-clear');

    if (searchEl) {
      searchEl.addEventListener('input', () => {
        state.filters.search = searchEl.value;
        updateFilterUI();
        // Debounce server-side search
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          const q = searchEl.value.trim();
          if (q.length >= 2) {
            searchEmailsServer(q);
          } else if (q.length === 0) {
            // Clear search — reload normal inbox
            loadEmails();
          }
        }, 400);
      });

      // Also support Enter key for immediate search
      searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          clearTimeout(searchDebounce);
          const q = searchEl.value.trim();
          if (q.length >= 1) {
            searchEmailsServer(q);
          } else {
            loadEmails();
          }
        }
      });
    }

    if (unreadBtn) {
      unreadBtn.addEventListener('click', () => {
        state.filters.unreadOnly = !state.filters.unreadOnly;
        updateFilterUI();
        renderEmailList(state.emails);
      });
    }

    if (dateEl) {
      dateEl.addEventListener('change', () => {
        state.filters.dateRange = dateEl.value;
        updateFilterUI();
        renderEmailList(state.emails);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.filters = { search: '', unreadOnly: false, dateRange: 'all' };
        updateFilterUI();
        // Reset to normal inbox view
        loadEmails();
      });
    }

    // Infinite scroll on the email list
    const emailListEl = document.getElementById('email-list');
    if (emailListEl) {
      emailListEl.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = emailListEl;
        // When within 100px of bottom, load more
        if (scrollTop + clientHeight >= scrollHeight - 100) {
          if (!state.loadingMore && !state.loadingEmails && state.currentOffset < state.totalEmails) {
            loadMore();
          }
        }
      });
    }
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

  // ── Folder menu (secret) ──────────────────────────────────────────────────

  function toggleFolderMenu(force) {
    const menu = document.getElementById('folder-menu');
    if (!menu) return;
    const show = force !== undefined ? force : menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !show);
  }

  async function markAllRead() {
    if (!state.activeAccount) return showToast('No account selected', 'error');
    toggleFolderMenu(false);
    try {
      const { marked } = await api('POST',
        `/api/accounts/${state.activeAccount}/mark-all-read?folder=${encodeURIComponent(state.activeFolder)}`
      );
      // Reflect read state locally
      state.emails.forEach(e => { e.read = true; });
      renderEmailList(state.emails);
      refreshUnread(state.activeAccount);
      showToast(marked ? `Marked ${marked} email(s) as read` : 'Nothing to mark', 'success');
    } catch (e) {
      showToast('Mark all read failed: ' + e.message, 'error');
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  function startPolling() {
    if (state.polling) clearInterval(state.polling);
    state.polling = setInterval(async () => {
      // Keep all inbox badges fresh even while reading another account
      refreshAllUnread();
      if (!state.activeAccount || state.loadingEmails || state.searchMode) return;
      // Silent refresh — only check first page for new emails
      try {
        const result = await api('GET',
          `/api/accounts/${state.activeAccount}/emails?folder=${encodeURIComponent(state.activeFolder)}&limit=50&offset=0`
        );
        const prevTotal = state.totalEmails;
        state.totalEmails = result.total;
        // Merge new emails at the top
        if (result.total > prevTotal) {
          const newCount = result.total - prevTotal;
          // Prepend new emails that aren't already in our list
          const existingUids = new Set(state.emails.map(e => e.uid));
          const newEmails = result.emails.filter(e => !existingUids.has(e.uid));
          state.emails = newEmails.concat(state.emails);
          state.currentOffset = state.emails.length;
          renderEmailList(state.emails);
          showToast(`${newCount} new email(s)`, 'success');
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
      refreshAllUnread();
    });

    // Secret folder menu (next to INBOX title)
    const folderMenuBtn = document.getElementById('btn-folder-menu');
    if (folderMenuBtn) {
      folderMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFolderMenu();
      });
    }
    const markAllBtn = document.getElementById('btn-mark-all-read');
    if (markAllBtn) markAllBtn.addEventListener('click', markAllRead);
    // Close the menu when clicking anywhere else
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.folder-menu-wrap')) toggleFolderMenu(false);
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

    // Filter bar
    initFilterBar();

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
    loadMore,
  };

})();

document.addEventListener('DOMContentLoaded', App.init);

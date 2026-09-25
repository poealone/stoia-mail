const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const AccountManager = require('./lib/account-manager');
const ImapClient = require('./lib/imap-client');
const SmtpClient = require('./lib/smtp-client');

const app = express();
const PORT = process.env.PORT || 4001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Accounts ──────────────────────────────────────────────────────────────────

app.get('/api/accounts', (req, res) => {
  try {
    const accounts = AccountManager.list();
    res.json(accounts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/accounts', (req, res) => {
  try {
    const account = AccountManager.add(req.body);
    res.json(account);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/accounts/:id', (req, res) => {
  try {
    const account = AccountManager.update(req.params.id, req.body);
    res.json(account);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  try {
    AccountManager.remove(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Folders ───────────────────────────────────────────────────────────────────

app.get('/api/accounts/:id/folders', async (req, res) => {
  try {
    const account = AccountManager.getDecrypted(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const client = new ImapClient(account);
    const folders = await client.listMailboxes();
    res.json(folders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Emails ────────────────────────────────────────────────────────────────────

app.get('/api/accounts/:id/emails', async (req, res) => {
  try {
    const account = AccountManager.getDecrypted(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const folder = req.query.folder || 'INBOX';
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const client = new ImapClient(account);
    const result = await client.fetchEmails(folder, limit, offset);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/accounts/:id/unread', async (req, res) => {
  try {
    const account = AccountManager.getDecrypted(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const folder = req.query.folder || 'INBOX';
    const client = new ImapClient(account);
    const unread = await client.unreadCount(folder);
    res.json({ unread });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/accounts/:id/mark-all-read', async (req, res) => {
  try {
    const account = AccountManager.getDecrypted(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const folder = req.query.folder || 'INBOX';
    const client = new ImapClient(account);
    const result = await client.markAllRead(folder);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/accounts/:id/search', async (req, res) => {
  try {
    const account = AccountManager.getDecrypted(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const folder = req.query.folder || 'INBOX';
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    if (!query) return res.status(400).json({ error: 'Search query required' });
    const client = new ImapClient(account);
    const result = await client.searchEmails(folder, query, limit, offset);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/accounts/:id/emails/:uid', async (req, res) => {
  try {
    const account = AccountManager.getDecrypted(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const folder = req.query.folder || 'INBOX';
    const client = new ImapClient(account);
    const email = await client.fetchEmail(folder, req.params.uid);
    res.json(email);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/accounts/:id/emails/:uid/read', async (req, res) => {
  try {
    const account = AccountManager.getDecrypted(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const folder = req.query.folder || 'INBOX';
    const client = new ImapClient(account);
    await client.markRead(folder, req.params.uid);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/accounts/:id/emails/:uid/move', async (req, res) => {
  try {
    const account = AccountManager.getDecrypted(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const { fromFolder, toFolder } = req.body;
    const client = new ImapClient(account);
    await client.moveEmail(fromFolder, req.params.uid, toFolder);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/accounts/:id/emails/:uid', async (req, res) => {
  try {
    const account = AccountManager.getDecrypted(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const folder = req.query.folder || 'INBOX';
    const client = new ImapClient(account);
    await client.deleteEmail(folder, req.params.uid);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Send ──────────────────────────────────────────────────────────────────────

app.post('/api/accounts/:id/send', async (req, res) => {
  try {
    const account = AccountManager.getDecrypted(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const result = await SmtpClient.send(account, req.body);

    // Save sent email to IMAP Sent folder
    if (result.rawMessage) {
      try {
        const client = new ImapClient(account);
        const appendResult = await client.appendToSent(result.rawMessage, account.sentFolder);
        result.savedToSent = true;
        result.sentFolder = appendResult.folder;
      } catch (e) {
        console.error(`Failed to save to Sent folder for ${account.email}:`, e.message);
        result.savedToSent = false;
        result.sentError = e.message;
      }
    }

    // Don't send raw message back to client
    delete result.rawMessage;
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Catch-all → SPA ──────────────────────────────────────────────────────────

// Download attachment
app.get('/api/accounts/:id/emails/:uid/attachments/:index', async (req, res) => {
  const account = AccountManager.getDecrypted(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  try {
    const client = new ImapClient(account);
    const folder = req.query.folder || 'INBOX';
    const att = await client.downloadAttachment(folder, req.params.uid, parseInt(req.params.index));
    res.setHeader('Content-Disposition', `attachment; filename="${att.filename.replace(/"/g, '\\"')}"`);
    res.setHeader('Content-Type', att.contentType);
    res.setHeader('Content-Length', att.content.length);
    res.send(att.content);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Stoia Mail running on http://0.0.0.0:${PORT}`);
});

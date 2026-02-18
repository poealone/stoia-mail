const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const AccountManager = require('./lib/account-manager');
const ImapClient = require('./lib/imap-client');
const SmtpClient = require('./lib/smtp-client');

const app = express();
const PORT = 3001;

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
    const client = new ImapClient(account);
    const emails = await client.fetchEmails(folder, limit);
    res.json(emails);
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
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Catch-all → SPA ──────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Stoia Mail running on http://localhost:${PORT}`);
});

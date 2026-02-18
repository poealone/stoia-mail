const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, '../data/accounts.json');
const ALGO = 'aes-256-cbc';
const SECRET = 'stoia-mail-secret-key-32byteslng!'; // 32 chars

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(SECRET, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  return iv.toString('hex') + ':' + enc;
}

function decrypt(text) {
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(SECRET, 'salt', 32);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  let dec = decipher.update(encrypted, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

function load() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return []; }
}

function save(accounts) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 2));
}

const AccountManager = {
  list() {
    return load().map(a => ({
      id: a.id,
      label: a.label,
      email: a.email,
      imapHost: a.imapHost,
      imapPort: a.imapPort,
      smtpHost: a.smtpHost,
      smtpPort: a.smtpPort,
      tls: a.tls,
    }));
  },

  getDecrypted(id) {
    const accounts = load();
    const a = accounts.find(x => x.id === id);
    if (!a) return null;
    return {
      ...a,
      imapPass: decrypt(a.imapPass),
      smtpPass: decrypt(a.smtpPass),
    };
  },

  add(data) {
    const accounts = load();
    const account = {
      id: uuidv4(),
      label: data.label || data.email,
      email: data.email,
      imapHost: data.imapHost,
      imapPort: data.imapPort || 993,
      imapUser: data.imapUser || data.email,
      imapPass: encrypt(data.imapPass),
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort || 465,
      smtpUser: data.smtpUser || data.email,
      smtpPass: encrypt(data.smtpPass),
      tls: data.tls !== false,
      rejectUnauthorized: data.rejectUnauthorized !== undefined ? data.rejectUnauthorized : false,
    };
    accounts.push(account);
    save(accounts);
    return { id: account.id, label: account.label, email: account.email };
  },

  update(id, data) {
    const accounts = load();
    const idx = accounts.findIndex(x => x.id === id);
    if (idx === -1) throw new Error('Account not found');
    const a = accounts[idx];
    if (data.label) a.label = data.label;
    if (data.imapHost) a.imapHost = data.imapHost;
    if (data.imapPort) a.imapPort = data.imapPort;
    if (data.imapPass) a.imapPass = encrypt(data.imapPass);
    if (data.smtpHost) a.smtpHost = data.smtpHost;
    if (data.smtpPort) a.smtpPort = data.smtpPort;
    if (data.smtpPass) a.smtpPass = encrypt(data.smtpPass);
    accounts[idx] = a;
    save(accounts);
    return { id: a.id, label: a.label, email: a.email };
  },

  remove(id) {
    const accounts = load();
    const filtered = accounts.filter(x => x.id !== id);
    if (filtered.length === accounts.length) throw new Error('Account not found');
    save(filtered);
  },
};

module.exports = AccountManager;

const Imap = require('imap');
const { simpleParser } = require('mailparser');

class ImapClient {
  constructor(account) {
    this.account = account;
    this.config = {
      user: account.imapUser || account.email,
      password: account.imapPass,
      host: account.imapHost,
      port: account.imapPort || 993,
      tls: account.tls !== false,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
      connTimeout: 15000,
    };
  }

  _connect() {
    return new Promise((resolve, reject) => {
      const imap = new Imap(this.config);
      imap.once('ready', () => resolve(imap));
      imap.once('error', reject);
      imap.connect();
    });
  }

  _openBox(imap, box, readOnly = false) {
    return new Promise((resolve, reject) => {
      imap.openBox(box, readOnly, (err, mailbox) => {
        if (err) reject(err);
        else resolve(mailbox);
      });
    });
  }

  listMailboxes() {
    return new Promise(async (resolve, reject) => {
      let imap;
      try {
        imap = await this._connect();
        imap.getBoxes((err, boxes) => {
          imap.end();
          if (err) return reject(err);
          const result = [];
          const walk = (obj, prefix = '') => {
            for (const [name, box] of Object.entries(obj)) {
              const full = prefix ? `${prefix}${box.delimiter || '/'}${name}` : name;
              result.push({ name, full, attribs: box.attribs || [] });
              if (box.children) walk(box.children, full);
            }
          };
          walk(boxes);
          resolve(result);
        });
      } catch (e) {
        if (imap) try { imap.end(); } catch {}
        reject(e);
      }
    });
  }

  fetchEmails(folder, limit = 50, offset = 0) {
    return new Promise(async (resolve, reject) => {
      let imap;
      try {
        imap = await this._connect();
        await this._openBox(imap, folder, true);

        const total = imap.seq.start ? imap.seq.end : 0;
        if (!total && total !== 0) {
          imap.end();
          return resolve({ emails: [], total: 0 });
        }

        imap.search(['ALL'], (err, uids) => {
          if (err) {
            imap.end();
            return reject(err);
          }
          if (!uids || uids.length === 0) {
            imap.end();
            return resolve({ emails: [], total: 0 });
          }

          const totalEmails = uids.length;
          // UIDs are in ascending order; reverse for newest-first
          const reversed = uids.slice().reverse();
          // Apply offset and limit
          const slice = reversed.slice(offset, offset + limit);

          if (slice.length === 0) {
            imap.end();
            return resolve({ emails: [], total: totalEmails });
          }

          const emails = [];
          const fetch = imap.fetch(slice, {
            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'],
            struct: false,
            envelope: true,
            flags: true,
          });

          fetch.on('message', (msg, seqno) => {
            const info = { uid: null, flags: [], seqno };
            let headerBuf = '';

            msg.on('body', (stream) => {
              stream.on('data', chunk => headerBuf += chunk.toString());
            });

            msg.once('attributes', (attrs) => {
              info.uid = attrs.uid;
              info.flags = attrs.flags || [];
              info.envelope = attrs.envelope || {};
            });

            msg.once('end', () => {
              const env = info.envelope || {};
              const from = env.from && env.from[0]
                ? `${env.from[0].name || ''} <${env.from[0].mailbox}@${env.from[0].host}>`.trim()
                : 'Unknown';
              const to = env.to && env.to[0]
                ? `${env.to[0].mailbox}@${env.to[0].host}`
                : '';
              emails.push({
                uid: info.uid,
                seqno: info.seqno,
                subject: env.subject || '(no subject)',
                from,
                to,
                date: env.date || null,
                read: info.flags.includes('\\Seen'),
                flagged: info.flags.includes('\\Flagged'),
                flags: info.flags,
                snippet: '',
              });
            });
          });

          fetch.once('error', (e) => {
            imap.end();
            reject(e);
          });

          fetch.once('end', () => {
            imap.end();
            // Sort newest-first by date
            emails.sort((a, b) => {
              const da = a.date ? new Date(a.date) : new Date(0);
              const db = b.date ? new Date(b.date) : new Date(0);
              return db - da;
            });
            resolve({ emails, total: totalEmails });
          });
        });
      } catch (e) {
        if (imap) try { imap.end(); } catch {}
        reject(e);
      }
    });
  }

  searchEmails(folder, query, limit = 50, offset = 0) {
    return new Promise(async (resolve, reject) => {
      let imap;
      try {
        imap = await this._connect();
        await this._openBox(imap, folder, true);

        // IMAP server-side search: subject OR from contains query
        // node-imap OR syntax: ['OR', criteriaA, criteriaB]
        const criteria = [
          ['OR',
            ['HEADER', 'SUBJECT', query],
            ['HEADER', 'FROM', query]
          ]
        ];

        imap.search(criteria, (err, uids) => {
          if (err) {
            imap.end();
            return reject(err);
          }
          if (!uids || uids.length === 0) {
            imap.end();
            return resolve({ emails: [], total: 0 });
          }

          const totalResults = uids.length;
          const reversed = uids.slice().reverse();
          const slice = reversed.slice(offset, offset + limit);

          if (slice.length === 0) {
            imap.end();
            return resolve({ emails: [], total: totalResults });
          }

          const emails = [];
          const fetch = imap.fetch(slice, {
            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'],
            struct: false,
            envelope: true,
            flags: true,
          });

          fetch.on('message', (msg) => {
            const info = { uid: null, flags: [] };
            msg.on('body', () => {});
            msg.once('attributes', (attrs) => {
              info.uid = attrs.uid;
              info.flags = attrs.flags || [];
              info.envelope = attrs.envelope || {};
            });
            msg.once('end', () => {
              const env = info.envelope || {};
              const from = env.from && env.from[0]
                ? `${env.from[0].name || ''} <${env.from[0].mailbox}@${env.from[0].host}>`.trim()
                : 'Unknown';
              const to = env.to && env.to[0]
                ? `${env.to[0].mailbox}@${env.to[0].host}`
                : '';
              emails.push({
                uid: info.uid,
                subject: env.subject || '(no subject)',
                from, to,
                date: env.date || null,
                read: info.flags.includes('\\Seen'),
                flagged: info.flags.includes('\\Flagged'),
                flags: info.flags,
                snippet: '',
              });
            });
          });

          fetch.once('error', (e) => { imap.end(); reject(e); });
          fetch.once('end', () => {
            imap.end();
            emails.sort((a, b) => {
              const da = a.date ? new Date(a.date) : new Date(0);
              const db = b.date ? new Date(b.date) : new Date(0);
              return db - da;
            });
            resolve({ emails, total: totalResults });
          });
        });
      } catch (e) {
        if (imap) try { imap.end(); } catch {}
        reject(e);
      }
    });
  }

  fetchEmail(folder, uid) {
    return new Promise(async (resolve, reject) => {
      let imap;
      try {
        imap = await this._connect();
        await this._openBox(imap, folder, false);

        const fetch = imap.fetch([uid], {
          bodies: '',
          struct: true,
          markSeen: true,
        });

        let attrs_ = {};
        let parsePromise = null;

        fetch.on('message', (msg) => {
          msg.on('body', (stream) => {
            parsePromise = new Promise((res, rej) => {
              simpleParser(stream, {}, (err, mail) => {
                if (err) rej(err);
                else res(mail);
              });
            });
          });

          msg.once('attributes', (a) => {
            attrs_ = a;
          });
        });

        fetch.once('error', (e) => {
          imap.end();
          reject(e);
        });

        fetch.once('end', async () => {
          imap.end();
          if (!parsePromise) return reject(new Error('Email not found'));
          try {
            const parsed = await parsePromise;
            resolve({
              uid: attrs_.uid,
              flags: attrs_.flags || [],
              subject: parsed.subject || '(no subject)',
              from: parsed.from ? parsed.from.text : 'Unknown',
              to: parsed.to ? parsed.to.text : '',
              cc: parsed.cc ? parsed.cc.text : '',
              date: parsed.date,
              text: parsed.text || '',
              html: parsed.html || '',
              attachments: (parsed.attachments || []).map(a => ({
                filename: a.filename,
                contentType: a.contentType,
                size: a.size,
              })),
            });
          } catch (e) {
            reject(e);
          }
        });
      } catch (e) {
        if (imap) try { imap.end(); } catch {}
        reject(e);
      }
    });
  }

  unreadCount(folder = 'INBOX') {
    return new Promise(async (resolve, reject) => {
      let imap;
      try {
        imap = await this._connect();
        await this._openBox(imap, folder, true);
        imap.search(['UNSEEN'], (err, uids) => {
          imap.end();
          if (err) return reject(err);
          resolve((uids || []).length);
        });
      } catch (e) {
        if (imap) try { imap.end(); } catch {}
        reject(e);
      }
    });
  }

  markAllRead(folder = 'INBOX') {
    return new Promise(async (resolve, reject) => {
      let imap;
      try {
        imap = await this._connect();
        await this._openBox(imap, folder, false);
        imap.search(['UNSEEN'], (err, uids) => {
          if (err) { imap.end(); return reject(err); }
          if (!uids || uids.length === 0) { imap.end(); return resolve({ marked: 0 }); }
          imap.addFlags(uids, ['\\Seen'], (err2) => {
            imap.end();
            if (err2) reject(err2);
            else resolve({ marked: uids.length });
          });
        });
      } catch (e) {
        if (imap) try { imap.end(); } catch {}
        reject(e);
      }
    });
  }

  markRead(folder, uid) {
    return new Promise(async (resolve, reject) => {
      let imap;
      try {
        imap = await this._connect();
        await this._openBox(imap, folder, false);
        imap.addFlags([uid], ['\\Seen'], (err) => {
          imap.end();
          if (err) reject(err);
          else resolve();
        });
      } catch (e) {
        if (imap) try { imap.end(); } catch {}
        reject(e);
      }
    });
  }

  moveEmail(fromFolder, uid, toFolder) {
    return new Promise(async (resolve, reject) => {
      let imap;
      try {
        imap = await this._connect();
        await this._openBox(imap, fromFolder, false);
        imap.move([uid], toFolder, (err) => {
          imap.end();
          if (err) reject(err);
          else resolve();
        });
      } catch (e) {
        if (imap) try { imap.end(); } catch {}
        reject(e);
      }
    });
  }

  deleteEmail(folder, uid) {
    return new Promise(async (resolve, reject) => {
      let imap;
      try {
        imap = await this._connect();
        await this._openBox(imap, folder, false);
        imap.addFlags([uid], ['\\Deleted'], (err) => {
          if (err) {
            imap.end();
            return reject(err);
          }
          imap.expunge((err2) => {
            imap.end();
            if (err2) reject(err2);
            else resolve();
          });
        });
      } catch (e) {
        if (imap) try { imap.end(); } catch {}
        reject(e);
      }
    });
  }
  appendToSent(rawMessage, sentFolder) {
    return new Promise(async (resolve, reject) => {
      let imap;
      try {
        imap = await this._connect();
        // Try common sent folder names in order
        const candidates = sentFolder
          ? [sentFolder]
          : ['INBOX.Sent', 'Sent', 'Sent Messages', 'Sent Items', '[Gmail]/Sent Mail'];

        // Find which sent folder exists
        const folders = await new Promise((res, rej) => {
          imap.getBoxes((err, boxes) => {
            if (err) return rej(err);
            const result = [];
            const walk = (obj, prefix = '') => {
              for (const [name, box] of Object.entries(obj)) {
                const full = prefix ? `${prefix}${box.delimiter || '.'}${name}` : name;
                result.push(full);
                if (box.children) walk(box.children, full);
              }
            };
            walk(boxes);
            res(result);
          });
        });

        let targetFolder = null;
        for (const candidate of candidates) {
          if (folders.includes(candidate)) {
            targetFolder = candidate;
            break;
          }
        }

        // Also check for \Sent attribute
        if (!targetFolder) {
          const sentAttr = await new Promise((res) => {
            imap.getBoxes((err, boxes) => {
              if (err) return res(null);
              const findSent = (obj, prefix = '') => {
                for (const [name, box] of Object.entries(obj)) {
                  const full = prefix ? `${prefix}${box.delimiter || '.'}${name}` : name;
                  if (box.attribs && box.attribs.includes('\\Sent')) return full;
                  if (box.children) {
                    const found = findSent(box.children, full);
                    if (found) return found;
                  }
                }
                return null;
              };
              res(findSent(boxes));
            });
          });
          if (sentAttr) targetFolder = sentAttr;
        }

        if (!targetFolder) {
          imap.end();
          return reject(new Error('No Sent folder found'));
        }

        imap.append(rawMessage, { mailbox: targetFolder, flags: ['\\Seen'] }, (err) => {
          imap.end();
          if (err) reject(err);
          else resolve({ folder: targetFolder });
        });
      } catch (e) {
        if (imap) try { imap.end(); } catch {}
        reject(e);
      }
    });
  }

  downloadAttachment(folder, uid, index) {
    return new Promise(async (resolve, reject) => {
      let imap;
      try {
        imap = await this._connect();
        await this._openBox(imap, folder, false);

        const fetch = imap.fetch([uid], { bodies: '', struct: true });
        let parsePromise = null;

        fetch.on('message', (msg) => {
          msg.on('body', (stream) => {
            parsePromise = new Promise((res, rej) => {
              simpleParser(stream, {}, (err, mail) => {
                if (err) rej(err);
                else res(mail);
              });
            });
          });
        });

        fetch.once('error', (e) => { imap.end(); reject(e); });

        fetch.once('end', async () => {
          imap.end();
          if (!parsePromise) return reject(new Error('Email not found'));
          try {
            const parsed = await parsePromise;
            const attachments = parsed.attachments || [];
            const att = attachments[index];
            if (!att) return reject(new Error(`Attachment index ${index} not found (${attachments.length} total)`));
            resolve({
              filename: att.filename || `attachment-${index}`,
              contentType: att.contentType || 'application/octet-stream',
              size: att.size,
              content: att.content, // Buffer
            });
          } catch (e) { reject(e); }
        });
      } catch (e) {
        if (imap) try { imap.end(); } catch {}
        reject(e);
      }
    });
  }
}

module.exports = ImapClient;

# Stoia Mail ⚡📬

A sleek, browser-based email client with glassmorphism dark UI. Multi-account IMAP/SMTP support with real-time inbox monitoring.

![Dark Theme](https://img.shields.io/badge/theme-dark-000000) ![Node.js](https://img.shields.io/badge/node-%3E%3D18-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- 🌑 **Dark glassmorphism UI** — glass panels, blur effects, gold accents
- 📬 **Multi-account support** — tabs at top, color-coded per account
- 🔴 **Unread badges** — live per-account unread counts on every tab, refreshed on poll
- 📁 **Full folder navigation** — Inbox, Sent, Drafts, Trash, custom folders
- ✉️ **Compose, reply, forward** — rich email composition
- 📤 **Sent-folder sync** — outgoing mail is IMAP-APPENDed to your real Sent folder, so it shows up in every other mail client
- 🔍 **Server-side IMAP search** — searches the whole mailbox (subject + from), not just the loaded page; debounced as you type, or hit Enter
- ♾️ **Pagination & infinite scroll** — loads 50 at a time with a *Load more* button; scroll to the bottom to auto-fetch
- 📎 **Attachment downloads** — click any attachment to download it straight from the server
- ✓ **Mark all as read** — via the ⋯ menu beside the folder title
- 🗂️ **Filters** — unread-only and date-range filters on the loaded set
- 🔒 **Encrypted credentials** — AES-256-CBC at rest
- 🔄 **Real-time polling** — auto-refresh every 60s, new mail merged in at the top
- 🎨 **Color-coded senders** — visual differentiation at a glance

## Quick Start

```bash
git clone https://github.com/poealone/stoia-mail.git
cd stoia-mail
npm install
node server.js
```

Open **http://localhost:4001** in your browser.

The port defaults to `4001` and can be overridden with the `PORT` env var:

```bash
PORT=8080 node server.js
```

The server binds `0.0.0.0`, so it is reachable from other machines on your LAN.

## Setup

1. Launch the app and click the **⚙️ Settings** gear icon
2. Add your email account (IMAP/SMTP credentials)
3. Supports Gmail, Outlook, and any standard IMAP/SMTP server

### Gmail Setup
- IMAP Host: `imap.gmail.com` / Port: `993`
- SMTP Host: `smtp.gmail.com` / Port: `587`
- Use an [App Password](https://support.google.com/accounts/answer/185833)

### Outlook Setup
- IMAP Host: `outlook.office365.com` / Port: `993`
- SMTP Host: `smtp.office365.com` / Port: `587`

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** Vanilla JS + CSS (no frameworks)
- **Email:** `imap` + `mailparser` + `nodemailer`
- **Encryption:** AES-256-CBC for credential storage

## API

All routes are scoped to an account id.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/accounts` | List configured accounts |
| `GET` | `/api/accounts/:id/folders` | List IMAP folders |
| `GET` | `/api/accounts/:id/emails?folder=&limit=&offset=` | Paginated envelope list → `{ emails, total }` |
| `GET` | `/api/accounts/:id/emails/:uid?folder=` | Full parsed message body |
| `GET` | `/api/accounts/:id/search?q=&folder=&limit=&offset=` | Server-side IMAP search → `{ emails, total }` |
| `GET` | `/api/accounts/:id/unread?folder=` | Unread count for badges |
| `POST` | `/api/accounts/:id/mark-all-read?folder=` | Flag every `UNSEEN` message `\Seen` |
| `GET` | `/api/accounts/:id/emails/:uid/attachments/:index?folder=` | Download one attachment |
| `POST` | `/api/accounts/:id/send` | Send via SMTP, then append to Sent |

Notes:

- `fetchEmails` / `searchEmails` return `{ emails, total }`, newest first. `total` is the full
  mailbox or result-set size, so the UI can show `50 / 318` and know when to stop paging.
- Sending is never blocked by the Sent append. If the append fails the mail is already
  delivered; the response carries `savedToSent: false` plus `sentError`.
- The Sent folder is auto-detected: known names first (`INBOX.Sent`, `Sent`, `Sent Messages`,
  `Sent Items`, `[Gmail]/Sent Mail`), then any mailbox carrying the `\Sent` attribute. Override
  per account with a `sentFolder` field.

## Screenshots

*Dark glassmorphism interface with three-panel layout*

## License

MIT — built by [Johnytiger](https://johnytiger.com) & [Stoia](https://github.com/poealone) ⚡

# Stoia Mail ⚡📬

A sleek, browser-based email client with glassmorphism dark UI. Multi-account IMAP/SMTP support with real-time inbox monitoring.

![Dark Theme](https://img.shields.io/badge/theme-dark-000000) ![Node.js](https://img.shields.io/badge/node-%3E%3D18-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- 🌑 **Dark glassmorphism UI** — glass panels, blur effects, gold accents
- 📬 **Multi-account support** — tabs at top, color-coded per account
- 📁 **Full folder navigation** — Inbox, Sent, Drafts, Trash, custom folders
- ✉️ **Compose, reply, forward** — rich email composition
- 🔍 **Search** across mailboxes
- 🔒 **Encrypted credentials** — AES-256-CBC at rest
- 🔄 **Real-time polling** — auto-refresh for new emails
- 🎨 **Color-coded senders** — visual differentiation at a glance

## Quick Start

```bash
git clone https://github.com/poealone/stoia-mail.git
cd stoia-mail
npm install
node server.js
```

Open **http://localhost:3001** in your browser.

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

## Screenshots

*Dark glassmorphism interface with three-panel layout*

## License

MIT — built by [Johnytiger](https://johnytiger.com) & [Stoia](https://github.com/poealone) ⚡

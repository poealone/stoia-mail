const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');

const SmtpClient = {
  async send(account, mail) {
    const transport = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort || 465,
      secure: account.smtpPort !== 587,
      auth: {
        user: account.smtpUser || account.email,
        pass: account.smtpPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const mailOptions = {
      from: `${account.label || account.email} <${account.email}>`,
      to: mail.to,
      cc: mail.cc || undefined,
      bcc: mail.bcc || undefined,
      subject: mail.subject || '(no subject)',
      text: mail.text || '',
      html: mail.html || undefined,
      replyTo: mail.replyTo || account.email,
    };

    const info = await transport.sendMail(mailOptions);

    // Build raw RFC822 message for IMAP Sent folder append
    let rawMessage = null;
    try {
      const composer = new MailComposer(mailOptions);
      rawMessage = await new Promise((resolve, reject) => {
        composer.compile().build((err, message) => {
          if (err) reject(err);
          else resolve(message);
        });
      });
    } catch (e) {
      // Non-fatal: email was sent, just can't save to Sent
      console.error('Failed to build raw message for Sent folder:', e.message);
    }

    return {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      rawMessage,
    };
  },
};

module.exports = SmtpClient;

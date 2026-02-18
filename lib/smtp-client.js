const nodemailer = require('nodemailer');

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

    const info = await transport.sendMail({
      from: `${account.label || account.email} <${account.email}>`,
      to: mail.to,
      cc: mail.cc || undefined,
      bcc: mail.bcc || undefined,
      subject: mail.subject || '(no subject)',
      text: mail.text || '',
      html: mail.html || undefined,
      replyTo: mail.replyTo || account.email,
    });

    return {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    };
  },
};

module.exports = SmtpClient;

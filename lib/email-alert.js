const nodemailer = require('nodemailer');
const { log } = require('./logger');

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtTimeShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(report) {
  const adds = report.changes.filter(c => c.type === 'Ajout');
  const mods = report.changes.filter(c => c.type === 'Modification');
  const dels = report.changes.filter(c => c.type === 'Suppression');

  const nbAdds = adds.length;
  const nbMods = mods.length;
  const nbDels = dels.length;

  let rows = '';

  for (const c of report.changes) {
    if (c.type === 'Ajout') {
      rows += `<tr><td style="padding:8px 10px;background:#f0fdf4;border-bottom:1px solid #d1fae5;vertical-align:top;white-space:nowrap;color:#166534;font-weight:600">AJOUT</td>`
        + `<td style="padding:8px 10px;background:#f0fdf4;border-bottom:1px solid #d1fae5;font-size:13px">`
        + `<strong>N° ${escapeHtml(c.id || '—')}</strong>`
        + (c.site ? ` — ${escapeHtml(c.site)}` : '')
        + (c.demandeur ? `<br><span style="color:#64748b">Demandeur : ${escapeHtml(c.demandeur)}</span>` : '')
        + `</td></tr>`;
    } else if (c.type === 'Suppression') {
      rows += `<tr><td style="padding:8px 10px;background:#fef2f2;border-bottom:1px solid #fecaca;vertical-align:top;white-space:nowrap;color:#dc2626;font-weight:600">SUPPR.</td>`
        + `<td style="padding:8px 10px;background:#fef2f2;border-bottom:1px solid #fecaca;font-size:13px">`
        + `<strong>N° ${escapeHtml(c.id || '—')}</strong>`
        + (c.site ? ` — ${escapeHtml(c.site)}` : '')
        + (c.demandeur ? `<br><span style="color:#64748b">Demandeur : ${escapeHtml(c.demandeur)}</span>` : '')
        + `</td></tr>`;
    } else {
      let details = '';
      for (const f of c.fields) {
        details += `<div style="margin:6px 0;padding:6px 8px;background:#fff;border-radius:4px;font-size:12px;border-left:3px solid #f59e0b">`
          + `<div><strong>${escapeHtml(f.label)}</strong> <span style="color:#94a3b8;font-size:11px">(${escapeHtml(f.colonne)}${c.row})</span></div>`
          + `<div style="color:#dc2626;margin-top:2px">← ${escapeHtml(f.oldValue)}</div>`
          + `<div style="color:#166534">→ ${escapeHtml(f.newValue)}</div>`
          + `</div>`;
      }
      rows += `<tr><td style="padding:8px 10px;background:#fffbeb;border-bottom:1px solid #fde68a;vertical-align:top;white-space:nowrap;color:#92400e;font-weight:600">MODIF.</td>`
        + `<td style="padding:8px 10px;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:13px">`
        + `<strong>Ligne ${c.row}</strong> — N° ${escapeHtml(c.id || '—')}`
        + (c.site ? `<br><span style="color:#64748b">Site : ${escapeHtml(c.site)}</span>` : '')
        + (c.demandeur ? `<br><span style="color:#64748b">Demandeur : ${escapeHtml(c.demandeur)}</span>` : '')
        + details
        + `</td></tr>`;
    }
  }

  const summary = [];
  if (nbAdds) summary.push(`${nbAdds} ajout(s)`);
  if (nbMods) summary.push(`${nbMods} modification(s)`);
  if (nbDels) summary.push(`${nbDels} suppression(s)`);

  return '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>'
    + '<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;background:#f1f5f9">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">'
    + '<tr><td style="background:#1e293b;padding:16px 20px">'
    + '<h1 style="margin:0;color:#fff;font-size:15px;font-weight:600">🔔 Suivi Demandes — Modifications</h1>'
    + '</td></tr>'
    + '<tr><td style="padding:4px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0">'
    + '<table style="width:100%;font-size:12px"><tr>'
    + '<td style="padding:6px 0;color:#64748b">Modifié par <strong>' + escapeHtml(report.lastModifiedBy) + '</strong></td>'
    + '<td style="padding:6px 0;color:#64748b;text-align:right">' + fmtTimeShort(report.detectedAt) + '</td>'
    + '</tr></table>'
    + '</td></tr>'
    + '<tr><td style="padding:12px 20px 4px;font-size:12px;color:#64748b">' + summary.join(' — ') + '</td></tr>'
    + '<tr><td style="padding:4px 20px 16px">'
    + '<table style="width:100%;border-collapse:collapse">'
    + rows
    + '</table>'
    + '</td></tr>'
    + '<tr><td style="background:#f8fafc;padding:10px 20px;border-top:1px solid #e2e8f0">'
    + '<p style="margin:0;color:#94a3b8;font-size:10px">Email automatique — IMMEIT Hub</p>'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}

async function sendSmtp(subject, htmlBody) {
  const host = process.env.SMTP_HOST || 'smtp.office365.com';
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  const to = process.env.ALERT_EMAIL_TO;

  if (!user || !pass) throw new Error('SMTP_USER et SMTP_PASS requis dans .env');
  if (!to) throw new Error('ALERT_EMAIL_TO requis dans .env');

  const transporter = nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from, to,
    subject: '[IMMEIT] ' + subject,
    html: htmlBody,
  });
  transporter.close();
  return info.messageId;
}

async function sendEthereal(subject, htmlBody) {
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });

  const info = await transporter.sendMail({
    from: '"IMMEIT Hub" <noreply@immeit.hub>',
    to: process.env.ALERT_EMAIL_TO || 'destinataire@email.com',
    subject: '[IMMEIT] ' + subject,
    html: htmlBody,
  });
  transporter.close();
  return nodemailer.getTestMessageUrl(info);
}

async function sendAlert(report) {
  const nbAdds = report.changes.filter(c => c.type === 'Ajout').length;
  const nbMods = report.changes.filter(c => c.type === 'Modification').length;
  const nbDels = report.changes.filter(c => c.type === 'Suppression').length;

  if (!nbAdds && !nbMods && !nbDels) {
    log('info', 'alert_no_changes_skipped');
    return true;
  }

  log('info', 'alert_sending', {
    by: report.lastModifiedBy,
    at: report.detectedAt,
    added: nbAdds, modified: nbMods, removed: nbDels,
  });

  const subject = buildSubject(nbAdds, nbMods, nbDels);
  const htmlBody = buildHtml(report);

  let lastError;

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const messageId = await sendSmtp(subject, htmlBody);
      log('info', 'alert_smtp_sent', {
        to: process.env.ALERT_EMAIL_TO,
        added: nbAdds, modified: nbMods, removed: nbDels,
        messageId,
      });
      return true;
    } catch (err) {
      lastError = err;
      log('warn', 'alert_smtp_failed', { error: err.message });
    }
  }

  try {
    const url = await sendEthereal(subject, htmlBody);
    log('warn', 'alert_ethereal_fallback', {
      to: process.env.ALERT_EMAIL_TO,
      previewUrl: url,
      smtpError: lastError ? lastError.message : 'SMTP_USER/PASS not configured',
    });
    return { previewUrl: url };
  } catch (err2) {
    log('error', 'alert_all_failed', { smtpError: lastError ? lastError.message : null, etherealError: err2.message });
    return false;
  }
}

function buildSubject(nbAdds, nbMods, nbDels) {
  const parts = [];
  if (nbAdds > 0) parts.push(nbAdds + ' ajout(s)');
  if (nbMods > 0) parts.push(nbMods + ' modif(s)');
  if (nbDels > 0) parts.push(nbDels + ' suppr(s)');
  return '🔔 ' + parts.join(', ') + ' — Suivi Demandes';
}

// Filet de sécurité : envoyé (au plus 1x/24h, voir lib/auto-sync.js) si la synchronisation
// live échoue complètement (ni app-only, ni session déléguée valide). Ne devrait quasiment
// jamais se déclencher une fois lib/msal-cache-plugin.js en place — mais si ça arrive, on
// préfère prévenir plutôt que de laisser le tableau de bord devenir silencieusement obsolète.
async function sendReconnectAlert(reason) {
  const subject = '⚠️ Reconnexion SharePoint nécessaire';
  const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>'
    + '<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;background:#f1f5f9">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px">'
    + '<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">'
    + '<tr><td style="background:#dc2626;padding:16px 20px">'
    + '<h1 style="margin:0;color:#fff;font-size:15px;font-weight:600">⚠️ Reconnexion SharePoint nécessaire</h1>'
    + '</td></tr>'
    + '<tr><td style="padding:20px;font-size:13px;color:#334155;line-height:1.6">'
    + '<p>La synchronisation automatique du fichier de suivi n\'arrive plus à s\'authentifier auprès de SharePoint.</p>'
    + (reason ? '<p style="color:#64748b;font-size:12px">Détail : ' + escapeHtml(reason) + '</p>' : '')
    + '<p>Le tableau de bord continue d\'afficher les dernières données connues (cache), mais elles ne sont plus mises à jour.</p>'
    + '<p><strong>Action requise :</strong> exécuter <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">node scripts/connect-sharepoint.js</code> depuis un poste ayant accès à SharePoint. Une seule reconnexion suffit — elle sera ensuite réutilisée automatiquement partout (y compris sur Vercel).</p>'
    + '</td></tr>'
    + '<tr><td style="background:#f8fafc;padding:10px 20px;border-top:1px solid #e2e8f0">'
    + '<p style="margin:0;color:#94a3b8;font-size:10px">Email automatique — IMMEIT Hub</p>'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    log('warn', 'reconnect_alert_skipped_no_smtp');
    return false;
  }
  try {
    await sendSmtp(subject, html);
    log('info', 'reconnect_alert_sent', { reason });
    return true;
  } catch (err) {
    log('warn', 'reconnect_alert_failed', { error: err.message });
    return false;
  }
}

module.exports = { sendAlert, buildHtml, sendReconnectAlert };

const https = require('https');
const { log } = require('./logger');

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
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
  const changes = [];
  if (report.added > 0) changes.push(`${report.added} nouvelle${report.added > 1 ? 's' : ''} demande${report.added > 1 ? 's' : ''}`);
  if (report.removed > 0) changes.push(`${report.removed} demande${report.removed > 1 ? 's' : ''} supprimée${report.removed > 1 ? 's' : ''}`);
  if (report.modified > 0) changes.push(`${report.modified} demande${report.modified > 1 ? 's' : ''} modifiée${report.modified > 1 ? 's' : ''}`);

  var rows = '';
  for (const row of report.addedRows) {
    rows += `<tr style="background:#f0fdf4">
      <td style="padding:6px 10px;border:1px solid #ddd;color:#166534;font-weight:600">NOUVEAU</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.id)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.site)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.demandeur)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.banc)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.nature)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.etat)}</td>
    </tr>`;
  }

  for (const row of report.removedRows) {
    rows += `<tr style="background:#fef2f2">
      <td style="padding:6px 10px;border:1px solid #ddd;color:#dc2626;font-weight:600">SUPPRIMÉ</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.id)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.site)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.demandeur)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.banc)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd" colspan="2">—</td>
    </tr>`;
  }

  for (const row of report.modifiedRows) {
    var changesDetail = '';
    var changeCount = 0;
    for (const c of row.changes) {
      changeCount++;
      changesDetail += `<div style="margin:8px 0;padding:8px;background:#f8fafc;border-radius:4px;border-left:3px solid #f59e0b">
        <div style="font-weight:600;color:#92400e;margin-bottom:4px">${changeCount}. ${escapeHtml(c.label)}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:2px 6px;color:#64748b;width:60px">Avant:</td><td style="padding:2px 6px;background:#fef2f2;color:#991b1b">${escapeHtml(c.oldValue)}</td></tr>
          <tr><td style="padding:2px 6px;color:#64748b">Après:</td><td style="padding:2px 6px;background:#f0fdf4;color:#166534">${escapeHtml(c.newValue)}</td></tr>
        </table>
      </div>`;
    }

    rows += `<tr style="background:#fffbeb">
      <td style="padding:6px 10px;border:1px solid #ddd;color:#92400e;font-weight:600">MODIFIÉ</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.id)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.site)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.demandeur)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd">${escapeHtml(row.banc)}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;max-width:400px" colspan="2">${changesDetail}</td>
    </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
<tr><td style="background:#1e293b;padding:20px 24px">
<h1 style="margin:0;color:#fff;font-size:18px;font-weight:600">${escapeHtml(changes.join(', '))}</h1>
<p style="margin:4px 0 0;color:#94a3b8;font-size:13px">IMMEIT — Suivi des modifications — ${escapeHtml(fmtTime(report.detectedAt))}</p>
</td></tr>
<tr><td style="padding:20px 24px">
<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6">
  <strong>${changes.join(', ')}</strong> détectée${changes.length > 1 ? 's' : ''} dans le fichier de suivi des demandes.
</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
  <tr><td style="padding:6px 12px;color:#64748b;font-size:13px">Total avant</td><td style="padding:6px 12px;font-weight:600;text-align:right">${report.totalBefore}</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b;font-size:13px">Total après</td><td style="padding:6px 12px;font-weight:600;text-align:right">${report.totalAfter}</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b;font-size:13px">Dernière modification par</td><td style="padding:6px 12px;font-weight:600;text-align:right">${escapeHtml(report.lastModifiedBy)}</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b;font-size:13px">Dernière sync</td><td style="padding:6px 12px;font-weight:600;text-align:right">${escapeHtml(fmtTime(report.syncedAt))}</td></tr>
</table>
${rows ? `<table style="width:100%;border-collapse:collapse;font-size:13px">
<thead><tr style="background:#f8fafc">
<th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;font-weight:600;color:#475569">Type</th>
<th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;font-weight:600;color:#475569">N°</th>
<th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;font-weight:600;color:#475569">Site</th>
<th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;font-weight:600;color:#475569">Demandeur</th>
<th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;font-weight:600;color:#475569">Banc</th>
<th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;font-weight:600;color:#475569" colspan="2">Détail</th>
</tr></thead>
<tbody>${rows}</tbody></table>` : ''}
</td></tr>
<tr><td style="background:#f8fafc;padding:12px 24px;border-top:1px solid #e2e8f0">
<p style="margin:0;color:#94a3b8;font-size:11px">Email automatique envoyé par le serveur IMMEIT via Microsoft Graph.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function graphRequest(token, method, path, body) {
  return new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: 'graph.microsoft.com',
      path: '/v1.0' + path,
      method: method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(d),
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch { resolve(null); }
        } else {
          let err;
          try { err = JSON.parse(data); } catch { err = data; }
          reject(new Error(err?.error?.message || err?.message || res.statusCode));
        }
      });
    });
    req.on('error', reject);
    req.write(d);
    req.end();
  });
}

async function sendAlert(report) {
  const toEmail = process.env.ALERT_EMAIL_TO || 'moustapha.niang@external.stellantis.com';

  const subject = [
    report.added > 0 ? report.added + ' nouvelle(s)' : '',
    report.modified > 0 ? report.modified + ' modification(s)' : '',
    report.removed > 0 ? report.removed + ' suppression(s)' : '',
  ].filter(Boolean).join(', ') + ' — Suivi Demandes';

  try {
    const autoSync = require('./auto-sync');
    const token = await autoSync.ensureToken();

    const emailBody = buildHtml(report);

    const message = {
      message: {
        subject: subject,
        body: { contentType: 'HTML', content: emailBody },
        toRecipients: [{ emailAddress: { address: toEmail } }],
      },
      saveToSentItems: false,
    };

    await graphRequest(token, 'POST', '/me/sendMail', message);
    log('info', 'alert_graph_sent', { to: toEmail, added: report.added, modified: report.modified, removed: report.removed });
    return true;
  } catch (err) {
    log('error', 'alert_graph_failed', { error: err.message });
    return false;
  }
}

module.exports = { sendAlert, buildHtml };

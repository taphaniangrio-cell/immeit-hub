const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
  const t = l.trim();
  if (!t || t.startsWith('#')) return;
  const i = t.indexOf('=');
  if (i < 1) return;
  if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
});
const db = require('../lib/db');

async function main() {
  const r = await db.query("SELECT cache_data FROM dashboard_cache WHERE cache_key = 'sharepoint_suivi_2026'");
  if (!r.rows.length) { console.log('No data'); process.exit(0); }
  var d = r.rows[0].cache_data;
  if (typeof d === 'string') d = JSON.parse(d);
  console.log('items:', d.items?.length);
  console.log('_rawCount:', d._rawCount);
  console.log('source:', d.source);
  console.log('syncedAt:', d.syncedAt);
  if (d.items) {
    console.log('Last 5 items:');
    d.items.slice(-5).forEach(i => {
      console.log(JSON.stringify({ _row: i._row, statut: i.statut, type_de_demande: i.type_de_demande, date: i.date_de_la_demande }));
    });
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

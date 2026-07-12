import { DeviceCodeCredential } from '@azure/identity';
import https from 'https';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TENANT_ID = 'd852d5cd-724c-4128-8812-ffa5db3f8507';

function graph(url, token, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: 'graph.microsoft.com',
      path: u.pathname + u.search,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'ConsistencyLevel': 'eventual',
      },
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`${res.statusCode}: ${parsed.error?.message || JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch { reject(new Error(`Parse: ${data.slice(0,200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timed out')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log();
  console.log('═'.repeat(60));
  console.log('  CONNEXION AZURE AD');
  console.log('═'.repeat(60));
  console.log();
  console.log('  Va sur https://login.microsoft.com/device');
  console.log('  entre le code ci-dessous :\n');

  const cred = new DeviceCodeCredential({
    tenantId: TENANT_ID,
    clientId: '1950a258-227b-4e31-a9cf-717495945fc2',
    userPromptCallback: (d) => {
      const code = d.message.match(/enter the code (\w+)/i)?.[1] || '???';
      console.log(`  ┌─ CODE : ${code} ─┐`);
      console.log('  └─────────────────────┘\n');
    },
  });

  const tokenResp = await cred.getToken('https://graph.microsoft.com/.default');
  const token = tokenResp.token;
  console.log('  ✅ Connecté\n');

  // Liste TOUTES les apps
  console.log('📋 Liste de toutes les apps Azure AD :\n');
  const all = await graph('https://graph.microsoft.com/v1.0/applications?$top=200', token);
  if (!all.value || all.value.length === 0) {
    console.log('  Aucune app trouvée ou pas les droits pour lister.');
  } else {
    all.value.forEach((a, i) => {
      const date = a.createdDateTime?.slice(0,10) || '?';
      console.log(`  ${i+1}. ${a.displayName} (${a.appId}) [${date}]`);
    });
  }
  console.log(`\n  Total: ${all.value?.length || 0} apps\n`);

  // Vérifier mon rôle
  console.log('👤 Vérification du rôle Azure AD...');
  try {
    const me = await graph('https://graph.microsoft.com/v1.0/me', token);
    const memberOf = await graph('https://graph.microsoft.com/v1.0/me/memberOf', token);
    const roles = (memberOf.value || []).filter(g => g.securityEnabled).map(g => g.displayName);
    console.log(`  Utilisateur: ${me.userPrincipalName}`);
    console.log(`  Rôles: ${roles.join(', ') || 'Aucun rôle admin'}`);
  } catch (e) {
    console.log(`  ${e.message}`);
  }
  console.log();
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });

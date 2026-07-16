import { DeviceCodeCredential } from '@azure/identity';
import 'dotenv/config';

const TENANT_ID = process.env.AZURE_TENANT_ID || process.env.SHAREPOINT_TENANT_ID || 'd852d5cd-724c-4128-8812-ffa5db3f8507';
const CLIENT_ID = process.env.AZURE_CLIENT_ID || '1950a258-227b-4e31-a9cf-717495945fc2';

async function graphRequest(url, token, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'ConsistencyLevel': 'eventual',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP Error ${response.status}: ${errorText}`);
  }
  return response.json();
}

async function main() {
  console.log();
  console.log('═'.repeat(60));
  console.log('  CONNEXION AZURE AD (Mode Interactif)');
  console.log('═'.repeat(60));
  console.log();
  console.log('  1. Rendez-vous sur https://login.microsoft.com/device');
  console.log('  2. Entrez le code de sécurité ci-dessous :\n');

  const credential = new DeviceCodeCredential({
    tenantId: TENANT_ID,
    clientId: CLIENT_ID,
    userPromptCallback: (info) => {
      const code = info.message.match(/enter the code (\w+)/i)?.[1] || '???';
      console.log(`  ┌─ CODE : ${code} ─┐`);
      console.log('  └─────────────────────┘\n');
    },
  });

  const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default');
  const token = tokenResponse.token;
  console.log('  ✅ Connexion établie avec succès !\n');

  console.log('  Liste des applications Azure AD :\n');
  try {
    const appsData = await graphRequest('https://graph.microsoft.com/v1.0/applications?$top=200', token);
    if (!appsData.value || appsData.value.length === 0) {
      console.log('  Aucune application trouvée ou privilèges insuffisants.');
    } else {
      appsData.value.forEach((app, idx) => {
        const creationDate = app.createdDateTime ? app.createdDateTime.slice(0, 10) : 'Date inconnue';
        console.log(`  ${String(idx + 1).padStart(2, ' ')}. ${app.displayName} (AppID: ${app.appId}) [Créée le : ${creationDate}]`);
      });
      console.log(`\n  Total : ${appsData.value.length} application(s) configurée(s).\n`);
    }
  } catch (error) {
    console.error(`  ❌ Impossible de lister les applications : ${error.message}`);
  }

  console.log('  Vérification du rôle Azure AD...');
  try {
    const me = await graphRequest('https://graph.microsoft.com/v1.0/me', token);
    const memberOf = await graphRequest('https://graph.microsoft.com/v1.0/me/memberOf', token);
    const adminRoles = (memberOf.value || [])
      .filter(group => group.securityEnabled)
      .map(group => group.displayName);
    console.log(`  Identifiant : ${me.userPrincipalName}`);
    console.log(`  Rôles : ${adminRoles.join(', ') || 'Aucun (Utilisateur Standard)'}`);
  } catch (error) {
    console.log(`  ⚠ Erreur lors de la vérification du profil : ${error.message}`);
  }
  console.log();
}

main().catch(err => {
  console.error('\n  ❌ Échec critique de l\'exécution :', err.message);
  process.exit(1);
});

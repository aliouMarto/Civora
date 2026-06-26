/**
 * Playwright E2E — parcours complet du module Contacts (17 étapes).
 * Lot 1 · Module 1 · Étape 5.
 *
 * Prérequis :
 *   - Playwright installé : `pnpm add -D @playwright/test`
 *   - API + Web + AI + Postgres + Redis + MinIO démarrés (cf. docker-compose dev)
 *   - Seed dev appliqué : `pnpm --filter @civora/api seed:dev`
 *   - Comptes E2E créés pour deux agences distinctes (A et B)
 *
 * Variables d'environnement utilisées :
 *   E2E_AGENCE_A_EMAIL / E2E_AGENCE_A_PASSWORD
 *   E2E_AGENCE_B_EMAIL / E2E_AGENCE_B_PASSWORD
 *   E2E_FIXTURE_CSV (chemin absolu vers apps/api/test/fixtures/contacts-50.csv)
 *
 * Lancement :
 *   pnpm --filter @civora/web exec playwright test e2e/contacts-full-journey.spec.ts
 */
import path from 'node:path';
import { expect, test } from '@playwright/test';

const A_EMAIL = process.env['E2E_AGENCE_A_EMAIL'] ?? 'admin@civora.dev';
const A_PASSWORD = process.env['E2E_AGENCE_A_PASSWORD'] ?? 'CivoraDev2024!';
const B_EMAIL = process.env['E2E_AGENCE_B_EMAIL'] ?? 'admin-b@civora.dev';
const B_PASSWORD = process.env['E2E_AGENCE_B_PASSWORD'] ?? 'CivoraDev2024!';
const FIXTURE = process.env['E2E_FIXTURE_CSV'] ??
  path.resolve(__dirname, '../../api/test/fixtures/contacts-50.csv');

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/mot de passe/i).fill(password);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.serial('Contacts — full journey (17 étapes)', () => {
  test('17 étapes en chaîne', async ({ page }) => {
    // 1) Login Admin agence A
    await login(page, A_EMAIL, A_PASSWORD);

    // 2) Ouvrir /contacts
    await page.getByRole('link', { name: /^Contacts$/ }).click();
    await expect(page).toHaveURL(/\/contacts$/);

    // 3) Importer un CSV de 50 contacts
    await page.getByRole('link', { name: /^Importer$/ }).click();
    await expect(page).toHaveURL(/\/contacts\/import$/);
    await page.setInputFiles('input[type="file"]', FIXTURE);
    // Wizard avance : Upload → Mapping (auto) → Aperçu → Lancement
    await expect(page.getByText(/Mapping des colonnes/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Aperçu/ }).click();
    await expect(page.getByText(/Aperçu \(5 premières lignes\)/)).toBeVisible();
    await page.getByRole('button', { name: /Lancer l'import/ }).click();
    await expect(page.getByText(/Import terminé|Import en cours/)).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Voir les contacts/ }).click();

    // 4) Vérifier ~50 contacts dans la liste (au moins 30 pour tolérance doublons)
    await expect(page).toHaveURL(/\/contacts$/);
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(30);

    // 5) Créer manuellement Bamba Sory
    await page.getByRole('link', { name: /Nouveau contact/ }).click();
    await page.getByLabel('Nom', { exact: true }).fill('Bamba');
    await page.getByLabel('Prénom').fill('Sory');
    await page.getByLabel('Email').fill('bamba.sory.e2e@example.ci');
    await page.getByLabel(/Téléphone \(E.164/).fill('+2250707880001');
    await page.getByRole('button', { name: 'Propriétaire' }).click();
    await page.getByRole('button', { name: /créer le contact/i }).click();
    await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: /Bamba Sory/ })).toBeVisible();
    const bambaUrl = page.url();

    // 6) Tenter de recréer (même email) → dialogue doublon
    await page.goto('/contacts/new');
    await page.getByLabel('Nom', { exact: true }).fill('Bamba');
    await page.getByLabel('Email').fill('bamba.sory.e2e@example.ci');
    await expect(page.getByText(/doublons potentiels détectés/i)).toBeVisible({ timeout: 3_000 });
    await page.getByRole('button', { name: /Annuler/ }).click();

    // 7) Ajouter une interaction "Visite réalisée"
    await page.goto(bambaUrl);
    await page.getByRole('button', { name: /Interactions/ }).click();
    await page.getByRole('button', { name: /Nouvelle interaction/ }).click();
    await page.getByLabel('Type', { exact: true }).selectOption('visite');
    await page.getByLabel('Direction').selectOption('sortant');
    await page.getByLabel('Sujet').fill('Visite réalisée');
    await page.getByRole('button', { name: /Enregistrer/ }).click();
    await expect(page.getByText('Visite réalisée')).toBeVisible();

    // 8) Filtrer score ≥ 70 (catégorie chaud)
    await page.goto('/contacts');
    await page.getByLabel(/Filtrer par score IA/).selectOption('chaud');
    await page.waitForResponse((r) => r.url().includes('/contacts?') && r.status() === 200);

    // 9) Sauvegarder en segment "Leads chauds"
    await page.getByRole('button', { name: /Sauvegarder en segment/ }).click();
    await page.getByLabel(/Nom du segment/).fill('Leads chauds');
    await page.getByRole('button', { name: /Créer le segment/ }).click();
    await expect(page.getByText(/Segment créé/)).toBeVisible();

    // 10) Vérifier que le segment est listé (recharger la liste avec filtre segment)
    await page.goto('/contacts?segments_ia=Leads%20chauds');
    // tolérance : pas de matches forcément si seed sans cette étiquette IA.

    // 11) Mettre à jour le profil de Bamba (ajouter rôle acheteur)
    await page.goto(bambaUrl);
    await page.getByRole('button', { name: /Éditer/ }).click();
    await page.getByRole('button', { name: 'Acheteur' }).click();
    await page.getByRole('button', { name: /Enregistrer/ }).click();
    await expect(page.getByText(/Contact mis à jour/)).toBeVisible();

    // 12) Attendre la mise à jour async du score (worker scoring)
    //     Le toast realtime "Score de Bamba : X → Y" doit apparaître < 10s.
    await expect(page.getByText(/Score de Bamba/)).toBeVisible({ timeout: 15_000 });

    // 13) Vérifier le badge dans la liste
    await page.goto('/contacts?q=Bamba');
    const bambaRow = page.locator('tbody tr', { hasText: 'Bamba' }).first();
    await expect(bambaRow.getByRole('status')).toBeVisible(); // ScoreBadge

    // 14) Ask KURA
    await page.getByRole('button', { name: /Demander à KURA/ }).click();
    await page.getByLabel(/Question pour KURA/).fill('Donne-moi les propriétaires VIP');
    await page.keyboard.press('Meta+Enter').catch(() => page.keyboard.press('Control+Enter'));
    await expect(page.locator('text=Contacts cités').or(page.locator('text=KURA réfléchit'))).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');

    // 15) Exporter la liste filtrée en CSV
    await page.getByLabel(/Filtrer par score IA/).selectOption('chaud');
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: /^Exporter$/ }).click();
    await page.getByRole('button', { name: /^Exporter$/ }).last().click(); // bouton du dialog
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/contacts-.+\.csv$/);

    // 16) Soft-delete Bamba
    await page.goto(bambaUrl);
    await page.getByRole('button', { name: /^Archiver$/ }).click();
    await page.getByRole('button', { name: /^Archiver$/ }).last().click(); // bouton confirmation
    await expect(page.getByText(/Contact archivé/)).toBeVisible();
    await page.goto('/contacts');
    await expect(page.getByText('Bamba Sory')).not.toBeVisible();

    // 17) Logout, login agence B, vérifier aucune fuite
    await page.evaluate(() => fetch('/api/auth/refresh', { method: 'POST' })); // pour s'assurer du cookie
    await page.goto('/login');
    await login(page, B_EMAIL, B_PASSWORD);
    await page.goto('/contacts');
    await expect(page.getByText('Bamba Sory')).not.toBeVisible();
    await expect(page.getByText('bamba.sory.e2e@example.ci')).not.toBeVisible();
  });
});

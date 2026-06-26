/**
 * Playwright E2E — Module Contacts (Lot 1 · Module 1 · Étape 4).
 *
 * Prérequis :
 *   - Playwright installé (`pnpm add -D @playwright/test` + `pnpm exec playwright install chromium`)
 *   - API en cours d'exécution sur http://localhost:3001
 *   - Web en cours d'exécution sur http://localhost:3000
 *   - Seed dev appliqué : `pnpm --filter @civora/api seed:dev`
 *
 * Lancement :
 *   pnpm --filter @civora/web exec playwright test e2e/contacts.spec.ts
 *
 * Le fichier est conservé prêt-à-l'emploi : `playwright.config.ts` sera ajouté
 * dans l'étape qualité/CI dédiée. Le squelette ci-dessous couvre les 7
 * parcours imposés par le cahier des charges.
 */
import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env['E2E_ADMIN_EMAIL'] ?? 'admin@civora.dev';
const ADMIN_PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'CivoraDev2024!';

test.describe('Contacts — parcours complet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-?mail/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/mot de passe/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('1. Naviguer vers /contacts depuis le sidebar', async ({ page }) => {
    await page.getByRole('link', { name: /^Contacts$/ }).click();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
  });

  test('2. Créer un contact, puis le retrouver dans la liste', async ({ page }) => {
    await page.goto('/contacts/new');
    await page.getByLabel('Nom', { exact: true }).fill('Test E2E');
    await page.getByLabel('Email').fill('test-e2e@example.ci');
    await page.getByRole('button', { name: /créer le contact/i }).click();
    await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: /Test E2E/ })).toBeVisible();
  });

  test('3. Tentative de doublon → dialogue de fusion', async ({ page }) => {
    await page.goto('/contacts/new');
    await page.getByLabel('Nom', { exact: true }).fill('Doublon');
    // email déjà présent grâce au seed dev :
    await page.getByLabel('Email').fill('sory.kouassi@example.ci');
    await expect(page.getByText(/doublons potentiels détectés/i)).toBeVisible({ timeout: 3000 });
  });

  test('4. Ouvrir la fiche 360°, basculer entre onglets', async ({ page }) => {
    await page.goto('/contacts');
    await page.getByRole('link', { name: /Kouassi/ }).first().click();
    await expect(page.getByRole('button', { name: /^Profil$/ })).toBeVisible();
    await page.getByRole('button', { name: /Interactions/ }).click();
    await expect(page.getByText(/Historique des interactions/)).toBeVisible();
    await page.getByRole('button', { name: /Scoring/ }).click();
    await expect(page.getByText(/Facteurs détaillés|Aucun facteur/)).toBeVisible();
  });

  test('5. Ajouter une interaction', async ({ page }) => {
    await page.goto('/contacts');
    await page.getByRole('link', { name: /Kouassi/ }).first().click();
    await page.getByRole('button', { name: /Interactions/ }).click();
    await page.getByRole('button', { name: /Nouvelle interaction/ }).click();
    await page.getByLabel('Sujet').fill('E2E — test');
    await page.getByRole('button', { name: /Enregistrer/ }).click();
    await expect(page.getByText('E2E — test')).toBeVisible();
  });

  test('6. Filtrer par rôle + score, sauvegarder en segment', async ({ page }) => {
    await page.goto('/contacts');
    await page.getByRole('button', { name: 'Propriétaire' }).click();
    await page.getByLabel(/Filtrer par score IA/).selectOption('chaud');
    await page.getByRole('button', { name: /Sauvegarder en segment/ }).click();
    await page.getByLabel(/Nom du segment/).fill('E2E — Propriétaires chauds');
    await page.getByRole('button', { name: /Créer le segment/ }).click();
    await expect(page.getByText(/Segment créé/)).toBeVisible();
  });

  test('7. Ask KURA : poser une question', async ({ page }) => {
    await page.goto('/contacts');
    await page.getByRole('button', { name: /Demander à KURA/ }).click();
    await page.getByLabel(/Question pour KURA/).fill('propriétaires VIP de Cocody');
    await page.getByRole('button', { name: /^$/ }).last().click(); // bouton Send icône uniquement
    await expect(page.locator('text=KURA réfléchit').or(page.locator('text=Contacts cités'))).toBeVisible({ timeout: 10_000 });
  });
});

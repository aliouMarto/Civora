import { describe, it, expect } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TemplateService } from '../templates/template.service';

function makeSvc() {
  return new TemplateService();
}

describe('TemplateService.render()', () => {
  it('substitue les variables {{}} dans le sujet et le corps', () => {
    const svc = makeSvc();
    const result = svc.render('invitation', {
      nom: 'Sory',
      nom_agence: 'Agence Test',
      lien: 'https://app.civora.io/invite/abc',
      expiry: '24h',
    });
    expect(result.subject).toContain('Agence Test');
    expect(result.body).toContain('Sory');
    expect(result.body).toContain('https://app.civora.io/invite/abc');
    expect(result.html).toContain('<strong>Sory</strong>');
  });

  it('conserve le placeholder si la variable est manquante (pas de crash)', () => {
    const svc = makeSvc();
    const result = svc.render('invitation', {
      nom: 'Ibra',
      nom_agence: 'Agence X',
      // lien manquant intentionnellement
      expiry: '48h',
    });
    expect(result.body).toContain('{{lien}}');
  });

  it('lève NotFoundException pour un template inconnu', () => {
    const svc = makeSvc();
    expect(() => svc.render('template-inexistant', {})).toThrow(NotFoundException);
    expect(() => svc.render('template-inexistant', {})).toThrow(/template-inexistant/);
  });

  it('rend en anglais si language="en"', () => {
    const svc = makeSvc();
    const result = svc.render(
      'invitation',
      { nom: 'John', nom_agence: 'Agency', lien: 'https://link', expiry: '24h' },
      'en',
    );
    expect(result.subject).toContain('Invitation to join');
    expect(result.body).toContain('Hello John');
  });

  it('repli sur fr si la langue demandée n\'a pas de variante', () => {
    const svc = makeSvc();
    // 'es' n'existe pas — doit tomber sur 'fr'
    const result = svc.render(
      'login-alert',
      { nom: 'Aminata', date: '2026-06-24', appareil: 'Chrome', ip: '1.2.3.4' },
      'es' as never,
    );
    expect(result.subject).toContain('Connexion');
  });

  it('supports() retourne true si le canal est dans la liste', () => {
    const svc = makeSvc();
    expect(svc.supports('invitation', 'email')).toBe(true);
    expect(svc.supports('invitation', 'sms')).toBe(false);
  });

  it('login-alert substitue date, appareil, ip', () => {
    const svc = makeSvc();
    const result = svc.render('login-alert', {
      nom: 'Fatou',
      date: '2026-06-24 08:30',
      appareil: 'iPhone 15',
      ip: '41.203.1.1',
    });
    expect(result.body).toContain('2026-06-24 08:30');
    expect(result.body).toContain('iPhone 15');
    expect(result.body).toContain('41.203.1.1');
  });
});

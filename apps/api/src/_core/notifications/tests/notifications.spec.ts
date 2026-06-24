import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsService } from '../notifications.service';
import { TemplateService } from '../templates/template.service';
import { EmailChannel } from '../channels/email.channel';
import { SmsChannel } from '../channels/sms.channel';
import { WhatsappChannel } from '../channels/whatsapp.channel';
import { InAppChannel } from '../channels/in-app.channel';
import type { TenantContextService } from '../../tenancy/tenant-context.service';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { QueueManagerService } from '../../jobs/queue-manager.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

function makeDeps(agence_id = 'agence-abc') {
  const mockAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
  const mockQueue = { add: mockAdd };

  const mockPrisma = {
    notification: {
      create: vi.fn().mockResolvedValue({ id: 'notif-uuid' }),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaService;

  const mockTenantCtx = {
    requireAgenceId: vi.fn().mockReturnValue(agence_id),
    getAgenceId: vi.fn().mockReturnValue(agence_id),
  } as unknown as TenantContextService;

  const mockQueues = {
    getQueue: vi.fn().mockReturnValue(mockQueue),
  } as unknown as QueueManagerService;

  const templateSvc = new TemplateService();

  const emailCh = { channel: 'email', send: vi.fn().mockResolvedValue({ externalId: 'msg-1' }) } as unknown as EmailChannel;
  const smsCh   = { channel: 'sms',   send: vi.fn().mockResolvedValue({}) } as unknown as SmsChannel;
  const waCh    = { channel: 'whatsapp', send: vi.fn().mockResolvedValue({}) } as unknown as WhatsappChannel;
  const inAppCh = { channel: 'in-app',   send: vi.fn().mockResolvedValue({}) } as unknown as InAppChannel;

  const svc = new NotificationsService(
    mockPrisma,
    mockTenantCtx,
    mockQueues,
    templateSvc,
    emailCh,
    smsCh,
    waCh,
    inAppCh,
  );

  return { svc, mockPrisma, mockTenantCtx, mockQueues, mockAdd, emailCh, smsCh, waCh, inAppCh };
}

// ─── Tests : send() ──────────────────────────────────────────────────────────

describe('NotificationsService.send()', () => {
  it('enfile un job et crée une notification (status=queued)', async () => {
    const { svc, mockPrisma, mockAdd } = makeDeps();

    const result = await svc.send({
      to: { email: 'test@civora.io' },
      channel: 'email',
      template: 'invitation',
      vars: { nom: 'Sory', nom_agence: 'Agence', lien: 'https://l', expiry: '24h' },
    });

    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'queued', template: 'invitation' }) }),
    );
    expect(mockAdd).toHaveBeenCalledWith(
      'send-notification',
      expect.objectContaining({ channel: 'email', template: 'invitation' }),
      expect.objectContaining({ jobId: 'notif-notif-uuid' }),
    );
    expect(result.notificationId).toBe('notif-uuid');
  });

  it('rejette un email invalide → BadRequestException', async () => {
    const { svc } = makeDeps();
    await expect(
      svc.send({ to: { email: 'pas-un-email' }, channel: 'email', template: 'invitation', vars: {} }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejette un téléphone non-E.164 pour sms → BadRequestException', async () => {
    const { svc } = makeDeps();
    await expect(
      svc.send({ to: { phone: '0700000000' }, channel: 'sms', template: 'invitation', vars: {} }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejette un template inconnu → NotFoundException', async () => {
    const { svc } = makeDeps();
    await expect(
      svc.send({ to: { email: 'ok@ok.io' }, channel: 'email', template: 'inexistant', vars: {} }),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─── Tests : processJob() ────────────────────────────────────────────────────

describe('NotificationsService.processJob()', () => {
  const basePayload = {
    notificationId: 'notif-uuid',
    agence_id: 'agence-abc',
    channel: 'email' as const,
    to: 'dest@example.com',
    template: 'invitation',
    vars: { nom: 'Sory', nom_agence: 'A', lien: 'https://l', expiry: '24h' },
    language: 'fr' as const,
  };

  it('appelle emailChannel.send() et marque status=sent', async () => {
    const { svc, mockPrisma, emailCh } = makeDeps();

    await svc.processJob(basePayload);

    expect(emailCh.send).toHaveBeenCalledOnce();
    expect(mockPrisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) }),
    );
  });

  it('repli whatsapp → sms si whatsapp échoue et fallbackToSms=true', async () => {
    const { svc, smsCh, mockPrisma } = makeDeps();

    // Override whatsapp channel to throw
    const waCh = { channel: 'whatsapp', send: vi.fn().mockRejectedValue(new Error('wa error')) } as unknown as WhatsappChannel;
    // Rebuild service with failing whatsapp
    const { svc: svc2, smsCh: smsCh2 } = makeDeps();
    // Patch the private channels map
    (svc2 as any).channels.set('whatsapp', { channel: 'whatsapp', send: vi.fn().mockRejectedValue(new Error('wa fail')) });

    await svc2.processJob({
      ...basePayload,
      channel: 'whatsapp',
      to: '+22507000000',
      fallbackToSms: true,
    });

    expect(smsCh2.send).toHaveBeenCalledOnce();
  });

  it('marque status=failed si le canal échoue sans repli', async () => {
    const { svc, mockPrisma } = makeDeps();
    (svc as any).channels.set('email', { channel: 'email', send: vi.fn().mockRejectedValue(new Error('SMTP down')) });

    await expect(svc.processJob(basePayload)).rejects.toThrow('SMTP down');

    expect(mockPrisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });
});

// ─── Tests : isolation tenant ────────────────────────────────────────────────

describe('Isolation tenant (markRead)', () => {
  it('refuse l\'accès à une notification d\'une autre agence → 403', async () => {
    const { svc, mockPrisma } = makeDeps('agence-abc');

    (mockPrisma.notification.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'notif-xyz',
      agence_id: 'agence-AUTRE',
      utilisateur_id: 'user-123',
    });

    await expect(svc.markRead('notif-xyz', 'user-123')).rejects.toThrow(ForbiddenException);
  });

  it('refuse si la notification appartient à un autre utilisateur → 403', async () => {
    const { svc, mockPrisma } = makeDeps('agence-abc');

    (mockPrisma.notification.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'notif-xyz',
      agence_id: 'agence-abc',
      utilisateur_id: 'user-AUTRE',
    });

    await expect(svc.markRead('notif-xyz', 'user-moi')).rejects.toThrow(ForbiddenException);
  });
});

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export class BudgetExceededError extends Error {
  constructor(
    public readonly agence_id: string,
    public readonly usedCents: number,
    public readonly limitCents: number,
  ) {
    super(
      `Budget IA dépassé pour l'agence ${agence_id} : ${usedCents}¢ utilisés / ${limitCents}¢ autorisés ce mois`,
    );
    this.name = 'BudgetExceededError';
  }
}

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Vérifie si le budget mensuel est disponible. Lève BudgetExceededError sinon. */
  async check(agence_id: string, estimatedCents: number): Promise<void> {
    const month = currentMonth();
    const budget = await this.getOrCreate(agence_id, month);

    if (budget.current_month !== month) {
      // Nouveau mois : remise à zéro
      await this.prisma.aiBudget.update({
        where: { agence_id },
        data: { current_month: month, used_cents: 0 },
      });
      return;
    }

    if (budget.used_cents + estimatedCents > budget.monthly_limit_cents) {
      throw new BudgetExceededError(agence_id, budget.used_cents, budget.monthly_limit_cents);
    }
  }

  /** Incrémente le compteur après un appel réussi. */
  async record(agence_id: string, costCents: number): Promise<void> {
    const month = currentMonth();
    await this.getOrCreate(agence_id, month);

    await this.prisma.aiBudget.update({
      where: { agence_id },
      data: { used_cents: { increment: costCents } },
    });
  }

  private async getOrCreate(agence_id: string, month: string) {
    return this.prisma.aiBudget.upsert({
      where: { agence_id },
      create: { agence_id, current_month: month, used_cents: 0, monthly_limit_cents: 1000 },
      update: {},
    });
  }
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

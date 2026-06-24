import { z } from 'zod';

export const SUPPORTED_CURRENCIES = ['XOF', 'EUR', 'USD'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CurrencySchema = z.enum(SUPPORTED_CURRENCIES);

export interface MoneyDTO {
  amount: string; // bigint sérialisé en string pour JSON
  currency: Currency;
}

export const MoneyDTOSchema = z.object({
  amount: z.string().regex(/^\d+$/, 'amount must be a non-negative integer string'),
  currency: CurrencySchema,
});

/**
 * Value object Money.
 * `amount` est TOUJOURS en centimes (entier bigint). Jamais de float.
 * 1 FCFA = 1 centime (XOF n'a pas de sous-unité en pratique, mais on stocke tout en centimes).
 * 1 EUR = 100 centimes.
 */
export class Money {
  readonly amount: bigint;
  readonly currency: Currency;

  private constructor(amount: bigint, currency: Currency) {
    if (typeof amount !== 'bigint') {
      throw new TypeError(`Money amount must be a bigint, got ${typeof amount}`);
    }
    this.amount = amount;
    this.currency = currency;
  }

  static of(currency: Currency, amount: bigint): Money {
    return new Money(amount, currency);
  }

  static ofXOF(amount: bigint): Money {
    return new Money(amount, 'XOF');
  }

  static fromDTO(dto: MoneyDTO): Money {
    const parsed = MoneyDTOSchema.parse(dto);
    return new Money(BigInt(parsed.amount), parsed.currency);
  }

  static zero(currency: Currency = 'XOF'): Money {
    return new Money(0n, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: cannot operate on ${this.currency} and ${other.currency}`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(scalar: bigint): Money {
    if (typeof scalar !== 'bigint') {
      throw new TypeError(`scalar must be a bigint, got ${typeof scalar}`);
    }
    return new Money(this.amount * scalar, this.currency);
  }

  divide(scalar: bigint): Money {
    if (typeof scalar !== 'bigint') {
      throw new TypeError(`scalar must be a bigint, got ${typeof scalar}`);
    }
    if (scalar === 0n) {
      throw new Error('Division by zero');
    }
    return new Money(this.amount / scalar, this.currency);
  }

  isZero(): boolean {
    return this.amount === 0n;
  }

  isNegative(): boolean {
    return this.amount < 0n;
  }

  isPositive(): boolean {
    return this.amount > 0n;
  }

  /** Retourne -1, 0, ou 1 */
  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.amount < other.amount) return -1;
    if (this.amount > other.amount) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  /**
   * Formate le montant pour l'affichage.
   * XOF : pas de décimales (devise sans sous-unité officielle).
   * EUR/USD : 2 décimales.
   */
  format(locale: string = 'fr-CI'): string {
    const fractionDigits = this.currency === 'XOF' ? 0 : 2;
    const numericValue =
      this.currency === 'XOF'
        ? Number(this.amount)
        : Number(this.amount) / 100;

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(numericValue);
  }

  toJSON(): MoneyDTO {
    return { amount: this.amount.toString(), currency: this.currency };
  }

  toString(): string {
    return `${this.amount} ${this.currency}`;
  }
}

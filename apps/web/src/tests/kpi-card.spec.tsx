import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KPICard } from '@/components/kpi-card';

// lucide-react uses SVG — stub it minimally
vi.mock('lucide-react', () => ({
  TrendingUp: () => <svg data-testid="icon-up" />,
  TrendingDown: () => <svg data-testid="icon-down" />,
  Minus: () => <svg data-testid="icon-minus" />,
}));

describe('KPICard', () => {
  it('affiche le titre', () => {
    render(<KPICard title="Revenus du mois" />);
    expect(screen.getByText('Revenus du mois')).toBeTruthy();
  });

  it('affiche la valeur et l\'unité', () => {
    render(<KPICard title="KPI" value="1 200 000" unit="FCFA" />);
    expect(screen.getByText('1 200 000')).toBeTruthy();
    expect(screen.getByText('FCFA')).toBeTruthy();
  });

  it('affiche le placeholder si value absente', () => {
    render(<KPICard title="KPI" placeholder="Sera alimenté en R1" />);
    expect(screen.getByText('Sera alimenté en R1')).toBeTruthy();
  });

  it('affiche un skeleton en mode loading', () => {
    const { container } = render(<KPICard title="KPI" loading />);
    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).toBeTruthy();
  });

  it('déclenche onClick au clic', async () => {
    const onClick = vi.fn();
    render(<KPICard title="KPI" onClick={onClick} />);
    await userEvent.click(screen.getByText('KPI').closest('div')!.parentElement!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('affiche TrendingUp pour une variation positive', () => {
    render(<KPICard title="KPI" value="100" change={5} />);
    expect(screen.getByTestId('icon-up')).toBeTruthy();
    expect(screen.getByText(/5%/)).toBeTruthy();
  });

  it('affiche TrendingDown pour une variation négative', () => {
    render(<KPICard title="KPI" value="100" change={-3} />);
    expect(screen.getByTestId('icon-down')).toBeTruthy();
    expect(screen.getByText(/3%/)).toBeTruthy();
  });
});

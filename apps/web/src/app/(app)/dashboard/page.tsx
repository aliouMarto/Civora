'use client';

import * as React from 'react';
import {
  TrendingUp,
  Building2,
  Home,
  AlertTriangle,
  Users,
  FileText,
  Sparkles,
  Activity,
} from 'lucide-react';
import { KPICard } from '@/components/kpi-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n/config';

function PlaceholderBlock({ title, description, release }: { title: string; description: string; release: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Badge variant="info">{release}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-200 py-6 text-center">
          <Activity size={20} className="text-neutral-300" />
          <p className="text-sm text-neutral-400">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{t('dashboard.title')}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t('dashboard.subtitle')}</p>
      </div>

      {/* AI Insights banner */}
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-neutral-900">{t('dashboard.ai_insights')}</p>
            <p className="text-sm text-neutral-400">{t('dashboard.ai_insights_desc')}</p>
          </div>
          <Badge variant="info">R1</Badge>
        </CardContent>
      </Card>

      {/* KPI row 1 — Finances */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Finances</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <KPICard
            title={t('dashboard.kpi_revenus')}
            placeholder={t('dashboard.ai_insights_desc').replace('IA', 'R1')}
            icon={<TrendingUp size={18} />}
          />
          <KPICard
            title={t('dashboard.kpi_impayes')}
            placeholder="Sera alimenté en R2"
            icon={<AlertTriangle size={18} />}
          />
          <KPICard
            title="Cash Flow 7j"
            placeholder="Sera alimenté en R1"
            icon={<TrendingUp size={18} />}
          />
        </div>
      </section>

      {/* KPI row 2 — Patrimoine */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Patrimoine</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <KPICard
            title={t('dashboard.kpi_biens')}
            placeholder="Sera alimenté en R1"
            icon={<Building2 size={18} />}
          />
          <KPICard
            title={t('dashboard.kpi_taux_occupation')}
            placeholder="Sera alimenté en R1"
            icon={<Home size={18} />}
          />
          <KPICard
            title={t('dashboard.kpi_baux')}
            placeholder="Sera alimenté en R1"
            icon={<FileText size={18} />}
          />
        </div>
      </section>

      {/* KPI row 3 — CRM */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">CRM</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <KPICard
            title={t('dashboard.kpi_contacts')}
            placeholder="Sera alimenté en R2"
            icon={<Users size={18} />}
          />
          <KPICard title="Leads en cours" placeholder="Sera alimenté en R2" icon={<Users size={18} />} />
          <KPICard title="Taux conversion" placeholder="Sera alimenté en R2" icon={<TrendingUp size={18} />} />
        </div>
      </section>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PlaceholderBlock
          title={t('dashboard.graph_revenus')}
          description={t('dashboard.graph_revenus_desc')}
          release="R1"
        />
        <PlaceholderBlock
          title={t('dashboard.donut_parc')}
          description={t('dashboard.donut_parc_desc')}
          release="R1"
        />
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <PlaceholderBlock
          title={t('dashboard.cashflow')}
          description={t('dashboard.cashflow_desc')}
          release="R1"
        />
        <PlaceholderBlock
          title={t('dashboard.pipeline')}
          description={t('dashboard.pipeline_desc')}
          release="R2"
        />
        <PlaceholderBlock
          title={t('dashboard.activite_live')}
          description={t('dashboard.activite_live_desc')}
          release="R1"
        />
      </div>

      {/* Bottom row 2 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <PlaceholderBlock
          title={t('dashboard.impayes_top')}
          description={t('dashboard.impayes_top_desc')}
          release="R2"
        />
        <PlaceholderBlock
          title={t('dashboard.saisonnier')}
          description={t('dashboard.saisonnier_desc')}
          release="R3"
        />
        <PlaceholderBlock
          title={t('dashboard.top_agents')}
          description={t('dashboard.top_agents_desc')}
          release="R2"
        />
      </div>
    </div>
  );
}

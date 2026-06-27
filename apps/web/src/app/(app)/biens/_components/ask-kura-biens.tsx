'use client';

import * as React from 'react';
import Link from 'next/link';
import { Send, Sparkles, Loader2, MapPin } from 'lucide-react';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useAskKuraBiens, type AskKuraBiensResponse } from '@/lib/api/biens.api';
import { ScoreBienBadge } from './score-bien-badge';
import { StatutBadge } from './statut-badge';
import { formatXof } from '@/lib/biens/format';

interface AskKuraBiensProps {
  open: boolean;
  onClose: () => void;
}

interface Exchange {
  id: string;
  question: string;
  response: AskKuraBiensResponse | null;
  error?: string;
}

const HISTORY_MAX = 10;

export function AskKuraBiens({ open, onClose }: AskKuraBiensProps): React.ReactElement {
  const [question, setQuestion] = React.useState('');
  const [history, setHistory] = React.useState<Exchange[]>([]);
  const ask = useAskKuraBiens();
  const { toast } = useToast();
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history.length]);

  const submit = async () => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setQuestion('');
    const id = crypto.randomUUID();
    setHistory((h) => [...h, { id, question: q, response: null }].slice(-HISTORY_MAX));
    try {
      const res = await ask.mutateAsync({ question: q, max_results: 8 });
      setHistory((h) => h.map((x) => (x.id === id ? { ...x, response: res } : x)));
    } catch (err) {
      const msg = (err as Error).message;
      setHistory((h) => h.map((x) => (x.id === id ? { ...x, error: msg } : x)));
      toast({ title: 'KURA en erreur', description: msg, variant: 'error' });
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Demander à KURA — Biens">
      <div className="flex max-h-[70vh] flex-col">
        <div ref={scrollRef} className="max-h-[50vh] space-y-3 overflow-y-auto p-2">
          {history.length === 0 ? (
            <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 p-4 text-center text-sm text-neutral-500">
              <Sparkles size={16} className="mx-auto mb-1 text-primary-500" />
              Posez une question sur votre portefeuille. Exemples :
              <ul className="mt-2 space-y-1 text-xs">
                <li>« Biens à Cocody avec yield &gt; 7 % »</li>
                <li>« Studios meublés disponibles »</li>
                <li>« Quels biens ont le meilleur score d'occupation ? »</li>
              </ul>
            </div>
          ) : null}

          {history.map((x) => (
            <div key={x.id} className="space-y-2">
              <div className="text-right">
                <div className="ml-auto inline-block max-w-[80%] rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900">
                  {x.question}
                </div>
              </div>
              {x.error ? (
                <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{x.error}</div>
              ) : !x.response ? (
                <div className="inline-flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 size={14} className="animate-spin" /> KURA réfléchit…
                </div>
              ) : (
                <div className="space-y-2 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-800">
                  <p className="whitespace-pre-line">{x.response.answer}</p>
                  {x.response.biens.length > 0 ? (
                    <div>
                      <p className="mb-1 text-xs font-medium text-neutral-500">
                        Biens cités ({x.response.biens.length})
                      </p>
                      <ul className="space-y-1">
                        {x.response.biens.map((b) => (
                          <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
                            <Link
                              href={`/biens/${b.id}`}
                              onClick={onClose}
                              className="flex-1 truncate text-primary-600 hover:underline"
                            >
                              {b.reference} — {b.nom}
                            </Link>
                            <span className="flex items-center gap-1 text-neutral-500">
                              <MapPin size={10} /> {b.commune ?? b.ville}
                            </span>
                            <StatutBadge statut={b.statut as never} />
                            <ScoreBienBadge score={b.score_ia} />
                            <span className="text-neutral-600">
                              {b.loyer_mensuel_xof
                                ? `${formatXof(b.loyer_mensuel_xof)}/mois`
                                : b.prix_vente_xof
                                  ? formatXof(b.prix_vente_xof)
                                  : '—'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className="text-xs text-neutral-400">
                    {x.response.meta.model} · {x.response.meta.latency_ms} ms ·{' '}
                    {(x.response.meta.cost_cents / 100).toFixed(4)} $
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-neutral-100 p-3">
          <Label htmlFor="kura-q" className="sr-only">Question pour KURA</Label>
          <div className="flex gap-2">
            <Textarea
              id="kura-q"
              rows={2}
              value={question}
              placeholder="Votre question (Cmd+Entrée pour envoyer)"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKey}
              aria-label="Question pour KURA"
            />
            <Button onClick={submit} disabled={ask.isPending || !question.trim()}>
              <Send size={14} />
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

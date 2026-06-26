'use client';

import * as React from 'react';
import Link from 'next/link';
import { Sparkles, Send, Loader2, Users } from 'lucide-react';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

import { useAskKura, type AskKuraResponse } from '@/lib/api/contacts.api';

interface AskKuraContactsProps {
  open: boolean;
  onClose: () => void;
}

interface ChatTurn {
  id: string;
  question: string;
  answer: string;
  contacts: AskKuraResponse['contacts'];
  error?: string;
}

const MAX_HISTORY = 10;

export function AskKuraContacts({ open, onClose }: AskKuraContactsProps): React.ReactElement {
  const [question, setQuestion] = React.useState('');
  const [history, setHistory] = React.useState<ChatTurn[]>([]);
  const ask = useAskKura();

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history.length, ask.isPending]);

  const submit = async () => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    const turnId = crypto.randomUUID();
    setQuestion('');
    setHistory((prev) => {
      const next = [
        ...prev,
        { id: turnId, question: q, answer: '', contacts: [] as AskKuraResponse['contacts'] },
      ];
      return next.slice(-MAX_HISTORY);
    });
    try {
      const res = await ask.mutateAsync({ question: q, max_results: 5 });
      setHistory((prev) =>
        prev.map((t) =>
          t.id === turnId ? { ...t, answer: res.answer, contacts: res.contacts } : t,
        ),
      );
    } catch (err) {
      const msg = (err as Error).message;
      setHistory((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, error: msg } : t)),
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Demander à KURA — Contacts">
      <div className="flex h-[60vh] flex-col">
        <p className="border-b border-neutral-100 pb-2 text-xs text-neutral-500">
          Posez une question en langage naturel : « propriétaires VIP à Cocody »,
          « contacts chauds qui n'ont pas eu d'interaction depuis 30 jours »…
          <br />
          Les emails et téléphones ne sont jamais transmis au modèle.
        </p>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-3">
          {history.length === 0 && !ask.isPending ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-neutral-400">
              <Sparkles size={28} />
              <p>Posez votre première question — KURA répond avec les contacts pertinents de votre agence.</p>
            </div>
          ) : null}

          {history.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary-600 px-3 py-2 text-sm text-white">
                {t.question}
              </div>
              {t.error ? (
                <div className="mr-auto max-w-[80%] rounded-2xl rounded-bl-sm bg-red-50 px-3 py-2 text-sm text-red-700">
                  {t.error}
                </div>
              ) : t.answer ? (
                <div className="mr-auto max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 text-sm text-neutral-800">
                  <p className="whitespace-pre-line">{t.answer}</p>
                  {t.contacts.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      <p className="flex items-center gap-1 text-xs font-medium text-neutral-500">
                        <Users size={12} /> Contacts cités :
                      </p>
                      <ul className="space-y-1">
                        {t.contacts.map((c) => (
                          <li key={c.id}>
                            <Link
                              href={`/contacts/${c.id}`}
                              onClick={onClose}
                              className="inline-flex items-center gap-1.5 text-xs text-primary-700 hover:underline"
                            >
                              {c.nom}{c.prenom ? ' ' + c.prenom : ''}
                              {c.ville ? (
                                <span className="text-neutral-500">— {c.ville}</span>
                              ) : null}
                              {c.score_categorie ? (
                                <Badge variant={c.score_categorie === 'chaud' ? 'success' : c.score_categorie === 'tiede' ? 'warning' : 'danger'}>
                                  {c.score_ia ?? '?'}
                                </Badge>
                              ) : null}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mr-auto max-w-[80%] rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 text-sm text-neutral-500">
                  <Loader2 size={14} className="mr-1 inline animate-spin" />
                  KURA réfléchit…
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-neutral-100 pt-3">
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Posez votre question… (Ctrl/⌘+Enter pour envoyer)"
              aria-label="Question pour KURA"
            />
            <Button onClick={submit} disabled={!question.trim() || ask.isPending}>
              <Send size={14} />
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

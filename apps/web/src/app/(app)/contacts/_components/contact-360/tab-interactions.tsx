'use client';

import * as React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Mail, MessageCircle, MessageSquare, Phone, Eye, StickyNote, Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';

import { useAddInteraction, useInteractions } from '@/lib/api/contacts.api';

interface TabInteractionsProps {
  contactId: string;
  canWrite: boolean;
}

type InteractionType = 'email' | 'whatsapp' | 'sms' | 'appel' | 'visite' | 'note';

const TYPE_LABEL: Record<InteractionType, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  appel: 'Appel',
  visite: 'Visite',
  note: 'Note',
};

function TypeIcon({ type }: { type: InteractionType }): React.ReactElement {
  const cls = 'text-neutral-500';
  switch (type) {
    case 'email':    return <Mail size={14} className={cls} />;
    case 'whatsapp': return <MessageCircle size={14} className={cls} />;
    case 'sms':      return <MessageSquare size={14} className={cls} />;
    case 'appel':    return <Phone size={14} className={cls} />;
    case 'visite':   return <Eye size={14} className={cls} />;
    case 'note':     return <StickyNote size={14} className={cls} />;
  }
}

export function TabInteractions({ contactId, canWrite }: TabInteractionsProps): React.ReactElement {
  const { data, isLoading } = useInteractions(contactId, 1, 50);
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-700">Historique des interactions</h3>
          <p className="text-xs text-neutral-500">{data?.total ?? 0} interaction(s)</p>
        </div>
        {canWrite ? (
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={14} className="mr-1.5" /> Nouvelle interaction
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-neutral-600">Aucune interaction enregistrée pour ce contact.</p>
          <p className="mt-1 text-xs text-neutral-500">
            Ajoutez une note, un appel ou un message pour démarrer l'historique.
          </p>
        </Card>
      ) : (
        <ol className="space-y-2">
          {data.items.map((it) => (
            <li key={it.id}>
              <Card className="p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <TypeIcon type={it.type as InteractionType} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-neutral-800">
                        {TYPE_LABEL[it.type as InteractionType] ?? it.type}
                      </span>
                      {it.direction ? (
                        <Badge variant={it.direction === 'entrant' ? 'info' : 'default'}>
                          {it.direction === 'entrant' ? 'Entrant' : 'Sortant'}
                        </Badge>
                      ) : null}
                      <span className="ml-auto text-xs text-neutral-500" title={format(new Date(it.occurred_at), 'PPpp', { locale: fr })}>
                        {formatDistanceToNow(new Date(it.occurred_at), { addSuffix: true, locale: fr })}
                      </span>
                    </div>
                    {it.sujet ? (
                      <p className="mt-1 text-sm font-medium text-neutral-700">{it.sujet}</p>
                    ) : null}
                    {it.contenu ? (
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-neutral-600">
                        {it.contenu}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <NewInteractionDialog
        contactId={contactId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

function NewInteractionDialog({
  contactId,
  open,
  onClose,
}: {
  contactId: string;
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const [type, setType] = React.useState<InteractionType>('note');
  const [direction, setDirection] = React.useState<'sortant' | 'entrant' | ''>('');
  const [sujet, setSujet] = React.useState('');
  const [contenu, setContenu] = React.useState('');
  const mut = useAddInteraction(contactId);
  const { toast } = useToast();

  const reset = () => {
    setType('note');
    setDirection('');
    setSujet('');
    setContenu('');
  };

  const submit = async () => {
    try {
      await mut.mutateAsync({
        type,
        direction: type === 'note' ? undefined : (direction || undefined) as 'sortant' | 'entrant' | undefined,
        sujet: sujet || undefined,
        contenu: contenu || undefined,
      });
      toast({ title: 'Interaction enregistrée', variant: 'success' });
      reset();
      onClose();
    } catch (err) {
      toast({ title: 'Erreur', description: (err as Error).message, variant: 'error' });
    }
  };

  const directionNeeded = type !== 'note';
  const valid = !directionNeeded || direction !== '';

  return (
    <Dialog open={open} onClose={onClose} title="Nouvelle interaction">
      <div className="space-y-3 p-4">
        <div>
          <Label htmlFor="it-type" required>Type</Label>
          <Select
            id="it-type"
            value={type}
            onChange={(e) => setType(e.target.value as InteractionType)}
          >
            {(Object.keys(TYPE_LABEL) as InteractionType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </Select>
        </div>
        {directionNeeded ? (
          <div>
            <Label htmlFor="it-dir" required>Direction</Label>
            <Select
              id="it-dir"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'sortant' | 'entrant' | '')}
            >
              <option value="">—</option>
              <option value="sortant">Sortant (vers le contact)</option>
              <option value="entrant">Entrant (du contact)</option>
            </Select>
          </div>
        ) : null}
        <div>
          <Label htmlFor="it-sujet">Sujet</Label>
          <Input id="it-sujet" value={sujet} onChange={(e) => setSujet(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="it-contenu">Contenu</Label>
          <Textarea id="it-contenu" rows={4} value={contenu} onChange={(e) => setContenu(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={!valid || mut.isPending}>
            {mut.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

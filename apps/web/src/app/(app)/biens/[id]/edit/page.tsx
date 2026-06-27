'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { BienForm } from '../../_components/bien-form';
import { useBien } from '@/lib/api/biens.api';

export default function EditBienPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const { data: bien, isLoading, error } = useBien(params.id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !bien) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-medium text-red-800">Bien introuvable</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <Link
          href={`/biens/${bien.id}`}
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ArrowLeft size={14} /> Retour à la fiche
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">
          Éditer : {bien.nom}
        </h1>
        <p className="text-sm text-neutral-500 font-mono">{bien.reference}</p>
      </div>
      <BienForm
        mode="edit"
        bienId={bien.id}
        initial={{
          nom: bien.nom,
          description: bien.description ?? undefined,
          type: bien.type,
          usage: bien.usage,
          statut: bien.statut,
          surface: bien.surface ? Number(bien.surface) : undefined,
          pieces: bien.pieces ?? undefined,
          chambres: bien.chambres ?? undefined,
          salles_bain: bien.salles_bain ?? undefined,
          etage: bien.etage ?? undefined,
          annee_construction: bien.annee_construction ?? undefined,
          amenities: bien.amenities,
          adresse_ligne1: bien.adresse_ligne1,
          adresse_ligne2: bien.adresse_ligne2 ?? undefined,
          ville: bien.ville,
          commune: bien.commune ?? undefined,
          pays: bien.pays,
          latitude: bien.latitude ?? undefined,
          longitude: bien.longitude ?? undefined,
          prix_vente_xof: bien.prix_vente_xof ? BigInt(bien.prix_vente_xof) : undefined,
          loyer_mensuel_xof: bien.loyer_mensuel_xof ? BigInt(bien.loyer_mensuel_xof) : undefined,
          charges_xof: bien.charges_xof ? BigInt(bien.charges_xof) : undefined,
          caution_xof: bien.caution_xof ? BigInt(bien.caution_xof) : undefined,
          proprietaire_id: bien.proprietaire_id ?? undefined,
          agent_responsable_id: bien.agent_responsable_id ?? undefined,
          tags: bien.tags,
        }}
      />
    </div>
  );
}

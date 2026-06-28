'use client';

import * as React from 'react';
import Link from 'next/link';

import { useMapbox } from '@/lib/maps/use-mapbox';
import { viewportBbox, mapboxgl } from '@/lib/maps/mapbox-client';
import {
  CLUSTER_COUNT_LAYOUT,
  CLUSTER_FILTER,
  CLUSTER_LAYER_PAINT,
  CLUSTER_PROPERTIES,
  STATUT_COLOR_EXPRESSION,
  UNCLUSTERED_FILTER,
} from '@/lib/maps/cluster-config';
import { apiFetch } from '@/lib/auth/api-client';
import type { BienFeatureCollection } from '@civora/shared-types';

import 'mapbox-gl/dist/mapbox-gl.css';

interface BiensMapProps {
  /** Filtres sérialisables passés à l'API (statut, type, prix, etc.) */
  filters?: Record<string, string | number | boolean | null | undefined>;
  className?: string;
}

const SOURCE_ID = 'biens-source';
const CLUSTERS_LAYER = 'biens-clusters';
const CLUSTER_COUNT_LAYER = 'biens-cluster-count';
const POINTS_LAYER = 'biens-points';
const HEATMAP_LAYER = 'biens-heatmap';

export function BiensMap({ filters = {}, className }: BiensMapProps): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const { map, ready, tokenMissing } = useMapbox(containerRef);
  const [heatmap, setHeatmap] = React.useState(false);
  const [truncated, setTruncated] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chargement initial + à chaque mouvement (debounce 300 ms)
  React.useEffect(() => {
    if (!map || !ready) return;
    const load = async () => {
      const bbox = viewportBbox(map);
      if (!bbox) return;
      try {
        const data = await apiFetch<BienFeatureCollection>(
          `/biens/map?bbox=${encodeURIComponent(bbox)}`,
        );
        setTruncated(data.truncated);
        const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
        if (src) {
          src.setData(data as unknown as GeoJSON.FeatureCollection);
        } else {
          map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: data as unknown as GeoJSON.FeatureCollection,
            ...CLUSTER_PROPERTIES,
          });
          addLayers(map);
        }
      } catch {
        // L'erreur API est silencieuse côté carte — la liste alertera.
      }
    };
    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(load, 300);
    };
    void load();
    map.on('moveend', schedule);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      map.off('moveend', schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ready, JSON.stringify(filters)]);

  // Toggle heatmap
  React.useEffect(() => {
    if (!map || !ready) return;
    if (heatmap && !map.getLayer(HEATMAP_LAYER)) {
      map.addLayer({
        id: HEATMAP_LAYER,
        type: 'heatmap',
        source: SOURCE_ID,
        maxzoom: 14,
        paint: {
          'heatmap-radius': 30,
          'heatmap-opacity': 0.6,
        },
      });
    }
    if (!heatmap && map.getLayer(HEATMAP_LAYER)) {
      map.removeLayer(HEATMAP_LAYER);
    }
  }, [heatmap, map, ready]);

  if (tokenMissing) {
    return (
      <div className={`relative flex h-[600px] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center ${className ?? ''}`}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400" aria-hidden="true"><path d="M20.893 13.393l-1.135-1.135a2.252 2.252 0 0 1-.421-.585l-1.08-2.16a.414.414 0 0 0-.663-.107.827.827 0 0 1-.812.21l-1.273-.363a.89.89 0 0 0-.738 1.595l.587.39c.59.395.674 1.23.172 1.732l-.2.2c-.211.212-.33.498-.33.796v.41c0 .409-.11.809-.32 1.158l-1.315 2.191a2.11 2.11 0 0 1-1.81 1.025 1.055 1.055 0 0 1-1.055-1.055v-1.172c0-.92-.56-1.747-1.414-2.089l-.655-.261a2.25 2.25 0 0 1-1.383-2.46l.007-.042a2.25 2.25 0 0 1 .29-.787l.09-.15a2.25 2.25 0 0 1 2.37-1.048l1.178.236a1.125 1.125 0 0 0 1.302-.795l.208-.73a1.125 1.125 0 0 0-.578-1.315l-.665-.332-.091.091a2.25 2.25 0 0 1-1.591.659h-.18c-.249 0-.487.1-.662.274a.931.931 0 0 1-1.458-1.137l1.411-2.353a2.25 2.25 0 0 0 .286-.76m11.928 9.869A9 9 0 0 0 8.965 3.525m11.928 9.868A9 9 0 1 1 8.965 3.525"/></svg>
        <div>
          <p className="font-semibold text-neutral-900">Token Mapbox manquant</p>
          <p className="mt-1 max-w-md text-sm text-neutral-600">
            La carte interactive nécessite un token Mapbox public. Récupère-en un gratuit sur{' '}
            <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer" className="font-medium text-primary-600 underline">account.mapbox.com</a>,
            puis ajoute-le dans <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs">.env</code> :
          </p>
          <pre className="mt-3 rounded-md bg-neutral-900 px-3 py-2 text-left text-xs text-neutral-100">MAPBOX_TOKEN_PUBLIC=pk.eyJ1...</pre>
          <p className="mt-2 text-xs text-neutral-500">Puis relance <code className="rounded bg-neutral-200 px-1 py-0.5">pnpm --filter @civora/web dev</code></p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-[600px] w-full overflow-hidden rounded-lg border border-neutral-200 ${className ?? ''}`}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* Légende */}
      <div className="absolute left-3 top-3 rounded-lg bg-white/95 p-3 text-xs shadow">
        <p className="mb-1 font-medium text-neutral-700">Statut</p>
        <ul className="space-y-1">
          <li className="flex items-center gap-2"><Dot color="#10b981" /> Disponible</li>
          <li className="flex items-center gap-2"><Dot color="#3b82f6" /> Loué</li>
          <li className="flex items-center gap-2"><Dot color="#f97316" /> Saisonnier</li>
          <li className="flex items-center gap-2"><Dot color="#6b7280" /> Hors circuit</li>
        </ul>
      </div>

      {/* Toggle heatmap */}
      <label className="absolute right-3 top-3 flex cursor-pointer items-center gap-2 rounded-md bg-white/95 px-3 py-1.5 text-xs font-medium shadow">
        <input
          type="checkbox"
          checked={heatmap}
          onChange={(e) => setHeatmap(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Heatmap densité
      </label>

      {truncated ? (
        <p className="absolute bottom-3 left-3 right-3 rounded-md bg-amber-50/95 px-3 py-2 text-xs text-amber-800 shadow">
          ⚠️ Plus de 5000 biens dans la zone — la carte est tronquée. Zoomez pour affiner.
        </p>
      ) : null}
    </div>
  );
}

function addLayers(map: mapboxgl.Map): void {
  map.addLayer({
    id: CLUSTERS_LAYER,
    type: 'circle',
    source: SOURCE_ID,
    filter: CLUSTER_FILTER,
    paint: CLUSTER_LAYER_PAINT as never,
  });
  map.addLayer({
    id: CLUSTER_COUNT_LAYER,
    type: 'symbol',
    source: SOURCE_ID,
    filter: CLUSTER_FILTER,
    layout: CLUSTER_COUNT_LAYOUT as never,
  });
  map.addLayer({
    id: POINTS_LAYER,
    type: 'circle',
    source: SOURCE_ID,
    filter: UNCLUSTERED_FILTER,
    paint: {
      'circle-color': STATUT_COLOR_EXPRESSION as never,
      'circle-radius': 7,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });

  // Clic cluster → zoom in
  map.on('click', CLUSTERS_LAYER, (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTERS_LAYER] });
    const f = features[0];
    if (!f) return;
    const clusterId = (f.properties as { cluster_id: number }).cluster_id;
    const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
    src.getClusterExpansionZoom(clusterId).then((zoom) => {
      map.easeTo({
        center: (f.geometry as GeoJSON.Point).coordinates as [number, number],
        zoom,
      });
    }).catch(() => undefined);
  });

  // Popup au clic d'un point
  map.on('click', POINTS_LAYER, (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const props = f.properties as Record<string, unknown>;
    const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    const html = `
      <div style="font-size: 12px; min-width: 180px">
        <div style="font-weight: 600; margin-bottom: 4px">${escapeHtml(String(props['nom']))}</div>
        <div style="color: #6b7280; margin-bottom: 6px">${escapeHtml(String(props['reference']))}</div>
        <div>Statut : <strong>${escapeHtml(String(props['statut']))}</strong></div>
        ${props['loyer_mensuel_xof'] ? `<div>Loyer : ${formatXof(props['loyer_mensuel_xof'])}/mois</div>` : ''}
        ${props['prix_vente_xof'] ? `<div>Prix : ${formatXof(props['prix_vente_xof'])}</div>` : ''}
        <a href="/biens/${escapeHtml(String(props['id']))}" style="display:inline-block;margin-top:6px;color:#2563eb">Voir la fiche →</a>
      </div>
    `;
    new mapboxgl.Popup({ closeButton: true })
      .setLngLat(coords)
      .setHTML(html)
      .addTo(map);
  });

  // Curseur main sur les points et clusters
  for (const layer of [CLUSTERS_LAYER, POINTS_LAYER]) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }
}

function Dot({ color }: { color: string }): React.ReactElement {
  return (
    <span
      aria-hidden
      style={{ background: color, width: 10, height: 10, borderRadius: 9999, display: 'inline-block' }}
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}
function formatXof(centimes: unknown): string {
  const n = typeof centimes === 'string' ? Number(centimes) : (centimes as number);
  const fcfa = Math.round(n / 100);
  return new Intl.NumberFormat('fr-FR').format(fcfa) + ' FCFA';
}

// Re-export pour typage indirect (cluster-config évite la dépendance circulaire)
export type { BienFeatureCollection };

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
  const { map, ready } = useMapbox(containerRef);
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

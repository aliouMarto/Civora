'use client';

import * as React from 'react';

import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_STYLE,
  DEFAULT_MAP_ZOOM,
  initMapbox,
  mapboxgl,
} from './mapbox-client';

interface UseMapboxOptions {
  center?: [number, number];
  zoom?: number;
  style?: string;
}

/**
 * Hook qui monte une instance Mapbox dans un container, la démontre au
 * cleanup et expose la map + un signal de "prêt".
 */
export function useMapbox(
  containerRef: React.RefObject<HTMLDivElement | null>,
  opts: UseMapboxOptions = {},
): { map: mapboxgl.Map | null; ready: boolean; tokenMissing: boolean } {
  const [map, setMap] = React.useState<mapboxgl.Map | null>(null);
  const [ready, setReady] = React.useState(false);
  const [tokenMissing, setTokenMissing] = React.useState(false);

  React.useEffect(() => {
    if (!containerRef.current) return;
    initMapbox();
    if (!mapboxgl.accessToken) {
      setTokenMissing(true);
      return;
    }
    setTokenMissing(false);

    const instance = new mapboxgl.Map({
      container: containerRef.current,
      style: opts.style ?? DEFAULT_MAP_STYLE,
      center: opts.center ?? DEFAULT_MAP_CENTER,
      zoom: opts.zoom ?? DEFAULT_MAP_ZOOM,
      attributionControl: true,
    });

    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    instance.addControl(
      new mapboxgl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
      'bottom-left',
    );

    instance.on('load', () => {
      // Force resize au cas où le container n'avait pas sa hauteur finale au mount.
      instance.resize();
      setMap(instance);
      setReady(true);
    });

    instance.on('error', (e: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[Mapbox] error', e);
    });

    // Resize après 200ms (sécurité supplémentaire pour le 1er paint).
    const resizeT = setTimeout(() => {
      try {
        instance.resize();
      } catch {
        /* noop */
      }
    }, 200);

    return () => {
      clearTimeout(resizeT);
      instance.remove();
      setMap(null);
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  return { map, ready, tokenMissing };
}

import { ImageryLayer, UrlTemplateImageryProvider } from 'cesium'

import type { BasemapId } from '../types/workspace'

function layer(url: string, credit: string, maximumLevel: number, subdomains?: string[]): ImageryLayer {
  return new ImageryLayer(
    new UrlTemplateImageryProvider({ url, credit, maximumLevel, ...(subdomains ? { subdomains } : {}) }),
  )
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'

/** Free basemaps. Attribution is shown in the map's credit line, as their licences require. */
export function createBasemap(id: BasemapId): ImageryLayer[] {
  switch (id) {
    case 'satellite':
      return [
        layer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, 'Imagery © Esri, Maxar, Earthstar Geographics', 19),
        // Road and place-name overlays turn raw imagery into a readable hybrid map.
        layer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, '© Esri', 19),
        layer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, '© Esri', 19),
      ]
    case 'streets':
      return [layer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© OpenStreetMap contributors', 19)]
    case 'dark':
      return [
        layer(
          'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          '© OpenStreetMap contributors © CARTO',
          20,
          ['a', 'b', 'c', 'd'],
        ),
      ]
  }
}

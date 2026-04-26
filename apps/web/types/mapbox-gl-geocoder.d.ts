declare module "@mapbox/mapbox-gl-geocoder" {
  import type mapboxgl from "mapbox-gl";

  export interface MapboxGeocoderOptions {
    accessToken: string;
    mapboxgl: typeof mapboxgl;
    marker?: boolean;
    placeholder?: string;
    countries?: string;
    bbox?: [number, number, number, number];
  }

  export default class MapboxGeocoder {
    constructor(options: MapboxGeocoderOptions);
    addTo(container: string | HTMLElement): unknown;
    on(type: "result", listener: (e: { result: { center: [number, number] } }) => void): this;
    clear(): void;
  }
}

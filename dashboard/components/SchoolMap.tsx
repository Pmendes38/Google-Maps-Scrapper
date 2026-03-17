"use client";

import { useEffect, useRef } from "react";

import type { SchoolLead } from "@/lib/types";

const COLORS: Record<string, string> = {
  alto: "#16a34a",
  medio: "#ca8a04",
  baixo: "#dc2626",
};

type SingleMarker = {
  lat: number;
  lng: number;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  score?: number | null;
  icp?: string | null;
};

export function SchoolMap({
  leads = [],
  height = "500px",
  marker,
  zoom,
}: {
  leads?: SchoolLead[];
  height?: string;
  marker?: SingleMarker;
  zoom?: number;
}) {
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapNodeRef.current) return;

    import("leaflet").then((leaflet) => {
      const L = leaflet.default;
      const mapNode = mapNodeRef.current;
      if (!mapNode) return;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);

      if (mapRef.current) {
        mapRef.current.remove();
      }

      const centerLat = marker?.lat ?? -15.8;
      const centerLng = marker?.lng ?? -47.9;
      const initialZoom = zoom ?? (marker ? 15 : 5);

      const map = L.map(mapNode, {
        center: [centerLat, centerLng],
        zoom: initialZoom,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      if (marker) {
        const color = COLORS[marker.icp ?? ""] ?? "#7c3aed";
        L.circleMarker([marker.lat, marker.lng], {
          radius: 10,
          fillColor: color,
          color: "#fff",
          weight: 1.5,
          fillOpacity: 0.9,
        })
          .bindPopup(
            `<strong>${marker.name ?? "Escola"}</strong><br/>${marker.city ?? ""}${marker.state ? ` · ${marker.state}` : ""}<br/>Score: <strong>${marker.score ?? "-"}</strong> · ICP: ${marker.icp ?? "-"}`,
          )
          .addTo(map);
      } else {
        leads.forEach((lead) => {
          const lat = lead.cep_lat ?? lead.latitude;
          const lng = lead.cep_lng ?? lead.longitude;
          if (!lat || !lng) return;

          const color = COLORS[lead.icp_match ?? ""] ?? "#6b7280";
          const radius = lead.ai_score ? Math.max(6, lead.ai_score / 12) : 6;

          L.circleMarker([lat, lng], {
            radius,
            fillColor: color,
            color: "#fff",
            weight: 1.5,
            fillOpacity: 0.8,
          })
            .bindPopup(
              `<strong>${lead.name}</strong><br/>${lead.city ?? ""} · ${lead.state ?? ""}<br/>Score: <strong>${lead.ai_score ?? "-"}</strong> · ICP: ${lead.icp_match ?? "-"}`,
            )
            .addTo(map);
        });
      }

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [leads, marker, zoom]);

  return <div ref={mapNodeRef} style={{ height, width: "100%", borderRadius: 12 }} />;
}

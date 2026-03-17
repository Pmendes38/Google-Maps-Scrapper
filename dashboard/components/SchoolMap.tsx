"use client";

import { useEffect, useRef } from "react";

import type { SchoolLead } from "@/lib/types";

const COLORS: Record<string, string> = {
  alto: "#16a34a",
  medio: "#ca8a04",
  baixo: "#dc2626",
};

export function SchoolMap({ leads, height = "500px" }: { leads: SchoolLead[]; height?: string }) {
  const mapRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    import("leaflet").then((leaflet) => {
      const L = leaflet.default;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);

      if (mapRef.current) {
        mapRef.current.remove();
      }

      const map = L.map("school-map", { center: [-15.8, -47.9], zoom: 5 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

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

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [leads]);

  return <div id="school-map" style={{ height, width: "100%", borderRadius: 12 }} />;
}

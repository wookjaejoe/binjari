"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  GeoJSONSource,
  LayerSpecification,
  LngLatBoundsLike,
  Map as MapLibre,
  MapGeoJSONFeature,
  StyleSpecification,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

/**
 * 대상 시트의 지도. 캠핑장마다 핀 하나, 가까우면 개수로 묶는다. 켜 둔 캠핑장은 primary.
 *
 * 바탕은 OpenFreeMap(키 없는 무료 OSM 타일)의 positron 이다. 무채색이라 화면의 규칙과 맞고,
 * 지명은 한글(name:ko)로 바꿔 단다. maplibre-gl 은 무거워서 이 파일째 시트를 열 때 받는다
 * (TargetPicker 의 dynamic import). 스타일·WebGL 이 실패하면 지도 칸을 통째로 뺀다 —
 * 목록만으로도 고를 수 있다.
 */

export type Pin = { id: string; name: string; lat: number; lng: number; on: boolean };
export type Bounds = { west: number; south: number; east: number; north: number };

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
/** 핀이 하나도 없을 때의 처음 화면. 남한 전체. */
const KOREA: LngLatBoundsLike = [
  [125.0, 33.1],
  [130.0, 38.65],
];
/** 손가락으로 핀을 누를 때 봐주는 반경(px). 핀 원은 반지름 6px 이라 그것만으로는 작다. */
const HIT = 16;

let stylePromise: Promise<StyleSpecification> | null = null;

/** 스타일은 한 번 받아 둔다. 지명을 한글로 바꾸고, 음영 기복(래스터)은 뺀다. */
function loadStyle(): Promise<StyleSpecification> {
  stylePromise ??= fetch(STYLE_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`${STYLE_URL} → HTTP ${res.status}`);
      return res.json() as Promise<StyleSpecification>;
    })
    .then((style) => ({
      ...style,
      layers: style.layers
        .filter((layer) => !("source" in layer && layer.source === "ne2_shaded"))
        .map((layer): LayerSpecification =>
          layer.type === "symbol" && layer.layout?.["text-field"]
            ? {
                ...layer,
                layout: {
                  ...layer.layout,
                  "text-field": ["coalesce", ["get", "name:ko"], ["get", "name"]],
                },
              }
            : layer,
        ),
    }))
    .catch((error) => {
      stylePromise = null;
      throw error;
    });
  return stylePromise;
}

type LngLatPair = [number, number];

const collection = (pins: Pin[]) => ({
  type: "FeatureCollection" as const,
  features: pins.map((pin) => ({
    type: "Feature" as const,
    properties: { id: pin.id, name: pin.name, on: pin.on ? 1 : 0 },
    geometry: { type: "Point" as const, coordinates: [pin.lng, pin.lat] },
  })),
});

function boxOf(points: LngLatPair[]): [LngLatPair, LngLatPair] | null {
  if (!points.length) return null;
  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

const pinBox = (pins: Pin[]) => boxOf(pins.map((pin): LngLatPair => [pin.lng, pin.lat]));

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 핀 전체가 들어오게. 핀 하나만 있어도 동네 단위(11)까지만 당긴다. */
const FIT = { padding: 24, maxZoom: 11 };

/**
 * 검색이 옮긴 지도는 목록을 거르지 않는다(검색어가 있으면 목록은 검색 결과다). 그 이동이 도중에
 * 끊기면 끊긴 자리로 moveend 가 오는데, 그걸 영역으로 받으면 검색을 지운 뒤에도 목록이 잠깐
 * 옛 검색 자리로 줄었다. 이동에 이유를 달아 검색 이동은 알리지 않는다.
 */
type FitReason = "search" | "reset";

function fitPins(map: MapLibre | null, pins: Pin[], reason: FitReason) {
  const target = pinBox(pins);
  if (target) map?.fitBounds(target, { ...FIT, animate: !still() }, { reason });
}

export default function PlaceMap({
  pins,
  fitKey,
  showReset,
  onBounds,
  onPick,
  onFail,
  className,
}: {
  pins: Pin[];
  /** 바뀌면 지금 핀 전체가 들어오게 맞춘다. 검색어를 넘긴다. */
  fitKey: string;
  /** 목록이 지도 영역으로 줄어 있을 때 "전국 보기"를 띄운다. */
  showReset: boolean;
  onBounds: (bounds: Bounds) => void;
  /** 핀(또는 한 자리에 겹친 핀 묶음)을 눌렀다. */
  onPick: (ids: string[]) => void;
  /** 스타일을 못 받았거나 WebGL 이 없다. 부모가 지도 칸을 뺀다. */
  onFail: () => void;
  /** 위치(absolute 등)를 준다. "전국 보기" 버튼이 이 상자 기준으로 붙는다. */
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 지도는 한 번 만들고, 콜백·핀은 ref 로 최신값을 읽는다.
  const latest = useRef({ pins, onBounds, onPick, onFail });
  useEffect(() => {
    latest.current = { pins, onBounds, onPick, onFail };
  });

  useEffect(() => {
    let map: MapLibre | null = null;
    let dead = false;
    (async () => {
      try {
        const [maplibre, style] = await Promise.all([import("maplibre-gl"), loadStyle()]);
        if (dead || !box.current) return;
        maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

        const css = getComputedStyle(document.documentElement);
        const token = (name: string) => css.getPropertyValue(name).trim();
        const [accent, ink, onInk, fg, surface] = [
          token("--accent"),
          token("--ink"),
          token("--on-ink"),
          token("--fg"),
          token("--surface"),
        ];

        map = new maplibre.Map({
          container: box.current,
          style,
          bounds: pinBox(latest.current.pins) ?? KOREA,
          fitBoundsOptions: FIT,
          minZoom: 4,
          maxZoom: 15,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          attributionControl: { compact: true },
          // 한글 지명·핀 이름은 글리프 파일 대신 기기 글꼴로 그린다. 화면과 같은 서체를 준다.
          localIdeographFontFamily: getComputedStyle(document.body).fontFamily || "sans-serif",
        });
        mapRef.current = map;
        map.touchZoomRotate.disableRotation();

        const report = () => {
          const b = map!.getBounds();
          latest.current.onBounds({
            west: b.getWest(),
            south: b.getSouth(),
            east: b.getEast(),
            north: b.getNorth(),
          });
        };

        map.on("load", () => {
          if (!map) return;
          // 출처 표기는 남기되 접어 둔다. 펼쳐진 채로 시작하면 지도 아래를 가린다.
          box.current
            ?.querySelector(".maplibregl-ctrl-attrib")
            ?.classList.remove("maplibregl-compact-show");

          map.addSource("pins", {
            type: "geojson",
            data: collection(latest.current.pins),
            cluster: true,
            clusterRadius: 32,
            clusterMaxZoom: 12,
            clusterProperties: { on: ["+", ["get", "on"]] },
          });
          map.addLayer({
            id: "clusters",
            type: "circle",
            source: "pins",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": ink,
              "circle-radius": ["step", ["get", "point_count"], 11, 5, 13, 10, 16],
              // 켜 둔 캠핑장이 든 묶음은 테두리만 primary. 채우면 "전부 켰다"로 읽힌다.
              "circle-stroke-color": ["case", [">", ["get", "on"], 0], accent, surface],
              "circle-stroke-width": ["case", [">", ["get", "on"], 0], 3, 2],
            },
          });
          map.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "pins",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Noto Sans Bold"],
              "text-size": 11,
              "text-allow-overlap": true,
            },
            paint: { "text-color": onInk },
          });
          map.addLayer({
            id: "pins",
            type: "circle",
            source: "pins",
            filter: ["!", ["has", "point_count"]],
            // 켜 둔 핀을 위에 그린다.
            layout: { "circle-sort-key": ["get", "on"] },
            paint: {
              "circle-color": ["case", ["==", ["get", "on"], 1], accent, ink],
              "circle-radius": 6,
              "circle-stroke-color": surface,
              "circle-stroke-width": 2,
            },
          });
          map.addLayer({
            id: "pin-names",
            type: "symbol",
            source: "pins",
            filter: ["!", ["has", "point_count"]],
            minzoom: 8,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 11,
              "text-offset": [0, 0.9],
              "text-anchor": "top",
              "text-max-width": 8,
              "text-optional": true,
            },
            paint: { "text-color": fg, "text-halo-color": surface, "text-halo-width": 1.5 },
          });
          setLoaded(true);
          report();
        });

        map.on("moveend", (event) => {
          if ((event as { reason?: FitReason }).reason !== "search") report();
        });

        map.on("click", async (event) => {
          if (!map) return;
          const { x, y } = event.point;
          const hits = map.queryRenderedFeatures(
            [
              [x - HIT, y - HIT],
              [x + HIT, y + HIT],
            ],
            { layers: ["clusters", "pins"] },
          );
          const hit = nearest(map, hits, x, y);
          if (!hit) return;
          const source = map.getSource<GeoJSONSource>("pins");
          if (!hit.properties.cluster || !source) {
            latest.current.onPick([hit.properties.id]);
            return;
          }
          const leaves = await source.getClusterLeaves(
            hit.properties.cluster_id,
            hit.properties.point_count,
            0,
          );
          const points = leaves.map((leaf) => (leaf.geometry as { coordinates: LngLatPair }).coordinates);
          const spread = boxOf(points);
          if (!spread) return;
          // 한 자리에 겹친 핀(좌표가 같은 캠핑장)은 벌어지지 않는다. 확대 대신 목록에서 보여준다.
          if (Math.abs(spread[1][0] - spread[0][0]) + Math.abs(spread[1][1] - spread[0][1]) < 0.002) {
            latest.current.onPick(leaves.map((leaf) => String(leaf.properties?.id)));
            return;
          }
          map.fitBounds(spread, { padding: 48, maxZoom: 13, animate: !still() });
        });

        for (const layer of ["clusters", "pins"]) {
          map.on("mouseenter", layer, () => {
            if (map) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            if (map) map.getCanvas().style.cursor = "";
          });
        }
      } catch {
        if (!dead) latest.current.onFail();
      }
    })();
    return () => {
      dead = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // 켜고 끄거나 검색으로 핀이 바뀌면 소스만 갈아 끼운다.
  useEffect(() => {
    if (!loaded) return;
    mapRef.current?.getSource<GeoJSONSource>("pins")?.setData(collection(pins));
  }, [loaded, pins]);

  // 검색어가 바뀌면 걸린 핀이 다 보이게 맞춘다. 처음 한 번은 생성 때 이미 맞췄다.
  const lastFit = useRef(fitKey);
  useEffect(() => {
    if (!loaded || lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    // 검색어를 지우면 전국으로 물러난다 — 그건 목록을 되돌리는 이동이라 알린다.
    fitPins(mapRef.current, latest.current.pins, fitKey ? "search" : "reset");
  }, [loaded, fitKey]);

  return (
    <div className={className}>
      <div ref={box} className="size-full" aria-hidden />
      {showReset && (
        <button
          type="button"
          onClick={() => fitPins(mapRef.current, latest.current.pins, "reset")}
          className="absolute top-2 right-2 rounded-full bg-surface px-3 py-1.5 text-xs font-medium elev-2 active:bg-surface-2"
        >
          전국 보기
        </button>
      )}
    </div>
  );
}

/** 누른 자리에서 가장 가까운 핀이나 묶음. */
function nearest(map: MapLibre, hits: MapGeoJSONFeature[], x: number, y: number) {
  let best: MapGeoJSONFeature | null = null;
  let bestDistance = Infinity;
  for (const hit of hits) {
    const [lng, lat] = (hit.geometry as { coordinates: LngLatPair }).coordinates;
    const point = map.project([lng, lat]);
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < bestDistance) {
      best = hit;
      bestDistance = distance;
    }
  }
  return best;
}

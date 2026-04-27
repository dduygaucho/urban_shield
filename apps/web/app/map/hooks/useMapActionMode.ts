"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { MapActionMode } from "@/app/map/constants/mapModes";

export type UseMapActionModeReturn = {
  mode: MapActionMode;
  setMode: Dispatch<SetStateAction<MapActionMode>>;
  enterBrowseMode: () => void;
  enterReportMode: () => void;
  enterRouteMode: () => void;
  enterPeerWalkMode: () => void;
};

export function useMapActionMode(initialMode: MapActionMode = "browse"): UseMapActionModeReturn {
  const [mode, setMode] = useState<MapActionMode>(initialMode);

  const enterBrowseMode = useCallback(() => setMode("browse"), []);
  const enterReportMode = useCallback(() => setMode("report"), []);
  const enterRouteMode = useCallback(() => setMode("route"), []);
  const enterPeerWalkMode = useCallback(() => setMode("peerWalkFuture"), []);

  return {
    mode,
    setMode,
    enterBrowseMode,
    enterReportMode,
    enterRouteMode,
    enterPeerWalkMode,
  };
}


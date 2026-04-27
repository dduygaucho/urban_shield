"use client";

import type { MapActionMode } from "@/app/map/constants/mapModes";
import {
  dockButtonActiveRoute,
  dockButtonActiveStandard,
  dockButtonBase,
  dockButtonInactive,
  dockInnerClass,
  dockLabelPrimaryClass,
  dockLabelSecondaryClass,
  dockLabelSecondaryOnRouteActiveClass,
  dockLabelSecondaryOnStandardActiveClass,
  dockOuterClass,
} from "@/app/map/components/primaryActionDock.styles";

type Props = {
  mode: MapActionMode;
  onReport: () => void;
  onRoute: () => void;
  onPeerWalk: () => void;
};

function buttonClass(active: boolean, routeVariant: boolean): string {
  if (!active) return `${dockButtonBase} ${dockButtonInactive}`;
  if (routeVariant) return `${dockButtonBase} ${dockButtonActiveRoute}`;
  return `${dockButtonBase} ${dockButtonActiveStandard}`;
}

export function PrimaryActionDock({ mode, onReport, onRoute, onPeerWalk }: Props) {
  const reportActive = mode === "report";
  const routeActive = mode === "route";
  const peerActive = mode === "peerWalkFuture";

  return (
    <div className={dockOuterClass} role="toolbar" aria-label="Map primary actions">
      <div className={dockInnerClass}>
        <button
          type="button"
          onClick={onReport}
          aria-pressed={reportActive}
          className={buttonClass(reportActive, false)}
        >
          <span className={dockLabelPrimaryClass}>Report</span>
          <span
            className={
              reportActive ? dockLabelSecondaryOnStandardActiveClass : dockLabelSecondaryClass
            }
          >
            Incident
          </span>
        </button>
        <button
          type="button"
          onClick={onRoute}
          aria-pressed={routeActive}
          className={buttonClass(routeActive, true)}
        >
          <span className={dockLabelPrimaryClass}>Plan</span>
          <span
            className={
              routeActive ? dockLabelSecondaryOnRouteActiveClass : dockLabelSecondaryClass
            }
          >
            Route
          </span>
        </button>
        <button
          type="button"
          onClick={onPeerWalk}
          aria-pressed={peerActive}
          className={buttonClass(peerActive, false)}
        >
          <span className={`${dockLabelPrimaryClass} max-w-[6.25rem] leading-tight`}>
            Walk With Peer
          </span>
          <span
            className={
              peerActive ? dockLabelSecondaryOnStandardActiveClass : dockLabelSecondaryClass
            }
          >
            Coming soon
          </span>
        </button>
      </div>
    </div>
  );
}

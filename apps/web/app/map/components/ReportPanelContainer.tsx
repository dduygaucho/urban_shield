"use client";

import type { ComponentProps } from "react";
import { ReportBottomSheet } from "@/app/map/ReportBottomSheet";

/**
 * Single mount path for the report sheet. When `open` is false, the bottom sheet
 * subtree is not mounted so no dialog/backdrop nodes sit in the tree alongside
 * route/peer panels (z-stacking clarity). Parent-owned form state is unchanged.
 */
export function ReportPanelContainer(props: ComponentProps<typeof ReportBottomSheet>) {
  if (!props.open) {
    return null;
  }
  return <ReportBottomSheet {...props} />;
}


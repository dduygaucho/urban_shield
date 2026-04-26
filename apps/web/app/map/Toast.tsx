"use client";

import { useEffect } from "react";

export type ToastVariant = "success" | "error";

export function Toast({
  message,
  variant,
  onDismiss,
}: {
  message: string;
  variant: ToastVariant;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 3200);
    return () => window.clearTimeout(t);
  }, [onDismiss]);

  const bg =
    variant === "success"
      ? "bg-emerald-900/95 text-emerald-50 shadow-lg shadow-emerald-900/20"
      : "bg-red-900/95 text-red-50 shadow-lg shadow-red-900/20";

  return (
    <div
      className={`pointer-events-auto fixed bottom-28 left-1/2 z-[60] max-w-[min(92vw,24rem)] -translate-x-1/2 rounded-2xl px-4 py-3 text-center text-sm font-medium shadow-xl transition-opacity duration-300 ${bg}`}
      role="status"
    >
      {message}
    </div>
  );
}

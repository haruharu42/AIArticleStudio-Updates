"use client";

import { useEffect } from "react";

import { errorMessage, reportClientError, windowErrorDiagnostic } from "@/lib/ops";

export function AppErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const diagnostic = windowErrorDiagnostic(event);
      void reportClientError({
        errorCode: diagnostic.errorCode,
        message: diagnostic.message,
        feature: "global-runtime",
        route: window.location.pathname,
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      void reportClientError({
        errorCode: "UNHANDLED_REJECTION",
        message: errorMessage(event.reason),
        feature: "global-runtime",
        route: window.location.pathname,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}

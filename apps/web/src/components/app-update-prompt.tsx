import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

import { useTranslation } from "../hooks/use-translation";

/**
 * Registers the service worker that keeps the app shell for starts with no
 * network, and offers a reload once a new version is waiting. The new version
 * never takes over a running page by itself: old and new code could mix.
 */
export function AppUpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    const id = toast(t("update.available"), {
      duration: Number.POSITIVE_INFINITY,
      action: { label: t("update.reload"), onClick: () => void updateServiceWorker(true) }
    });
    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, t, updateServiceWorker]);

  return null;
}

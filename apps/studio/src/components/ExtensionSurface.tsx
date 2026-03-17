import { Component, type ReactNode, useEffect } from "react";
import { AlertTriangle, Lock, PlugZap, RefreshCw } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { useStudioCommands } from "@/kernel/hooks";
import type {
  StudioContributionDescriptor,
  StudioExtensionRuntimeRecord,
} from "@/kernel/types";

type ExtensionSurfaceProps = {
  contribution: StudioContributionDescriptor;
  runtime: StudioExtensionRuntimeRecord | null;
  chrome?: "fill" | "card";
};

type ExtensionBoundaryProps = {
  children: ReactNode;
  onError: (error: Error) => void;
};

type ExtensionBoundaryState = {
  failed: boolean;
};

class ExtensionBoundary extends Component<ExtensionBoundaryProps, ExtensionBoundaryState> {
  state: ExtensionBoundaryState = {
    failed: false,
  };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}

function SurfaceFallback({
  contribution,
  runtime,
  chrome,
}: ExtensionSurfaceProps) {
  const {
    clearExtensionError,
    setCapabilityGrant,
    setExtensionEnabled,
  } = useStudioCommands();
  const { t } = useTranslation('workbench');
  const { t: tc } = useTranslation('common');
  const shellClassName =
    chrome === "fill"
      ? "flex h-full w-full items-center justify-center bg-background p-6"
      : "rounded-xl border bg-card p-4";

  if (!runtime) {
    return (
      <div className={shellClassName}>
        <div className="text-sm text-muted-foreground">{t("extensionRuntimeUnavailable")}</div>
      </div>
    );
  }

  if (runtime.status === "disabled") {
    return (
      <div className={shellClassName}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <PlugZap className="size-4" />
            {t("extensionDisabled", { title: contribution.title })}
          </div>
          <div className="text-muted-foreground">
            {t("extensionDisabledDesc")}
          </div>
          <Button size="sm" onClick={() => setExtensionEnabled(contribution.extensionId, true)}>
            {t("enableExtension")}
          </Button>
        </div>
      </div>
    );
  }

  if (runtime.status === "blocked") {
    return (
      <div className={shellClassName}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Lock className="size-4" />
            {t("extensionBlocked", { title: contribution.title })}
          </div>
          <div className="text-muted-foreground">
            {t("missingCapabilities", { capabilities: runtime.missingCapabilities.join(", ") })}
          </div>
          {runtime.optionalCapabilities.length > 0 ? (
            <div className="text-xs text-muted-foreground">
              {t("degradedCapabilities", { capabilities: runtime.optionalCapabilities.join(", ") })}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {runtime.missingCapabilities.map((capability) => (
              <Button
                key={capability}
                variant="outline"
                size="sm"
                onClick={() => setCapabilityGrant(capability, true)}
              >
                {t("authorize", { capability })}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (runtime.status === "error") {
    return (
      <div className={shellClassName}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4" />
            {t("extensionLoadFailed", { title: contribution.title })}
          </div>
          <div className="text-muted-foreground">{runtime.error}</div>
          <Button variant="outline" size="sm" onClick={() => clearExtensionError(contribution.extensionId)}>
            <RefreshCw className="size-4" />
            {tc("retry")}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

export function ExtensionSurface({ contribution, runtime, chrome = "card" }: ExtensionSurfaceProps) {
  const { activateExtension, markExtensionError } = useStudioCommands();
  const { t } = useTranslation('workbench');
  const activationReason = `${contribution.surface ?? "surface"}:${contribution.id}`;

  useEffect(() => {
    if (!runtime || !runtime.enabled || runtime.missingCapabilities.length > 0) {
      return;
    }
    if (runtime.activated) {
      return;
    }

    activateExtension(contribution.extensionId, activationReason);
  }, [
    activateExtension,
    activationReason,
    contribution.extensionId,
    runtime,
  ]);

  if (!runtime || runtime.status === "disabled" || runtime.status === "blocked" || runtime.status === "error") {
    return <SurfaceFallback contribution={contribution} runtime={runtime} chrome={chrome} />;
  }

  const SurfaceComponent = contribution.component;

  return (
    <div className="h-full w-full">
      {runtime.optionalCapabilities.length > 0 ? (
        <div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t("restrictedMode", { capabilities: runtime.optionalCapabilities.join(", ") })}
        </div>
      ) : null}
      <ExtensionBoundary
        key={`${contribution.id}:${runtime.error ?? "ok"}`}
        onError={(error) => {
          markExtensionError(contribution.extensionId, error.message || t("extensionRenderFailed"));
        }}
      >
        <SurfaceComponent />
      </ExtensionBoundary>
    </div>
  );
}

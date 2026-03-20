import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

export type StudioViewId = string;
export type StudioExtensionId = string;
export type StudioContributionId = string;

export type StudioExtensionKind =
  | 'official-core'
  | 'official-workflow'
  | 'third-party';

export type StudioExtensionHost = 'browser' | 'workspace' | 'service';
export type StudioContributionSurface = 'view' | 'panel' | 'inspector' | 'debug-view';
export type StudioPanelSlot = 'left' | 'right' | 'down';
export type StudioActivationEvent =
  | `onView:${string}`
  | `onCommand:${string}`
  | `onEvent:${string}`;
export type StudioRenderableComponent = ComponentType;

export interface StudioContributionBaseDescriptor {
  id: StudioContributionId;
  extensionId: StudioExtensionId;
  title: string;
  description: string;
  component: StudioRenderableComponent;
  order?: number;
}

export interface StudioViewDescriptor extends StudioContributionBaseDescriptor {
  surface?: 'view';
  id: StudioViewId;
  shortTitle: string;
  icon: LucideIcon;
}

export interface StudioPanelDescriptor extends StudioContributionBaseDescriptor {
  surface?: 'panel';
  slot: Extract<StudioPanelSlot, 'down'>;
  icon?: LucideIcon;
}

export interface StudioInspectorDescriptor extends StudioContributionBaseDescriptor {
  surface?: 'inspector';
  slot: Extract<StudioPanelSlot, 'right'>;
}

export interface StudioDebugViewDescriptor extends StudioContributionBaseDescriptor {
  surface?: 'debug-view';
  slot: StudioPanelSlot;
  icon?: LucideIcon;
}

export type StudioContributionDescriptor =
  | StudioViewDescriptor
  | StudioPanelDescriptor
  | StudioInspectorDescriptor
  | StudioDebugViewDescriptor;

export interface StudioExtensionContributions {
  views?: StudioViewDescriptor[];
  panels?: StudioPanelDescriptor[];
  inspectors?: StudioInspectorDescriptor[];
  debugViews?: StudioDebugViewDescriptor[];
  commands?: string[];
}

export interface StudioExtensionDescriptor {
  id: StudioExtensionId;
  title: string;
  description: string;
  kind: StudioExtensionKind;
  host: StudioExtensionHost;
  activationEvents: StudioActivationEvent[];
  contributes: StudioExtensionContributions;
}

export type StudioRegisteredExtensionDescriptor = StudioExtensionDescriptor;

export type StudioExtensionRuntimeStatus =
  | 'registered'
  | 'active'
  | 'disabled'
  | 'error';

export interface StudioExtensionRuntimeRecord {
  extensionId: StudioExtensionId;
  enabled: boolean;
  activated: boolean;
  status: StudioExtensionRuntimeStatus;
  activationReason?: string;
  lastActivatedAt?: number;
  error?: string;
}

export type StudioKernelEventName =
  | 'project.connected'
  | 'project.disconnected'
  | 'project.reloaded'
  | 'resource.changed'
  | 'diagnostics.updated'
  | 'history.updated'
  | 'review.changed'
  | 'checkpoint.created'
  | 'checkpoint.deleted'
  | 'checkpoint.restored'
  | 'run.created'
  | 'run.updated'
  | 'run.ended'
  | 'run.cancelled'
  | 'run.breakpoint.hit'
  | 'extension.activated'
  | 'extension.error'
  | 'job.updated';

export interface StudioKernelEventRecord {
  id: string;
  type: StudioKernelEventName;
  timestamp: number;
  message: string;
  resourceId?: string;
  extensionId?: StudioExtensionId;
  runId?: string;
  jobId?: string;
  data?: Record<string, unknown>;
}

export type StudioJobStatus = 'running' | 'completed' | 'failed';

export interface StudioJobRecord {
  id: string;
  title: string;
  detail?: string;
  status: StudioJobStatus;
  progress: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

// ── Third-party Extension System ──

export type ExtensionTrustLevel = 'official' | 'team' | 'third-party' | 'unverified';

export type ExtensionSignatureStatus = 'valid' | 'invalid' | 'missing' | 'expired';

export interface ExtensionHealthRecord {
  extensionId: StudioExtensionId;
  crashCount: number;
  lastCrashAt?: number;
  lastCrashError?: string;
  recoveryAttempts: number;
  healthy: boolean;
  disabledBySystem: boolean;
  disableReason?: string;
}

export type ThirdPartyContributionKind =
  | 'nodes'
  | 'views'
  | 'panels'
  | 'inspectors'
  | 'debugViews'
  | 'commands'
  | 'templates'
  | 'starters'
  | 'themes'
  | 'exporters'
  | 'shareTargets'
  | 'lints'
  | 'codeActions';

export interface ThirdPartyExtensionManifest {
  id: StudioExtensionId;
  title: string;
  description: string;
  version: string;
  author?: string;
  license?: string;
  repository?: string;
  host: StudioExtensionHost;
  activationEvents: StudioActivationEvent[];
  contributes: StudioExtensionContributions;
  trustLevel: ExtensionTrustLevel;
  signature?: {
    status: ExtensionSignatureStatus;
    signer?: string;
    signedAt?: number;
  };
  sandbox?: {
    maxMemoryMb?: number;
    timeoutMs?: number;
    allowedApis?: string[];
  };
}

// ── Presence / Collaboration ──

export type PresenceRole = 'owner' | 'editor' | 'reviewer' | 'viewer';

export interface PresenceUser {
  id: string;
  name: string;
  avatar?: string;
  role: PresenceRole;
  color: string;
  connectedAt: number;
  lastActiveAt: number;
}

export interface PresenceActivity {
  userId: string;
  resourceId?: string;
  viewId?: StudioViewId;
  cursorPosition?: { nodeId?: string; stepId?: string };
  selection?: string[];
  updatedAt: number;
}

export interface PresenceState {
  users: PresenceUser[];
  activities: PresenceActivity[];
  selfId: string | null;
}

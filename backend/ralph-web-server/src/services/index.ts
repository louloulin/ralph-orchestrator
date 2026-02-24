/**
 * Service layer exports
 * Business logic services for ralphbot
 */

export {
  SettingsService,
  SettingKeys,
  DEFAULT_PERSONA,
  DEFAULT_HAT,
  FALLBACK_PERSONA_DEFINITION,
  FALLBACK_HAT_DEFINITION,
  type PersonaDefinition,
  type HatDefinition,
  type PersonaMap,
  type HatMap,
} from "./SettingsService";

export {
  HatManager,
  PresetLoadError,
  PresetValidationError,
  type HatPreset,
  type McpServerConfig,
} from "./HatManager";

export {
  TaskBridge,
  type EnqueueResult,
  type EnqueueAllResult,
  type ExecutionStatus,
  type TaskBridgeOptions,
} from "./TaskBridge";

export { LoopsManager, type LoopStatus, type LoopsManagerOptions } from "./LoopsManager";

export {
  PlanningService,
  SessionStatus,
  type PlanningServiceOptions,
  type PlanningSessionDetail,
  type PlanningSessionSummary,
  type ConversationEntry,
} from "./PlanningService";

export { CollectionService } from "./CollectionService";

export { ConfigMerger, type MergeResult } from "./ConfigMerger";

export {
  HealthMonitor,
  DEFAULT_HEALTH_MONITOR_CONFIG,
  type HealthMonitorConfig,
} from "./HealthMonitor";

export {
  RestartManager,
  DEFAULT_RESTART_MANAGER_CONFIG,
  type RestartManagerConfig,
  type RestartDecision,
} from "./RestartManager";

export {
  LoopSupervisor,
  DEFAULT_LOOP_SUPERVISOR_CONFIG,
  type LoopSupervisorConfig,
  type LoopSupervisorEvents,
} from "./LoopSupervisor";

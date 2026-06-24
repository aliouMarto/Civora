export type TriggerKind = 'event' | 'cron' | 'manual';

export interface EventTriggerConfig {
  kind: 'event';
  event_type: string;
}

export interface CronTriggerConfig {
  kind: 'cron';
  /** Expression cron (ex: '0 9 * * 1' = lundi 9h) */
  cron: string;
  timezone?: string;
}

export interface ManualTriggerConfig {
  kind: 'manual';
}

export type TriggerConfig = EventTriggerConfig | CronTriggerConfig | ManualTriggerConfig;

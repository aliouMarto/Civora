export const channel = {
  tenant: (agence_id: string) => `tenant.${agence_id}`,
  user: (user_id: string) => `user.${user_id}`,
  module: (module_name: string, agence_id: string) => `module.${module_name}.${agence_id}`,
} as const;

export const event = {
  NOTIFICATION_NEW: 'notification.new',
  ACTIVITY_LIVE: 'activity.live',
  CONNECT_ACK: 'connect.ack',
} as const;

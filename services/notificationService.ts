import * as Notifications from 'expo-notifications';

export async function scheduleRescanNudge(lastScanDate: Date): Promise<void> {
  const triggerDate = new Date(lastScanDate);
  triggerDate.setDate(triggerDate.getDate() + 30);
  if (triggerDate <= new Date()) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Time to check in',
      body:  "It's been 30 days. See how your skin has changed.",
      data:  { type: 'rescan_nudge' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });
}

export async function cancelRescanNudge(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === 'rescan_nudge') {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

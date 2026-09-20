import { lazy, type ComponentType } from 'react';

export interface WidgetDef {
  id: string;
  label: string;
  icon: string;
  component: ComponentType;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
  /**
   * Safe to show on the guest display. Anything that surfaces household data
   * (calendar, tasks, chores, grocery, inventory, meals, reminders, commute)
   * is not; the guest layout refuses to place or render it.
   */
  guestSafe?: boolean;
}

const registry: WidgetDef[] = [
  {
    id: 'clock',
    label: 'Clock',
    icon: '🕐',
    component: lazy(() => import('./ClockWidget')),
    defaultW: 4, defaultH: 2, minW: 2, minH: 2,
    guestSafe: true,
  },
  {
    id: 'weather',
    label: 'Weather',
    icon: '🌤️',
    component: lazy(() => import('./WeatherWidget')),
    defaultW: 4, defaultH: 2, minW: 3, minH: 2,
    guestSafe: true,
  },
  {
    id: 'wifi',
    label: 'Wi-Fi',
    icon: '📶',
    component: lazy(() => import('./WifiWidget')),
    defaultW: 4, defaultH: 3, minW: 3, minH: 3,
    guestSafe: true,
  },
  {
    id: 'drinkFridge',
    label: 'Drink Fridge',
    icon: '🥤',
    component: lazy(() => import('./DrinkFridgeWidget')),
    defaultW: 4, defaultH: 3, minW: 3, minH: 2,
    guestSafe: true,
  },
  {
    id: 'reading',
    label: 'Currently Reading',
    icon: '📚',
    component: lazy(() => import('./ReadingWidget')),
    defaultW: 4, defaultH: 3, minW: 3, minH: 2,
    guestSafe: true,
  },
  {
    id: 'commute',
    label: 'Commute',
    icon: '🚗',
    component: lazy(() => import('./CommuteWidget')),
    defaultW: 4, defaultH: 3, minW: 3, minH: 2,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: '📋',
    component: lazy(() => import('./TasksWidget')),
    defaultW: 4, defaultH: 3, minW: 2, minH: 2,
  },
  {
    id: 'chores',
    label: 'Chores',
    icon: '🧹',
    component: lazy(() => import('./ChoresWidget')),
    defaultW: 6, defaultH: 3, minW: 2, minH: 2,
  },
  {
    id: 'events',
    label: 'Events',
    icon: '📅',
    component: lazy(() => import('./EventsWidget')),
    defaultW: 8, defaultH: 3, minW: 3, minH: 2,
  },
  {
    id: 'overdueChores',
    label: 'Overdue Chores',
    icon: '⚠️',
    component: lazy(() => import('./OverdueChoresWidget')),
    defaultW: 4, defaultH: 2, minW: 2, minH: 2,
  },
  {
    id: 'grocery',
    label: 'Grocery',
    icon: '🛒',
    component: lazy(() => import('./GroceryWidget')),
    defaultW: 6, defaultH: 3, minW: 3, minH: 2,
  },
  {
    id: 'reminders',
    label: 'Reminders',
    icon: '🔔',
    component: lazy(() => import('./RemindersWidget')),
    defaultW: 4, defaultH: 3, minW: 2, minH: 2,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: '📦',
    component: lazy(() => import('./InventoryWidget')),
    defaultW: 6, defaultH: 3, minW: 3, minH: 2,
  },
  {
    id: 'mealPlan',
    label: 'Meal Plan',
    icon: '🍽️',
    component: lazy(() => import('./MealPlanWidget')),
    defaultW: 6, defaultH: 3, minW: 3, minH: 2,
  },
];

export function getWidget(id: string): WidgetDef | undefined {
  return registry.find((w) => w.id === id);
}

export function getAllWidgets(): WidgetDef[] {
  return registry;
}

export function getGuestSafeWidgets(): WidgetDef[] {
  return registry.filter((w) => w.guestSafe);
}

export function isGuestSafe(id: string): boolean {
  return Boolean(getWidget(id)?.guestSafe);
}

export default registry;

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
}

const registry: WidgetDef[] = [
  {
    id: 'clock',
    label: 'Clock',
    icon: '🕐',
    component: lazy(() => import('./ClockWidget')),
    defaultW: 6, defaultH: 2, minW: 1, minH: 1,
  },
  {
    id: 'weather',
    label: 'Weather',
    icon: '🌤️',
    component: lazy(() => import('./WeatherWidget')),
    defaultW: 6, defaultH: 2, minW: 1, minH: 1,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: '📋',
    component: lazy(() => import('./TasksWidget')),
    defaultW: 6, defaultH: 3, minW: 1, minH: 1,
  },
  {
    id: 'chores',
    label: 'Chores',
    icon: '🧹',
    component: lazy(() => import('./ChoresWidget')),
    defaultW: 6, defaultH: 3, minW: 1, minH: 1,
  },
  {
    id: 'events',
    label: 'Events',
    icon: '📅',
    component: lazy(() => import('./EventsWidget')),
    defaultW: 12, defaultH: 4, minW: 3, minH: 2,
  },
  {
    id: 'overdueChores',
    label: 'Overdue Chores',
    icon: '⚠️',
    component: lazy(() => import('./OverdueChoresWidget')),
    defaultW: 6, defaultH: 3, minW: 1, minH: 1,
  },
  {
    id: 'grocery',
    label: 'Grocery',
    icon: '🛒',
    component: lazy(() => import('./GroceryWidget')),
    defaultW: 6, defaultH: 3, minW: 1, minH: 1,
  },
  {
    id: 'reminders',
    label: 'Reminders',
    icon: '🔔',
    component: lazy(() => import('./RemindersWidget')),
    defaultW: 6, defaultH: 3, minW: 1, minH: 1,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: '📦',
    component: lazy(() => import('./InventoryWidget')),
    defaultW: 6, defaultH: 3, minW: 1, minH: 1,
  },
  {
    id: 'mealPlan',
    label: 'Meal Plan',
    icon: '🍽️',
    component: lazy(() => import('./MealPlanWidget')),
    defaultW: 6, defaultH: 3, minW: 2, minH: 2,
  },
];

export function getWidget(id: string): WidgetDef | undefined {
  return registry.find((w) => w.id === id);
}

export function getAllWidgets(): WidgetDef[] {
  return registry;
}

export default registry;

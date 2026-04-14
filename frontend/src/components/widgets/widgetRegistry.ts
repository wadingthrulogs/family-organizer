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
    defaultW: 4, defaultH: 2, minW: 2, minH: 2,
  },
  {
    id: 'weather',
    label: 'Weather',
    icon: '🌤️',
    component: lazy(() => import('./WeatherWidget')),
    defaultW: 4, defaultH: 2, minW: 3, minH: 2,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: '📋',
    component: lazy(() => import('./TasksWidget')),
    defaultW: 4, defaultH: 3, minW: 3, minH: 2,
  },
  {
    id: 'chores',
    label: 'Chores',
    icon: '🧹',
    component: lazy(() => import('./ChoresWidget')),
    defaultW: 6, defaultH: 3, minW: 3, minH: 2,
  },
  {
    id: 'events',
    label: 'Events',
    icon: '📅',
    component: lazy(() => import('./EventsWidget')),
    defaultW: 8, defaultH: 3, minW: 5, minH: 3,
  },
  {
    id: 'overdueChores',
    label: 'Overdue Chores',
    icon: '⚠️',
    component: lazy(() => import('./OverdueChoresWidget')),
    defaultW: 4, defaultH: 2, minW: 3, minH: 2,
  },
  {
    id: 'grocery',
    label: 'Grocery',
    icon: '🛒',
    component: lazy(() => import('./GroceryWidget')),
    defaultW: 6, defaultH: 3, minW: 3, minH: 3,
  },
  {
    id: 'reminders',
    label: 'Reminders',
    icon: '🔔',
    component: lazy(() => import('./RemindersWidget')),
    defaultW: 4, defaultH: 3, minW: 3, minH: 2,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: '📦',
    component: lazy(() => import('./InventoryWidget')),
    defaultW: 6, defaultH: 3, minW: 3, minH: 3,
  },
  {
    id: 'mealPlan',
    label: 'Meal Plan',
    icon: '🍽️',
    component: lazy(() => import('./MealPlanWidget')),
    defaultW: 6, defaultH: 3, minW: 4, minH: 3,
  },
];

export function getWidget(id: string): WidgetDef | undefined {
  return registry.find((w) => w.id === id);
}

export function getAllWidgets(): WidgetDef[] {
  return registry;
}

export default registry;

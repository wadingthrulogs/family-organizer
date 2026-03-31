import { useState, useMemo } from 'react';
import { useMealPlans, useRecipes } from '../hooks/useMealPlans';
import {
  useCreateMealPlanMutation,
  useDeleteMealPlanMutation,
  useCreateEntryMutation,
  useUpdateEntryMutation,
  useDeleteEntryMutation,
  useSendToGroceryMutation,
  useCreateRecipeMutation,
  useUpdateRecipeMutation,
  useDeleteRecipeMutation,
} from '../hooks/useMealPlanMutations';
import { MealPlanGrid } from '../components/mealPlans/MealPlanGrid';
import { AddMealEntryModal } from '../components/mealPlans/AddMealEntryModal';
import { RecipesTab } from '../components/mealPlans/RecipesTab';
import { Modal } from '../components/ui/Modal';
import type { MealPlan, MealPlanEntry, MealType } from '../types/mealPlan';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ApiListResponse } from '../api/client';
import { useInventory } from '../hooks/useInventory';

interface GroceryListItem { id: number; name: string }

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekDatesFrom(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${monday.toLocaleDateString(undefined, opts)} – ${sunday.toLocaleDateString(undefined, opts)}`;
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

type Tab = 'plan' | 'recipes';

export default function MealPlanPage() {
  const [activeTab, setActiveTab] = useState<Tab>('plan');
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()));
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [modalDayOffset, setModalDayOffset] = useState(0);
  const [modalMealType, setModalMealType] = useState<MealType>('DINNER');
  const [editingEntry, setEditingEntry] = useState<MealPlanEntry | null>(null);
  const [showGroceryDropdown, setShowGroceryDropdown] = useState(false);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<MealPlanEntry | null>(null);
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false);

  const { data: plansData, isLoading, isError } = useMealPlans();
  const { data: recipesData } = useRecipes();
  const { data: inventoryData } = useInventory();
  const { data: groceryData } = useQuery({
    queryKey: ['groceryLists'],
    queryFn: async () => {
      const { data } = await api.get<ApiListResponse<GroceryListItem>>('/grocery/lists');
      return data;
    },
    staleTime: 30_000,
  });

  const createPlan = useCreateMealPlanMutation();
  const deletePlan = useDeleteMealPlanMutation();
  const createEntry = useCreateEntryMutation();
  const updateEntry = useUpdateEntryMutation();
  const deleteEntry = useDeleteEntryMutation();
  const sendToGrocery = useSendToGroceryMutation();
  const createRecipe = useCreateRecipeMutation();
  const updateRecipe = useUpdateRecipeMutation();
  const deleteRecipe = useDeleteRecipeMutation();

  const plans: MealPlan[] = plansData?.items ?? [];
  const recipes = recipesData?.items ?? [];
  const inventoryItems = inventoryData?.items ?? [];
  const groceryLists: GroceryListItem[] = groceryData?.items ?? [];

  const currentPlan = useMemo(() => {
    const mondayStr = toISODate(currentMonday);
    return plans.find((p) => toISODate(new Date(p.weekStart)) === mondayStr) ?? null;
  }, [plans, currentMonday]);

  const weekDates = useMemo(() => weekDatesFrom(currentMonday), [currentMonday]);

  const goToPrevWeek = () => setCurrentMonday((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const goToNextWeek = () => setCurrentMonday((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  const goToCurrentWeek = () => setCurrentMonday(getMonday(new Date()));

  const ensurePlanExists = async (): Promise<MealPlan> => {
    if (currentPlan) return currentPlan;
    return await createPlan.mutateAsync({ weekStart: currentMonday.toISOString() });
  };

  const handleAddEntry = (dayOffset: number, mealType: MealType) => {
    setModalDayOffset(dayOffset);
    setModalMealType(mealType);
    setEditingEntry(null);
    setShowEntryModal(true);
  };

  const handleEditEntry = (entry: MealPlanEntry) => {
    setEditingEntry(entry);
    setShowEntryModal(true);
  };

  const handleDeleteEntry = (entry: MealPlanEntry) => {
    setConfirmDeleteEntry(entry);
  };

  const handleConfirmDeleteEntry = async () => {
    if (!confirmDeleteEntry) return;
    await deleteEntry.mutateAsync({ planId: confirmDeleteEntry.mealPlanId, entryId: confirmDeleteEntry.id });
    setConfirmDeleteEntry(null);
  };

  const handleSaveEntry = async (payload: Parameters<typeof createEntry.mutateAsync>[0]['payload']) => {
    if (editingEntry) {
      await updateEntry.mutateAsync({ planId: editingEntry.mealPlanId, entryId: editingEntry.id, payload });
    } else {
      const plan = await ensurePlanExists();
      await createEntry.mutateAsync({ planId: plan.id, payload });
    }
    setShowEntryModal(false);
    setEditingEntry(null);
  };

  const handleSendToGrocery = async (listId: number) => {
    if (!currentPlan) return;
    setShowGroceryDropdown(false);
    try {
      const result = await sendToGrocery.mutateAsync({ planId: currentPlan.id, groceryListId: listId });
      alert(`Added ${result.added} ingredient${result.added !== 1 ? 's' : ''} to grocery list${result.skipped > 0 ? ` (${result.skipped} already on list)` : ''}.`);
    } catch {
      alert('Failed to send to grocery list.');
    }
  };

  const isCurrentWeek = toISODate(currentMonday) === toISODate(getMonday(new Date()));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-card" />
        <div className="h-64 animate-pulse rounded-card bg-card" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-card bg-card p-6 text-center">
        <p className="text-secondary">Unable to load meal plans.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-display font-bold text-heading">Meal Plan</h1>

        {activeTab === 'plan' && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Week navigation */}
            <div className="flex items-center rounded-lg border border-th-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={goToPrevWeek}
                className="px-3 py-2 text-sm text-secondary hover:bg-hover-bg border-r border-th-border"
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={goToCurrentWeek}
                className={`px-3 py-2 text-sm font-medium ${isCurrentWeek ? 'text-btn-primary' : 'text-secondary hover:bg-hover-bg'}`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={goToNextWeek}
                className="px-3 py-2 text-sm text-secondary hover:bg-hover-bg border-l border-th-border"
              >
                Next →
              </button>
            </div>

            {/* Send to Grocery */}
            <div className="relative">
              <button
                type="button"
                disabled={!currentPlan || groceryLists.length === 0}
                title={groceryLists.length === 0 ? 'Create a grocery list first' : undefined}
                onClick={() => setShowGroceryDropdown((v) => !v)}
                className="rounded-lg bg-btn-primary px-3 py-2 text-sm font-medium text-btn-primary-text disabled:opacity-40"
              >
                🛒 Send to Grocery ▾
              </button>
              {groceryLists.length === 0 && (
                <p className="mt-1 text-xs text-muted">
                  <a href="/grocery" className="text-accent hover:underline">Create a grocery list</a> to enable this.
                </p>
              )}
              {showGroceryDropdown && (
                <div className="absolute right-0 top-full mt-1 z-20 rounded-card bg-card border border-th-border shadow-soft min-w-[180px] max-h-48 overflow-y-auto">
                  {groceryLists.map((list) => (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => handleSendToGrocery(list.id)}
                      className="block w-full text-left px-3 py-2 text-sm text-heading hover:bg-hover-bg"
                    >
                      {list.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-th-border">
        {([['plan', '📅 Meal Plan'], ['recipes', `📖 Recipes${recipes.length > 0 ? ` (${recipes.length})` : ''}`]] as [Tab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-btn-primary text-btn-primary'
                : 'border-transparent text-muted hover:text-heading'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Meal Plan */}
      {activeTab === 'plan' && (
        <>
          <p className="text-sm text-muted -mt-2">{formatWeekRange(currentMonday)}</p>

          {!currentPlan ? (
            <div className="rounded-card bg-card border border-th-border p-8 text-center">
              <p className="text-secondary text-sm mb-3">No meal plan for this week yet.</p>
              <button
                type="button"
                onClick={() => createPlan.mutateAsync({ weekStart: currentMonday.toISOString() })}
                disabled={createPlan.isPending}
                className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text disabled:opacity-50"
              >
                {createPlan.isPending ? 'Creating…' : "Start this week's plan"}
              </button>
            </div>
          ) : (
            <div className="rounded-card bg-card border border-th-border p-4">
              <MealPlanGrid
                plan={currentPlan}
                weekDates={weekDates}
                onAddEntry={handleAddEntry}
                onEditEntry={handleEditEntry}
                onDeleteEntry={handleDeleteEntry}
              />
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmDeletePlan(true)}
                  className="text-xs text-red-400 hover:text-red-500"
                >
                  Delete this plan
                </button>
              </div>
            </div>
          )}

          {/* Add/Edit entry modal */}
          {showEntryModal && (
            <AddMealEntryModal
              initialDayOffset={modalDayOffset}
              initialMealType={modalMealType}
              editingEntry={editingEntry}
              recipes={recipes}
              onSave={handleSaveEntry}
              onClose={() => { setShowEntryModal(false); setEditingEntry(null); }}
              isPending={createEntry.isPending || updateEntry.isPending || createPlan.isPending}
            />
          )}

          {/* Close grocery dropdown on outside click */}
          {showGroceryDropdown && (
            <div className="fixed inset-0 z-10" onClick={() => setShowGroceryDropdown(false)} />
          )}
        </>
      )}

      {/* Tab: Recipes */}
      {activeTab === 'recipes' && (
        <RecipesTab
          recipes={recipes}
          inventoryItems={inventoryItems}
          groceryLists={groceryLists}
          onCreateRecipe={async (payload) => { await createRecipe.mutateAsync(payload); }}
          onUpdateRecipe={async (recipeId, payload) => { await updateRecipe.mutateAsync({ recipeId, payload }); }}
          onDeleteRecipe={async (recipeId) => { await deleteRecipe.mutateAsync(recipeId); }}
          isCreating={createRecipe.isPending}
          isUpdating={updateRecipe.isPending}
        />
      )}

      {/* Confirm delete entry modal */}
      <Modal
        open={confirmDeleteEntry !== null}
        onClose={() => setConfirmDeleteEntry(null)}
        title="Remove meal entry"
        maxWidth="max-w-sm"
      >
        <p className="text-sm text-secondary mb-4">
          Remove <strong className="text-heading">"{confirmDeleteEntry?.title}"</strong> from the plan?
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-full border border-th-border px-4 py-2 text-sm text-secondary"
            onClick={() => setConfirmDeleteEntry(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={deleteEntry.isPending}
            onClick={handleConfirmDeleteEntry}
          >
            {deleteEntry.isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </Modal>

      {/* Confirm delete plan modal */}
      <Modal
        open={confirmDeletePlan}
        onClose={() => setConfirmDeletePlan(false)}
        title="Delete meal plan"
        maxWidth="max-w-sm"
      >
        <p className="text-sm text-secondary mb-4">
          Delete this week's meal plan and all its entries? This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-full border border-th-border px-4 py-2 text-sm text-secondary"
            onClick={() => setConfirmDeletePlan(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={deletePlan.isPending}
            onClick={async () => {
              if (!currentPlan) return;
              await deletePlan.mutateAsync(currentPlan.id);
              setConfirmDeletePlan(false);
            }}
          >
            {deletePlan.isPending ? 'Deleting…' : 'Delete plan'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

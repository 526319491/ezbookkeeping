<template>
    <main-page-layout>
        <template #nav-items>
            <budget-sidebar @edit-plan="showPlanDialog = true"
                            @refresh="refreshBudget"
                            @select-accounts="showAccountFilterDialog = true" />
        </template>

        <template #content>
            <v-row class="match-height">
                <v-col cols="12">
                    <v-card>
                        <template #title>
                            <div class="title-and-toolbar d-flex align-center flex-wrap gap-2">
                                <span>{{ tt('Budget Planner') }}</span>
                                <v-btn density="comfortable" color="default" variant="text"
                                       :aria-label="tt('Previous Month')" :icon="true"
                                       @click="changeMonth(-1)">
                                    <v-icon :icon="mdiChevronLeft" size="24" />
                                </v-btn>
                                <span class="text-body-large mx-1">{{ selectedYearMonthDisplay }}</span>
                                <v-btn density="comfortable" color="default" variant="text"
                                       :aria-label="tt('Next Month')" :icon="true"
                                       :disabled="!canGoNextMonth"
                                       @click="changeMonth(1)">
                                    <v-icon :icon="mdiChevronRight" size="24" />
                                </v-btn>
                                <v-btn class="ms-2" color="default" variant="outlined" @click="openPlanSettings">
                                    {{ tt('Edit Budget Plan') }}
                                </v-btn>
                                <v-btn class="ms-2" color="default" variant="outlined" v-if="!isCurrentMonth" @click="goToCurrentMonth">
                                    {{ tt('Current Month') }}
                                </v-btn>
                                <v-spacer />
                                <v-btn density="comfortable" color="default" variant="text"
                                       :aria-label="tt('Refresh')" :icon="true" :loading="loading"
                                       @click="reload(true)">
                                    <template #loader>
                                        <v-progress-circular indeterminate size="20" />
                                    </template>
                                    <v-icon :icon="mdiRefresh" size="24" />
                                    <v-tooltip activator="parent">{{ tt('Refresh') }}</v-tooltip>
                                </v-btn>
                            </div>
                        </template>

                        <v-card-text>
                            <v-alert class="mb-4" type="warning" variant="tonal" v-if="error">
                                {{ tt('Unable to retrieve budget data') }}
                            </v-alert>
                            <v-alert class="mb-4" type="info" variant="tonal" v-if="hasOtherCurrencyData">
                                {{ tt('Some expenses in other currencies are not included in the budget') }}
                            </v-alert>
                            <v-alert class="mb-4" type="info" variant="tonal" v-if="hasOtherCurrencyAccountBalance">
                                {{ tt('Some account balances in other currencies are not included in the budget') }}
                            </v-alert>

                            <v-row>
                                <v-col cols="12" sm="6" md="3">
                                    <div class="budget-summary-item">
                                        <span class="text-body-medium">{{ isAccountBalanceActive ? tt('Living Expense Balance') : tt('Monthly Living Allowance') }}</span>
                                        <div class="text-h6 mt-1">{{ formatAmount(isAccountBalanceActive ? accountBalance : plan.monthlyBudget) }}</div>
                                        <small class="text-medium-emphasis">{{ currency }}</small>
                                    </div>
                                </v-col>
                                <v-col cols="12" sm="6" md="3">
                                    <div class="budget-summary-item">
                                        <span class="text-body-medium">{{ tt('Spent This Month') }}</span>
                                        <div class="text-h6 mt-1 text-expense">{{ formatAmount(summary.monthSpent) }}</div>
                                        <small class="text-medium-emphasis">{{ tt('Remaining') }} {{ formatAmount(summary.monthRemaining) }}</small>
                                    </div>
                                </v-col>
                                <v-col cols="12" sm="6" md="3">
                                    <div class="budget-summary-item">
                                        <span class="text-body-medium">{{ isCurrentMonth ? tt('Today Suggested Spending') : tt('Suggested Daily Spending') }}</span>
                                        <div class="text-h6 mt-1 text-primary">{{ formatAmount(summary.idealToday) }}</div>
                                        <small class="text-medium-emphasis">{{ tt('Fixed Expenses') }} {{ formatAmount(summary.fixedToday) }}</small>
                                    </div>
                                </v-col>
                                <v-col cols="12" sm="6" md="3">
                                    <div class="budget-summary-item">
                                        <span class="text-body-medium">{{ isCurrentMonth ? tt('Today Spent') : tt('Last Day Spent') }}</span>
                                        <div class="text-h6 mt-1" :class="todayStatusClass">{{ formatAmount(summary.actualToday) }}</div>
                                        <small class="text-medium-emphasis">
                                            {{ getDayStatusText(todayStatus) }}
                                            <span v-if="isCurrentMonth"> / {{ formatAmount(summary.remainingToday) }}</span>
                                        </small>
                                    </div>
                                </v-col>
                            </v-row>

                            <v-divider class="my-4" />

                            <div class="d-flex align-center flex-wrap gap-2">
                                <span class="text-body-medium">{{ tt('Flexible Budget Today') }}</span>
                                <span class="text-body-large text-primary">{{ formatAmount(summary.flexibleToday) }}</span>
                                <v-spacer />
                                <span class="text-body-medium">{{ tt('Overspent Days') }}</span>
                                <v-chip size="small" :color="summary.overspentDays > 0 ? 'error' : 'success'" variant="tonal">
                                    {{ formatNumber(summary.overspentDays) }}
                                </v-chip>
                            </div>
                        </v-card-text>
                    </v-card>
                </v-col>

                <v-col cols="12">
                    <v-card>
                        <template #title>
                            <span>{{ tt('Daily Budget Calendar') }}</span>
                        </template>
                        <v-card-text>
                            <div class="budget-calendar">
                                <div class="budget-calendar-header">
                                    <div class="budget-calendar-weekday" :key="weekday.type" v-for="weekday in allWeekdays">
                                        {{ weekday.displayName }}
                                    </div>
                                </div>
                                <div class="budget-calendar-week" :key="weekIndex" v-for="(week, weekIndex) in calendarWeeks">
                                    <div class="budget-calendar-day-cell" :key="day?.date ?? 'empty-' + weekIndex + '-' + dayIndex"
                                         v-for="(day, dayIndex) in week">
                                        <div class="budget-calendar-day"
                                             :class="day ? ['budget-day-' + day.status, { 'budget-day-today': isToday(day.date), 'budget-day-empty': !day.hasActualData && day.status !== dayStatusFuture }] : 'budget-day-placeholder'"
                                             v-if="day"
                                             @click="openDayDialog(day)">
                                            <span class="budget-calendar-day-number">{{ formatNumber(day.day) }}</span>
                                            <span class="budget-calendar-day-amount" v-if="day.hasActualData">{{ formatAmount(day.actualAmount, false) }}</span>
                                            <span class="budget-calendar-day-limit">{{ tt('Daily Budget') }} {{ formatAmount(day.idealTotalAmount, false) }}</span>
                                            <span class="budget-calendar-day-status">{{ getDayStatusText(day.status) }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>

            <v-dialog v-model="showPlanDialog" width="960">
                <v-card>
                    <template #title>
                        <span>{{ tt('Budget Plan Settings') }}</span>
                    </template>
                    <v-card-text>
                        <div class="d-flex align-center flex-wrap gap-3">
                            <div class="text-body-medium">{{ tt('Monthly Living Allowance') }}</div>
                            <v-switch class="ms-2" density="compact" hide-details
                                      :label="tt('Use Account Balance as Living Allowance')"
                                      :model-value="plan.useAccountBalance"
                                      @update:model-value="onUseAccountBalanceChanged" />
                        </div>
                        <div class="d-flex align-center flex-wrap gap-2 mt-2" v-if="plan.useAccountBalance">
                            <span class="text-body-large text-primary">{{ formatAmount(accountBalance) }}</span>
                            <span class="text-body-medium text-medium-emphasis">{{ tt('Living Expense Balance') }}</span>
                        </div>
                        <div class="text-caption text-medium-emphasis mt-1" v-if="plan.useAccountBalance && !isAccountBalanceActive">
                            {{ tt('Account Balance Only Applies to Current Month') }}
                        </div>
                        <div class="d-flex align-center flex-wrap gap-2 mt-2" v-if="!plan.useAccountBalance">
                            <amount-input class="budget-amount-input" density="compact" :currency="currency"
                                          v-model="budgetInput" />
                            <v-btn color="primary" variant="tonal" @click="applyBudget">{{ tt('Apply') }}</v-btn>
                            <span class="text-body-medium text-medium-emphasis">{{ currency }}</span>
                        </div>

                        <v-divider class="my-5" />

                        <div class="d-flex align-center flex-wrap gap-2 mb-3">
                            <span class="text-body-large">{{ tt('Fixed Daily Expenses') }}</span>
                            <v-spacer />
                            <span class="text-body-medium text-medium-emphasis">{{ tt('Total Fixed Expenses Today') }} {{ formatAmount(summary.fixedToday) }}</span>
                        </div>

                        <div class="budget-fixed-expense-list">
                            <div class="budget-fixed-expense-row" :key="expense.id" v-for="expense in plan.fixedExpenses">
                                <v-text-field class="budget-fixed-expense-name" density="compact" :label="tt('Name')"
                                              :model-value="expense.name"
                                              @update:model-value="updateFixedExpenseName(expense, $event)" />
                                <amount-input class="budget-fixed-expense-amount" density="compact" :currency="currency"
                                              :model-value="toInputNumber(expense.amount)"
                                              @update:model-value="updateFixedExpenseAmount(expense, $event)" />
                                <v-select class="budget-fixed-expense-weekdays" density="compact" multiple chips
                                          :label="tt('Applies On')"
                                          item-title="displayName" item-value="type"
                                          :items="allWeekdays"
                                          :model-value="expense.weekdays"
                                          @update:model-value="updateFixedExpenseWeekdays(expense, $event)" />
                                <v-switch class="budget-fixed-expense-enabled" density="compact" hide-details
                                          :model-value="expense.enabled"
                                          @update:model-value="toggleFixedExpenseEnabled(expense)" />
                                <v-btn density="comfortable" color="error" variant="text"
                                       :aria-label="tt('Delete')" :icon="true"
                                       @click="removeFixedExpense(expense.id)">
                                    <v-icon :icon="mdiDeleteOutline" size="22" />
                                </v-btn>
                            </div>
                        </div>

                        <div class="budget-fixed-expense-row budget-fixed-expense-add-row">
                            <v-text-field class="budget-fixed-expense-name" density="compact" :label="tt('Name')"
                                          v-model="newFixedExpenseName" />
                            <amount-input class="budget-fixed-expense-amount" density="compact" :currency="currency"
                                          v-model="newFixedExpenseAmount" />
                            <v-btn color="primary" variant="tonal" @click="addNewFixedExpense">{{ tt('Add') }}</v-btn>
                        </div>

                        <v-divider class="my-5" />

                        <div class="text-body-large mb-3">{{ tt('Statistics Scope') }}</div>
                        <v-row>
                            <v-col cols="12" md="6">
                                <v-text-field class="always-cursor-pointer" density="compact" readonly
                                              :label="tt('Accounts Included in Budget')"
                                              :model-value="includedAccountsDisplay"
                                              @click="showAccountFilterDialog = true" />
                            </v-col>
                            <v-col cols="12" md="6">
                                <v-text-field class="always-cursor-pointer" density="compact" readonly
                                              :label="tt('Transaction Categories Included in Budget')"
                                              :model-value="includedCategoriesDisplay"
                                              @click="showCategoryFilterDialog = true" />
                            </v-col>
                        </v-row>

                        <v-switch class="mt-2" density="compact" hide-details
                                  :label="tt('Use Transaction Timezone')"
                                  :model-value="plan.useTransactionTimezone"
                                  @update:model-value="onUseTransactionTimezoneChanged" />
                    </v-card-text>
                    <v-card-actions>
                        <v-spacer />
                        <v-btn variant="text" @click="showPlanDialog = false">{{ tt('Close') }}</v-btn>
                    </v-card-actions>
                </v-card>
            </v-dialog>

            <v-dialog v-model="showDayDialog" width="440">
                <v-card v-if="selectedDay">
                    <template #title>
                        <span>{{ selectedDay.date }}</span>
                    </template>
                    <v-card-text>
                        <div class="d-flex flex-wrap gap-3">
                            <div>
                                <span class="text-body-medium">{{ tt('Daily Budget') }}</span>
                                <div class="text-body-large text-primary">{{ formatAmount(selectedDay.idealTotalAmount) }}</div>
                            </div>
                            <div>
                                <span class="text-body-medium">{{ tt('Suggested Daily Spending') }}</span>
                                <div class="text-body-large text-primary">{{ formatAmount(selectedDay.suggestedAmount) }}</div>
                            </div>
                            <div>
                                <span class="text-body-medium">{{ tt('Spent') }}</span>
                                <div class="text-body-large">{{ formatAmount(selectedDay.actualAmount) }}</div>
                            </div>
                            <div>
                                <span class="text-body-medium">{{ tt('Status') }}</span>
                                <div class="text-body-large">{{ getDayStatusText(selectedDay.status) }}</div>
                            </div>
                        </div>

                        <div class="text-body-medium mt-5">{{ tt('Manual Actual Spending') }}</div>
                        <amount-input class="mt-2" density="compact" :currency="currency" v-model="manualActualInput" />
                        <div class="d-flex align-center mt-3">
                            <v-btn color="primary" variant="tonal" @click="saveManualActual">{{ tt('Save') }}</v-btn>
                            <v-btn class="ms-2" color="default" variant="text" v-if="getManualActual(selectedDay.date) !== null"
                                   @click="clearManualActualForSelectedDay">{{ tt('Clear Override') }}</v-btn>
                        </div>
                    </v-card-text>
                    <v-card-actions>
                        <v-spacer />
                        <v-btn variant="text" @click="showDayDialog = false">{{ tt('Close') }}</v-btn>
                    </v-card-actions>
                </v-card>
            </v-dialog>

            <account-filter-settings-dialog type="budgetPlanner"
                                            :show="showAccountFilterDialog"
                                            @update:show="showAccountFilterDialog = $event"
                                            @settings:change="onAccountFilterChanged" />
            <category-filter-settings-dialog type="budgetPlanner"
                                             category-types="2"
                                             :show="showCategoryFilterDialog"
                                             @update:show="showCategoryFilterDialog = $event"
                                             @settings:change="onCategoryFilterChanged" />
        </template>
    </main-page-layout>
</template>

<script setup lang="ts">
import BudgetSidebar from '@/views/desktop/budget/BudgetSidebar.vue';
import AccountFilterSettingsDialog from '@/views/desktop/common/dialogs/AccountFilterSettingsDialog.vue';
import CategoryFilterSettingsDialog from '@/views/desktop/common/dialogs/CategoryFilterSettingsDialog.vue';

import { computed, ref, watch } from 'vue';

import { useI18n } from '@/locales/helpers.ts';
import { useBudgetPlannerPageBase } from '@/views/base/budget/BudgetPlannerPageBase.ts';

import { BudgetDayStatus, type BudgetDaySummary, type BudgetFixedExpense } from '@/core/budget.ts';
import type { WeekDayValue } from '@/core/datetime.ts';

import { parseBudgetAmount } from '@/lib/budget.ts';
import { isUserLogined, isUserUnlocked } from '@/lib/userstate.ts';

import {
    mdiChevronLeft,
    mdiChevronRight,
    mdiDeleteOutline,
    mdiRefresh,
} from '@mdi/js';

const { tt } = useI18n();

const {
    selectedYearMonthDisplay,
    plan,
    summary,
    days,
    today,
    isCurrentMonth,
    canGoNextMonth,
    currency,
    loading,
    error,
    hasOtherCurrencyData,
    hasOtherCurrencyAccountBalance,
    accountBalance,
    isAccountBalanceActive,
    allWeekdays,
    includedAccountIds,
    includedCategoryIds,
    reload,
    changeMonth,
    goToCurrentMonth,
    setMonthlyBudget,
    setUseAccountBalance,
    setUseTransactionTimezone,
    addFixedExpense,
    updateFixedExpense,
    removeFixedExpense,
    toggleFixedExpenseEnabled,
    setManualActual,
    clearManualActual,
    getManualActual,
    formatAmount,
    formatNumber,
    getDayStatusText,
    isToday,
} = useBudgetPlannerPageBase();

const dayStatusFuture = BudgetDayStatus.Future;

const showPlanDialog = ref<boolean>(false);
const showDayDialog = ref<boolean>(false);
const showAccountFilterDialog = ref<boolean>(false);
const showCategoryFilterDialog = ref<boolean>(false);
const selectedDay = ref<BudgetDaySummary | null>(null);
const budgetInput = ref<number>(0);
const manualActualInput = ref<number>(0);
const newFixedExpenseName = ref<string>('');
const newFixedExpenseAmount = ref<number>(0);

const firstDayOfWeek = computed<WeekDayValue>(() => (allWeekdays.value[0]?.type ?? 0) as WeekDayValue);

const calendarWeeks = computed<(BudgetDaySummary | null)[][]>(() => {
    const weeks: (BudgetDaySummary | null)[][] = [];
    let currentWeek: (BudgetDaySummary | null)[] = [];
    const firstDay = days.value[0];

    if (!firstDay) {
        return weeks;
    }

    const offset = (firstDay.weekday - firstDayOfWeek.value + 7) % 7;

    for (let i = 0; i < offset; i++) {
        currentWeek.push(null);
    }

    for (const day of days.value) {
        currentWeek.push(day);

        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    }

    while (currentWeek.length > 0 && currentWeek.length < 7) {
        currentWeek.push(null);
    }

    if (currentWeek.length > 0) {
        weeks.push(currentWeek);
    }

    return weeks;
});

const todayStatus = computed<BudgetDayStatus>(() => {
    const focusDay = isCurrentMonth.value ? days.value.find(day => day.date === today.value) : days.value[days.value.length - 1];
    return focusDay ? focusDay.status : BudgetDayStatus.NoData;
});

const todayStatusClass = computed<string>(() => {
    if (todayStatus.value === BudgetDayStatus.Overspent) {
        return 'text-expense';
    } else if (todayStatus.value === BudgetDayStatus.NearLimit) {
        return 'text-warning';
    } else {
        return 'text-success';
    }
});

const includedAccountsDisplay = computed<string>(() => {
    if (includedAccountIds.value.length < 1) {
        return tt('All Accounts');
    } else if (includedAccountIds.value.length === 1 && includedAccountIds.value[0] === '0') {
        return tt('None');
    } else {
        return `${formatNumber(includedAccountIds.value.length)} ${tt('Accounts')}`;
    }
});

const includedCategoriesDisplay = computed<string>(() => {
    if (includedCategoryIds.value.length < 1) {
        return tt('All Categories');
    } else if (includedCategoryIds.value.length === 1 && includedCategoryIds.value[0] === '0') {
        return tt('None');
    } else {
        return `${formatNumber(includedCategoryIds.value.length)} ${tt('Categories')}`;
    }
});

function toInputNumber(value: string): number {
    return parseBudgetAmount(value).toDoubleNumber();
}

function openPlanSettings(): void {
    budgetInput.value = parseBudgetAmount(plan.value.monthlyBudget).toDoubleNumber();
    showPlanDialog.value = true;
}

function applyBudget(): void {
    setMonthlyBudget(budgetInput.value);
}

function addNewFixedExpense(): void {
    if (!newFixedExpenseName.value.trim()) {
        return;
    }

    addFixedExpense(newFixedExpenseName.value.trim(), newFixedExpenseAmount.value);
    newFixedExpenseName.value = '';
    newFixedExpenseAmount.value = 0;
}

function updateFixedExpenseName(expense: BudgetFixedExpense, name: string): void {
    updateFixedExpense({ ...expense, name: name });
}

function updateFixedExpenseAmount(expense: BudgetFixedExpense, amount: number): void {
    updateFixedExpense({ ...expense, amount: amount.toString() });
}

function updateFixedExpenseWeekdays(expense: BudgetFixedExpense, weekdays: WeekDayValue[]): void {
    updateFixedExpense({ ...expense, weekdays: weekdays });
}

function openDayDialog(day: BudgetDaySummary): void {
    selectedDay.value = day;
    manualActualInput.value = day.hasActualData ? parseBudgetAmount(day.actualAmount).toDoubleNumber() : 0;
    showDayDialog.value = true;
}

function saveManualActual(): void {
    if (!selectedDay.value) {
        return;
    }

    setManualActual(selectedDay.value.date, manualActualInput.value);
    showDayDialog.value = false;
}

function clearManualActualForSelectedDay(): void {
    if (!selectedDay.value) {
        return;
    }

    clearManualActual(selectedDay.value.date);
    showDayDialog.value = false;
}

function onUseTransactionTimezoneChanged(value: boolean | null): void {
    setUseTransactionTimezone(!!value);
}

function onUseAccountBalanceChanged(value: boolean | null): void {
    setUseAccountBalance(!!value);
}

function refreshBudget(): void {
    reload(true).catch(() => undefined);
}

function onAccountFilterChanged(changed: boolean): void {
    showAccountFilterDialog.value = false;

    if (changed) {
        reload(true).catch(() => undefined);
    }
}

function onCategoryFilterChanged(changed: boolean): void {
    showCategoryFilterDialog.value = false;

    if (changed) {
        reload(true).catch(() => undefined);
    }
}

watch(() => plan.value.monthlyBudget, value => {
    if (!showPlanDialog.value) {
        budgetInput.value = parseBudgetAmount(value).toDoubleNumber();
    }
});

if (isUserLogined() && isUserUnlocked()) {
    reload().catch(() => undefined);
}
</script>

<style scoped>
.budget-summary-item {
    padding: 4px 0;
}

.budget-calendar {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.budget-calendar-header,
.budget-calendar-week {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
}

.budget-calendar-weekday {
    padding: 4px 8px;
    color: rgba(var(--v-theme-on-surface), 0.6);
    font-size: 0.75rem;
    text-align: center;
}

.budget-calendar-day-cell {
    min-height: 100px;
}

.budget-calendar-day {
    display: flex;
    flex-direction: column;
    min-height: 100px;
    padding: 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;
}

.budget-calendar-day:hover {
    border-color: rgb(var(--v-theme-primary));
}

.budget-calendar-day-number {
    font-size: 0.875rem;
    font-weight: 600;
}

.budget-calendar-day-amount {
    margin-top: 4px;
    font-size: 0.875rem;
    font-weight: 600;
}

.budget-calendar-day-limit,
.budget-calendar-day-status {
    margin-top: 2px;
    color: rgba(var(--v-theme-on-surface), 0.6);
    font-size: 0.7rem;
}

.budget-calendar-day.budget-day-today {
    box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
}

.budget-calendar-day.budget-day-overspent {
    background: rgba(var(--v-theme-error), 0.08);
    border-color: rgba(var(--v-theme-error), 0.4);
}

.budget-calendar-day.budget-day-near_limit {
    background: rgba(var(--v-theme-warning), 0.08);
    border-color: rgba(var(--v-theme-warning), 0.4);
}

.budget-calendar-day.budget-day-under {
    background: rgba(var(--v-theme-success), 0.08);
    border-color: rgba(var(--v-theme-success), 0.3);
}

.budget-calendar-day.budget-day-no_data,
.budget-calendar-day.budget-day-future {
    background: rgba(var(--v-theme-on-surface), 0.025);
}

.budget-calendar-day.budget-day-empty {
    opacity: 0.7;
}

.budget-calendar-day-placeholder {
    min-height: 100px;
}

.budget-fixed-expense-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.budget-fixed-expense-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
}

.budget-fixed-expense-name {
    min-width: 160px;
    flex: 1 1 180px;
}

.budget-fixed-expense-amount {
    min-width: 150px;
    flex: 0 1 180px;
}

.budget-fixed-expense-weekdays {
    min-width: 220px;
    flex: 1 1 260px;
}

.budget-fixed-expense-enabled {
    flex: 0 0 auto;
}

.budget-fixed-expense-add-row {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.budget-amount-input {
    max-width: 240px;
}
</style>

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
                                             :class="day ? ['budget-day-' + day.status, { 'budget-day-today': isToday(day.date), 'budget-day-empty': !day.hasActualData && day.fixedExpenses.length < 1 && day.status !== dayStatusFuture }] : 'budget-day-placeholder'"
                                             v-if="day"
                                             @click="openDayDialog(day)">
                                            <span class="budget-calendar-day-badge">{{ formatNumber(day.day) }}</span>
                                            <div class="budget-calendar-day-remaining" :class="getDayRemainingClass(day)">
                                                {{ formatAmount(day.remainingAmount) }}
                                            </div>
                                            <small class="budget-calendar-day-remaining-label">{{ tt('Remaining') }}</small>
                                            <div class="budget-calendar-day-meta">
                                                <span>{{ tt('Used') }} {{ formatAmount(day.usedAmount, false) }} / {{ formatAmount(day.dailyBudgetAmount, false) }}</span>
                                                <b>{{ formatPercent(day.usagePercent) }}</b>
                                            </div>
                                            <v-progress-linear class="budget-calendar-day-progress" rounded height="5"
                                                               :model-value="Math.min(100, day.usagePercent)"
                                                               :color="getDayProgressColor(day)" />
                                            <div class="budget-calendar-day-fixed" :class="{ 'budget-fixed-excluded': !plan.includeFixedExpensesInRemaining || day.includedFixedAmount === '0' }" v-if="day.fixedAmount !== '0' && day.date >= today">
                                                <span>{{ tt('Fixed Expenses') }} {{ formatAmount(day.fixedAmount, false) }}</span>
                                            </div>
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

            <v-dialog v-model="showDayDialog" width="820">
                <v-card v-if="selectedDay">
                    <template #title>
                        <span>{{ selectedDay.date }}</span>
                    </template>
                    <v-card-text>
                        <div class="d-flex flex-wrap gap-4">
                            <div>
                                <span class="text-body-medium">{{ tt('Daily Budget') }}</span>
                                <div class="text-body-large text-primary">{{ formatAmount(selectedDay.dailyBudgetAmount) }}</div>
                            </div>
                            <div>
                                <span class="text-body-medium">{{ tt('Remaining') }}</span>
                                <div class="text-body-large" :class="getDayRemainingClass(selectedDay)">{{ formatAmount(selectedDay.remainingAmount) }}</div>
                            </div>
                            <div>
                                <span class="text-body-medium">{{ tt('Spent') }}</span>
                                <div class="text-body-large">{{ formatAmount(selectedDay.actualAmount) }}</div>
                            </div>
                        </div>

                        <div class="mt-5" v-if="selectedDay.fixedExpenses.length > 0 && selectedDay.date >= today">
                            <div class="text-body-large mb-2">{{ tt('Fixed Expenses') }}</div>
                            <div class="budget-day-fixed-expense-row" :key="fixedExpense.id" v-for="fixedExpense in dayFixedExpenses">
                                <span class="budget-day-fixed-expense-name text-truncate">{{ fixedExpense.name }}</span>
                                <amount-input class="budget-day-fixed-expense-amount" density="compact" :currency="currency"
                                              :model-value="toInputNumber(fixedExpense.amount)"
                                              @update:model-value="setDayFixedExpenseAmount(selectedDay.date, fixedExpense.id, $event)" />
                                <v-btn density="comfortable" color="default" variant="text"
                                       :aria-label="tt('Reset')" :icon="true"
                                       @click="clearDayFixedExpense(selectedDay.date, fixedExpense.id)">
                                    <v-icon :icon="mdiRestore" size="20" />
                                    <v-tooltip activator="parent">{{ tt('Reset') }}</v-tooltip>
                                </v-btn>
                            </div>
                        </div>

                        <div class="mt-5">
                            <div class="text-body-large mb-2">{{ tt('Transaction Details') }}</div>
                            <div class="d-flex justify-center py-4" v-if="dayTransactionsLoading">
                                <v-progress-circular indeterminate size="24" />
                            </div>
                            <div class="text-body-medium text-medium-emphasis" v-else-if="dayTransactionsError">
                                {{ tt('Unable to retrieve budget data') }}
                            </div>
                            <div class="text-body-medium text-medium-emphasis" v-else-if="dayTransactions.length < 1">
                                {{ tt('No transaction data') }}
                            </div>
                            <div class="budget-day-transaction-table-wrapper" v-else>
                                <v-table class="budget-day-transaction-table" density="compact">
                                    <thead>
                                        <tr>
                                            <th>{{ tt('Time') }}</th>
                                            <th>{{ tt('Category') }}</th>
                                            <th>{{ tt('Account') }}</th>
                                            <th class="text-end">{{ tt('Amount') }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr :key="transaction.id" v-for="transaction in dayTransactions">
                                            <td class="text-no-wrap">{{ formatTransactionTime(transaction) }}</td>
                                            <td>
                                                <div class="d-flex align-center">
                                                    <item-icon v-if="transaction.categoryColor"
                                                               :icon-type="getCategoryIconType(transaction.categoryIconType)"
                                                               :icon-id="transaction.categoryIcon"
                                                               :color="transaction.categoryColor"
                                                               size="20px" />
                                                    <div class="d-flex flex-column ms-1">
                                                        <span>{{ transaction.categoryName || tt('None') }}</span>
                                                        <small class="text-medium-emphasis" v-if="transaction.comment">{{ transaction.comment }}</small>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>{{ transaction.accountName }}</td>
                                            <td class="text-end text-no-wrap text-expense">{{ formatAmount(transaction.amount) }}</td>
                                        </tr>
                                    </tbody>
                                </v-table>
                            </div>
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

import { computed, ref } from 'vue';

import { useI18n } from '@/locales/helpers.ts';
import { useBudgetPlannerPageBase } from '@/views/base/budget/BudgetPlannerPageBase.ts';

import { BudgetDayStatus, type BudgetDaySummary, type BudgetFixedExpense, type BudgetFixedExpenseDaySummary } from '@/core/budget.ts';
import type { WeekDayValue } from '@/core/datetime.ts';

import { parseBudgetAmount } from '@/lib/budget.ts';
import { getCategoryIconType } from '@/lib/icon.ts';
import { isUserLogined, isUserUnlocked } from '@/lib/userstate.ts';

import {
    mdiChevronLeft,
    mdiChevronRight,
    mdiDeleteOutline,
    mdiRefresh,
    mdiRestore,
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
    dayTransactions,
    dayTransactionsLoading,
    dayTransactionsError,
    reload,
    loadDayTransactions,
    changeMonth,
    goToCurrentMonth,
    setUseTransactionTimezone,
    addFixedExpense,
    updateFixedExpense,
    removeFixedExpense,
    toggleFixedExpenseEnabled,
    setFixedExpenseDayAmount,
    clearFixedExpenseDayState,
    formatAmount,
    formatNumber,
    formatPercent,
    formatTransactionTime,
    getDayStatusText,
    isToday,
} = useBudgetPlannerPageBase();

const dayStatusFuture = BudgetDayStatus.Future;

const showPlanDialog = ref<boolean>(false);
const showDayDialog = ref<boolean>(false);
const showAccountFilterDialog = ref<boolean>(false);
const showCategoryFilterDialog = ref<boolean>(false);
const selectedDayDate = ref<string | null>(null);
const selectedDay = computed<BudgetDaySummary | null>(() => {
    if (!selectedDayDate.value) {
        return null;
    }

    return days.value.find(day => day.date === selectedDayDate.value) ?? null;
});
const dayFixedExpenses = ref<BudgetFixedExpenseDaySummary[]>([]);
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
    showPlanDialog.value = true;
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
    selectedDayDate.value = day.date;
    dayFixedExpenses.value = day.fixedExpenses.map(fixedExpense => ({ ...fixedExpense }));
    loadDayTransactions(day.date);
    showDayDialog.value = true;
}

function getDayProgressColor(day: BudgetDaySummary): string {
    if (day.status === BudgetDayStatus.Future || day.status === BudgetDayStatus.NoData) {
        return 'secondary';
    } else if (day.status === BudgetDayStatus.Overspent) {
        return 'error';
    } else if (day.status === BudgetDayStatus.NearLimit) {
        return 'warning';
    } else {
        return 'success';
    }
}

function getDayRemainingClass(day: BudgetDaySummary): string {
    const remainingAmount = parseBudgetAmount(day.remainingAmount);
    const dailyBudgetAmount = parseBudgetAmount(day.dailyBudgetAmount);

    if (remainingAmount.isNegative()) {
        return 'budget-amount-overspent';
    } else if (day.status === BudgetDayStatus.Future) {
        return 'budget-amount-future';
    } else if (dailyBudgetAmount.greaterThan(0) && remainingAmount.lessThanOrEqual(dailyBudgetAmount.multiply(0.1))) {
        return 'budget-amount-near_limit';
    } else {
        return 'budget-amount-under';
    }
}

function setDayFixedExpenseAmount(date: string, expenseId: string, amount: number): void {
    dayFixedExpenses.value = dayFixedExpenses.value.map(fixedExpense => fixedExpense.id === expenseId
        ? { ...fixedExpense, amount: amount.toString() }
        : fixedExpense);
    setFixedExpenseDayAmount(date, expenseId, amount);
}

function clearDayFixedExpense(date: string, expenseId: string): void {
    const defaultExpense = plan.value.fixedExpenses.find(fixedExpense => fixedExpense.id === expenseId);
    dayFixedExpenses.value = dayFixedExpenses.value.map(fixedExpense => fixedExpense.id === expenseId
        ? { ...fixedExpense, amount: defaultExpense?.amount ?? '0' }
        : fixedExpense);
    clearFixedExpenseDayState(date, expenseId);
}

function onUseTransactionTimezoneChanged(value: boolean | null): void {
    setUseTransactionTimezone(!!value);
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
    min-height: 132px;
}

.budget-calendar-day {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 132px;
    padding: 10px 8px 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;
}

.budget-calendar-day:hover {
    border-color: rgb(var(--v-theme-primary));
}

.budget-calendar-day-badge {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 4px;
    border-radius: 10px;
    background: rgba(var(--v-theme-primary), 0.12);
    color: rgb(var(--v-theme-primary));
    font-size: 0.7rem;
    font-weight: 700;
    inset-block-start: 6px;
    inset-inline-end: 6px;
}

.budget-calendar-day-remaining {
    padding-inline-end: 24px;
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.2;
}

.budget-calendar-day-remaining-label {
    color: rgba(var(--v-theme-on-surface), 0.55);
    font-size: 0.65rem;
}

.budget-calendar-day-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    margin-top: 6px;
    color: rgba(var(--v-theme-on-surface), 0.64);
    font-size: 0.68rem;
}

.budget-calendar-day-meta b {
    font-weight: 700;
}

.budget-calendar-day-progress {
    margin-top: 4px;
}

.budget-calendar-day-fixed {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    margin-top: 4px;
    color: rgba(var(--v-theme-on-surface), 0.6);
    font-size: 0.65rem;
}

.budget-calendar-day-fixed.budget-fixed-excluded {
    text-decoration: line-through;
    opacity: 0.7;
}

.budget-amount-overspent {
    color: rgb(var(--v-theme-error));
}

.budget-amount-near_limit {
    color: rgb(var(--v-theme-warning));
}

.budget-amount-under {
    color: rgb(var(--v-theme-success));
}

.budget-amount-no_data,
.budget-amount-future {
    color: rgba(var(--v-theme-on-surface), 0.6);
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
    min-height: 132px;
}

.budget-day-fixed-expense-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.budget-day-fixed-expense-name {
    min-width: 0;
    flex: 1 1 160px;
}

.budget-day-fixed-expense-amount {
    flex: 0 1 180px;
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

.budget-day-transaction-table-wrapper {
    max-height: 320px;
    overflow-y: auto;
}

.budget-day-transaction-table {
    font-size: 0.8125rem;
}
</style>

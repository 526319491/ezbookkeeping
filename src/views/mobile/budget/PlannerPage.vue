<template>
    <f7-page @page:afterin="onPageAfterIn">
        <f7-navbar>
            <f7-nav-left :back-link="tt('Back')"></f7-nav-left>
            <f7-nav-title :title="tt('Budget Planner')"></f7-nav-title>
            <f7-nav-right>
                <f7-link icon-f7="ellipsis" :aria-label="tt('More')" @click="openPlanSheet"></f7-link>
            </f7-nav-right>
        </f7-navbar>

        <f7-block class="budget-month-nav margin-top">
            <f7-link icon-f7="chevron_left" :aria-label="tt('Previous Month')" @click="changeMonth(-1)"></f7-link>
            <b>{{ selectedYearMonthDisplay }}</b>
            <f7-link icon-f7="chevron_right" :aria-label="tt('Next Month')" :class="{ 'disabled': !canGoNextMonth }"
                     @click="changeMonth(1)"></f7-link>
            <f7-link class="budget-current-month-link" :text="tt('Current Month')" v-if="!isCurrentMonth"
                     @click="goToCurrentMonth"></f7-link>
        </f7-block>

        <f7-block class="no-margin-top" v-if="error">
            <f7-card>
                <f7-card-content class="text-color-red">{{ tt('Unable to retrieve budget data') }}</f7-card-content>
            </f7-card>
        </f7-block>

        <f7-block class="no-margin-top" v-if="hasOtherCurrencyData || hasOtherCurrencyAccountBalance">
            <f7-card>
                <f7-card-content>
                    <div v-if="hasOtherCurrencyData">{{ tt('Some expenses in other currencies are not included in the budget') }}</div>
                    <div v-if="hasOtherCurrencyAccountBalance">{{ tt('Some account balances in other currencies are not included in the budget') }}</div>
                </f7-card-content>
            </f7-card>
        </f7-block>

        <f7-block class="no-margin-top">
            <f7-card class="budget-summary-card">
                <f7-card-content>
                    <div class="budget-summary-grid">
                        <div class="budget-summary-item">
                            <small>{{ isAccountBalanceActive ? tt('Living Expense Balance') : tt('Monthly Living Allowance') }}</small>
                            <b>{{ formatAmount(isAccountBalanceActive ? accountBalance : plan.monthlyBudget) }}</b>
                        </div>
                        <div class="budget-summary-item">
                            <small>{{ tt('Spent This Month') }}</small>
                            <b class="text-expense">{{ formatAmount(summary.monthSpent) }}</b>
                        </div>
                        <div class="budget-summary-item">
                            <small>{{ isCurrentMonth ? tt('Today Suggested Spending') : tt('Suggested Daily Spending') }}</small>
                            <b class="text-primary">{{ formatAmount(summary.idealToday) }}</b>
                        </div>
                        <div class="budget-summary-item">
                            <small>{{ isCurrentMonth ? tt('Today Spent') : tt('Last Day Spent') }}</small>
                            <b :class="todayStatusClass">{{ formatAmount(summary.actualToday) }}</b>
                        </div>
                    </div>
                    <div class="budget-summary-status margin-top">
                        <span>{{ tt('Flexible Budget Today') }} <b>{{ formatAmount(summary.flexibleToday) }}</b></span>
                        <span class="budget-status-chip" :class="'budget-status-' + todayStatus">{{ getDayStatusText(todayStatus) }}</span>
                    </div>
                </f7-card-content>
            </f7-card>
        </f7-block>

        <f7-block-title>{{ tt('Daily Budget') }}</f7-block-title>
        <f7-list strong inset dividers media-list>
            <f7-list-item :key="day.date" v-for="day in days"
                          :class="['budget-mobile-day', { 'budget-day-today': isToday(day.date) }]"
                          @click="openDayDialog(day)">
                <template #title>
                    <div class="budget-mobile-day-title">
                        <span class="budget-mobile-day-badge">{{ formatNumber(day.day) }}</span>
                        <span>{{ day.date }}</span>
                    </div>
                </template>
                <template #after>
                    <b :class="getDayRemainingClass(day)">{{ formatAmount(day.remainingAmount) }}</b>
                </template>
                <template #subtitle>
                    <div class="budget-mobile-day-meta">
                        <span>{{ tt('Used') }} {{ formatAmount(day.usedAmount, false) }} / {{ formatAmount(day.dailyBudgetAmount, false) }}</span>
                        <b>{{ formatPercent(day.usagePercent) }}</b>
                    </div>
                    <f7-progressbar class="budget-mobile-day-progress" :progress="Math.min(100, day.usagePercent)"
                                    :class="'budget-progress-' + day.status"></f7-progressbar>
                    <div class="budget-mobile-day-fixed" :class="{ 'budget-fixed-excluded': !plan.includeFixedExpensesInRemaining || day.includedFixedAmount === '0' }" v-if="day.fixedAmount !== '0' && day.date >= today">
                        <span>{{ tt('Fixed Expenses') }} {{ formatAmount(day.fixedAmount, false) }}</span>
                    </div>
                </template>
            </f7-list-item>
        </f7-list>

        <f7-sheet swipe-to-close swipe-handler=".swipe-handler" style="height:auto"
                  :opened="showPlanSheet" @sheet:closed="showPlanSheet = false">
            <div class="swipe-handler"></div>
            <f7-page-content class="margin-top no-padding-top">
                <div class="display-flex padding justify-content-space-between align-items-center">
                    <div class="ebk-sheet-title"><b>{{ tt('Budget Plan Settings') }}</b></div>
                </div>
                <div class="padding-horizontal padding-bottom">
                    <f7-list strong inset dividers class="no-margin margin-bottom">
                        <f7-list-item>
                            <template #after-title>{{ tt('Use Transaction Timezone') }}</template>
                            <template #after>
                                <f7-toggle :checked="plan.useTransactionTimezone" @toggle:change="setUseTransactionTimezone"></f7-toggle>
                            </template>
                        </f7-list-item>
                        <f7-list-item link="/settings/filter/account?type=budgetPlanner"
                                      :title="tt('Accounts Included in Budget')"
                                      :after="includedAccountsDisplay"></f7-list-item>
                        <f7-list-item link="/settings/filter/category?type=budgetPlanner&allowCategoryTypes=2"
                                      :title="tt('Transaction Categories Included in Budget')"
                                      :after="includedCategoriesDisplay"></f7-list-item>
                    </f7-list>

                    <f7-block-title class="budget-fixed-expenses-title">{{ tt('Fixed Daily Expenses') }}</f7-block-title>
                    <f7-list strong inset dividers class="no-margin">
                        <f7-list-item>
                            <template #after-title>{{ tt('Include in Remaining') }}</template>
                            <template #after>
                                <f7-toggle :checked="plan.includeFixedExpensesInRemaining"
                                           @toggle:change="setIncludeFixedExpensesInRemaining"></f7-toggle>
                            </template>
                        </f7-list-item>
                        <template :key="expense.id" v-for="expense in plan.fixedExpenses">
                            <f7-list-input type="text" :label="tt('Name')" :value="expense.name"
                                           @input="updateFixedExpenseName(expense, $event.target.value)"></f7-list-input>
                            <list-number-input :label="tt('Amount')" :model-value="toInputNumber(expense.amount)"
                                               :max-decimal-count="2"
                                               @update:model-value="updateFixedExpenseAmount(expense, $event)"></list-number-input>
                            <f7-list-item :title="tt('Applies On')" :after="getFixedExpenseWeekdaysText(expense)"
                                          @click="openWeekdaySheet(expense)"></f7-list-item>
                            <f7-list-item>
                                <template #after-title>{{ tt('Enabled') }}</template>
                                <template #after>
                                    <f7-toggle :checked="expense.enabled" @toggle:change="toggleFixedExpenseEnabled(expense)"></f7-toggle>
                                </template>
                            </f7-list-item>
                            <f7-list-button color="red" @click="removeFixedExpense(expense.id)">{{ tt('Delete') }}</f7-list-button>
                        </template>
                        <f7-list-input type="text" :label="tt('Name')" :value="newFixedExpenseName"
                                       @input="newFixedExpenseName = $event.target.value"></f7-list-input>
                        <list-number-input :label="tt('Amount')" :max-decimal-count="2"
                                           v-model="newFixedExpenseAmount"></list-number-input>
                    </f7-list>
                    <f7-button class="margin-top" large fill :text="tt('Add Fixed Expense')" @click="addNewFixedExpense"></f7-button>

                    <div class="margin-top text-align-center">
                        <f7-link :text="tt('Close')" @click="showPlanSheet = false"></f7-link>
                    </div>
                </div>
            </f7-page-content>
        </f7-sheet>

        <f7-sheet swipe-to-close swipe-handler=".swipe-handler" style="height:auto"
                  :opened="showWeekdaySheet" @sheet:closed="showWeekdaySheet = false">
            <div class="swipe-handler"></div>
            <f7-page-content class="margin-top no-padding-top">
                <div class="display-flex padding justify-content-space-between align-items-center">
                    <div class="ebk-sheet-title"><b>{{ tt('Applies On') }}</b></div>
                </div>
                <f7-list strong inset dividers>
                    <f7-list-item checkbox :key="weekday.type" v-for="weekday in allWeekdays"
                                  :title="weekday.displayName"
                                  :checked="isWeekdaySelected(weekday.type)"
                                  @change="toggleWeekday(weekday.type)">
                    </f7-list-item>
                </f7-list>
                <div class="padding-horizontal padding-bottom text-align-center">
                    <f7-link :text="tt('Close')" @click="showWeekdaySheet = false"></f7-link>
                </div>
            </f7-page-content>
        </f7-sheet>

        <f7-sheet swipe-to-close swipe-handler=".swipe-handler" style="height:auto"
                  :opened="showDaySheet" @sheet:closed="showDaySheet = false">
            <div class="swipe-handler"></div>
            <f7-page-content class="margin-top no-padding-top" v-if="selectedDay">
                <div class="display-flex padding justify-content-space-between align-items-center">
                    <div class="ebk-sheet-title"><b>{{ selectedDay.date }}</b></div>
                </div>
                <f7-block class="no-margin-top">
                    <div class="budget-day-detail">
                        <span>{{ tt('Daily Budget') }}</span>
                        <b class="text-primary">{{ formatAmount(selectedDay.dailyBudgetAmount) }}</b>
                    </div>
                    <div class="budget-day-detail">
                        <span>{{ tt('Remaining') }}</span>
                        <b :class="getDayRemainingClass(selectedDay)">{{ formatAmount(selectedDay.remainingAmount) }}</b>
                    </div>
                    <div class="budget-day-detail">
                        <span>{{ tt('Spent') }}</span>
                        <b>{{ formatAmount(selectedDay.actualAmount) }}</b>
                    </div>
                </f7-block>
                <f7-block-title class="margin-top">{{ tt('Transaction Details') }}</f7-block-title>
                <f7-list strong inset dividers v-if="dayTransactionsLoading">
                    <f7-list-item>
                        <div class="display-flex justify-content-center padding">
                            <f7-preloader />
                        </div>
                    </f7-list-item>
                </f7-list>
                <f7-list strong inset dividers v-else-if="dayTransactionsError">
                    <f7-list-item :title="tt('Unable to retrieve budget data')" />
                </f7-list>
                <f7-list strong inset dividers v-else-if="dayTransactions.length < 1">
                    <f7-list-item :title="tt('No transaction data')" />
                </f7-list>
                <f7-list strong inset dividers media-list v-else>
                    <f7-list-item :key="transaction.id" v-for="transaction in dayTransactions">
                        <template #media>
                            <item-icon v-if="transaction.categoryColor"
                                       :icon-type="getCategoryIconType(transaction.categoryIconType)"
                                       :icon-id="transaction.categoryIcon"
                                       :color="transaction.categoryColor" />
                        </template>
                        <template #title>
                            <div class="budget-mobile-transaction-title">
                                <span class="text-truncate">{{ transaction.categoryName || tt('None') }}</span>
                                <b class="text-expense">{{ formatAmount(transaction.amount) }}</b>
                            </div>
                        </template>
                        <template #subtitle>
                            <div class="budget-mobile-transaction-meta">
                                {{ formatTransactionTime(transaction) }} · {{ transaction.accountName }}
                            </div>
                            <div class="text-truncate" v-if="transaction.comment">{{ transaction.comment }}</div>
                        </template>
                    </f7-list-item>
                </f7-list>
                <f7-list strong inset dividers v-if="dayFixedExpenses.length > 0 && selectedDay.date >= today">
                    <f7-list-item group-title>{{ tt('Fixed Expenses') }}</f7-list-item>
                    <template :key="fixedExpense.id" v-for="fixedExpense in dayFixedExpenses">
                        <list-number-input :label="fixedExpense.name" :max-decimal-count="2"
                                           :model-value="toInputNumber(fixedExpense.amount)"
                                           @update:model-value="setDayFixedExpenseAmount(selectedDay.date, fixedExpense.id, $event)"></list-number-input>
                    </template>
                </f7-list>
            </f7-page-content>
        </f7-sheet>
    </f7-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { useI18n } from '@/locales/helpers.ts';
import { useBudgetPlannerPageBase } from '@/views/base/budget/BudgetPlannerPageBase.ts';

import { BudgetDayStatus, type BudgetDaySummary, type BudgetFixedExpense, type BudgetFixedExpenseDaySummary } from '@/core/budget.ts';
import type { WeekDayValue } from '@/core/datetime.ts';

import { parseBudgetAmount } from '@/lib/budget.ts';
import { getCategoryIconType } from '@/lib/icon.ts';
import { isUserLogined, isUserUnlocked } from '@/lib/userstate.ts';

const { tt } = useI18n();

const {
    selectedYearMonthDisplay,
    plan,
    summary,
    days,
    today,
    isCurrentMonth,
    canGoNextMonth,
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
    setIncludeFixedExpensesInRemaining,
    setUseTransactionTimezone,
    addFixedExpense,
    updateFixedExpense,
    removeFixedExpense,
    toggleFixedExpenseEnabled,
    toggleFixedExpenseWeekday,
    setFixedExpenseDayAmount,
    formatAmount,
    formatNumber,
    formatPercent,
    formatTransactionTime,
    getDayStatusText,
    isToday,
} = useBudgetPlannerPageBase();

const showPlanSheet = ref<boolean>(false);
const showWeekdaySheet = ref<boolean>(false);
const showDaySheet = ref<boolean>(false);
const selectedDayDate = ref<string | null>(null);
const selectedDay = computed<BudgetDaySummary | null>(() => {
    if (!selectedDayDate.value) {
        return null;
    }

    return days.value.find(day => day.date === selectedDayDate.value) ?? null;
});
const dayFixedExpenses = ref<BudgetFixedExpenseDaySummary[]>([]);
const currentWeekdayExpense = ref<BudgetFixedExpense | null>(null);
const newFixedExpenseName = ref<string>('');
const newFixedExpenseAmount = ref<number>(0);

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

function openPlanSheet(): void {
    showPlanSheet.value = true;
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

function getFixedExpenseWeekdaysText(expense: BudgetFixedExpense): string {
    return expense.weekdays.map(weekday => allWeekdays.value.find(item => item.type === weekday)?.displayName ?? '').filter(name => !!name).join(', ');
}

function openWeekdaySheet(expense: BudgetFixedExpense): void {
    currentWeekdayExpense.value = expense;
    showWeekdaySheet.value = true;
}

function isWeekdaySelected(weekday: number): boolean {
    return currentWeekdayExpense.value?.weekdays.includes(weekday as WeekDayValue) ?? false;
}

function toggleWeekday(weekday: number): void {
    if (!currentWeekdayExpense.value) {
        return;
    }

    toggleFixedExpenseWeekday(currentWeekdayExpense.value, weekday as WeekDayValue);
    currentWeekdayExpense.value = plan.value.fixedExpenses.find(expense => expense.id === currentWeekdayExpense.value?.id) ?? null;
}

function openDayDialog(day: BudgetDaySummary): void {
    selectedDayDate.value = day.date;
    dayFixedExpenses.value = day.fixedExpenses.map(fixedExpense => ({ ...fixedExpense }));
    loadDayTransactions(day.date);
    showDaySheet.value = true;
}

function setDayFixedExpenseAmount(date: string, expenseId: string, amount: number): void {
    dayFixedExpenses.value = dayFixedExpenses.value.map(fixedExpense => fixedExpense.id === expenseId
        ? { ...fixedExpense, amount: amount.toString() }
        : fixedExpense);
    setFixedExpenseDayAmount(date, expenseId, amount);
}

function onPageAfterIn(): void {
    reload(false).catch(() => undefined);
}

if (isUserLogined() && isUserUnlocked()) {
    reload().catch(() => undefined);
}
</script>

<style scoped>
.budget-month-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
}

.budget-current-month-link {
    margin-inline-start: 8px;
    font-size: 0.8rem;
}

.budget-summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
}

.budget-summary-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.budget-summary-item small {
    color: var(--f7-text-color-secondary);
}

.budget-summary-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--f7-text-color-secondary);
    font-size: 0.8rem;
}

.budget-status-chip {
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--f7-theme-color);
    color: #fff;
    font-size: 0.75rem;
}

.budget-status-overspent {
    background: #d9534f;
}

.budget-status-near_limit {
    background: #f0ad4e;
}

.budget-status-under {
    background: #5cb85c;
}

.budget-status-no_data,
.budget-status-future {
    background: #8e8e93;
}

.budget-day-today {
    background: rgba(198, 126, 72, 0.08);
}

.text-expense {
    color: #d9534f;
}

.text-success {
    color: #5cb85c;
}

.text-warning {
    color: #f0ad4e;
}

.text-primary {
    color: #c67e48;
}

.budget-mobile-day-title {
    display: flex;
    align-items: center;
    gap: 8px;
}

.budget-mobile-day-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 4px;
    border-radius: 10px;
    background: rgba(198, 126, 72, 0.14);
    color: #c67e48;
    font-size: 0.7rem;
    font-weight: 700;
}

.budget-mobile-day-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.75rem;
}

.budget-mobile-day-progress {
    margin-top: 6px;
}

.budget-mobile-day-fixed {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
    color: var(--f7-text-color-secondary);
    font-size: 0.7rem;
}

.budget-mobile-day-fixed.budget-fixed-excluded {
    text-decoration: line-through;
    opacity: 0.7;
}

.budget-amount-overspent {
    color: #d9534f;
}

.budget-amount-near_limit {
    color: #f0ad4e;
}

.budget-amount-under {
    color: #5cb85c;
}

.budget-amount-no_data,
.budget-amount-future {
    color: var(--f7-text-color-secondary);
}

.budget-progress-overspent :deep(.progressbar-inner) {
    background-color: #d9534f;
}

.budget-progress-near_limit :deep(.progressbar-inner) {
    background-color: #f0ad4e;
}

.budget-progress-under :deep(.progressbar-inner) {
    background-color: #5cb85c;
}

.budget-progress-no_data :deep(.progressbar-inner),
.budget-progress-future :deep(.progressbar-inner) {
    background-color: #8e8e93;
}

.budget-fixed-expenses-title {
    margin-top: 16px;
}

.budget-fixed-expense-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    color: var(--f7-text-color-secondary);
}

.budget-day-detail {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid var(--f7-list-item-border-color);
}

.budget-mobile-transaction-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.budget-mobile-transaction-meta {
    color: var(--f7-text-color-secondary);
    font-size: 0.75rem;
}
</style>

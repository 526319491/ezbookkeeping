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
                          :title="day.date"
                          :subtitle="getDayStatusText(day.status)"
                          :after="formatAmount(day.actualAmount, false)"
                          :class="{ 'budget-day-today': isToday(day.date) }"
                          @click="openDayDialog(day)">
                <template #footer>
                    <small>{{ tt('Daily Budget') }} {{ formatAmount(day.idealTotalAmount, false) }}</small>
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
                            <template #after-title>{{ tt('Use Account Balance as Living Allowance') }}</template>
                            <template #after>
                                <f7-toggle :checked="plan.useAccountBalance" @toggle:change="setUseAccountBalance"></f7-toggle>
                            </template>
                        </f7-list-item>
                        <f7-list-item v-if="plan.useAccountBalance" :title="tt('Living Expense Balance')"
                                      :after="formatAmount(accountBalance)"></f7-list-item>
                        <f7-list-item v-if="plan.useAccountBalance && !isAccountBalanceActive"
                                      :title="tt('Account Balance Only Applies to Current Month')"></f7-list-item>
                        <list-number-input v-if="!plan.useAccountBalance" :label="tt('Monthly Living Allowance')" :max-decimal-count="2"
                                           v-model="budgetInput"></list-number-input>
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
                    <f7-button large fill :text="tt('Apply')" @click="applyBudget"></f7-button>

                    <f7-block-title class="budget-fixed-expenses-title">{{ tt('Fixed Daily Expenses') }}</f7-block-title>
                    <f7-list strong inset dividers class="no-margin">
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
                        <b class="text-primary">{{ formatAmount(selectedDay.idealTotalAmount) }}</b>
                    </div>
                    <div class="budget-day-detail">
                        <span>{{ tt('Suggested Daily Spending') }}</span>
                        <b class="text-primary">{{ formatAmount(selectedDay.suggestedAmount) }}</b>
                    </div>
                    <div class="budget-day-detail">
                        <span>{{ tt('Spent') }}</span>
                        <b>{{ formatAmount(selectedDay.actualAmount) }}</b>
                    </div>
                    <div class="budget-day-detail">
                        <span>{{ tt('Status') }}</span>
                        <b>{{ getDayStatusText(selectedDay.status) }}</b>
                    </div>
                </f7-block>
                <f7-list strong inset dividers>
                    <list-number-input :label="tt('Manual Actual Spending')" :max-decimal-count="2"
                                       v-model="manualActualInput"></list-number-input>
                </f7-list>
                <div class="padding-horizontal padding-bottom">
                    <f7-button large fill :text="tt('Save')" @click="saveManualActual"></f7-button>
                    <f7-button class="margin-top" large :text="tt('Clear Override')"
                               v-if="getManualActual(selectedDay.date) !== null"
                               @click="clearManualActualForSelectedDay"></f7-button>
                </div>
            </f7-page-content>
        </f7-sheet>
    </f7-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { useI18n } from '@/locales/helpers.ts';
import { useBudgetPlannerPageBase } from '@/views/base/budget/BudgetPlannerPageBase.ts';

import { BudgetDayStatus, type BudgetDaySummary, type BudgetFixedExpense } from '@/core/budget.ts';
import type { WeekDayValue } from '@/core/datetime.ts';

import { parseBudgetAmount } from '@/lib/budget.ts';
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
    toggleFixedExpenseWeekday,
    setManualActual,
    clearManualActual,
    getManualActual,
    formatAmount,
    formatNumber,
    getDayStatusText,
    isToday,
} = useBudgetPlannerPageBase();

const showPlanSheet = ref<boolean>(false);
const showWeekdaySheet = ref<boolean>(false);
const showDaySheet = ref<boolean>(false);
const selectedDay = ref<BudgetDaySummary | null>(null);
const currentWeekdayExpense = ref<BudgetFixedExpense | null>(null);
const budgetInput = ref<number>(0);
const manualActualInput = ref<number>(0);
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

function openPlanSheet(): void {
    budgetInput.value = parseBudgetAmount(plan.value.monthlyBudget).toDoubleNumber();
    showPlanSheet.value = true;
}

function applyBudget(): void {
    setMonthlyBudget(budgetInput.value);
    showPlanSheet.value = false;
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
    selectedDay.value = day;
    manualActualInput.value = day.hasActualData ? parseBudgetAmount(day.actualAmount).toDoubleNumber() : 0;
    showDaySheet.value = true;
}

function saveManualActual(): void {
    if (!selectedDay.value) {
        return;
    }

    setManualActual(selectedDay.value.date, manualActualInput.value);
    showDaySheet.value = false;
}

function clearManualActualForSelectedDay(): void {
    if (!selectedDay.value) {
        return;
    }

    clearManualActual(selectedDay.value.date);
    showDaySheet.value = false;
}

function onPageAfterIn(): void {
    reload(false).catch(() => undefined);
}

watch(() => plan.value.monthlyBudget, value => {
    if (!showPlanSheet.value) {
        budgetInput.value = parseBudgetAmount(value).toDoubleNumber();
    }
});

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
</style>

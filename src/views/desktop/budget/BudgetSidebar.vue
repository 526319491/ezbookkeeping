<template>
    <li class="budget-sidebar">
        <div class="budget-sidebar-summary mx-2 mb-2">
            <span class="text-body-medium">{{ isAccountBalanceActive ? tt('Living Expense Balance') : tt('Monthly Living Allowance') }}</span>
            <div class="text-h6 text-primary text-truncate mt-1">
                {{ formatAmount(isAccountBalanceActive ? accountBalance : plan.monthlyBudget) }}
            </div>

            <div class="budget-sidebar-progress mt-3">
                <div class="d-flex align-center justify-space-between">
                    <small class="text-medium-emphasis">{{ tt('Budget Usage') }}</small>
                    <small class="text-medium-emphasis">{{ formatPercentToLocalizedNumerals(budgetUsagePercent, 0, '') }}</small>
                </div>
                <v-progress-linear class="mt-1" rounded height="6"
                                   :model-value="Math.min(100, budgetUsagePercent)"
                                   :color="budgetUsageColor" />
            </div>

            <div class="budget-sidebar-kv mt-3">
                <span>{{ tt('Spent This Month') }}</span>
                <b class="text-expense">{{ formatAmount(summary.monthSpent) }}</b>
            </div>
            <div class="budget-sidebar-kv">
                <span>{{ tt('Remaining') }}</span>
                <b>{{ formatAmount(summary.monthRemaining) }}</b>
            </div>
            <div class="budget-sidebar-kv">
                <span>{{ tt('Today Suggested Spending') }}</span>
                <b class="text-primary">{{ formatAmount(summary.idealToday) }}</b>
            </div>
            <div class="budget-sidebar-today-status mt-2">
                <span class="budget-status-dot" :class="'budget-status-' + todayStatus"></span>
                <span>{{ getDayStatusText(todayStatus) }}</span>
            </div>
        </div>

        <v-divider class="my-2" />

        <div class="nav-section-title">{{ tt('Quick Actions') }}</div>
        <div class="nav-link">
            <a class="d-flex align-center cursor-pointer" @click="$emit('edit-plan')">
                <v-icon class="nav-item-icon" :icon="mdiPencilOutline" size="20" />
                <span class="nav-item-title">{{ tt('Edit Budget Plan') }}</span>
            </a>
        </div>
        <div class="nav-link">
            <a class="d-flex align-center cursor-pointer" @click="$emit('refresh')">
                <v-icon class="nav-item-icon" :icon="mdiRefresh" size="20" />
                <span class="nav-item-title">{{ tt('Refresh') }}</span>
            </a>
        </div>
        <div class="nav-link">
            <a class="d-flex align-center cursor-pointer" @click="$emit('select-accounts')">
                <v-icon class="nav-item-icon" :icon="mdiAccountMultipleOutline" size="20" />
                <span class="nav-item-title">{{ tt('Select Accounts') }}</span>
            </a>
        </div>

        <v-divider class="my-2" />

        <div class="budget-sidebar-section-header">
            <div class="nav-section-title">{{ tt('Fixed Expenses') }}</div>
            <v-switch class="budget-sidebar-fixed-switch" density="compact" hide-details
                      :label="tt('Include in Remaining')"
                      :model-value="plan.includeFixedExpensesInRemaining"
                      @update:model-value="onIncludeFixedExpensesChanged" />
        </div>
        <template v-if="fixedExpenses.length > 0">
            <div class="budget-sidebar-row" :key="expense.id" v-for="expense in fixedExpenses"
                 @click="$emit('edit-plan')">
                <div class="budget-sidebar-row-content">
                    <span class="budget-sidebar-row-title text-truncate">{{ expense.name || tt('Fixed Expenses') }}</span>
                    <small class="budget-sidebar-row-sub text-truncate">{{ getFixedExpenseWeekdaysText(expense) }}</small>
                </div>
                <b class="budget-sidebar-row-value">{{ formatAmount(expense.amount) }}</b>
                <span class="budget-sidebar-row-switch" @click.stop>
                    <v-switch class="budget-sidebar-row-switch-control" density="compact" hide-details inset
                              :aria-label="tt('Include in Remaining')"
                              :title="tt('Include in Remaining')"
                              :model-value="expense.includeInRemaining"
                              @update:model-value="updateFixedExpenseIncludeInRemaining(expense, $event)" />
                </span>
            </div>
        </template>
        <div class="budget-sidebar-empty" v-else>{{ tt('No Fixed Expenses') }}</div>

        <v-divider class="my-2" />

        <div class="nav-section-title">{{ tt('Accounts') }}</div>
        <template v-if="visibleAccounts.length > 0">
            <a class="budget-sidebar-row" :key="account.id" v-for="account in visibleAccounts"
               @click="$emit('select-accounts')">
                <item-icon :icon-type="getAccountIconType(account.iconType)"
                           :icon-id="account.icon" :color="account.color" />
                <div class="budget-sidebar-row-content">
                    <span class="budget-sidebar-row-title text-truncate">{{ account.name }}</span>
                    <small class="budget-sidebar-row-sub">{{ formatAccountBalance(account) }}</small>
                </div>
            </a>
            <div class="nav-link" v-if="hasMoreAccounts">
                <a class="d-flex align-center cursor-pointer" @click="$emit('select-accounts')">
                    <span class="nav-item-title">{{ tt('View All') }}</span>
                    <v-icon :icon="mdiChevronRight" size="18" />
                </a>
            </div>
        </template>
        <div class="budget-sidebar-empty" v-else>{{ tt('No available account') }}</div>
    </li>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useI18n } from '@/locales/helpers.ts';
import { useBudgetPlannerPageBase } from '@/views/base/budget/BudgetPlannerPageBase.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useUserStore } from '@/stores/user.ts';

import { BudgetDayStatus, type BudgetFixedExpense } from '@/core/budget.ts';
import type { Account } from '@/models/account.ts';

import { parseBudgetAmount } from '@/lib/budget.ts';
import { getAccountIconType } from '@/lib/icon.ts';

import {
    mdiAccountMultipleOutline,
    mdiChevronRight,
    mdiPencilOutline,
    mdiRefresh,
} from '@mdi/js';

defineEmits<{
    (e: 'edit-plan'): void;
    (e: 'refresh'): void;
    (e: 'select-accounts'): void;
}>();

const {
    tt,
    formatPercentToLocalizedNumerals,
    formatAmountToLocalizedNumeralsWithCurrency,
    getMultiWeekdayLongNames,
} = useI18n();

const {
    summary,
    plan,
    days,
    today,
    isCurrentMonth,
    accountBalance,
    isAccountBalanceActive,
    setIncludeFixedExpensesInRemaining,
    updateFixedExpense,
    formatAmount,
    getDayStatusText,
} = useBudgetPlannerPageBase();

const accountsStore = useAccountsStore();
const userStore = useUserStore();

const fixedExpenses = computed(() => plan.value.fixedExpenses.filter(expense => expense.enabled));

const includedAccounts = computed<Account[]>(() => {
    const planValue = plan.value;
    const includedAccountIds = new Set<string>(planValue.includedAccountIds);

    for (const accountId of planValue.includedAccountIds) {
        const account = accountsStore.allAccountsMap[accountId];

        if (account?.subAccounts) {
            for (const subAccount of account.subAccounts) {
                includedAccountIds.add(subAccount.id);
            }
        }
    }

    return accountsStore.allPlainAccounts.filter(account => includedAccountIds.size < 1 || includedAccountIds.has(account.id));
});

const visibleAccounts = computed(() => includedAccounts.value.slice(0, 4));
const hasMoreAccounts = computed(() => includedAccounts.value.length > 4);

const budgetUsagePercent = computed<number>(() => {
    const used = parseBudgetAmount(summary.value.monthUsed);
    const base = parseBudgetAmount(summary.value.monthlyBudget);

    if (base.lessThanOrEqual(0)) {
        return 0;
    }

    return Math.min(999, used.divide(base).multiply(100).toDoubleNumber());
});

const budgetUsageColor = computed<string>(() => {
    if (budgetUsagePercent.value > 100) {
        return 'error';
    } else if (budgetUsagePercent.value >= 90) {
        return 'warning';
    } else {
        return 'primary';
    }
});

const todayStatus = computed<BudgetDayStatus>(() => {
    const focusDay = isCurrentMonth.value ? days.value.find(day => day.date === today.value) : days.value[days.value.length - 1];
    return focusDay ? focusDay.status : BudgetDayStatus.NoData;
});

function getFixedExpenseWeekdaysText(expense: { weekdays: number[] }): string {
    const weekdays = [...expense.weekdays].sort((a, b) => a - b);

    if (weekdays.length === 7) {
        return tt('Every Day');
    } else if (weekdays.length === 5 && weekdays.every(day => day >= 1 && day <= 5)) {
        return tt('Weekdays');
    } else if (weekdays.length === 2 && weekdays.includes(0) && weekdays.includes(6)) {
        return tt('Weekends');
    } else {
        return getMultiWeekdayLongNames(weekdays, userStore.currentUserFirstDayOfWeek);
    }
}

function formatAccountBalance(account: Account): string {
    return formatAmountToLocalizedNumeralsWithCurrency(parseBudgetAmount(account.balance), account.currency);
}

function onIncludeFixedExpensesChanged(value: boolean | null): void {
    setIncludeFixedExpensesInRemaining(!!value);
}

function updateFixedExpenseIncludeInRemaining(expense: BudgetFixedExpense, includeInRemaining: boolean | null): void {
    updateFixedExpense({ ...expense, includeInRemaining: !!includeInRemaining });
}
</script>

<style scoped>
.budget-sidebar {
    list-style: none;
}

.budget-sidebar-section-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
}

.budget-sidebar-section-header .nav-section-title {
    padding-inline-end: 0;
}

.budget-sidebar-fixed-switch {
    flex: 0 0 auto;
    margin-inline-end: 8px;
    font-size: 0.68rem;
}

.budget-sidebar-progress small {
    font-size: 0.7rem;
}

.budget-sidebar-kv {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 0;
    font-size: 0.8rem;
}

.budget-sidebar-kv span {
    color: rgba(var(--v-theme-on-surface), 0.64);
}

.budget-sidebar-today-status {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgba(var(--v-theme-on-surface), 0.64);
    font-size: 0.75rem;
}

.budget-status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: rgba(var(--v-theme-on-surface), 0.45);
}

.budget-status-dot.budget-status-overspent {
    background: rgb(var(--v-theme-error));
}

.budget-status-dot.budget-status-near_limit {
    background: rgb(var(--v-theme-warning));
}

.budget-status-dot.budget-status-under {
    background: rgb(var(--v-theme-success));
}

.budget-sidebar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 2px 0;
    padding: 6px 8px;
    border-radius: 8px;
    color: inherit;
    text-decoration: none;
    cursor: pointer;
}

.budget-sidebar-row:hover {
    background: rgba(var(--v-theme-primary), 0.065);
}

.budget-sidebar-row-content {
    display: flex;
    overflow: hidden;
    flex: 1;
    flex-direction: column;
    min-width: 0;
}

.budget-sidebar-row-title {
    overflow: hidden;
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.budget-sidebar-row-sub {
    overflow: hidden;
    color: rgba(var(--v-theme-on-surface), 0.6);
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.budget-sidebar-row-value {
    flex: 0 0 auto;
    font-size: 0.8rem;
}

.budget-sidebar-row-switch {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
}

.budget-sidebar-row-switch-control :deep(.v-input__control) {
    height: auto;
}

.budget-sidebar-row-switch-control :deep(.v-selection-control) {
    min-height: 24px;
}

.budget-sidebar-empty {
    padding: 4px 12px;
    color: rgba(var(--v-theme-on-surface), 0.55);
    font-size: 0.75rem;
}
</style>

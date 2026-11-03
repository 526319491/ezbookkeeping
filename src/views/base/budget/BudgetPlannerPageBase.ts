import { computed, ref } from 'vue';

import { useI18n } from '@/locales/helpers.ts';
import { useBudgetStore } from '@/stores/budget.ts';
import { useUserStore } from '@/stores/user.ts';

import {
    BudgetDayStatus,
    type BudgetDaySummary,
    type BudgetDayTransaction,
    type BudgetFixedExpense,
} from '@/core/budget.ts';
import type { WeekDayValue, Year0BasedMonth } from '@/core/datetime.ts';
import type { BigDecimal } from '@/core/numeral.ts';

import {
    getYearMonthDayDateTime,
    parseDateTimeFromUnixTimeWithTimezoneOffset,
} from '@/lib/datetime.ts';
import {
    getCurrentYearMonth,
    parseBudgetAmount,
    parseYearMonth,
} from '@/lib/budget.ts';

export function useBudgetPlannerPageBase() {
    const {
        tt,
        formatAmountToLocalizedNumerals,
        formatAmountToLocalizedNumeralsWithCurrency,
        formatNumberToLocalizedNumerals,
        formatPercentToLocalizedNumerals,
        formatDateTimeToGregorianLikeLongYearMonth,
        formatDateTimeToShortTime,
        getAllWeekDays,
    } = useI18n();

    const budgetStore = useBudgetStore();
    const userStore = useUserStore();

    const selectedYearMonth = computed<string>({
        get: () => budgetStore.selectedYearMonth,
        set: (value: string) => {
            budgetStore.setSelectedYearMonth(value);
            void reload();
        },
    });

    const selectedYearMonthDisplay = computed<string>(() => {
        const parsed = parseYearMonth(budgetStore.selectedYearMonth);

        if (!parsed) {
            return '';
        }

        return formatDateTimeToGregorianLikeLongYearMonth(getYearMonthDayDateTime(parsed.year, parsed.month, 1));
    });

    const selectedMonth = computed<Year0BasedMonth | null>(() => {
        const parsed = parseYearMonth(budgetStore.selectedYearMonth);

        if (!parsed) {
            return null;
        }

        return {
            year: parsed.year,
            month0base: parsed.month - 1,
        };
    });

    const plan = computed(() => budgetStore.currentPlan);
    const summary = computed(() => budgetStore.currentSummary);
    const days = computed<BudgetDaySummary[]>(() => summary.value.days);
    const today = computed<string>(() => budgetStore.today);
    const isCurrentMonth = computed<boolean>(() => budgetStore.selectedYearMonth === budgetStore.currentYearMonth);
    const canGoNextMonth = computed<boolean>(() => budgetStore.selectedYearMonth < budgetStore.currentYearMonth);
    const currency = computed<string>(() => plan.value.currency || userStore.currentUserDefaultCurrency);
    const loading = computed<boolean>(() => budgetStore.loading);
    const error = computed<unknown | null>(() => budgetStore.error);
    const hasOtherCurrencyData = computed<boolean>(() => budgetStore.hasOtherCurrencyData);
    const hasOtherCurrencyAccountBalance = computed<boolean>(() => budgetStore.hasOtherCurrencyAccountBalance);
    const accountBalance = computed<string>(() => budgetStore.accountBalance);
    const isAccountBalanceActive = computed<boolean>(() => budgetStore.isAccountBalanceActive);
    const allWeekdays = computed(() => getAllWeekDays(userStore.currentUserFirstDayOfWeek));
    const includedAccountIds = computed<string[]>(() => plan.value.includedAccountIds);
    const includedCategoryIds = computed<string[]>(() => plan.value.includedCategoryIds);

    const dayTransactions = ref<BudgetDayTransaction[]>([]);
    const dayTransactionsLoading = ref<boolean>(false);
    const dayTransactionsError = ref<unknown | null>(null);
    let dayTransactionsRequestId = 0;

    function reload(force: boolean = false): Promise<void> {
        return budgetStore.loadCurrentMonthData({ force: force });
    }

    function loadDayTransactions(date: string): void {
        const requestId = ++dayTransactionsRequestId;

        dayTransactionsLoading.value = true;
        dayTransactionsError.value = null;
        dayTransactions.value = [];

        budgetStore.loadDayTransactions(date).then(transactions => {
            if (requestId !== dayTransactionsRequestId) {
                return;
            }

            dayTransactions.value = transactions;
        }).catch(err => {
            if (requestId !== dayTransactionsRequestId) {
                return;
            }

            dayTransactionsError.value = err;
        }).finally(() => {
            if (requestId !== dayTransactionsRequestId) {
                return;
            }

            dayTransactionsLoading.value = false;
        });
    }

    function changeMonth(offset: number): void {
        const parsed = parseYearMonth(budgetStore.selectedYearMonth);

        if (!parsed) {
            return;
        }

        const date = new Date(parsed.year, parsed.month - 1 + offset, 1);
        const yearMonth = getCurrentYearMonth(date);

        if (yearMonth > budgetStore.currentYearMonth) {
            return;
        }

        budgetStore.setSelectedYearMonth(yearMonth);
        void reload();
    }

    function goToCurrentMonth(): void {
        budgetStore.setSelectedYearMonth(budgetStore.currentYearMonth);
        void reload();
    }

    function setUseTransactionTimezone(value: boolean): void {
        budgetStore.setUseTransactionTimezone(value);
        void reload(true);
    }

    function setIncludeFixedExpensesInRemaining(value: boolean): void {
        budgetStore.setIncludeFixedExpensesInRemaining(value);
    }

    function setIncludedAccountIds(accountIds: string[]): void {
        budgetStore.setIncludedAccountIds(accountIds);
        void reload(true);
    }

    function setIncludedCategoryIds(categoryIds: string[]): void {
        budgetStore.setIncludedCategoryIds(categoryIds);
        void reload(true);
    }

    function addFixedExpense(name: string, amount: number): void {
        budgetStore.addFixedExpense(name, amount);
    }

    function updateFixedExpense(expense: BudgetFixedExpense): void {
        budgetStore.updateFixedExpense(expense);
    }

    function removeFixedExpense(id: string): void {
        budgetStore.removeFixedExpense(id);
    }

    function toggleFixedExpenseWeekday(expense: BudgetFixedExpense, weekday: WeekDayValue): void {
        const weekdays = expense.weekdays.includes(weekday)
            ? expense.weekdays.filter(item => item !== weekday)
            : [...expense.weekdays, weekday].sort((a, b) => a - b);

        budgetStore.updateFixedExpense({
            ...expense,
            weekdays: weekdays,
        });
    }

    function toggleFixedExpenseEnabled(expense: BudgetFixedExpense): void {
        budgetStore.updateFixedExpense({
            ...expense,
            enabled: !expense.enabled,
        });
    }

    function setFixedExpenseDayAmount(date: string, expenseId: string, amount: number | string | null): void {
        budgetStore.setFixedExpenseDayAmount(date, expenseId, amount);
    }

    function clearFixedExpenseDayState(date: string, expenseId: string): void {
        budgetStore.clearFixedExpenseDayState(date, expenseId);
    }

    function formatAmount(value: string | BigDecimal | null | undefined, withCurrency: boolean = true): string {
        const amount = value === null || value === undefined ? parseBudgetAmount(undefined) : (typeof value === 'string' ? parseBudgetAmount(value) : value);

        if (withCurrency) {
            return formatAmountToLocalizedNumeralsWithCurrency(amount, currency.value);
        } else {
            return formatAmountToLocalizedNumerals(amount, currency.value);
        }
    }

    function formatNumber(value: number): string {
        return formatNumberToLocalizedNumerals(value);
    }

    function formatPercent(value: number): string {
        return formatPercentToLocalizedNumerals(value, 0, '');
    }

    function formatTransactionTime(transaction: BudgetDayTransaction): string {
        const dateTime = parseDateTimeFromUnixTimeWithTimezoneOffset(transaction.time, transaction.utcOffset);
        return formatDateTimeToShortTime(dateTime);
    }

    function getWeekdayName(weekday: WeekDayValue): string {
        const weekDay = allWeekdays.value.find(item => item.type === weekday);
        return weekDay ? weekDay.displayName : '';
    }

    function getDayStatusText(status: BudgetDayStatus): string {
        if (status === BudgetDayStatus.Overspent) {
            return tt('Overspent');
        } else if (status === BudgetDayStatus.NearLimit) {
            return tt('Near Limit');
        } else if (status === BudgetDayStatus.Under) {
            return tt('Under Budget');
        } else if (status === BudgetDayStatus.Future) {
            return tt('Future');
        } else {
            return tt('No Spending Data');
        }
    }

    function getDayStatusColor(status: BudgetDayStatus): string {
        if (status === BudgetDayStatus.Overspent) {
            return 'error';
        } else if (status === BudgetDayStatus.NearLimit) {
            return 'warning';
        } else if (status === BudgetDayStatus.Under) {
            return 'success';
        } else if (status === BudgetDayStatus.Future) {
            return 'default';
        } else {
            return 'secondary';
        }
    }

    function isToday(date: string): boolean {
        return date === today.value;
    }

    return {
        // states
        selectedYearMonth,
        selectedYearMonthDisplay,
        selectedMonth,
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
        // functions
        reload,
        loadDayTransactions,
        changeMonth,
        goToCurrentMonth,
        setIncludeFixedExpensesInRemaining,
        setUseTransactionTimezone,
        setIncludedAccountIds,
        setIncludedCategoryIds,
        addFixedExpense,
        updateFixedExpense,
        removeFixedExpense,
        toggleFixedExpenseWeekday,
        toggleFixedExpenseEnabled,
        setFixedExpenseDayAmount,
        clearFixedExpenseDayState,
        formatAmount,
        formatNumber,
        formatPercent,
        formatTransactionTime,
        getWeekdayName,
        getDayStatusText,
        getDayStatusColor,
        isToday,
    };
}

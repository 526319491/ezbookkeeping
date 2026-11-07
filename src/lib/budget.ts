import type { WeekDayValue } from '@/core/datetime.ts';
import type { BigDecimal } from '@/core/numeral.ts';
import {
    BUDGET_PLANNER_DATA_VERSION,
    BUDGET_PLANNER_NEAR_LIMIT_RATIO,
    BudgetDayStatus,
    type BudgetDaySummary,
    type BudgetFixedExpense,
    type BudgetFixedExpenseDayState,
    type BudgetFixedExpenseDaySummary,
    type BudgetMonthPlan,
    type BudgetMonthSummary,
    type BudgetPlannerData,
    type BudgetProgressSummary,
} from '@/core/budget.ts';

import {
    isArray,
    isBoolean,
    isNumber,
    isObject,
    isString,
} from '@/lib/common.ts';
import {
    BIG_DECIMAL_ZERO,
    parseBigDecimal,
} from '@/lib/numeral.ts';

const BUDGET_AMOUNT_FACTOR = parseBigDecimal(100);

export function getCurrentYearMonth(date: Date = new Date()): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

export function getTodayDate(date: Date = new Date()): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

export function isValidYearMonth(yearMonth: string): boolean {
    return /^\d{4}-\d{2}$/.test(yearMonth);
}

export function parseYearMonth(yearMonth: string): { year: number, month: number } | null {
    if (!isValidYearMonth(yearMonth)) {
        return null;
    }

    const parts = yearMonth.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null;
    }

    return { year, month };
}

export function createDefaultBudgetMonthPlan(currency: string): BudgetMonthPlan {
    return {
        monthlyBudget: '0',
        currency: currency,
        includeFixedExpensesInRemaining: true,
        fixedExpenses: [],
        fixedExpenseDailyStates: {},
        includedAccountIds: [],
        includedCategoryIds: [],
        useTransactionTimezone: false,
    };
}

export function cloneBudgetMonthPlan(plan: BudgetMonthPlan): BudgetMonthPlan {
    return {
        monthlyBudget: plan.monthlyBudget,
        currency: plan.currency,
        includeFixedExpensesInRemaining: plan.includeFixedExpensesInRemaining,
        fixedExpenses: plan.fixedExpenses.map(expense => ({
            id: expense.id,
            name: expense.name,
            amount: expense.amount,
            weekdays: [...expense.weekdays],
            enabled: expense.enabled,
            includeInRemaining: expense.includeInRemaining,
        })),
        fixedExpenseDailyStates: cloneFixedExpenseDailyStates(plan.fixedExpenseDailyStates),
        includedAccountIds: [...plan.includedAccountIds],
        includedCategoryIds: [...plan.includedCategoryIds],
        useTransactionTimezone: plan.useTransactionTimezone,
    };
}

export function createInheritedBudgetMonthPlan(data: BudgetPlannerData, yearMonth: string, defaultCurrency: string): BudgetMonthPlan {
    const monthKeys = Object.keys(data.months).filter(key => key < yearMonth).sort();

    if (monthKeys.length < 1) {
        return createDefaultBudgetMonthPlan(defaultCurrency);
    }

    const previousPlan = data.months[monthKeys[monthKeys.length - 1] as string];

    if (!previousPlan) {
        return createDefaultBudgetMonthPlan(defaultCurrency);
    }

    const clonedPlan = cloneBudgetMonthPlan(previousPlan);
    return {
        ...clonedPlan,
        fixedExpenseDailyStates: {},
    };
}

export function parseBudgetPlannerData(raw: string | null | undefined, defaultCurrency: string): BudgetPlannerData {
    if (!raw) {
        return {
            version: BUDGET_PLANNER_DATA_VERSION,
            months: {},
        };
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        return {
            version: BUDGET_PLANNER_DATA_VERSION,
            months: {},
        };
    }

    if (!isObject(parsed)) {
        return {
            version: BUDGET_PLANNER_DATA_VERSION,
            months: {},
        };
    }

    const parsedData = parsed as Record<string, unknown>;
    const parsedMonths = parsedData['months'];
    const months: Record<string, BudgetMonthPlan> = {};

    if (isObject(parsedMonths)) {
        for (const [yearMonth, monthPlan] of Object.entries(parsedMonths as Record<string, unknown>)) {
            if (!isValidYearMonth(yearMonth) || !isObject(monthPlan)) {
                continue;
            }

            months[yearMonth] = normalizeBudgetMonthPlan(monthPlan as Record<string, unknown>, defaultCurrency);
        }
    }

    return {
        version: BUDGET_PLANNER_DATA_VERSION,
        months,
    };
}

export function serializeBudgetPlannerData(data: BudgetPlannerData): string {
    return JSON.stringify({
        version: BUDGET_PLANNER_DATA_VERSION,
        months: data.months,
    });
}

export function parseBudgetAmount(value: string | number | null | undefined): BigDecimal {
    if (value === null || value === undefined || value === '') {
        return BIG_DECIMAL_ZERO;
    }

    const amount = parseBigDecimal(value);
    return amount.isNaN() ? BIG_DECIMAL_ZERO : amount;
}

export function truncateBudgetAmount(value: BigDecimal): BigDecimal {
    const normalizedValue = value.isNaN() ? BIG_DECIMAL_ZERO : value;
    return normalizedValue.multiply(BUDGET_AMOUNT_FACTOR).truncate().divide(BUDGET_AMOUNT_FACTOR);
}

export function getBudgetFixedExpenseDaySummaries(plan: BudgetMonthPlan, date: string, weekday: WeekDayValue): BudgetFixedExpenseDaySummary[] {
    const result: BudgetFixedExpenseDaySummary[] = [];
    const dailyStates = plan.fixedExpenseDailyStates[date];

    for (const fixedExpense of plan.fixedExpenses) {
        if (!fixedExpense.enabled || !fixedExpense.weekdays.includes(weekday)) {
            continue;
        }

        const dailyState = dailyStates?.[fixedExpense.id];
        result.push({
            id: fixedExpense.id,
            name: fixedExpense.name,
            amount: dailyState?.amount ?? fixedExpense.amount,
            includeInRemaining: fixedExpense.includeInRemaining,
        });
    }

    return result;
}

export function buildBudgetMonthSummary(
    plan: BudgetMonthPlan,
    dailyExpenseAmounts: Record<string, string>,
    yearMonth: string,
    today: string,
    accountBalance?: string | null
): BudgetMonthSummary {
    const parsedYearMonth = parseYearMonth(yearMonth);

    if (!parsedYearMonth) {
        return createEmptyBudgetMonthSummary(yearMonth);
    }

    const { year, month } = parsedYearMonth;
    const daysInMonth = new Date(year, month, 0).getDate();
    const useAccountBalance = accountBalance !== undefined && accountBalance !== null;
    const actualAmounts: Record<string, BigDecimal> = {};
    const hasActualDataMap: Record<string, boolean> = {};
    let totalActualSpent = BIG_DECIMAL_ZERO;

    for (let day = 1; day <= daysInMonth; day++) {
        const date = formatBudgetDate(year, month, day);
        const dailyAmount = dailyExpenseAmounts[date];
        const actualAmount = truncateBudgetAmount(parseBudgetAmount(dailyAmount));

        actualAmounts[date] = actualAmount;
        hasActualDataMap[date] = dailyAmount !== undefined;
        totalActualSpent = totalActualSpent.add(actualAmount);
    }

    const monthlyBudget = useAccountBalance
        ? parseBudgetAmount(accountBalance).add(totalActualSpent)
        : parseBudgetAmount(plan.monthlyBudget);
    let remainingBudget = monthlyBudget;
    let monthSpent = BIG_DECIMAL_ZERO;
    let monthUsed = BIG_DECIMAL_ZERO;
    let overspentDays = 0;

    const days: BudgetDaySummary[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const date = formatBudgetDate(year, month, day);
        const weekday = new Date(year, month - 1, day).getDay() as WeekDayValue;
        const isFuture = date > today;
        const fixedExpenses = getBudgetFixedExpenseDaySummaries(plan, date, weekday);
        let fixedAmount = BIG_DECIMAL_ZERO;
        let itemIncludedFixedAmount = BIG_DECIMAL_ZERO;

        for (const fixedExpense of fixedExpenses) {
            const amount = parseBudgetAmount(fixedExpense.amount);
            fixedAmount = fixedAmount.add(amount);

            if (fixedExpense.includeInRemaining) {
                itemIncludedFixedAmount = itemIncludedFixedAmount.add(amount);
            }
        }

        fixedAmount = truncateBudgetAmount(fixedAmount);
        itemIncludedFixedAmount = truncateBudgetAmount(itemIncludedFixedAmount);
        const actualAmount = actualAmounts[date] as BigDecimal;
        const usedAmount = actualAmount;
        const includedFixedAmount = plan.includeFixedExpensesInRemaining && date >= today ? itemIncludedFixedAmount : BIG_DECIMAL_ZERO;
        const daysLeft = daysInMonth - day + 1;
        const dailyBudgetAmount = remainingBudget.greaterThan(0)
            ? truncateBudgetAmount(remainingBudget.divide(daysLeft))
            : BIG_DECIMAL_ZERO;
        const remainingAmount = truncateBudgetAmount(dailyBudgetAmount.subtract(usedAmount).subtract(includedFixedAmount));
        const usagePercent = dailyBudgetAmount.greaterThan(0)
            ? Math.min(999, usedAmount.divide(dailyBudgetAmount).multiply(100).toDoubleNumber())
            : (usedAmount.greaterThan(0) ? 100 : 0);
        const hasActualData = hasActualDataMap[date] === true;
        const status = getBudgetDayStatus(isFuture, hasActualData, usagePercent);

        if (status === BudgetDayStatus.Overspent) {
            overspentDays++;
        }

        days.push({
            date,
            day,
            weekday,
            actualAmount: actualAmount.toString(),
            dailyBudgetAmount: dailyBudgetAmount.toString(),
            fixedAmount: fixedAmount.toString(),
            includedFixedAmount: itemIncludedFixedAmount.toString(),
            usedAmount: usedAmount.toString(),
            remainingAmount: remainingAmount.toString(),
            usagePercent,
            fixedExpenses,
            hasActualData,
            status,
        });

        remainingBudget = remainingBudget.subtract(usedAmount).subtract(includedFixedAmount);
        monthSpent = monthSpent.add(actualAmount);
        monthUsed = monthUsed.add(usedAmount);
    }

    const currentYearMonth = today.substring(0, 7);
    let focusDay = daysInMonth;

    if (yearMonth === currentYearMonth) {
        focusDay = Math.min(Number(today.substring(8, 10)), daysInMonth);
    } else if (yearMonth > currentYearMonth) {
        focusDay = 1;
    }

    const focusDaySummary = days[Math.max(0, Math.min(focusDay - 1, days.length - 1))] as BudgetDaySummary;
    const elapsedDays = yearMonth === currentYearMonth ? focusDay : (yearMonth < currentYearMonth ? daysInMonth : 0);
    const remainingDays = yearMonth === currentYearMonth ? daysInMonth - focusDay + 1 : (yearMonth > currentYearMonth ? daysInMonth : 0);
    const dailyBudgetToday = parseBudgetAmount(focusDaySummary.dailyBudgetAmount);
    const itemIncludedFixedTodayAmount = parseBudgetAmount(focusDaySummary.includedFixedAmount);
    const includedFixedTodayAmount = plan.includeFixedExpensesInRemaining ? itemIncludedFixedTodayAmount : BIG_DECIMAL_ZERO;
    const flexibleTodayAmount = dailyBudgetToday.subtract(includedFixedTodayAmount).greaterThan(0)
        ? truncateBudgetAmount(dailyBudgetToday.subtract(includedFixedTodayAmount))
        : BIG_DECIMAL_ZERO;

    return {
        yearMonth,
        daysInMonth,
        elapsedDays,
        remainingDays,
        monthlyBudget: truncateBudgetAmount(monthlyBudget).toString(),
        monthSpent: truncateBudgetAmount(monthSpent).toString(),
        monthUsed: truncateBudgetAmount(monthUsed).toString(),
        monthRemaining: truncateBudgetAmount(remainingBudget).toString(),
        fixedToday: focusDaySummary.fixedAmount,
        idealToday: focusDaySummary.dailyBudgetAmount,
        flexibleToday: flexibleTodayAmount.toString(),
        actualToday: focusDaySummary.actualAmount,
        usedToday: focusDaySummary.usedAmount,
        remainingToday: focusDaySummary.remainingAmount,
        overspentDays,
        days,
    };
}

export function buildBudgetProgressSummary(summary: BudgetMonthSummary, yearMonth: string, today: string): BudgetProgressSummary | null {
    const currentYearMonth = today.substring(0, 7);

    if (yearMonth > currentYearMonth || summary.elapsedDays < 1) {
        return null;
    }

    const elapsedDays = Math.min(summary.elapsedDays, summary.days.length);
    let expectedAmount = BIG_DECIMAL_ZERO;
    let actualAmount = BIG_DECIMAL_ZERO;

    for (let index = 0; index < elapsedDays; index++) {
        const day = summary.days[index];

        if (!day) {
            continue;
        }

        expectedAmount = expectedAmount.add(parseBudgetAmount(day.dailyBudgetAmount));
        actualAmount = actualAmount.add(parseBudgetAmount(day.usedAmount));
    }

    expectedAmount = truncateBudgetAmount(expectedAmount);
    actualAmount = truncateBudgetAmount(actualAmount);

    if (!expectedAmount.isPositive()) {
        return null;
    }

    return {
        elapsedDays,
        expectedAmount: expectedAmount.toString(),
        actualAmount: actualAmount.toString(),
        differenceAmount: truncateBudgetAmount(actualAmount.subtract(expectedAmount)).toString(),
    };
}

export function getBudgetExcludedIds(includedIds: string[], allIds: string[], childIdsOf: (id: string) => string[]): string[] {
    if (!includedIds || includedIds.length < 1) {
        return [];
    }

    const finalIncludedIds = new Set<string>(includedIds);

    for (const includedId of includedIds) {
        for (const childId of childIdsOf(includedId)) {
            finalIncludedIds.add(childId);
        }
    }

    return allIds.filter(id => !finalIncludedIds.has(id));
}

function createEmptyBudgetMonthSummary(yearMonth: string): BudgetMonthSummary {
    return {
        yearMonth,
        daysInMonth: 0,
        elapsedDays: 0,
        remainingDays: 0,
        monthlyBudget: '0',
        monthSpent: '0',
        monthUsed: '0',
        monthRemaining: '0',
        fixedToday: '0',
        idealToday: '0',
        flexibleToday: '0',
        actualToday: '0',
        usedToday: '0',
        remainingToday: '0',
        overspentDays: 0,
        days: [],
    };
}

function getBudgetDayStatus(isFuture: boolean, hasAnyData: boolean, usagePercent: number): BudgetDayStatus {
    if (isFuture) {
        return BudgetDayStatus.Future;
    } else if (!hasAnyData) {
        return BudgetDayStatus.NoData;
    } else if (usagePercent > 100) {
        return BudgetDayStatus.Overspent;
    } else if (usagePercent >= BUDGET_PLANNER_NEAR_LIMIT_RATIO * 100) {
        return BudgetDayStatus.NearLimit;
    } else {
        return BudgetDayStatus.Under;
    }
}

function formatBudgetDate(year: number, month: number, day: number): string {
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function cloneFixedExpenseDailyStates(states: Record<string, Record<string, BudgetFixedExpenseDayState>>): Record<string, Record<string, BudgetFixedExpenseDayState>> {
    const result: Record<string, Record<string, BudgetFixedExpenseDayState>> = {};

    for (const [date, dayStates] of Object.entries(states)) {
        const clonedDayStates: Record<string, BudgetFixedExpenseDayState> = {};

        for (const [expenseId, state] of Object.entries(dayStates)) {
            clonedDayStates[expenseId] = {
                amount: state.amount,
            };
        }

        result[date] = clonedDayStates;
    }

    return result;
}

function normalizeBudgetMonthPlan(plan: Record<string, unknown>, defaultCurrency: string): BudgetMonthPlan {
    return {
        monthlyBudget: normalizeBudgetAmount(plan['monthlyBudget']),
        currency: isString(plan['currency']) && plan['currency'] ? plan['currency'] : defaultCurrency,
        includeFixedExpensesInRemaining: isBoolean(plan['includeFixedExpensesInRemaining']) ? plan['includeFixedExpensesInRemaining'] : true,
        fixedExpenses: normalizeFixedExpenses(plan['fixedExpenses']),
        fixedExpenseDailyStates: normalizeFixedExpenseDailyStates(plan['fixedExpenseDailyStates']),
        includedAccountIds: normalizeStringArray(plan['includedAccountIds']),
        includedCategoryIds: normalizeStringArray(plan['includedCategoryIds']),
        useTransactionTimezone: isBoolean(plan['useTransactionTimezone']) ? plan['useTransactionTimezone'] : false,
    };
}

function normalizeFixedExpenses(value: unknown): BudgetFixedExpense[] {
    if (!isArray(value)) {
        return [];
    }

    const fixedExpenses: BudgetFixedExpense[] = [];

    for (const item of value) {
        if (!isObject(item)) {
            continue;
        }

        const fixedExpense = item as Record<string, unknown>;
        const weekdays = normalizeWeekdays(fixedExpense['weekdays']);

        if (!isString(fixedExpense['id']) || !fixedExpense['id']) {
            continue;
        }

        fixedExpenses.push({
            id: fixedExpense['id'],
            name: isString(fixedExpense['name']) ? fixedExpense['name'] : '',
            amount: normalizeBudgetAmount(fixedExpense['amount']),
            weekdays: weekdays.length > 0 ? weekdays : [0, 1, 2, 3, 4, 5, 6],
            enabled: isBoolean(fixedExpense['enabled']) ? fixedExpense['enabled'] : true,
            includeInRemaining: isBoolean(fixedExpense['includeInRemaining']) ? fixedExpense['includeInRemaining'] : true,
        });
    }

    return fixedExpenses;
}

function normalizeFixedExpenseDailyStates(value: unknown): Record<string, Record<string, BudgetFixedExpenseDayState>> {
    if (!isObject(value)) {
        return {};
    }

    const result: Record<string, Record<string, BudgetFixedExpenseDayState>> = {};

    for (const [date, dayStates] of Object.entries(value as Record<string, unknown>)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isObject(dayStates)) {
            continue;
        }

        const normalizedDayStates: Record<string, BudgetFixedExpenseDayState> = {};

        for (const [expenseId, state] of Object.entries(dayStates as Record<string, unknown>)) {
            if (!expenseId || !isObject(state)) {
                continue;
            }

            const stateValue = state as Record<string, unknown>;
            const amount = stateValue['amount'] === null || stateValue['amount'] === undefined || stateValue['amount'] === ''
                ? null
                : normalizeBudgetAmount(stateValue['amount']);

            if (amount !== null) {
                normalizedDayStates[expenseId] = {
                    amount,
                };
            }
        }

        if (Object.keys(normalizedDayStates).length > 0) {
            result[date] = normalizedDayStates;
        }
    }

    return result;
}

function normalizeWeekdays(value: unknown): WeekDayValue[] {
    if (!isArray(value)) {
        return [];
    }

    const weekdays = new Set<WeekDayValue>();

    for (const item of value) {
        if (isNumber(item) && Number.isInteger(item) && item >= 0 && item <= 6) {
            weekdays.add(item as WeekDayValue);
        }
    }

    return Array.from(weekdays).sort((a, b) => a - b);
}

function normalizeStringArray(value: unknown): string[] {
    if (!isArray(value)) {
        return [];
    }

    const result = new Set<string>();

    for (const item of value) {
        if (isString(item) && item) {
            result.add(item);
        }
    }

    return Array.from(result);
}

function normalizeBudgetAmount(value: unknown): string {
    if (isString(value)) {
        return truncateBudgetAmount(parseBudgetAmount(value)).toString();
    } else if (isNumber(value)) {
        return truncateBudgetAmount(parseBudgetAmount(value)).toString();
    } else {
        return '0';
    }
}

import type { WeekDayValue } from '@/core/datetime.ts';
import type { BigDecimal } from '@/core/numeral.ts';
import {
    BUDGET_PLANNER_DATA_VERSION,
    BUDGET_PLANNER_NEAR_LIMIT_RATIO,
    BudgetDayStatus,
    type BudgetDaySummary,
    type BudgetFixedExpense,
    type BudgetMonthPlan,
    type BudgetMonthSummary,
    type BudgetPlannerData,
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
        useAccountBalance: true,
        fixedExpenses: [],
        includedAccountIds: [],
        includedCategoryIds: [],
        useTransactionTimezone: false,
        manualDailyActuals: {},
    };
}

export function cloneBudgetMonthPlan(plan: BudgetMonthPlan): BudgetMonthPlan {
    return {
        monthlyBudget: plan.monthlyBudget,
        currency: plan.currency,
        useAccountBalance: plan.useAccountBalance,
        fixedExpenses: plan.fixedExpenses.map(expense => ({
            id: expense.id,
            name: expense.name,
            amount: expense.amount,
            weekdays: [...expense.weekdays],
            enabled: expense.enabled,
        })),
        includedAccountIds: [...plan.includedAccountIds],
        includedCategoryIds: [...plan.includedCategoryIds],
        useTransactionTimezone: plan.useTransactionTimezone,
        manualDailyActuals: { ...plan.manualDailyActuals },
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
        manualDailyActuals: {},
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

export function getBudgetFixedExpenseAmount(plan: BudgetMonthPlan, weekday: WeekDayValue): BigDecimal {
    let totalAmount = BIG_DECIMAL_ZERO;

    for (const fixedExpense of plan.fixedExpenses) {
        if (!fixedExpense.enabled || !fixedExpense.weekdays.includes(weekday)) {
            continue;
        }

        totalAmount = totalAmount.add(parseBudgetAmount(fixedExpense.amount));
    }

    return truncateBudgetAmount(totalAmount);
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
        return {
            yearMonth,
            daysInMonth: 0,
            elapsedDays: 0,
            remainingDays: 0,
            monthlyBudget: '0',
            monthSpent: '0',
            monthRemaining: '0',
            fixedToday: '0',
            idealToday: '0',
            flexibleToday: '0',
            actualToday: '0',
            remainingToday: '0',
            overspentDays: 0,
            days: [],
        };
    }

    const { year, month } = parsedYearMonth;
    const daysInMonth = new Date(year, month, 0).getDate();
    const useAccountBalance = plan.useAccountBalance && accountBalance !== undefined && accountBalance !== null;
    const monthlyBudget = useAccountBalance ? parseBudgetAmount(accountBalance) : parseBudgetAmount(plan.monthlyBudget);
    const dailyBudgetAmount = truncateBudgetAmount(monthlyBudget.divide(daysInMonth));
    let remainingBudget = monthlyBudget;
    let monthSpent = BIG_DECIMAL_ZERO;
    let overspentDays = 0;

    const days: BudgetDaySummary[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const date = formatBudgetDate(year, month, day);
        const weekday = new Date(year, month - 1, day).getDay() as WeekDayValue;
        const isFuture = date > today;
        const fixedAmount = getBudgetFixedExpenseAmount(plan, weekday);
        const manualAmount = plan.manualDailyActuals[date];
        const dailyAmount = dailyExpenseAmounts[date];
        const isManualActual = manualAmount !== undefined && manualAmount !== '';
        const hasActualData = isManualActual || dailyAmount !== undefined;
        const actualAmount = truncateBudgetAmount(parseBudgetAmount(isManualActual ? manualAmount : dailyAmount));
        const daysLeft = daysInMonth - day + 1;
        const remainingDailyAmount = remainingBudget.greaterThan(0)
            ? truncateBudgetAmount(remainingBudget.divide(daysLeft))
            : BIG_DECIMAL_ZERO;
        const suggestedAmount = remainingDailyAmount.lessThan(dailyBudgetAmount) ? remainingDailyAmount : dailyBudgetAmount;
        const flexibleAmount = dailyBudgetAmount.subtract(fixedAmount).greaterThan(0)
            ? truncateBudgetAmount(dailyBudgetAmount.subtract(fixedAmount))
            : BIG_DECIMAL_ZERO;
        const deltaAmount = truncateBudgetAmount(actualAmount.subtract(dailyBudgetAmount));
        const remainingAmount = truncateBudgetAmount(dailyBudgetAmount.subtract(actualAmount));
        const status = getBudgetDayStatus(isFuture, hasActualData, actualAmount, dailyBudgetAmount, deltaAmount);

        if (status === BudgetDayStatus.Overspent) {
            overspentDays++;
        }

        days.push({
            date,
            day,
            weekday,
            actualAmount: actualAmount.toString(),
            idealTotalAmount: dailyBudgetAmount.toString(),
            suggestedAmount: suggestedAmount.toString(),
            fixedAmount: fixedAmount.toString(),
            flexibleAmount: flexibleAmount.toString(),
            remainingAmount: remainingAmount.toString(),
            deltaAmount: deltaAmount.toString(),
            hasActualData,
            isManualActual,
            status,
        });

        if (!useAccountBalance) {
            remainingBudget = remainingBudget.subtract(actualAmount);
        }

        monthSpent = monthSpent.add(actualAmount);
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
    const isCurrentMonth = yearMonth === currentYearMonth;
    const suggestedTodayAmount = parseBudgetAmount(isCurrentMonth ? focusDaySummary.suggestedAmount : focusDaySummary.idealTotalAmount);
    const fixedTodayAmount = parseBudgetAmount(focusDaySummary.fixedAmount);
    const actualTodayAmount = parseBudgetAmount(focusDaySummary.actualAmount);
    const flexibleTodayAmount = suggestedTodayAmount.subtract(fixedTodayAmount).greaterThan(0)
        ? truncateBudgetAmount(suggestedTodayAmount.subtract(fixedTodayAmount))
        : BIG_DECIMAL_ZERO;

    return {
        yearMonth,
        daysInMonth,
        elapsedDays,
        remainingDays,
        monthlyBudget: truncateBudgetAmount(monthlyBudget).toString(),
        monthSpent: truncateBudgetAmount(monthSpent).toString(),
        monthRemaining: truncateBudgetAmount(useAccountBalance ? monthlyBudget : monthlyBudget.subtract(monthSpent)).toString(),
        fixedToday: focusDaySummary.fixedAmount,
        idealToday: truncateBudgetAmount(suggestedTodayAmount).toString(),
        flexibleToday: flexibleTodayAmount.toString(),
        actualToday: focusDaySummary.actualAmount,
        remainingToday: truncateBudgetAmount(suggestedTodayAmount.subtract(actualTodayAmount)).toString(),
        overspentDays,
        days,
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

function getBudgetDayStatus(isFuture: boolean, hasActualData: boolean, actualAmount: BigDecimal, idealTotalAmount: BigDecimal, deltaAmount: BigDecimal): BudgetDayStatus {
    if (isFuture) {
        return BudgetDayStatus.Future;
    } else if (!hasActualData) {
        return BudgetDayStatus.NoData;
    } else if (deltaAmount.greaterThan(0)) {
        return BudgetDayStatus.Overspent;
    } else if (idealTotalAmount.greaterThan(0) && actualAmount.greaterThanOrEqual(idealTotalAmount.multiply(BUDGET_PLANNER_NEAR_LIMIT_RATIO))) {
        return BudgetDayStatus.NearLimit;
    } else {
        return BudgetDayStatus.Under;
    }
}

function formatBudgetDate(year: number, month: number, day: number): string {
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function normalizeBudgetMonthPlan(plan: Record<string, unknown>, defaultCurrency: string): BudgetMonthPlan {
    return {
        monthlyBudget: normalizeBudgetAmount(plan['monthlyBudget']),
        currency: isString(plan['currency']) && plan['currency'] ? plan['currency'] : defaultCurrency,
        useAccountBalance: isBoolean(plan['useAccountBalance']) ? plan['useAccountBalance'] : true,
        fixedExpenses: normalizeFixedExpenses(plan['fixedExpenses']),
        includedAccountIds: normalizeStringArray(plan['includedAccountIds']),
        includedCategoryIds: normalizeStringArray(plan['includedCategoryIds']),
        useTransactionTimezone: isBoolean(plan['useTransactionTimezone']) ? plan['useTransactionTimezone'] : false,
        manualDailyActuals: normalizeManualDailyActuals(plan['manualDailyActuals']),
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
        });
    }

    return fixedExpenses;
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

function normalizeManualDailyActuals(value: unknown): Record<string, string> {
    if (!isObject(value)) {
        return {};
    }

    const result: Record<string, string> = {};

    for (const [date, amount] of Object.entries(value as Record<string, unknown>)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            continue;
        }

        result[date] = normalizeBudgetAmount(amount);
    }

    return result;
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

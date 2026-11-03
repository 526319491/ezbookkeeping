import type { WeekDayValue } from './datetime.ts';

export const BUDGET_PLANNER_DATA_VERSION = 2;
export const BUDGET_PLANNER_NEAR_LIMIT_RATIO = 0.9;

export interface BudgetFixedExpense {
    readonly id: string;
    readonly name: string;
    readonly amount: string;
    readonly weekdays: WeekDayValue[];
    readonly enabled: boolean;
    readonly includeInRemaining: boolean;
}

export interface BudgetFixedExpenseDayState {
    readonly amount: string | null;
}

export interface BudgetFixedExpenseDaySummary {
    readonly id: string;
    readonly name: string;
    readonly amount: string;
    readonly includeInRemaining: boolean;
}

export interface BudgetDayTransaction {
    readonly id: string;
    readonly time: number;
    readonly utcOffset: number;
    readonly categoryName: string;
    readonly categoryIconType: number;
    readonly categoryIcon: string;
    readonly categoryColor: string;
    readonly accountName: string;
    readonly amount: string;
    readonly comment: string;
}

export interface BudgetMonthPlan {
    readonly monthlyBudget: string;
    readonly currency: string;
    readonly includeFixedExpensesInRemaining: boolean;
    readonly fixedExpenses: BudgetFixedExpense[];
    readonly fixedExpenseDailyStates: Record<string, Record<string, BudgetFixedExpenseDayState>>;
    readonly includedAccountIds: string[];
    readonly includedCategoryIds: string[];
    readonly useTransactionTimezone: boolean;
}

export interface BudgetPlannerData {
    readonly version: number;
    readonly months: Record<string, BudgetMonthPlan>;
}

export enum BudgetDayStatus {
    NoData = 'no_data',
    Under = 'under',
    NearLimit = 'near_limit',
    Overspent = 'overspent',
    Future = 'future',
}

export interface BudgetDaySummary {
    readonly date: string;
    readonly day: number;
    readonly weekday: WeekDayValue;
    readonly actualAmount: string;
    readonly dailyBudgetAmount: string;
    readonly fixedAmount: string;
    readonly includedFixedAmount: string;
    readonly usedAmount: string;
    readonly remainingAmount: string;
    readonly usagePercent: number;
    readonly fixedExpenses: BudgetFixedExpenseDaySummary[];
    readonly hasActualData: boolean;
    readonly status: BudgetDayStatus;
}

export interface BudgetMonthSummary {
    readonly yearMonth: string;
    readonly daysInMonth: number;
    readonly elapsedDays: number;
    readonly remainingDays: number;
    readonly monthlyBudget: string;
    readonly monthSpent: string;
    readonly monthUsed: string;
    readonly monthRemaining: string;
    readonly fixedToday: string;
    readonly idealToday: string;
    readonly flexibleToday: string;
    readonly actualToday: string;
    readonly usedToday: string;
    readonly remainingToday: string;
    readonly overspentDays: number;
    readonly days: BudgetDaySummary[];
}

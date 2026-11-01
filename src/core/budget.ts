import type { WeekDayValue } from './datetime.ts';

export const BUDGET_PLANNER_DATA_VERSION = 1;
export const BUDGET_PLANNER_NEAR_LIMIT_RATIO = 0.9;

export interface BudgetFixedExpense {
    readonly id: string;
    readonly name: string;
    readonly amount: string;
    readonly weekdays: WeekDayValue[];
    readonly enabled: boolean;
}

export interface BudgetMonthPlan {
    readonly monthlyBudget: string;
    readonly currency: string;
    readonly useAccountBalance: boolean;
    readonly fixedExpenses: BudgetFixedExpense[];
    readonly includedAccountIds: string[];
    readonly includedCategoryIds: string[];
    readonly useTransactionTimezone: boolean;
    readonly manualDailyActuals: Record<string, string>;
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
    readonly idealTotalAmount: string;
    readonly suggestedAmount: string;
    readonly fixedAmount: string;
    readonly flexibleAmount: string;
    readonly remainingAmount: string;
    readonly deltaAmount: string;
    readonly hasActualData: boolean;
    readonly isManualActual: boolean;
    readonly status: BudgetDayStatus;
}

export interface BudgetMonthSummary {
    readonly yearMonth: string;
    readonly daysInMonth: number;
    readonly elapsedDays: number;
    readonly remainingDays: number;
    readonly monthlyBudget: string;
    readonly monthSpent: string;
    readonly monthRemaining: string;
    readonly fixedToday: string;
    readonly idealToday: string;
    readonly flexibleToday: string;
    readonly actualToday: string;
    readonly remainingToday: string;
    readonly overspentDays: number;
    readonly days: BudgetDaySummary[];
}

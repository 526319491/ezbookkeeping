import { describe, expect, it } from 'vitest';

import {
    BudgetDayStatus,
    type BudgetMonthPlan,
} from '@/core/budget.ts';
import {
    buildBudgetMonthSummary,
    createDefaultBudgetMonthPlan,
    getBudgetExcludedIds,
    getBudgetFixedExpenseAmount,
    parseBudgetPlannerData,
    serializeBudgetPlannerData,
} from '@/lib/budget.ts';

function createPlan(overrides?: Partial<BudgetMonthPlan>): BudgetMonthPlan {
    return {
        ...createDefaultBudgetMonthPlan('CNY'),
        ...overrides,
    };
}

describe('getBudgetFixedExpenseAmount', () => {
    const plan = createPlan({
        fixedExpenses: [
            {
                id: 'lunch',
                name: 'Lunch',
                amount: '20',
                weekdays: [1, 2, 3, 4, 5],
                enabled: true,
            },
            {
                id: 'breakfast',
                name: 'Breakfast',
                amount: '8',
                weekdays: [0, 6],
                enabled: true,
            },
            {
                id: 'disabled',
                name: 'Disabled',
                amount: '100',
                weekdays: [1, 2, 3, 4, 5, 6, 0],
                enabled: false,
            },
        ],
    });

    it('returns weekday fixed expenses on a weekday', () => {
        expect(getBudgetFixedExpenseAmount(plan, 1).toString()).toBe('20');
    });

    it('returns weekend fixed expenses on a weekend', () => {
        expect(getBudgetFixedExpenseAmount(plan, 6).toString()).toBe('8');
    });
});

describe('buildBudgetMonthSummary', () => {
    it('uses a stable daily budget when there is no spending', () => {
        const summary = buildBudgetMonthSummary(createPlan({ monthlyBudget: '3000' }), {}, '2026-11', '2026-11-01');

        expect(summary.daysInMonth).toBe(30);
        expect(summary.monthSpent).toBe('0');
        expect(summary.monthRemaining).toBe('3000');
        expect(summary.idealToday).toBe('100');
        expect(summary.days[0]?.idealTotalAmount).toBe('100');
        expect(summary.days[1]?.idealTotalAmount).toBe('100');
        expect(summary.days[1]?.suggestedAmount).toBe('100');
        expect(summary.days[0]?.status).toBe(BudgetDayStatus.NoData);
    });

    it('marks an overspent day and reduces the next day suggested amount', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({ monthlyBudget: '3000' }),
            { '2026-11-01': '150' },
            '2026-11',
            '2026-11-02'
        );

        expect(summary.days[0]?.actualAmount).toBe('150');
        expect(summary.days[0]?.deltaAmount).toBe('50');
        expect(summary.days[0]?.status).toBe(BudgetDayStatus.Overspent);
        expect(summary.days[0]?.idealTotalAmount).toBe('100');
        expect(summary.days[1]?.idealTotalAmount).toBe('100');
        expect(summary.days[1]?.suggestedAmount).toBe('98.27');
        expect(summary.idealToday).toBe('98.27');
        expect(summary.overspentDays).toBe(1);
        expect(summary.monthSpent).toBe('150');
    });

    it('uses the account balance as the current remaining living allowance', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({ useAccountBalance: true }),
            { '2026-11-01': '2000' },
            '2026-11',
            '2026-11-01',
            '150000'
        );

        expect(summary.monthlyBudget).toBe('150000');
        expect(summary.monthSpent).toBe('2000');
        expect(summary.monthRemaining).toBe('150000');
        expect(summary.days[0]?.idealTotalAmount).toBe('5000');
        expect(summary.days[0]?.suggestedAmount).toBe('5000');
        expect(summary.days[0]?.actualAmount).toBe('2000');
        expect(summary.days[0]?.status).toBe(BudgetDayStatus.Under);
        expect(summary.days[1]?.idealTotalAmount).toBe('5000');
    });

    it('lets manual actual spending override transaction amounts', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({
                monthlyBudget: '3000',
                manualDailyActuals: {
                    '2026-11-01': '30',
                },
            }),
            { '2026-11-01': '120' },
            '2026-11',
            '2026-11-01'
        );

        expect(summary.days[0]?.actualAmount).toBe('30');
        expect(summary.days[0]?.isManualActual).toBe(true);
        expect(summary.days[0]?.status).toBe(BudgetDayStatus.Under);
    });

    it('handles leap year February', () => {
        const summary = buildBudgetMonthSummary(createPlan({ monthlyBudget: '2900' }), {}, '2024-02', '2024-02-01');

        expect(summary.daysInMonth).toBe(29);
        expect(summary.idealToday).toBe('100');
    });

    it('marks future days without treating them as overspent', () => {
        const summary = buildBudgetMonthSummary(createPlan({ monthlyBudget: '3000' }), {}, '2026-11', '2026-11-01');

        expect(summary.days[1]?.status).toBe(BudgetDayStatus.Future);
        expect(summary.overspentDays).toBe(0);
    });
});

describe('budget planner data parsing', () => {
    it('falls back to empty data for invalid JSON', () => {
        expect(parseBudgetPlannerData('{invalid', 'CNY').months).toEqual({});
    });

    it('normalizes and serializes planner data', () => {
        const parsed = parseBudgetPlannerData(JSON.stringify({
            version: 1,
            months: {
                '2026-11': {
                    monthlyBudget: '3000',
                    currency: 'CNY',
                    fixedExpenses: [
                        {
                            id: 'lunch',
                            name: 'Lunch',
                            amount: '20',
                            weekdays: [1, 2, 3, 4, 5],
                            enabled: true,
                        },
                    ],
                    includedAccountIds: ['1'],
                    includedCategoryIds: [],
                    useTransactionTimezone: false,
                    manualDailyActuals: {
                        '2026-11-01': '35',
                    },
                },
            },
        }), 'CNY');

        expect(parsed.months['2026-11']?.monthlyBudget).toBe('3000');
        expect(parsed.months['2026-11']?.fixedExpenses[0]?.amount).toBe('20');
        expect(parsed.months['2026-11']?.manualDailyActuals['2026-11-01']).toBe('35');

        const serialized = serializeBudgetPlannerData(parsed);
        const reparsed = parseBudgetPlannerData(serialized, 'CNY');
        expect(reparsed.months['2026-11']?.fixedExpenses[0]?.name).toBe('Lunch');
    });
});

describe('getBudgetExcludedIds', () => {
    it('returns no excluded ids when no filter is selected', () => {
        expect(getBudgetExcludedIds([], ['1', '2', '3'], () => [])).toEqual([]);
    });

    it('expands parent ids and excludes all other ids', () => {
        expect(getBudgetExcludedIds(['1'], ['1', '2', '3', '4'], id => id === '1' ? ['2'] : [])).toEqual(['3', '4']);
    });
});

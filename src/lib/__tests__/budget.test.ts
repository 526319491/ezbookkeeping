import { describe, expect, it } from 'vitest';

import {
    BudgetDayStatus,
    type BudgetMonthPlan,
} from '@/core/budget.ts';
import {
    buildBudgetMonthSummary,
    buildBudgetProgressSummary,
    createDefaultBudgetMonthPlan,
    getBudgetExcludedIds,
    getBudgetFixedExpenseDaySummaries,
    parseBudgetPlannerData,
    serializeBudgetPlannerData,
} from '@/lib/budget.ts';

function createPlan(overrides?: Partial<BudgetMonthPlan>): BudgetMonthPlan {
    return {
        ...createDefaultBudgetMonthPlan('CNY'),
        ...overrides,
    };
}

describe('getBudgetFixedExpenseDaySummaries', () => {
    const plan = createPlan({
        fixedExpenses: [
            {
                id: 'lunch',
                name: 'Lunch',
                amount: '20',
                weekdays: [1, 2, 3, 4, 5],
                enabled: true,
                includeInRemaining: true,
            },
            {
                id: 'breakfast',
                name: 'Breakfast',
                amount: '8',
                weekdays: [0, 6],
                enabled: true,
                includeInRemaining: true,
            },
            {
                id: 'disabled',
                name: 'Disabled',
                amount: '100',
                weekdays: [1, 2, 3, 4, 5, 6, 0],
                enabled: false,
                includeInRemaining: true,
            },
        ],
    });

    it('returns weekday fixed expenses on a weekday', () => {
        const fixedExpenses = getBudgetFixedExpenseDaySummaries(plan, '2026-11-02', 1);

        expect(fixedExpenses).toHaveLength(1);
        expect(fixedExpenses[0]?.id).toBe('lunch');
        expect(fixedExpenses[0]?.amount).toBe('20');
    });

    it('returns weekend fixed expenses on a weekend', () => {
        const fixedExpenses = getBudgetFixedExpenseDaySummaries(plan, '2026-11-01', 0);

        expect(fixedExpenses).toHaveLength(1);
        expect(fixedExpenses[0]?.id).toBe('breakfast');
    });

    it('uses the per-day amount override', () => {
        const fixedExpenses = getBudgetFixedExpenseDaySummaries(createPlan({
            ...plan,
            fixedExpenseDailyStates: {
                '2026-11-02': {
                    lunch: { amount: '25' },
                },
            },
        }), '2026-11-02', 1);

        expect(fixedExpenses[0]?.amount).toBe('25');
    });
});

describe('buildBudgetMonthSummary', () => {
    it('updates the daily budget with the remaining days when there is no spending', () => {
        const summary = buildBudgetMonthSummary(createPlan({ monthlyBudget: '3000' }), {}, '2026-11', '2026-11-01');

        expect(summary.daysInMonth).toBe(30);
        expect(summary.monthSpent).toBe('0');
        expect(summary.monthRemaining).toBe('3000');
        expect(summary.idealToday).toBe('100');
        expect(summary.days[0]?.dailyBudgetAmount).toBe('100');
        expect(summary.days[1]?.dailyBudgetAmount).toBe('103.44');
        expect(summary.days[0]?.status).toBe(BudgetDayStatus.NoData);
    });

    it('marks an overspent day and reduces the next day daily budget', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({ monthlyBudget: '3000' }),
            { '2026-11-01': '150' },
            '2026-11',
            '2026-11-02'
        );

        expect(summary.days[0]?.actualAmount).toBe('150');
        expect(summary.days[0]?.usedAmount).toBe('150');
        expect(summary.days[0]?.usagePercent).toBe(150);
        expect(summary.days[0]?.remainingAmount).toBe('-50');
        expect(summary.days[0]?.status).toBe(BudgetDayStatus.Overspent);
        expect(summary.days[1]?.dailyBudgetAmount).toBe('98.27');
        expect(summary.idealToday).toBe('98.27');
        expect(summary.monthSpent).toBe('150');
        expect(summary.monthRemaining).toBe('2850');
    });

    it('uses the account balance as the current remaining living allowance', () => {
        const summary = buildBudgetMonthSummary(
            createPlan(),
            { '2026-11-01': '2000' },
            '2026-11',
            '2026-11-01',
            '148000'
        );

        expect(summary.monthlyBudget).toBe('150000');
        expect(summary.monthSpent).toBe('2000');
        expect(summary.monthUsed).toBe('2000');
        expect(summary.monthRemaining).toBe('148000');
        expect(summary.days[0]?.dailyBudgetAmount).toBe('5000');
        expect(summary.days[0]?.actualAmount).toBe('2000');
        expect(summary.days[0]?.status).toBe(BudgetDayStatus.Under);
    });

    it('does not apply fixed expenses to past days', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({
                monthlyBudget: '3000',
                includeFixedExpensesInRemaining: true,
                fixedExpenses: [
                    {
                        id: 'lunch',
                        name: 'Lunch',
                        amount: '20',
                        weekdays: [1, 2],
                        enabled: true,
                        includeInRemaining: true,
                    },
                ],
            }),
            {},
            '2026-11',
            '2026-11-03'
        );

        expect(summary.days[1]?.date).toBe('2026-11-02');
        expect(summary.days[1]?.fixedAmount).toBe('20');
        expect(summary.days[1]?.remainingAmount).toBe('103.44');
        expect(summary.days[2]?.date).toBe('2026-11-03');
        expect(summary.days[2]?.fixedAmount).toBe('20');
        expect(summary.days[2]?.remainingAmount).toBe('87.14');
    });

    it('includes fixed expenses in remaining when the switch is enabled', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({
                monthlyBudget: '3000',
                includeFixedExpensesInRemaining: true,
                fixedExpenses: [
                    {
                        id: 'lunch',
                        name: 'Lunch',
                        amount: '20',
                        weekdays: [1],
                        enabled: true,
                        includeInRemaining: true,
                    },
                ],
            }),
            {},
            '2026-11',
            '2026-11-02'
        );

        expect(summary.days[1]?.fixedAmount).toBe('20');
        expect(summary.days[1]?.usedAmount).toBe('0');
        expect(summary.days[1]?.remainingAmount).toBe('83.44');
        expect(summary.days[1]?.dailyBudgetAmount).toBe('103.44');
        expect(summary.days[1]?.usagePercent).toBe(0);
    });

    it('excludes fixed expense items with the item switch disabled', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({
                monthlyBudget: '3000',
                includeFixedExpensesInRemaining: true,
                fixedExpenses: [
                    {
                        id: 'lunch',
                        name: 'Lunch',
                        amount: '20',
                        weekdays: [1],
                        enabled: true,
                        includeInRemaining: false,
                    },
                ],
            }),
            {},
            '2026-11',
            '2026-11-02'
        );

        expect(summary.days[1]?.fixedAmount).toBe('20');
        expect(summary.days[1]?.includedFixedAmount).toBe('0');
        expect(summary.days[1]?.remainingAmount).toBe('103.44');
    });

    it('excludes fixed expenses from remaining when the switch is disabled', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({
                monthlyBudget: '3000',
                includeFixedExpensesInRemaining: false,
                fixedExpenses: [
                    {
                        id: 'lunch',
                        name: 'Lunch',
                        amount: '20',
                        weekdays: [1],
                        enabled: true,
                        includeInRemaining: true,
                    },
                ],
            }),
            {},
            '2026-11',
            '2026-11-02'
        );

        expect(summary.days[1]?.fixedAmount).toBe('20');
        expect(summary.days[1]?.usedAmount).toBe('0');
        expect(summary.days[1]?.remainingAmount).toBe('103.44');
    });

    it('uses the per-day fixed expense amount', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({
                monthlyBudget: '3000',
                includeFixedExpensesInRemaining: true,
                fixedExpenses: [
                    {
                        id: 'lunch',
                        name: 'Lunch',
                        amount: '20',
                        weekdays: [1],
                        enabled: true,
                        includeInRemaining: true,
                    },
                ],
                fixedExpenseDailyStates: {
                    '2026-11-02': {
                        lunch: { amount: '25' },
                    },
                },
            }),
            {},
            '2026-11',
            '2026-11-02'
        );

        expect(summary.days[1]?.fixedAmount).toBe('25');
        expect(summary.days[1]?.usedAmount).toBe('0');
        expect(summary.days[1]?.remainingAmount).toBe('78.44');
    });

    it('does not include fixed expenses in used amount', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({
                monthlyBudget: '3000',
                includeFixedExpensesInRemaining: true,
                fixedExpenses: [
                    {
                        id: 'lunch',
                        name: 'Lunch',
                        amount: '20',
                        weekdays: [1],
                        enabled: true,
                        includeInRemaining: true,
                    },
                ],
            }),
            { '2026-11-02': '35' },
            '2026-11',
            '2026-11-02'
        );

        expect(summary.days[1]?.actualAmount).toBe('35');
        expect(summary.days[1]?.usedAmount).toBe('35');
        expect(summary.days[1]?.remainingAmount).toBe('48.44');
    });

    it('uses only transaction amounts for the actual spending', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({ monthlyBudget: '3000' }),
            { '2026-11-01': '120' },
            '2026-11',
            '2026-11-01'
        );

        expect(summary.days[0]?.actualAmount).toBe('120');
        expect(summary.days[0]?.usedAmount).toBe('120');
        expect(summary.days[0]?.status).toBe(BudgetDayStatus.Overspent);
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

describe('buildBudgetProgressSummary', () => {
    it('summarizes expected and actual spending from the start of the month to today', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({ monthlyBudget: '3000' }),
            { '2026-11-01': '150', '2026-11-02': '150' },
            '2026-11',
            '2026-11-02'
        );
        const progress = buildBudgetProgressSummary(summary, '2026-11', '2026-11-02');

        expect(progress).not.toBeNull();
        expect(progress?.elapsedDays).toBe(2);
        expect(progress?.expectedAmount).toBe('198.27');
        expect(progress?.actualAmount).toBe('300');
        expect(progress?.differenceAmount).toBe('101.73');
    });

    it('returns a negative difference when spending is under the budget', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({ monthlyBudget: '3000' }),
            { '2026-11-01': '50' },
            '2026-11',
            '2026-11-02'
        );
        const progress = buildBudgetProgressSummary(summary, '2026-11', '2026-11-02');

        expect(progress).not.toBeNull();
        expect(progress?.expectedAmount).toBe('201.72');
        expect(progress?.actualAmount).toBe('50');
        expect(progress?.differenceAmount).toBe('-151.72');
    });

    it('returns null when there are no elapsed days', () => {
        const summary = buildBudgetMonthSummary(createPlan({ monthlyBudget: '3000' }), {}, '2026-12', '2026-11-07');

        expect(summary.elapsedDays).toBe(0);
        expect(buildBudgetProgressSummary(summary, '2026-12', '2026-11-07')).toBeNull();
    });

    it('returns null when the expected amount is zero', () => {
        const summary = buildBudgetMonthSummary(createPlan({ monthlyBudget: '0' }), {}, '2026-11', '2026-11-01');

        expect(summary.elapsedDays).toBe(1);
        expect(buildBudgetProgressSummary(summary, '2026-11', '2026-11-01')).toBeNull();
    });

    it('covers the whole month for a past month', () => {
        const summary = buildBudgetMonthSummary(
            createPlan({ monthlyBudget: '3000' }),
            { '2026-10-15': '200' },
            '2026-10',
            '2026-11-08'
        );
        const progress = buildBudgetProgressSummary(summary, '2026-10', '2026-11-08');

        expect(progress).not.toBeNull();
        expect(progress?.elapsedDays).toBe(31);
        expect(progress?.actualAmount).toBe(summary.monthUsed);
        expect(progress?.differenceAmount).not.toBe('0');
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
                    useAccountBalance: false,
                    includeFixedExpensesInRemaining: false,
                    fixedExpenses: [
                        {
                            id: 'lunch',
                            name: 'Lunch',
                            amount: '20',
                            weekdays: [1, 2, 3, 4, 5],
                            enabled: true,
                            includeInRemaining: true,
                        },
                    ],
                    fixedExpenseDailyStates: {
                        '2026-11-02': {
                            lunch: {
                                amount: '25',
                            },
                        },
                    },
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
        expect(parsed.months['2026-11']?.includeFixedExpensesInRemaining).toBe(false);
        expect(parsed.months['2026-11']?.fixedExpenses[0]?.amount).toBe('20');
        expect(parsed.months['2026-11']?.fixedExpenseDailyStates['2026-11-02']?.['lunch']?.amount).toBe('25');

        const parsedMonth = parsed.months['2026-11'] as unknown as Record<string, unknown>;
        expect(parsed.version).toBe(2);
        expect(parsedMonth['useAccountBalance']).toBeUndefined();
        expect(parsedMonth['manualDailyActuals']).toBeUndefined();

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

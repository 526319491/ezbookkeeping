import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import moment from 'moment';

import { useSettingsStore } from '@/stores/setting.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useTransactionCategoriesStore } from '@/stores/transactionCategory.ts';
import { useUserStore } from '@/stores/user.ts';

import {
    type BudgetFixedExpense,
    type BudgetMonthPlan,
    type BudgetMonthSummary,
    type BudgetPlannerData,
    BUDGET_PLANNER_DATA_VERSION,
} from '@/core/budget.ts';
import type { WeekDayValue } from '@/core/datetime.ts';

import { DEFAULT_CURRENCY_CODE } from '@/consts/currency.ts';

import { BIG_DECIMAL_ZERO } from '@/lib/numeral.ts';
import services from '@/lib/services.ts';
import logger from '@/lib/logger.ts';
import {
    buildBudgetMonthSummary,
    cloneBudgetMonthPlan,
    createInheritedBudgetMonthPlan,
    getBudgetExcludedIds,
    getCurrentYearMonth,
    getTodayDate,
    parseBudgetAmount,
    parseBudgetPlannerData,
    parseYearMonth,
    serializeBudgetPlannerData,
    truncateBudgetAmount,
} from '@/lib/budget.ts';

export const useBudgetStore = defineStore('budget', () => {
    const settingsStore = useSettingsStore();
    const accountsStore = useAccountsStore();
    const transactionCategoriesStore = useTransactionCategoriesStore();
    const userStore = useUserStore();

    const defaultCurrency = computed<string>(() => userStore.currentUserDefaultCurrency || DEFAULT_CURRENCY_CODE);
    const plannerData = ref<BudgetPlannerData>(parseBudgetPlannerData(settingsStore.appSettings.budgetPlannerData, defaultCurrency.value));
    const selectedYearMonth = ref<string>(getCurrentYearMonth());
    const dailyExpenseAmounts = ref<Record<string, string>>({});
    const hasOtherCurrencyData = ref<boolean>(false);
    const dailyExpenseStateInvalid = ref<boolean>(true);
    const loading = ref<boolean>(false);
    const error = ref<unknown | null>(null);

    let loadRequestId = 0;

    const today = computed<string>(() => getTodayDate());
    const currentYearMonth = computed<string>(() => getCurrentYearMonth());

    const currentPlan = computed<BudgetMonthPlan>(() => {
        return plannerData.value.months[selectedYearMonth.value] ?? createInheritedBudgetMonthPlan(plannerData.value, selectedYearMonth.value, defaultCurrency.value);
    });

    const accountBalance = computed<string>(() => {
        const plan = currentPlan.value;
        const includedAccountIds = new Set<string>(plan.includedAccountIds);

        for (const accountId of plan.includedAccountIds) {
            const account = accountsStore.allAccountsMap[accountId];

            if (account?.subAccounts) {
                for (const subAccount of account.subAccounts) {
                    includedAccountIds.add(subAccount.id);
                }
            }
        }

        let totalBalance = BIG_DECIMAL_ZERO;

        for (const account of accountsStore.allPlainAccounts) {
            if (includedAccountIds.size > 0 && !includedAccountIds.has(account.id)) {
                continue;
            }

            if (account.currency !== plan.currency) {
                continue;
            }

            totalBalance = totalBalance.add(parseBudgetAmount(account.balance));
        }

        return truncateBudgetAmount(totalBalance).toString();
    });

    const hasOtherCurrencyAccountBalance = computed<boolean>(() => {
        const plan = currentPlan.value;
        const includedAccountIds = new Set<string>(plan.includedAccountIds);

        for (const accountId of plan.includedAccountIds) {
            const account = accountsStore.allAccountsMap[accountId];

            if (account?.subAccounts) {
                for (const subAccount of account.subAccounts) {
                    includedAccountIds.add(subAccount.id);
                }
            }
        }

        for (const account of accountsStore.allPlainAccounts) {
            if (includedAccountIds.size > 0 && !includedAccountIds.has(account.id)) {
                continue;
            }

            if (account.currency !== plan.currency && !parseBudgetAmount(account.balance).isZero()) {
                return true;
            }
        }

        return false;
    });

    const isAccountBalanceActive = computed<boolean>(() => currentPlan.value.useAccountBalance && selectedYearMonth.value === currentYearMonth.value);

    const currentSummary = computed<BudgetMonthSummary>(() => {
        const accountBalanceForSummary = isAccountBalanceActive.value ? accountBalance.value : null;
        return buildBudgetMonthSummary(currentPlan.value, dailyExpenseAmounts.value, selectedYearMonth.value, today.value, accountBalanceForSummary);
    });

    watch(() => settingsStore.appSettings.budgetPlannerData, (newValue) => {
        plannerData.value = parseBudgetPlannerData(newValue, defaultCurrency.value);
        dailyExpenseStateInvalid.value = true;
    });

    function persistPlannerData(): void {
        settingsStore.setBudgetPlannerData(serializeBudgetPlannerData(plannerData.value));
    }

    function setMonthPlan(yearMonth: string, plan: BudgetMonthPlan): void {
        plannerData.value = {
            version: BUDGET_PLANNER_DATA_VERSION,
            months: {
                ...plannerData.value.months,
                [yearMonth]: plan,
            },
        };

        persistPlannerData();
    }

    function ensureCurrentPlan(): BudgetMonthPlan {
        const existingPlan = plannerData.value.months[selectedYearMonth.value];

        if (existingPlan) {
            return existingPlan;
        }

        const newPlan = createInheritedBudgetMonthPlan(plannerData.value, selectedYearMonth.value, defaultCurrency.value);
        setMonthPlan(selectedYearMonth.value, newPlan);
        return newPlan;
    }

    function updateCurrentPlan(updater: (plan: BudgetMonthPlan) => BudgetMonthPlan): BudgetMonthPlan {
        const currentPlanValue = ensureCurrentPlan();
        const updatedPlan = updater(cloneBudgetMonthPlan(currentPlanValue));
        setMonthPlan(selectedYearMonth.value, updatedPlan);
        return updatedPlan;
    }

    function setSelectedYearMonth(yearMonth: string): void {
        if (!parseYearMonth(yearMonth) || selectedYearMonth.value === yearMonth) {
            return;
        }

        selectedYearMonth.value = yearMonth;
        dailyExpenseAmounts.value = {};
        hasOtherCurrencyData.value = false;
        dailyExpenseStateInvalid.value = true;
        error.value = null;
    }

    function setMonthlyBudget(value: string | number): void {
        updateCurrentPlan(plan => ({
            ...plan,
            monthlyBudget: truncateBudgetAmount(parseBudgetAmount(value)).toString(),
        }));
        dailyExpenseStateInvalid.value = true;
    }

    function setUseTransactionTimezone(value: boolean): void {
        updateCurrentPlan(plan => ({ ...plan, useTransactionTimezone: value }));
        dailyExpenseStateInvalid.value = true;
    }

    function setUseAccountBalance(value: boolean): void {
        updateCurrentPlan(plan => ({ ...plan, useAccountBalance: value }));
    }

    function setIncludedAccountIds(accountIds: string[]): void {
        updateCurrentPlan(plan => ({ ...plan, includedAccountIds: [...accountIds] }));
        dailyExpenseStateInvalid.value = true;
    }

    function setIncludedCategoryIds(categoryIds: string[]): void {
        updateCurrentPlan(plan => ({ ...plan, includedCategoryIds: [...categoryIds] }));
        dailyExpenseStateInvalid.value = true;
    }

    function addFixedExpense(name: string, amount: string | number): void {
        updateCurrentPlan(plan => ({
            ...plan,
            fixedExpenses: [
                ...plan.fixedExpenses,
                {
                    id: createLocalId(),
                    name: name,
                    amount: truncateBudgetAmount(parseBudgetAmount(amount)).toString(),
                    weekdays: [1, 2, 3, 4, 5] as WeekDayValue[],
                    enabled: true,
                },
            ],
        }));
    }

    function updateFixedExpense(expense: BudgetFixedExpense): void {
        updateCurrentPlan(plan => ({
            ...plan,
            fixedExpenses: plan.fixedExpenses.map(item => item.id === expense.id ? expense : item),
        }));
    }

    function removeFixedExpense(id: string): void {
        updateCurrentPlan(plan => ({
            ...plan,
            fixedExpenses: plan.fixedExpenses.filter(item => item.id !== id),
        }));
    }

    function setManualActual(date: string, amount: string | number | null): void {
        updateCurrentPlan(plan => {
            const manualDailyActuals = { ...plan.manualDailyActuals };

            if (amount === null || amount === '') {
                delete manualDailyActuals[date];
            } else {
                manualDailyActuals[date] = truncateBudgetAmount(parseBudgetAmount(amount)).toString();
            }

            return {
                ...plan,
                manualDailyActuals,
            };
        });
    }

    function updateStoreInvalidState(invalidState: boolean): void {
        dailyExpenseStateInvalid.value = invalidState;
    }

    function loadCurrentMonthData({ force }: { force: boolean }): Promise<void> {
        ensureCurrentPlan();

        if (!force && !dailyExpenseStateInvalid.value) {
            return Promise.resolve();
        }

        const yearMonth = selectedYearMonth.value;
        const parsedYearMonth = parseYearMonth(yearMonth);

        if (!parsedYearMonth) {
            return Promise.reject({ message: 'Invalid month' });
        }

        const requestId = ++loadRequestId;
        loading.value = true;
        error.value = null;

        const monthMoment = moment({ year: parsedYearMonth.year, month: parsedYearMonth.month - 1, day: 1 });
        const startTime = monthMoment.clone().startOf('month').unix();
        const endTime = monthMoment.clone().endOf('month').unix();
        const plan = currentPlan.value;

        if (force) {
            accountsStore.updateAccountListInvalidState(true);
        }

        return Promise.all([
            accountsStore.loadAllAccounts({ force: false }),
            transactionCategoriesStore.loadAllCategories({ force: false }),
        ]).then(() => {
            if (requestId !== loadRequestId) {
                return;
            }

            const allAccountIds = Object.keys(accountsStore.allAccountsMap);
            const allCategoryIds = Object.keys(transactionCategoriesStore.allTransactionCategoriesMap);
            const excludedAccountIds = getBudgetExcludedIds(plan.includedAccountIds, allAccountIds, accountId => {
                const account = accountsStore.allAccountsMap[accountId];
                return account?.subAccounts?.map(subAccount => subAccount.id) ?? [];
            });
            const excludedCategoryIds = getBudgetExcludedIds(plan.includedCategoryIds, allCategoryIds, categoryId => {
                const category = transactionCategoriesStore.allTransactionCategoriesMap[categoryId];
                return category?.subCategories?.map(subCategory => subCategory.id) ?? [];
            });

            return services.getTransactionDailyAmounts({
                startTime: startTime,
                endTime: endTime,
                useTransactionTimezone: plan.useTransactionTimezone,
                excludeAccountIds: excludedAccountIds,
                excludeCategoryIds: excludedCategoryIds,
                tagFilter: '',
            }).then(response => {
                if (requestId !== loadRequestId) {
                    return;
                }

                const data = response.data;

                if (!data || !data.success || !data.result) {
                    throw { message: 'Unable to retrieve budget daily expenses' };
                }

                const dailyAmounts: Record<string, string> = {};
                let hasOtherCurrency = false;

                for (const item of data.result) {
                    let dailyAmount = BIG_DECIMAL_ZERO;

                    for (const amountInfo of item.amounts) {
                        if (amountInfo.currency !== plan.currency) {
                            if (parseBudgetAmount(amountInfo.expenseAmount).greaterThan(0)) {
                                hasOtherCurrency = true;
                            }

                            continue;
                        }

                        dailyAmount = dailyAmount.add(parseBudgetAmount(amountInfo.expenseAmount));
                    }

                    dailyAmounts[item.date] = truncateBudgetAmount(dailyAmount).toString();
                }

                dailyExpenseAmounts.value = dailyAmounts;
                hasOtherCurrencyData.value = hasOtherCurrency;
                dailyExpenseStateInvalid.value = false;
                loading.value = false;
            });
        }).catch(err => {
            if (requestId !== loadRequestId) {
                return;
            }

            loading.value = false;
            error.value = err;
            logger.error('failed to load budget planner data', err);
            throw err;
        });
    }

    function resetBudget(): void {
        plannerData.value = {
            version: BUDGET_PLANNER_DATA_VERSION,
            months: {},
        };
        dailyExpenseAmounts.value = {};
        hasOtherCurrencyData.value = false;
        dailyExpenseStateInvalid.value = true;
        persistPlannerData();
    }

    return {
        // states
        plannerData,
        selectedYearMonth,
        dailyExpenseAmounts,
        hasOtherCurrencyData,
        dailyExpenseStateInvalid,
        loading,
        error,
        // computed states
        today,
        currentYearMonth,
        currentPlan,
        currentSummary,
        accountBalance,
        hasOtherCurrencyAccountBalance,
        isAccountBalanceActive,
        // functions
        setSelectedYearMonth,
        setMonthlyBudget,
        setUseAccountBalance,
        setUseTransactionTimezone,
        setIncludedAccountIds,
        setIncludedCategoryIds,
        addFixedExpense,
        updateFixedExpense,
        removeFixedExpense,
        setManualActual,
        updateStoreInvalidState,
        loadCurrentMonthData,
        resetBudget,
    };
});

function createLocalId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

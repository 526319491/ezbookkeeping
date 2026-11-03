import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import moment from 'moment-timezone';

import { useSettingsStore } from '@/stores/setting.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useTransactionCategoriesStore } from '@/stores/transactionCategory.ts';
import { useUserStore } from '@/stores/user.ts';

import {
    type BudgetDayTransaction,
    type BudgetFixedExpense,
    type BudgetFixedExpenseDayState,
    type BudgetMonthPlan,
    type BudgetMonthSummary,
    type BudgetPlannerData,
    BUDGET_PLANNER_DATA_VERSION,
} from '@/core/budget.ts';
import type { WeekDayValue } from '@/core/datetime.ts';
import { TransactionType } from '@/core/transaction.ts';

import { DEFAULT_CURRENCY_CODE } from '@/consts/currency.ts';

import { getBrowserTimezoneName } from '@/lib/datetime.ts';
import { BIG_DECIMAL_ZERO } from '@/lib/numeral.ts';
import services from '@/lib/services.ts';
import logger from '@/lib/logger.ts';
import { getTimeZone, updateApplicationSettingsValue } from '@/lib/settings.ts';
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
    const saving = ref<boolean>(false);
    const error = ref<unknown | null>(null);
    const saveError = ref<unknown | null>(null);
    const budgetPlanLoaded = ref<boolean>(false);

    let loadRequestId = 0;
    let loadBudgetPlanPromise: Promise<void> | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

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

    const isAccountBalanceActive = computed<boolean>(() => selectedYearMonth.value === currentYearMonth.value);

    const currentSummary = computed<BudgetMonthSummary>(() => {
        const accountBalanceForSummary = isAccountBalanceActive.value ? accountBalance.value : null;
        return buildBudgetMonthSummary(currentPlan.value, dailyExpenseAmounts.value, selectedYearMonth.value, today.value, accountBalanceForSummary);
    });

    function getExcludedAccountIds(plan: BudgetMonthPlan): string[] {
        const allAccountIds = Object.keys(accountsStore.allAccountsMap);
        return getBudgetExcludedIds(plan.includedAccountIds, allAccountIds, accountId => {
            const account = accountsStore.allAccountsMap[accountId];
            return account?.subAccounts?.map(subAccount => subAccount.id) ?? [];
        });
    }

    function getExcludedCategoryIds(plan: BudgetMonthPlan): string[] {
        const allCategoryIds = Object.keys(transactionCategoriesStore.allTransactionCategoriesMap);
        return getBudgetExcludedIds(plan.includedCategoryIds, allCategoryIds, categoryId => {
            const category = transactionCategoriesStore.allTransactionCategoriesMap[categoryId];
            return category?.subCategories?.map(subCategory => subCategory.id) ?? [];
        });
    }

    function loadDayTransactions(date: string): Promise<BudgetDayTransaction[]> {
        return Promise.all([
            loadBudgetPlan(),
            accountsStore.loadAllAccounts({ force: false }),
            transactionCategoriesStore.loadAllCategories({ force: false }),
        ]).then(() => {
            const plan = currentPlan.value;
            const timezoneName = getTimeZone() || getBrowserTimezoneName();
            const dayMoment = moment.tz(date, 'YYYY-MM-DD', timezoneName);

            if (!dayMoment.isValid()) {
                throw { message: 'Invalid date' };
            }

            const dayStart = dayMoment.clone().startOf('day');
            const dayEnd = dayMoment.clone().endOf('day');
            const startLocalKey = dayStart.format('YYYYMMDDHHmmss');
            const endLocalKey = dayEnd.format('YYYYMMDDHHmmss');
            const excludedAccountIds = new Set<string>(getExcludedAccountIds(plan));
            const excludedCategoryIds = new Set<string>(getExcludedCategoryIds(plan));

            return services.getAllTransactions({
                startTime: dayStart.unix(),
                endTime: dayEnd.unix(),
                withPictures: false,
            }).then(response => {
                const data = response.data;

                if (!data || !data.success) {
                    throw { message: 'Unable to retrieve day transactions' };
                }

                const transactions: BudgetDayTransaction[] = [];
                const items = Array.isArray(data.result) ? data.result : [];

                for (const item of items) {
                    if (item.type !== TransactionType.Expense || excludedAccountIds.has(item.sourceAccountId) || excludedCategoryIds.has(item.categoryId)) {
                        continue;
                    }

                    const account = accountsStore.allAccountsMap[item.sourceAccountId];

                    if (!account || account.currency !== plan.currency) {
                        continue;
                    }

                    const transactionTime = plan.useTransactionTimezone
                        ? moment.unix(item.time).utcOffset(item.utcOffset)
                        : moment.unix(item.time).tz(timezoneName);
                    const localKey = transactionTime.format('YYYYMMDDHHmmss');

                    if (localKey < startLocalKey || localKey > endLocalKey) {
                        continue;
                    }

                    const category = transactionCategoriesStore.allTransactionCategoriesMap[item.categoryId];

                    transactions.push({
                        id: item.id,
                        time: item.time,
                        utcOffset: item.utcOffset,
                        categoryName: category?.name ?? '',
                        categoryIconType: category?.iconType ?? 0,
                        categoryIcon: category?.icon ?? '',
                        categoryColor: category?.color ?? '',
                        accountName: account.name,
                        amount: truncateBudgetAmount(parseBudgetAmount(item.sourceAmount)).toString(),
                        comment: item.comment,
                    });
                }

                transactions.sort((a, b) => a.time - b.time);
                return transactions;
            });
        });
    }

    function loadBudgetPlan(): Promise<void> {
        if (budgetPlanLoaded.value) {
            return Promise.resolve();
        }

        if (loadBudgetPlanPromise) {
            return loadBudgetPlanPromise;
        }

        loadBudgetPlanPromise = services.getUserBudgetPlan().then(response => {
            const data = response.data;

            if (!data || !data.success) {
                throw { message: 'Unable to retrieve budget plan' };
            }

            if (data.result && typeof data.result === 'object' && data.result.data) {
                const rawData = data.result.data;
                const rawVersion = typeof rawData['version'] === 'number' ? rawData['version'] : 0;
                const rawMonths = rawData['months'];
                const hasLegacyManualActuals = rawMonths && typeof rawMonths === 'object'
                    && Object.values(rawMonths as Record<string, unknown>).some(month => month && typeof month === 'object' && 'manualDailyActuals' in month);

                plannerData.value = parseBudgetPlannerData(JSON.stringify(rawData), defaultCurrency.value);
                budgetPlanLoaded.value = true;

                if (rawVersion !== BUDGET_PLANNER_DATA_VERSION || hasLegacyManualActuals) {
                    ensureCurrentPlan();
                    savePlannerData().catch(() => undefined);
                }

                return;
            }

            const legacyData = settingsStore.appSettings.budgetPlannerData;

            if (legacyData) {
                plannerData.value = parseBudgetPlannerData(legacyData, defaultCurrency.value);
                budgetPlanLoaded.value = true;
                return savePlannerData().then(() => {
                    settingsStore.appSettings.budgetPlannerData = '';
                    updateApplicationSettingsValue('budgetPlannerData', '');
                });
            }

            plannerData.value = {
                version: BUDGET_PLANNER_DATA_VERSION,
                months: {},
            };
            budgetPlanLoaded.value = true;
            return;
        }).catch(err => {
            logger.error('failed to load budget plan', err);
            error.value = err;
            throw err;
        }).finally(() => {
            loadBudgetPlanPromise = null;
        });

        return loadBudgetPlanPromise;
    }

    function savePlannerData(): Promise<void> {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }

        if (!budgetPlanLoaded.value) {
            return Promise.resolve();
        }

        saving.value = true;
        saveError.value = null;

        const data = JSON.parse(serializeBudgetPlannerData(plannerData.value)) as Record<string, unknown>;

        return services.updateUserBudgetPlan({ data: data }).then(response => {
            const result = response.data;

            if (!result || !result.success) {
                throw { message: 'Unable to save budget plan' };
            }

            saving.value = false;
        }).catch(err => {
            logger.error('failed to save budget plan', err);
            saving.value = false;
            saveError.value = err;
            throw err;
        });
    }

    function scheduleSave(): void {
        if (!budgetPlanLoaded.value) {
            return;
        }

        if (saveTimer) {
            clearTimeout(saveTimer);
        }

        saveTimer = setTimeout(() => {
            saveTimer = null;
            savePlannerData().catch(() => undefined);
        }, 500);
    }

    function setMonthPlan(yearMonth: string, plan: BudgetMonthPlan): void {
        plannerData.value = {
            version: BUDGET_PLANNER_DATA_VERSION,
            months: {
                ...plannerData.value.months,
                [yearMonth]: plan,
            },
        };

        scheduleSave();
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

    function setUseTransactionTimezone(value: boolean): void {
        updateCurrentPlan(plan => ({ ...plan, useTransactionTimezone: value }));
        dailyExpenseStateInvalid.value = true;
    }

    function setIncludeFixedExpensesInRemaining(value: boolean): void {
        updateCurrentPlan(plan => ({ ...plan, includeFixedExpensesInRemaining: value }));
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
                    includeInRemaining: true,
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
        updateCurrentPlan(plan => {
            const fixedExpenseDailyStates: Record<string, Record<string, BudgetFixedExpenseDayState>> = {};

            for (const [date, dayStates] of Object.entries(plan.fixedExpenseDailyStates)) {
                const newDayStates: Record<string, BudgetFixedExpenseDayState> = {};

                for (const [expenseId, state] of Object.entries(dayStates)) {
                    if (expenseId !== id) {
                        newDayStates[expenseId] = state;
                    }
                }

                if (Object.keys(newDayStates).length > 0) {
                    fixedExpenseDailyStates[date] = newDayStates;
                }
            }

            return {
                ...plan,
                fixedExpenses: plan.fixedExpenses.filter(item => item.id !== id),
                fixedExpenseDailyStates: fixedExpenseDailyStates,
            };
        });
    }

    function setFixedExpenseDayAmount(date: string, expenseId: string, amount: string | number | null): void {
        updateCurrentPlan(plan => {
            const dayStates = { ...(plan.fixedExpenseDailyStates[date] ?? {}) };
            const normalizedAmount = amount === null || amount === '' ? null : truncateBudgetAmount(parseBudgetAmount(amount)).toString();

            if (normalizedAmount === null) {
                delete dayStates[expenseId];
            } else {
                dayStates[expenseId] = {
                    amount: normalizedAmount,
                };
            }

            const fixedExpenseDailyStates = { ...plan.fixedExpenseDailyStates };

            if (Object.keys(dayStates).length > 0) {
                fixedExpenseDailyStates[date] = dayStates;
            } else {
                delete fixedExpenseDailyStates[date];
            }

            return {
                ...plan,
                fixedExpenseDailyStates,
            };
        });
    }

    function clearFixedExpenseDayState(date: string, expenseId: string): void {
        updateCurrentPlan(plan => {
            const dayStates = { ...(plan.fixedExpenseDailyStates[date] ?? {}) };
            delete dayStates[expenseId];

            const fixedExpenseDailyStates = { ...plan.fixedExpenseDailyStates };

            if (Object.keys(dayStates).length > 0) {
                fixedExpenseDailyStates[date] = dayStates;
            } else {
                delete fixedExpenseDailyStates[date];
            }

            return {
                ...plan,
                fixedExpenseDailyStates,
            };
        });
    }

    function updateStoreInvalidState(invalidState: boolean): void {
        dailyExpenseStateInvalid.value = invalidState;
    }

    function loadCurrentMonthData({ force }: { force: boolean }): Promise<void> {
        return loadBudgetPlan().then(() => {
            ensureCurrentPlan();

            if (!force && !dailyExpenseStateInvalid.value) {
                return;
            }

            const yearMonth = selectedYearMonth.value;
            const parsedYearMonth = parseYearMonth(yearMonth);

            if (!parsedYearMonth) {
                throw { message: 'Invalid month' };
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
        }).catch(err => {
            loading.value = false;
            error.value = err;
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
        budgetPlanLoaded.value = true;
        savePlannerData().catch(() => undefined);
    }

    return {
        // states
        plannerData,
        selectedYearMonth,
        dailyExpenseAmounts,
        hasOtherCurrencyData,
        dailyExpenseStateInvalid,
        loading,
        saving,
        error,
        saveError,
        budgetPlanLoaded,
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
        setIncludeFixedExpensesInRemaining,
        setUseTransactionTimezone,
        setIncludedAccountIds,
        setIncludedCategoryIds,
        addFixedExpense,
        updateFixedExpense,
        removeFixedExpense,
        setFixedExpenseDayAmount,
        clearFixedExpenseDayState,
        updateStoreInvalidState,
        loadCurrentMonthData,
        loadDayTransactions,
        loadBudgetPlan,
        savePlannerData,
        resetBudget,
    };
});

function createLocalId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

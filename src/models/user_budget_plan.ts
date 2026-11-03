export interface UserBudgetPlanResponse {
    readonly data: Record<string, unknown>;
    readonly updatedUnixTime: number;
}

export interface UserBudgetPlanUpdateRequest {
    readonly data: Record<string, unknown>;
}

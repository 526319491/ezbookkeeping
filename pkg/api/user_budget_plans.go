package api

import (
	"encoding/json/v2"

	"github.com/mayswind/ezbookkeeping/pkg/core"
	"github.com/mayswind/ezbookkeeping/pkg/errs"
	"github.com/mayswind/ezbookkeeping/pkg/log"
	"github.com/mayswind/ezbookkeeping/pkg/models"
	"github.com/mayswind/ezbookkeeping/pkg/services"
)

// UserBudgetPlansApi represents user budget plan api
type UserBudgetPlansApi struct {
	userBudgetPlans *services.UserBudgetPlanService
}

// Initialize a user budget plan api singleton instance
var (
	UserBudgetPlans = &UserBudgetPlansApi{
		userBudgetPlans: services.UserBudgetPlans,
	}
)

// UserBudgetPlanGetHandler returns budget plan of current user
func (a *UserBudgetPlansApi) UserBudgetPlanGetHandler(c *core.WebContext) (any, *errs.Error) {
	uid := c.GetCurrentUid()
	userBudgetPlan, err := a.userBudgetPlans.GetUserBudgetPlanByUid(c, uid)

	if err != nil {
		log.Errorf(c, "[user_budget_plans.UserBudgetPlanGetHandler] failed to get budget plan for user \"uid:%d\", because %s", uid, err.Error())
		return nil, errs.Or(err, errs.ErrOperationFailed)
	}

	if userBudgetPlan == nil {
		return false, nil
	}

	budgetPlanResp, err := userBudgetPlan.ToUserBudgetPlanResponse()

	if err != nil {
		log.Errorf(c, "[user_budget_plans.UserBudgetPlanGetHandler] failed to parse budget plan for user \"uid:%d\", because %s", uid, err.Error())
		return nil, errs.ErrOperationFailed
	}

	return budgetPlanResp, nil
}

// UserBudgetPlanUpdateHandler updates budget plan for current user
func (a *UserBudgetPlansApi) UserBudgetPlanUpdateHandler(c *core.WebContext) (any, *errs.Error) {
	var userBudgetPlanUpdateReq models.UserBudgetPlanUpdateRequest
	err := c.ShouldBindJSON(&userBudgetPlanUpdateReq)

	if err != nil {
		log.Warnf(c, "[user_budget_plans.UserBudgetPlanUpdateHandler] parse request failed, because %s", err.Error())
		return false, errs.NewIncompleteOrIncorrectSubmissionError(err)
	}

	data, err := json.Marshal(userBudgetPlanUpdateReq.Data)

	if err != nil {
		log.Warnf(c, "[user_budget_plans.UserBudgetPlanUpdateHandler] marshal request failed, because %s", err.Error())
		return false, errs.NewIncompleteOrIncorrectSubmissionError(err)
	}

	uid := c.GetCurrentUid()
	err = a.userBudgetPlans.UpdateUserBudgetPlan(c, uid, string(data))

	if err != nil {
		log.Errorf(c, "[user_budget_plans.UserBudgetPlanUpdateHandler] failed to update budget plan for user \"uid:%d\", because %s", uid, err.Error())
		return false, errs.Or(err, errs.ErrOperationFailed)
	}

	return true, nil
}

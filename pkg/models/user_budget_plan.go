package models

import "encoding/json/v2"

// UserBudgetPlan represents the budget planner data stored in database
type UserBudgetPlan struct {
	Uid             int64  `xorm:"PK"`
	Data            string `xorm:"MEDIUMBLOB"`
	UpdatedUnixTime int64
}

// UserBudgetPlanUpdateRequest represents all parameters of budget plan update request
type UserBudgetPlanUpdateRequest struct {
	Data map[string]any `json:"data" binding:"required"`
}

// UserBudgetPlanResponse represents a view-object of budget plan data
type UserBudgetPlanResponse struct {
	Data            map[string]any `json:"data"`
	UpdatedUnixTime int64          `json:"updatedUnixTime"`
}

// ToUserBudgetPlanResponse returns a view-object according to database model
func (p *UserBudgetPlan) ToUserBudgetPlanResponse() (*UserBudgetPlanResponse, error) {
	var data map[string]any = nil

	if p.Data != "" {
		err := json.Unmarshal([]byte(p.Data), &data)

		if err != nil {
			return nil, err
		}
	}

	return &UserBudgetPlanResponse{
		Data:            data,
		UpdatedUnixTime: p.UpdatedUnixTime,
	}, nil
}

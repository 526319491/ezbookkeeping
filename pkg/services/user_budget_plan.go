package services

import (
	"time"

	"xorm.io/xorm"

	"github.com/mayswind/ezbookkeeping/pkg/core"
	"github.com/mayswind/ezbookkeeping/pkg/datastore"
	"github.com/mayswind/ezbookkeeping/pkg/errs"
	"github.com/mayswind/ezbookkeeping/pkg/models"
)

// UserBudgetPlanService represents user budget plan service
type UserBudgetPlanService struct {
	ServiceUsingDB
}

// Initialize a user budget plan service singleton instance
var (
	UserBudgetPlans = &UserBudgetPlanService{
		ServiceUsingDB: ServiceUsingDB{
			container: datastore.Container,
		},
	}
)

// GetUserBudgetPlanByUid returns user budget plan model of user
func (s *UserBudgetPlanService) GetUserBudgetPlanByUid(c core.Context, uid int64) (*models.UserBudgetPlan, error) {
	if uid <= 0 {
		return nil, errs.ErrUserIdInvalid
	}

	userBudgetPlan := &models.UserBudgetPlan{}
	has, err := s.UserDB().NewSession(c).ID(uid).Get(userBudgetPlan)

	if err != nil {
		return nil, err
	} else if !has {
		return nil, nil
	}

	return userBudgetPlan, nil
}

// UpdateUserBudgetPlan updates user budget plan
func (s *UserBudgetPlanService) UpdateUserBudgetPlan(c core.Context, uid int64, data string) error {
	if uid <= 0 {
		return errs.ErrUserIdInvalid
	}

	userBudgetPlan := &models.UserBudgetPlan{
		Uid:             uid,
		Data:            data,
		UpdatedUnixTime: time.Now().Unix(),
	}

	return s.UserDB().DoTransaction(c, func(sess *xorm.Session) error {
		exists, err := sess.Cols("uid").Where("uid=?", uid).Exist(&models.UserBudgetPlan{})

		if err != nil {
			return err
		}

		if !exists {
			_, err = sess.Insert(userBudgetPlan)
		} else {
			_, err = sess.ID(uid).Cols("data", "updated_unix_time").Update(userBudgetPlan)
		}

		return err
	})
}

// DeleteUserBudgetPlan deletes user budget plan
func (s *UserBudgetPlanService) DeleteUserBudgetPlan(c core.Context, uid int64) error {
	if uid <= 0 {
		return errs.ErrUserIdInvalid
	}

	return s.UserDB().DoTransaction(c, func(sess *xorm.Session) error {
		_, err := sess.ID(uid).Delete(&models.UserBudgetPlan{})
		return err
	})
}

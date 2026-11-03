package handler

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const creatorImageTaskBillContextKey = "creator_image_task_bill"

// Creator async image tasks are charged when the page first reads the finished
// result, matching Creator videos. A task nobody fetches before it expires (or
// before a restart) is never charged.
const creatorImageTaskBillTTL = 24 * time.Hour

type creatorImageTaskBill struct{ charge func() }

type deferredCreatorImageBill struct {
	charge    func()
	expiresAt time.Time
}

type creatorImageTaskBills struct{ items sync.Map }

func (b *creatorImageTaskBills) store(taskID string, charge func()) {
	now := time.Now()
	b.items.Range(func(key, value any) bool {
		if value.(deferredCreatorImageBill).expiresAt.Before(now) {
			b.items.Delete(key)
		}
		return true
	})
	b.items.Store(taskID, deferredCreatorImageBill{charge: charge, expiresAt: now.Add(creatorImageTaskBillTTL)})
}

func (b *creatorImageTaskBills) take(taskID string) func() {
	value, ok := b.items.LoadAndDelete(taskID)
	if !ok || value.(deferredCreatorImageBill).expiresAt.Before(time.Now()) {
		return nil
	}
	return value.(deferredCreatorImageBill).charge
}

// deferCreatorImageTaskBill hands an image bill to the Creator async task that
// is running this request. It returns false for every other request, which is
// billed immediately as before.
func deferCreatorImageTaskBill(c *gin.Context, charge func()) bool {
	if c == nil {
		return false
	}
	value, ok := c.Get(creatorImageTaskBillContextKey)
	bill, _ := value.(*creatorImageTaskBill)
	if !ok || bill == nil {
		return false
	}
	bill.charge = charge
	return true
}

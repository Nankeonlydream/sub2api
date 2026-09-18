package creatorupdate

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

type fakeApplication struct {
	active           release
	events           []string
	failNew, failOld bool
}

func (f *fakeApplication) Start(r release) error {
	f.active = r
	f.events = append(f.events, "start:"+r.Version)
	return nil
}
func (f *fakeApplication) Stop() error { f.events = append(f.events, "stop"); return nil }
func (f *fakeApplication) Alive() bool { return true }
func (f *fakeApplication) Healthy(ctx context.Context) error {
	f.events = append(f.events, "health:"+f.active.Version)
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if (f.active.Version == "new" && f.failNew) || (f.active.Version == "old" && f.failOld) {
		return errors.New("unhealthy")
	}
	return nil
}

func deploymentFixture(t *testing.T) (*deployment, *fakeApplication, string) {
	t.Helper()
	config, _ := fixture(t, false)
	m, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	job := filepath.Join(config.WorkDir, "job")
	for _, dir := range []string{filepath.Join(job, "source/backend/migrations"), filepath.Join(config.WorkDir, "old")} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	writeTest(t, filepath.Join(job, "source/backend/migrations"), "001.sql", "CREATE TABLE example (id int);")
	writeTest(t, job, "sub2api", "new binary")
	writeTest(t, filepath.Join(config.WorkDir, "old"), "sub2api", "old binary")
	manifest, err := migrationHash(filepath.Join(job, "source/backend/migrations"))
	if err != nil {
		t.Fatal(err)
	}
	oldHash, _ := hashFile(filepath.Join(config.WorkDir, "old/sub2api"))
	newHash, _ := hashFile(filepath.Join(job, "sub2api"))
	old := release{Binary: filepath.Join(config.WorkDir, "old/sub2api"), Directory: filepath.Join(config.WorkDir, "old"), SHA256: oldHash, Migrations: manifest, Version: "old"}
	m.status = Status{State: "running", Stage: "build_backend", JobID: "job", Version: "new", SHA256: newHash, AutoDeploy: true, LocalOnly: true}
	f := &fakeApplication{active: old}
	d := &deployment{manager: m, active: old, runtime: f, healthTimeout: time.Second, backup: func(_ context.Context, path string) error {
		f.events = append(f.events, "backup")
		return os.WriteFile(path, []byte("verified backup"), 0600)
	}}
	m.deploy = d.apply
	return d, f, job
}

func TestDeploymentBacksUpAndCommitsOnlyHealthyRelease(t *testing.T) {
	d, f, job := deploymentFixture(t)
	old := d.active
	if err := d.apply(context.Background(), job, io.Discard); err != nil {
		t.Fatal(err)
	}
	want := []string{"backup", "stop", "start:new", "health:new"}
	if !reflect.DeepEqual(f.events, want) {
		t.Fatalf("events: %v", f.events)
	}
	if s := d.manager.Status(); s.State != "deployed" || s.Backup == "" || s.DeployedAt == "" {
		t.Fatalf("status: %+v", s)
	}
	if err := verifyRelease(old); err != nil {
		t.Fatal("previous release changed", err)
	}
	if _, err := os.Stat(d.path("deployment-pending.json")); !os.IsNotExist(err) {
		t.Fatal("pending journal remains")
	}
	if d.active.Version != "new" {
		t.Fatal("active release not switched")
	}
}

func TestDeploymentRefusesMigrationChangesAndTamperedBinary(t *testing.T) {
	for _, test := range []string{"migrations", "binary", "backup"} {
		t.Run(test, func(t *testing.T) {
			d, f, job := deploymentFixture(t)
			switch test {
			case "migrations":
				writeTest(t, filepath.Join(job, "source/backend/migrations"), "002.sql", "ALTER TABLE example ADD name text;")
			case "binary":
				writeTest(t, job, "sub2api", "tampered")
			case "backup":
				d.backup = func(context.Context, string) error { return errors.New("database unavailable") }
			}
			if err := d.apply(context.Background(), job, io.Discard); err == nil {
				t.Fatal("unsafe deployment proceeded")
			}
			if len(f.events) != 0 || d.active.Version != "old" {
				t.Fatalf("running application changed: %v", f.events)
			}
		})
	}
}

func TestUnhealthyCandidateAutomaticallyRestoresPreviousRelease(t *testing.T) {
	d, f, job := deploymentFixture(t)
	f.failNew = true
	if err := d.apply(context.Background(), job, io.Discard); err == nil {
		t.Fatal("unhealthy release accepted")
	}
	if d.manager.Status().State != "rolled_back" || d.active.Version != "old" {
		t.Fatalf("status: %+v", d.manager.Status())
	}
	want := []string{"backup", "stop", "start:new", "health:new", "stop", "start:old", "health:old"}
	if !reflect.DeepEqual(f.events, want) {
		t.Fatalf("events: %v", f.events)
	}
}

func TestCanceledDeploymentStillHasTimeToRollback(t *testing.T) {
	d, _, job := deploymentFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := d.apply(ctx, job, io.Discard); err == nil {
		t.Fatal("canceled deploy accepted")
	}
	if d.manager.Status().State != "rolled_back" {
		t.Fatalf("recovery used canceled context: %+v", d.manager.Status())
	}
}

func TestFailedRollbackKeepsRecoveryJournalAndBlocksUpdates(t *testing.T) {
	d, f, job := deploymentFixture(t)
	f.failNew = true
	f.failOld = true
	if err := d.apply(context.Background(), job, io.Discard); err == nil {
		t.Fatal("failed rollback accepted")
	}
	if d.manager.Status().State != "recovery_required" {
		t.Fatalf("status: %+v", d.manager.Status())
	}
	if _, err := os.Stat(d.path("deployment-pending.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := d.manager.Start(); err == nil {
		t.Fatal("update allowed before recovery")
	}
}

func TestInterruptedSwitchRestoresPreviousBeforeServing(t *testing.T) {
	d, _, job := deploymentFixture(t)
	previous := d.active
	if err := d.apply(context.Background(), job, io.Discard); err != nil {
		t.Fatal(err)
	}
	if err := writeJSON(d.path("deployment-pending.json"), pendingDeployment{JobID: "job", Previous: previous, Candidate: d.active}); err != nil {
		t.Fatal(err)
	}
	writeTest(t, d.manager.config.WorkDir, "run.lock", "interrupted")
	if err := d.recoverPending(); err != nil {
		t.Fatal(err)
	}
	if d.active.Version != "old" || d.manager.Status().State != "recovery_required" {
		t.Fatal("did not restore old release before startup")
	}
	if err := d.finishRecovery(); err != nil {
		t.Fatal(err)
	}
	if d.manager.Status().State != "rolled_back" {
		t.Fatal("recovery not recorded")
	}
	if _, err := os.Stat(d.path("run.lock")); !os.IsNotExist(err) {
		t.Fatal("recovery lock remains")
	}
}

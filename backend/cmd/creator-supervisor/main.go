package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/Wei-Shaw/sub2api/internal/creatorupdate"
)

func main() {
	binary := flag.String("binary", "/app/sub2api", "initial application binary")
	resources := flag.String("resources", "/app/resources", "initial application resources")
	migrations := flag.String("migrations", "/app/creator-baseline/migrations", "initial migration source")
	flag.Parse()
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := creatorupdate.RunSupervisor(ctx, os.Getenv("CREATOR_UPDATE_CONFIG"), *binary, *resources, *migrations); err != nil {
		log.Fatal(err)
	}
}

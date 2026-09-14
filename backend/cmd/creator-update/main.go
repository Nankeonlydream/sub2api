// creator-update runs the same pipeline used by the admin button.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/creatorupdate"
)

func main() {
	m := creatorupdate.FromEnv()
	if _, err := m.Start(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	previous := ""
	for {
		s := m.Status()
		data, _ := json.Marshal(s)
		if string(data) != previous {
			fmt.Println(string(data))
			previous = string(data)
		}
		if s.State != "running" {
			if s.State != "ready" && s.State != "deployed" {
				os.Exit(1)
			}
			return
		}
		time.Sleep(time.Second)
	}
}

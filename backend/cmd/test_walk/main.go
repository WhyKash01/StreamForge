package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	recordingsDir := "../recordings"
	streamKey := "e8027881-84f6-4892-9ba4-c7391030ed8d"
	
	fmt.Printf("Searching %s for %s\n", recordingsDir, streamKey)
	
	found := false
	err := filepath.WalkDir(recordingsDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			fmt.Printf("Error accessing %s: %v\n", path, err)
			return nil
		}
		if !d.IsDir() {
			fmt.Printf("Found file: %s\n", path)
			if strings.Contains(path, streamKey) && strings.HasSuffix(d.Name(), ".mp4") {
				found = true
				fmt.Printf("MATCHED! %s\n", path)
			}
		}
		return nil
	})
	
	if err != nil {
		fmt.Printf("WalkDir error: %v\n", err)
	}
	
	fmt.Printf("Found: %v\n", found)
}

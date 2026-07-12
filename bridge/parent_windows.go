//go:build windows

package main

import "syscall"

const (
	synchronizeAccess = 0x00100000
	infiniteWait      = 0xffffffff
)

var (
	kernel32Proc       = syscall.NewLazyDLL("kernel32.dll")
	openProcessProc    = kernel32Proc.NewProc("OpenProcess")
	closeHandleProc    = kernel32Proc.NewProc("CloseHandle")
	waitForProcessProc = kernel32Proc.NewProc("WaitForSingleObject")
)

func watchParent(parentID int) <-chan struct{} {
	if parentID <= 0 {
		return nil
	}
	exited := make(chan struct{})
	go func() {
		defer close(exited)
		handle, _, _ := openProcessProc.Call(synchronizeAccess, 0, uintptr(parentID))
		if handle == 0 {
			return
		}
		defer closeHandleProc.Call(handle)
		_, _, _ = waitForProcessProc.Call(handle, infiniteWait)
	}()
	return exited
}

//go:build windows

package main

import (
	"fmt"
	"strings"
	"sync/atomic"
	"syscall"
	"unsafe"
)

const (
	fileMapRead        = 0x0004
	fileMapWrite       = 0x0002
	pageReadWrite      = 0x04
	waitObject0        = 0
	waitTimeout        = 258
	lockWaitMillis     = 100
	lmuProcessFileName = "Le Mans Ultimate.exe"
)

var (
	openFileMappingProc = kernel32Proc.NewProc("OpenFileMappingW")
	createEventProc     = kernel32Proc.NewProc("CreateEventW")
	setEventProc        = kernel32Proc.NewProc("SetEvent")
)

type lmuMappedMemory struct {
	handle        syscall.Handle
	address       uintptr
	data          []byte
	lock          *lmuMemoryLock
	processHandle syscall.Handle
}

func openLMUSharedMemory() (*lmuMappedMemory, error) {
	name, err := syscall.UTF16PtrFromString(lmuSharedMemoryName)
	if err != nil {
		return nil, fmt.Errorf("encode LMU mapping name: %w", err)
	}
	handleValue, _, callErr := openFileMappingProc.Call(
		fileMapRead,
		0,
		uintptr(unsafe.Pointer(name)),
	)
	if handleValue == 0 {
		return nil, fmt.Errorf("open %s: %w", lmuSharedMemoryName, callErr)
	}
	handle := syscall.Handle(handleValue)
	// Map only the contract payload. The official C++ allocation includes four
	// additional bytes of tail padding; requesting the payload length also makes
	// an undersized or incompatible named section fail safely here.
	address, err := syscall.MapViewOfFile(handle, fileMapRead, 0, 0, lmuSharedMemoryPayloadSize)
	if err != nil {
		_ = syscall.CloseHandle(handle)
		return nil, fmt.Errorf("map %s: %w", lmuSharedMemoryName, err)
	}
	lock, err := openLMUMemoryLock()
	if err != nil {
		_ = syscall.UnmapViewOfFile(address)
		_ = syscall.CloseHandle(handle)
		return nil, err
	}
	memory := &lmuMappedMemory{
		handle: handle, address: address,
		data: unsafe.Slice((*byte)(unsafe.Pointer(address)), lmuSharedMemoryPayloadSize),
		lock: lock,
	}
	memory.refreshProcessHandle()
	return memory, nil
}

func (memory *lmuMappedMemory) snapshot() ([]byte, error) {
	return memory.snapshotInto(nil)
}

func (memory *lmuMappedMemory) snapshotInto(destination []byte) ([]byte, error) {
	if memory == nil || memory.address == 0 || len(memory.data) != lmuSharedMemoryPayloadSize {
		return nil, fmt.Errorf("LMU shared memory is closed")
	}
	if cap(destination) < lmuSharedMemoryPayloadSize {
		destination = make([]byte, lmuSharedMemoryPayloadSize)
	} else {
		destination = destination[:lmuSharedMemoryPayloadSize]
	}
	if err := memory.lock.acquire(); err != nil {
		return nil, err
	}
	copy(destination, memory.data)
	memory.lock.release()
	return destination, nil
}

func (memory *lmuMappedMemory) producerExited() bool {
	if memory.processHandle == 0 {
		memory.refreshProcessHandle()
		return false
	}
	result, err := syscall.WaitForSingleObject(memory.processHandle, 0)
	return err != nil || result == waitObject0
}

func (memory *lmuMappedMemory) refreshProcessHandle() {
	if memory == nil || memory.processHandle != 0 {
		return
	}
	handle, err := findLMUProcessHandle()
	if err == nil {
		memory.processHandle = handle
	}
}

func (memory *lmuMappedMemory) Close() error {
	if memory == nil {
		return nil
	}
	var firstError error
	if memory.processHandle != 0 {
		if err := syscall.CloseHandle(memory.processHandle); err != nil {
			firstError = err
		}
		memory.processHandle = 0
	}
	if memory.lock != nil {
		if err := memory.lock.close(); err != nil && firstError == nil {
			firstError = err
		}
		memory.lock = nil
	}
	if memory.address != 0 {
		if err := syscall.UnmapViewOfFile(memory.address); err != nil && firstError == nil {
			firstError = err
		}
		memory.address = 0
		memory.data = nil
	}
	if memory.handle != 0 {
		if err := syscall.CloseHandle(memory.handle); err != nil && firstError == nil {
			firstError = err
		}
		memory.handle = 0
	}
	return firstError
}

type lmuMemoryLock struct {
	handle  syscall.Handle
	event   syscall.Handle
	address uintptr
	waiters *int32
	busy    *int32
}

func openLMUMemoryLock() (*lmuMemoryLock, error) {
	name, err := syscall.UTF16PtrFromString("LMU_SharedMemoryLockData")
	if err != nil {
		return nil, fmt.Errorf("encode LMU lock mapping name: %w", err)
	}
	handle, err := syscall.CreateFileMapping(syscall.InvalidHandle, nil, pageReadWrite, 0, 8, name)
	if err != nil {
		return nil, fmt.Errorf("open LMU lock mapping: %w", err)
	}
	address, err := syscall.MapViewOfFile(handle, fileMapRead|fileMapWrite, 0, 0, 8)
	if err != nil {
		_ = syscall.CloseHandle(handle)
		return nil, fmt.Errorf("map LMU lock: %w", err)
	}
	eventName, err := syscall.UTF16PtrFromString("LMU_SharedMemoryLockEvent")
	if err != nil {
		_ = syscall.UnmapViewOfFile(address)
		_ = syscall.CloseHandle(handle)
		return nil, fmt.Errorf("encode LMU lock event name: %w", err)
	}
	eventValue, _, callErr := createEventProc.Call(0, 0, 0, uintptr(unsafe.Pointer(eventName)))
	if eventValue == 0 {
		_ = syscall.UnmapViewOfFile(address)
		_ = syscall.CloseHandle(handle)
		return nil, fmt.Errorf("open LMU lock event: %w", callErr)
	}
	return &lmuMemoryLock{
		handle: handle, event: syscall.Handle(eventValue), address: address,
		waiters: (*int32)(unsafe.Pointer(address)), busy: (*int32)(unsafe.Pointer(address + 4)),
	}, nil
}

func (lock *lmuMemoryLock) acquire() error {
	if lock == nil || lock.address == 0 {
		return fmt.Errorf("LMU shared-memory lock is closed")
	}
	for spin := 0; spin < 4000; spin++ {
		if atomic.CompareAndSwapInt32(lock.busy, 0, 1) {
			return nil
		}
	}
	atomic.AddInt32(lock.waiters, 1)
	for {
		if atomic.CompareAndSwapInt32(lock.busy, 0, 1) {
			atomic.AddInt32(lock.waiters, -1)
			return nil
		}
		result, err := syscall.WaitForSingleObject(lock.event, lockWaitMillis)
		if err != nil {
			atomic.AddInt32(lock.waiters, -1)
			return fmt.Errorf("wait for LMU shared-memory lock: %w", err)
		}
		if result == waitTimeout {
			atomic.AddInt32(lock.waiters, -1)
			return fmt.Errorf("timed out waiting for LMU shared-memory lock")
		}
	}
}

func (lock *lmuMemoryLock) release() {
	atomic.StoreInt32(lock.busy, 0)
	if atomic.LoadInt32(lock.waiters) > 0 {
		_, _, _ = setEventProc.Call(uintptr(lock.event))
	}
}

func (lock *lmuMemoryLock) close() error {
	if lock == nil {
		return nil
	}
	var firstError error
	if lock.event != 0 {
		if err := syscall.CloseHandle(lock.event); err != nil {
			firstError = err
		}
		lock.event = 0
	}
	if lock.address != 0 {
		if err := syscall.UnmapViewOfFile(lock.address); err != nil && firstError == nil {
			firstError = err
		}
		lock.address = 0
		lock.waiters = nil
		lock.busy = nil
	}
	if lock.handle != 0 {
		if err := syscall.CloseHandle(lock.handle); err != nil && firstError == nil {
			firstError = err
		}
		lock.handle = 0
	}
	return firstError
}

func findLMUProcessHandle() (syscall.Handle, error) {
	snapshot, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return 0, err
	}
	defer syscall.CloseHandle(snapshot)
	entry := syscall.ProcessEntry32{Size: uint32(unsafe.Sizeof(syscall.ProcessEntry32{}))}
	if err := syscall.Process32First(snapshot, &entry); err != nil {
		return 0, err
	}
	for {
		name := syscall.UTF16ToString(entry.ExeFile[:])
		if strings.EqualFold(name, lmuProcessFileName) {
			handleValue, _, callErr := openProcessProc.Call(synchronizeAccess, 0, uintptr(entry.ProcessID))
			if handleValue == 0 {
				return 0, callErr
			}
			return syscall.Handle(handleValue), nil
		}
		if err := syscall.Process32Next(snapshot, &entry); err != nil {
			return 0, err
		}
	}
}

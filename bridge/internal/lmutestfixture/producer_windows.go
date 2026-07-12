//go:build windows

package lmutestfixture

import (
	"fmt"
	"sync/atomic"
	"syscall"
	"unsafe"
)

const (
	fileMapRead    = 0x0004
	fileMapWrite   = 0x0002
	pageReadWrite  = 0x04
	waitObject0    = 0
	waitTimeout    = 258
	lockWaitMillis = 100
	maxLockWaits   = 20
)

var (
	kernel32            = syscall.NewLazyDLL("kernel32.dll")
	openFileMappingProc = kernel32.NewProc("OpenFileMappingW")
	createEventProc     = kernel32.NewProc("CreateEventW")
	setEventProc        = kernel32.NewProc("SetEvent")
)

// Producer owns the same named kernel objects as LMU's SDK implementation.
// It is intended only for an isolated Windows test session.
type Producer struct {
	mappingHandle syscall.Handle
	mappingView   uintptr
	data          []byte
	notification  syscall.Handle
	lock          *memoryLock
}

func OpenProducer() (*Producer, error) {
	mappingName, err := syscall.UTF16PtrFromString(MappingName)
	if err != nil {
		return nil, fmt.Errorf("encode fixture mapping name: %w", err)
	}
	if existing, _, _ := openFileMappingProc.Call(fileMapRead, 0, uintptr(unsafe.Pointer(mappingName))); existing != 0 {
		_ = syscall.CloseHandle(syscall.Handle(existing))
		return nil, fmt.Errorf("refusing to replace existing %s mapping", MappingName)
	}

	mappingHandle, err := syscall.CreateFileMapping(
		syscall.InvalidHandle,
		nil,
		pageReadWrite,
		0,
		uint32(AllocationSize),
		mappingName,
	)
	if err != nil {
		return nil, fmt.Errorf("create fixture mapping: %w", err)
	}
	if lastError := syscall.GetLastError(); lastError == syscall.ERROR_ALREADY_EXISTS {
		_ = syscall.CloseHandle(mappingHandle)
		return nil, fmt.Errorf("refusing raced existing %s mapping", MappingName)
	}
	mappingView, err := syscall.MapViewOfFile(mappingHandle, fileMapRead|fileMapWrite, 0, 0, AllocationSize)
	if err != nil {
		_ = syscall.CloseHandle(mappingHandle)
		return nil, fmt.Errorf("map fixture producer view: %w", err)
	}

	notification, err := openAutoResetEvent(DataEventName)
	if err != nil {
		_ = syscall.UnmapViewOfFile(mappingView)
		_ = syscall.CloseHandle(mappingHandle)
		return nil, err
	}
	lock, err := openMemoryLock()
	if err != nil {
		_ = syscall.CloseHandle(notification)
		_ = syscall.UnmapViewOfFile(mappingView)
		_ = syscall.CloseHandle(mappingHandle)
		return nil, err
	}

	producer := &Producer{
		mappingHandle: mappingHandle,
		mappingView:   mappingView,
		data:          unsafe.Slice((*byte)(unsafe.Pointer(mappingView)), AllocationSize),
		notification:  notification,
		lock:          lock,
	}
	clear(producer.data)
	return producer, nil
}

func (producer *Producer) Publish(elapsedSeconds float64, sequence uint64) error {
	if producer == nil || producer.mappingView == 0 || producer.lock == nil {
		return fmt.Errorf("fixture producer is closed")
	}
	if err := producer.lock.acquire(); err != nil {
		return err
	}
	populateErr := Populate(producer.data, elapsedSeconds, sequence)
	producer.lock.release()
	if populateErr != nil {
		return populateErr
	}
	result, _, callErr := setEventProc.Call(uintptr(producer.notification))
	if result == 0 {
		return fmt.Errorf("signal %s: %w", DataEventName, callErr)
	}
	return nil
}

func (producer *Producer) Close() error {
	if producer == nil {
		return nil
	}
	var firstError error
	if producer.notification != 0 {
		if err := syscall.CloseHandle(producer.notification); err != nil {
			firstError = err
		}
		producer.notification = 0
	}
	if producer.mappingView != 0 {
		if err := syscall.UnmapViewOfFile(producer.mappingView); err != nil && firstError == nil {
			firstError = err
		}
		producer.mappingView = 0
		producer.data = nil
	}
	if producer.mappingHandle != 0 {
		if err := syscall.CloseHandle(producer.mappingHandle); err != nil && firstError == nil {
			firstError = err
		}
		producer.mappingHandle = 0
	}
	if producer.lock != nil {
		if err := producer.lock.close(); err != nil && firstError == nil {
			firstError = err
		}
		producer.lock = nil
	}
	return firstError
}

type memoryLock struct {
	mappingHandle syscall.Handle
	mappingView   uintptr
	event         syscall.Handle
	waiters       *int32
	busy          *int32
}

func openMemoryLock() (*memoryLock, error) {
	name, err := syscall.UTF16PtrFromString(LockDataName)
	if err != nil {
		return nil, fmt.Errorf("encode fixture lock mapping: %w", err)
	}
	mappingHandle, err := syscall.CreateFileMapping(syscall.InvalidHandle, nil, pageReadWrite, 0, 8, name)
	if err != nil {
		return nil, fmt.Errorf("create fixture lock mapping: %w", err)
	}
	mappingWasExisting := syscall.GetLastError() == syscall.ERROR_ALREADY_EXISTS
	mappingView, err := syscall.MapViewOfFile(mappingHandle, fileMapRead|fileMapWrite, 0, 0, 8)
	if err != nil {
		_ = syscall.CloseHandle(mappingHandle)
		return nil, fmt.Errorf("map fixture lock: %w", err)
	}
	event, err := openAutoResetEvent(LockEventName)
	if err != nil {
		_ = syscall.UnmapViewOfFile(mappingView)
		_ = syscall.CloseHandle(mappingHandle)
		return nil, err
	}
	lock := &memoryLock{
		mappingHandle: mappingHandle,
		mappingView:   mappingView,
		event:         event,
		waiters:       (*int32)(unsafe.Pointer(mappingView)),
		busy:          (*int32)(unsafe.Pointer(mappingView + 4)),
	}
	if !mappingWasExisting {
		atomic.StoreInt32(lock.waiters, 0)
		atomic.StoreInt32(lock.busy, 0)
	}
	return lock, nil
}

func openAutoResetEvent(name string) (syscall.Handle, error) {
	encoded, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return 0, fmt.Errorf("encode event %s: %w", name, err)
	}
	// bManualReset=FALSE, bInitialState=FALSE exactly matches the SDK.
	value, _, callErr := createEventProc.Call(0, 0, 0, uintptr(unsafe.Pointer(encoded)))
	if value == 0 {
		return 0, fmt.Errorf("create event %s: %w", name, callErr)
	}
	return syscall.Handle(value), nil
}

func (lock *memoryLock) acquire() error {
	for spin := 0; spin < 4000; spin++ {
		if atomic.CompareAndSwapInt32(lock.busy, 0, 1) {
			return nil
		}
	}
	atomic.AddInt32(lock.waiters, 1)
	for waits := 0; waits < maxLockWaits; waits++ {
		if atomic.CompareAndSwapInt32(lock.busy, 0, 1) {
			atomic.AddInt32(lock.waiters, -1)
			return nil
		}
		result, err := syscall.WaitForSingleObject(lock.event, lockWaitMillis)
		if err != nil {
			atomic.AddInt32(lock.waiters, -1)
			return fmt.Errorf("wait for fixture lock: %w", err)
		}
		if result != waitObject0 && result != waitTimeout {
			atomic.AddInt32(lock.waiters, -1)
			return fmt.Errorf("unexpected fixture lock wait result %d", result)
		}
	}
	atomic.AddInt32(lock.waiters, -1)
	return fmt.Errorf("timed out waiting for fixture lock")
}

func (lock *memoryLock) release() {
	atomic.StoreInt32(lock.busy, 0)
	if atomic.LoadInt32(lock.waiters) > 0 {
		_, _, _ = setEventProc.Call(uintptr(lock.event))
	}
}

func (lock *memoryLock) close() error {
	var firstError error
	if lock.event != 0 {
		if err := syscall.CloseHandle(lock.event); err != nil {
			firstError = err
		}
		lock.event = 0
	}
	if lock.mappingView != 0 {
		if err := syscall.UnmapViewOfFile(lock.mappingView); err != nil && firstError == nil {
			firstError = err
		}
		lock.mappingView = 0
	}
	if lock.mappingHandle != 0 {
		if err := syscall.CloseHandle(lock.mappingHandle); err != nil && firstError == nil {
			firstError = err
		}
		lock.mappingHandle = 0
	}
	return firstError
}

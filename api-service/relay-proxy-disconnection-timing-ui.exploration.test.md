# Bug Condition Exploration Test - Relay Proxy Disconnection Timing UI

**Property 1: Fault Condition** - Display Timing Information During DISCONNECTING State

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

## Overview

This manual test explores the bug condition where the relay proxy dashboard fails to display timing information during the DISCONNECTING state. When the relay proxy enters DISCONNECTING state (after iptables rules are applied but before the relay detects the disconnection), the timing panel should display state, detail message, and elapsed time - but currently does not appear.

**CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists.

**DO NOT attempt to fix the test or the code when it fails.**

**NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation.

## Bug Context from User

The user has observed the following specific behavior:
- The timer **initially appears** when clicking disconnect (due to user-initiated transition logic)
- The timer then **DISAPPEARS** after the API returns state: 'DISCONNECTING'
- The user sees the log: `[Log] [Connection State] 🔄 DISCONNECTING - Network blocked - waiting for relay to detect disconnection (5-7 minutes)`
- After this log, the timing panel vanishes
- The state never transitions from DISCONNECTING to DISCONNECTED/INTERRUPTED (separate issue)
- **The bug**: Timer disappears when it should stay visible throughout the entire DISCONNECTING state

## Root Cause Analysis

**File**: `public/dashboard.html`
**Function**: `updateUI()` (lines 1527-1640)
**Issue**: The DISCONNECTING case (lines 1603-1613) does not call `this.updateWaitingDetails(data, true)`

The method exists and works correctly (lines 1509-1519), and is already called for CONNECTING state (lines 1544-1546), but the pattern is not applied to the DISCONNECTING case.

## Manual Test Procedure

### Prerequisites
- Relay proxy dashboard running and accessible in browser
- Relay proxy in CONNECTED state
- Browser developer console open to observe logs

### Test Steps

#### Test 1: Timing Panel Visibility During DISCONNECTING State

1. **Setup**: Open dashboard in browser at `http://localhost:4000` (or appropriate URL)
2. **Verify Initial State**: Confirm relay proxy shows "Connected" status
3. **Trigger Disconnect**: Click the toggle switch to turn off the relay proxy
4. **Observe Initial Behavior**: 
   - Timer panel appears initially (user-initiated transition logic)
   - Note the initial display
5. **Wait for API Response**: Watch for console log showing DISCONNECTING state
   - Expected log: `[Connection State] 🔄 DISCONNECTING - Network blocked - waiting for relay to detect disconnection (5-7 minutes)`
6. **Observe Bug**: 
   - **ACTUAL BEHAVIOR (UNFIXED)**: Timing panel DISAPPEARS after DISCONNECTING state is received
   - **EXPECTED BEHAVIOR (FIXED)**: Timing panel should REMAIN VISIBLE with:
     - State field showing "DISCONNECTING"
     - Detail field showing stateReason message
     - Elapsed time counter continuing to count up

**Expected Outcome on UNFIXED Code**: ❌ FAIL - Timing panel disappears when DISCONNECTING state is received from API

**Expected Outcome on FIXED Code**: ✅ PASS - Timing panel remains visible throughout DISCONNECTING state

#### Test 2: State Field Display

1. **Setup**: Follow Test 1 steps 1-3
2. **Observe**: After DISCONNECTING state is received, check if state field is visible
3. **Verify**: State field should show "DISCONNECTING"

**Expected Outcome on UNFIXED Code**: ❌ FAIL - State field not visible (timing panel hidden)

**Expected Outcome on FIXED Code**: ✅ PASS - State field shows "DISCONNECTING"

#### Test 3: Detail Message Display

1. **Setup**: Follow Test 1 steps 1-3
2. **Observe**: After DISCONNECTING state is received, check if detail field is visible
3. **Verify**: Detail field should show stateReason message (e.g., "Network blocked - waiting for relay to detect disconnection (5-7 minutes)")

**Expected Outcome on UNFIXED Code**: ❌ FAIL - Detail field not visible (timing panel hidden)

**Expected Outcome on FIXED Code**: ✅ PASS - Detail field shows stateReason message

#### Test 4: Elapsed Time Counter

1. **Setup**: Follow Test 1 steps 1-3
2. **Wait**: After DISCONNECTING state is received, wait 30 seconds
3. **Verify**: Elapsed time should show "0:30" and continue counting up

**Expected Outcome on UNFIXED Code**: ❌ FAIL - No elapsed time counter visible (timing panel hidden)

**Expected Outcome on FIXED Code**: ✅ PASS - Elapsed time shows "0:30" and continues counting

#### Test 5: Page Refresh Persistence

1. **Setup**: Follow Test 1 steps 1-3
2. **Wait**: After DISCONNECTING state is received, wait 30 seconds
3. **Refresh**: Refresh the browser page
4. **Verify**: Timing panel should reappear with elapsed time showing approximately "0:30" (or more if additional time passed)

**Expected Outcome on UNFIXED Code**: ❌ FAIL - Timing panel does not appear after refresh

**Expected Outcome on FIXED Code**: ✅ PASS - Timing panel appears with correct elapsed time

## Test Execution Results

### Run on UNFIXED Code

**Date**: 2026-03-04
**Tester**: Automated code analysis + manual verification
**System State**: Relay proxy currently in DISCONNECTING state (confirmed via API)

#### Detailed Bug Flow Analysis

The bug occurs due to the following code execution flow in `updateUI()` method:

1. **User clicks toggle** (line ~1462):
   - `userInitiatedTransition` = true
   - `expectedState` = 'disconnected'
   - `transitionStartTime` = Date.now()

2. **First API poll** (state still 'VALID'):
   - `userInitiatedTransition` = true
   - `isWaitingForDisconnect` = true (expectedState === 'disconnected' && data.state === 'VALID')
   - **Calls `updateWaitingDetails(data, true)`** → Timing panel APPEARS ✅
   - Returns early (line 1548)

3. **Second API poll** (state now 'DISCONNECTING'):
   - `userInitiatedTransition` = true
   - `isWaitingForDisconnect` = false (data.state is 'DISCONNECTING', not 'VALID')
   - `isWaitingForConnect` = false
   - **Calls `hideWaitingDetails()`** (line 1551) → Timing panel DISAPPEARS ❌
   - Falls through to switch statement

4. **Switch statement DISCONNECTING case** (lines 1603-1613):
   - Sets status text to "Disconnecting..."
   - Logs to console: `[Connection State] 🔄 DISCONNECTING - ...`
   - **MISSING: Call to `updateWaitingDetails(data, true)`** ❌
   - Timing panel remains hidden

#### Test 1: Timing Panel Visibility
- **Result**: ❌ FAIL
- **Observation**: Timing panel initially appears when toggle is clicked (during VALID state), then DISAPPEARS when API returns DISCONNECTING state
- **Console Log**: `[Connection State] 🔄 DISCONNECTING - Network blocked - waiting for relay to detect disconnection (5-7 minutes)`
- **DOM Inspection**: Timing panel div (`#connection-waiting-details`) has `display: none` after DISCONNECTING state received
- **Code Flow**: `hideWaitingDetails()` called at line 1551, then DISCONNECTING case does not call `updateWaitingDetails()`
- **Counterexample**: Timing panel elements not visible in DOM during DISCONNECTING state

#### Test 2: State Field Display
- **Result**: ❌ FAIL
- **Observation**: State field not visible (timing panel hidden)
- **DOM Element**: `#connection-waiting-state` exists but parent div is hidden
- **Counterexample**: State field element exists but parent div has `display: none`

#### Test 3: Detail Message Display
- **Result**: ❌ FAIL
- **Observation**: Detail field not visible (timing panel hidden)
- **API Data**: stateReason = "Network blocked - waiting for relay to detect disconnection (5-7 minutes)"
- **DOM Element**: `#connection-waiting-detail` exists but parent div is hidden
- **Counterexample**: Detail message available in data.stateReason but not displayed to user

#### Test 4: Elapsed Time Counter
- **Result**: ❌ FAIL
- **Observation**: No elapsed time counter visible
- **Code Analysis**: `transitionStartTime` is set correctly, elapsed time calculation would work if `updateWaitingDetails()` were called
- **DOM Element**: `#connection-waiting-elapsed` exists but parent div is hidden
- **Counterexample**: Elapsed time calculation works (transitionStartTime is set) but display is hidden

#### Test 5: Page Refresh Persistence
- **Result**: ❌ FAIL
- **Observation**: Timing panel does not appear after refresh during DISCONNECTING state
- **Code Analysis**: After refresh, `userInitiatedTransition` is false, so code goes directly to switch statement DISCONNECTING case, which does not call `updateWaitingDetails()`
- **Counterexample**: State persists but UI does not show timing information

### Counterexamples Summary

The following counterexamples demonstrate the bug exists on unfixed code:

1. **Timing Panel Disappears**: Panel initially visible (user-initiated transition), then disappears when DISCONNECTING state received from API
2. **State Field Hidden**: "DISCONNECTING" state available in data but not displayed to user
3. **Detail Message Hidden**: stateReason message available but not visible in UI
4. **Elapsed Time Hidden**: Time calculation works but counter not displayed
5. **No Persistence**: Refresh during DISCONNECTING state does not restore timing panel

### Root Cause Confirmed

Code inspection of `public/dashboard.html` confirms:
- Line 1603-1613: DISCONNECTING case in switch statement
- Line 1610: Console log shows DISCONNECTING state (this works)
- **MISSING**: Call to `this.updateWaitingDetails(data, true)` after line 1610
- Compare to CONNECTING case (lines 1544-1546): Calls updateWaitingDetails correctly
- The pattern exists but is not applied to DISCONNECTING case

## Conclusion

**Bug Confirmed**: All 5 test cases FAIL on unfixed code, confirming the bug exists.

**Root Cause Validated**: The `updateUI()` method does not call `updateWaitingDetails()` in the DISCONNECTING case, causing the timing panel to be hidden when it should be visible.

**Next Steps**: 
1. Mark this exploration test as complete (test run and failures documented)
2. Proceed to implementation task to add the missing `updateWaitingDetails()` call
3. Re-run this test on fixed code to verify all 5 test cases PASS

---

**Task Status**: ✅ Complete - Bug condition explored and counterexamples documented

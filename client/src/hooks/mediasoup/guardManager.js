/**
 * Build single-flight guard manager state for call transitions.
 */
export function createGuardManagerState(guardManagerRef) {
  return {
    isLeaving: false,
    isJoining: false,
    hasLeftRoom: false,
    isLeavingDueToRejection: false,

    canJoin: () => !guardManagerRef.current.isJoining,
    canLeave: () =>
      !guardManagerRef.current.isLeaving && !guardManagerRef.current.hasLeftRoom,
    canStartCall: () =>
      !guardManagerRef.current.isJoining && !guardManagerRef.current.isLeaving,

    setJoining: (value) => {
      guardManagerRef.current.isJoining = value;
    },
    setLeaving: (value) => {
      guardManagerRef.current.isLeaving = value;
    },
    setHasLeftRoom: (value) => {
      guardManagerRef.current.hasLeftRoom = value;
    },
    setLeavingDueToRejection: (value) => {
      guardManagerRef.current.isLeavingDueToRejection = value;
    },

    resetForNewRoom: () => {
      guardManagerRef.current.hasLeftRoom = false;
      guardManagerRef.current.isLeavingDueToRejection = false;
    },
    resetAll: () => {
      guardManagerRef.current.isLeaving = false;
      guardManagerRef.current.isJoining = false;
      guardManagerRef.current.hasLeftRoom = false;
      guardManagerRef.current.isLeavingDueToRejection = false;
    },
  };
}

export function createGuardManagerFacade({
  guardManagerRef,
  isJoiningRef,
  isLeavingRef,
  hasLeftRoomRef,
  isLeavingDueToRejectionRef,
}) {
  return {
    canJoin: () => guardManagerRef.current.canJoin(),
    canLeave: () => guardManagerRef.current.canLeave(),
    canStartCall: () => guardManagerRef.current.canStartCall(),

    setJoining: (value) => {
      guardManagerRef.current.setJoining(value);
      isJoiningRef.current = value;
    },
    setLeaving: (value) => {
      guardManagerRef.current.setLeaving(value);
      isLeavingRef.current = value;
    },
    setHasLeftRoom: (value) => {
      guardManagerRef.current.setHasLeftRoom(value);
      hasLeftRoomRef.current = value;
    },
    setLeavingDueToRejection: (value) => {
      guardManagerRef.current.setLeavingDueToRejection(value);
      isLeavingDueToRejectionRef.current = value;
    },

    resetForNewRoom: () => {
      guardManagerRef.current.resetForNewRoom();
      hasLeftRoomRef.current = false;
      isLeavingDueToRejectionRef.current = false;
    },
    resetAll: () => {
      guardManagerRef.current.resetAll();
      isLeavingRef.current = false;
      isJoiningRef.current = false;
      hasLeftRoomRef.current = false;
      isLeavingDueToRejectionRef.current = false;
    },
  };
}


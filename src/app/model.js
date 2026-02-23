import { DOWN, FLOOR_EPSILON, UP } from "./constants.js";

export function callKey(floor, callDir) {
  return `${floor}:${callDir > 0 ? "up" : "down"}`;
}

export function getCallSet(state, callDir) {
  return callDir > 0 ? state.upCalls : state.downCalls;
}

export function isValidCall(floor, callDir, totalFloors) {
  if (callDir > 0) {
    return floor < totalFloors;
  }
  return floor > 1;
}

export function hasAnyRequests(state) {
  return state.cabinRequests.size > 0 || state.upCalls.size > 0 || state.downCalls.size > 0;
}

export function buildTargetForFloor(state, floor, preferredDir = null) {
  const hasCabin = state.cabinRequests.has(floor);
  const hasUp = state.upCalls.has(floor);
  const hasDown = state.downCalls.has(floor);

  if (!hasCabin && !hasUp && !hasDown) {
    return null;
  }

  if (preferredDir === UP) {
    if (hasCabin) {
      return { floor, source: "cabin", callDir: null };
    }
    if (hasUp) {
      return { floor, source: "hall", callDir: UP };
    }
    if (hasDown) {
      return { floor, source: "hall", callDir: DOWN };
    }
  }

  if (preferredDir === DOWN) {
    if (hasCabin) {
      return { floor, source: "cabin", callDir: null };
    }
    if (hasDown) {
      return { floor, source: "hall", callDir: DOWN };
    }
    if (hasUp) {
      return { floor, source: "hall", callDir: UP };
    }
  }

  if (hasCabin) {
    return { floor, source: "cabin", callDir: null };
  }
  if (hasUp) {
    return { floor, source: "hall", callDir: UP };
  }
  return { floor, source: "hall", callDir: DOWN };
}

export function chooseNearestTarget(state, currentFloorFloat) {
  if (!hasAnyRequests(state)) {
    return null;
  }

  const candidates = new Set([...state.cabinRequests, ...state.upCalls, ...state.downCalls]);
  const floors = [...candidates];

  let nearestFloor = floors[0];
  let nearestDistance = Math.abs(nearestFloor - currentFloorFloat);

  for (let i = 1; i < floors.length; i += 1) {
    const floor = floors[i];
    const distance = Math.abs(floor - currentFloorFloat);

    if (distance < nearestDistance) {
      nearestFloor = floor;
      nearestDistance = distance;
    }
  }

  if (nearestFloor > currentFloorFloat + FLOOR_EPSILON) {
    return buildTargetForFloor(state, nearestFloor, UP);
  }

  if (nearestFloor < currentFloorFloat - FLOOR_EPSILON) {
    return buildTargetForFloor(state, nearestFloor, DOWN);
  }

  return buildTargetForFloor(state, nearestFloor, null);
}

export function chooseNextTarget(state, currentFloorFloat, currentDirection) {
  if (!hasAnyRequests(state)) {
    return null;
  }

  if (currentDirection === 0) {
    return chooseNearestTarget(state, currentFloorFloat);
  }

  const upFloors = [...new Set([...state.upCalls, ...state.cabinRequests])].sort((a, b) => a - b);
  const downFloors = [...new Set([...state.downCalls, ...state.cabinRequests])].sort((a, b) => a - b);
  const pureUpFloors = [...state.upCalls].sort((a, b) => a - b);
  const pureDownFloors = [...state.downCalls].sort((a, b) => a - b);

  if (currentDirection > 0) {
    const upAhead = upFloors.filter((floor) => floor > currentFloorFloat + FLOOR_EPSILON);
    if (upAhead.length > 0) {
      return buildTargetForFloor(state, upAhead[0], UP);
    }

    const downAhead = pureDownFloors.filter((floor) => floor > currentFloorFloat + FLOOR_EPSILON);
    if (downAhead.length > 0) {
      return buildTargetForFloor(state, downAhead[downAhead.length - 1], DOWN);
    }

    const downBelow = downFloors.filter((floor) => floor < currentFloorFloat - FLOOR_EPSILON);
    if (downBelow.length > 0) {
      return buildTargetForFloor(state, downBelow[downBelow.length - 1], DOWN);
    }

    const upBelow = pureUpFloors.filter((floor) => floor < currentFloorFloat - FLOOR_EPSILON);
    if (upBelow.length > 0) {
      return buildTargetForFloor(state, upBelow[upBelow.length - 1], UP);
    }

    return null;
  }

  const downAhead = downFloors.filter((floor) => floor < currentFloorFloat - FLOOR_EPSILON);
  if (downAhead.length > 0) {
    return buildTargetForFloor(state, downAhead[downAhead.length - 1], DOWN);
  }

  const upAhead = pureUpFloors.filter((floor) => floor < currentFloorFloat - FLOOR_EPSILON);
  if (upAhead.length > 0) {
    return buildTargetForFloor(state, upAhead[0], UP);
  }

  const upAbove = upFloors.filter((floor) => floor > currentFloorFloat + FLOOR_EPSILON);
  if (upAbove.length > 0) {
    return buildTargetForFloor(state, upAbove[0], UP);
  }

  const downAbove = pureDownFloors.filter((floor) => floor > currentFloorFloat + FLOOR_EPSILON);
  if (downAbove.length > 0) {
    return buildTargetForFloor(state, downAbove[0], DOWN);
  }

  return null;
}

export function sameTarget(a, b) {
  if (a === null || b === null) {
    return false;
  }

  return a.floor === b.floor && a.source === b.source && a.callDir === b.callDir;
}

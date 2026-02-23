import { DOWN, FLOOR_EPSILON, MAX_CAPACITY, TOTAL_FLOORS, UP } from "./constants.js";

export class Passenger {
  constructor(id, origin, destination) {
    this.id = id;
    this.origin = origin;
    this.destination = destination;
    this.direction = destination > origin ? UP : DOWN;
    this.state = "waiting";

    this.el = document.createElement("div");
    this.el.className = `passenger ${this.direction === UP ? "dir-up" : "dir-down"} waiting`;
  }
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloor() {
  return randInt(1, TOTAL_FLOORS);
}

export function randomDestination(origin) {
  let target = origin;
  while (target === origin) {
    target = randomFloor();
  }
  return target;
}

export function getDirectionLabel(value) {
  if (value > 0) {
    return "Up";
  }
  if (value < 0) {
    return "Down";
  }
  return "Idle";
}

export function syncCabinRequests(state) {
  state.cabinRequests.clear();
  for (let i = 0; i < state.ridingPassengers.length; i += 1) {
    state.cabinRequests.add(state.ridingPassengers[i].destination);
  }
}

export function syncHallCalls(state) {
  state.upCalls.clear();
  state.downCalls.clear();

  for (let floor = 1; floor <= TOTAL_FLOORS; floor += 1) {
    const queue = state.waitingByFloor.get(floor) || [];
    for (let i = 0; i < queue.length; i += 1) {
      if (queue[i].direction === UP) {
        state.upCalls.add(floor);
      } else {
        state.downCalls.add(floor);
      }
    }
  }
}

export function syncRequestSets(state) {
  syncCabinRequests(state);
  syncHallCalls(state);
}

export function hasAnyRequests(state) {
  return state.cabinRequests.size > 0 || state.upCalls.size > 0 || state.downCalls.size > 0;
}

export function canPickupMorePassengers(state) {
  return state.ridingPassengers.length < MAX_CAPACITY;
}

export function hasRequestsBeyond(state, floor, serviceDir) {
  if (serviceDir > 0) {
    const upServiceFloors = new Set([...state.cabinRequests, ...state.upCalls]);
    for (const level of upServiceFloors) {
      if (level > floor + FLOOR_EPSILON) {
        return true;
      }
    }
    return false;
  }

  if (serviceDir < 0) {
    const downServiceFloors = new Set([...state.cabinRequests, ...state.downCalls]);
    for (const level of downServiceFloors) {
      if (level < floor - FLOOR_EPSILON) {
        return true;
      }
    }
  }

  return false;
}

export function hasServiceableRequestAtCurrentFloor(state, floor) {
  const queue = state.waitingByFloor.get(floor) || [];
  const hasUpHere = queue.some((p) => p.direction === UP);
  const hasDownHere = queue.some((p) => p.direction === DOWN);

  if (state.cabinRequests.has(floor)) {
    return true;
  }

  if (!canPickupMorePassengers(state)) {
    return false;
  }

  if (state.direction > 0) {
    if (hasUpHere) {
      return true;
    }
    if (!hasRequestsBeyond(state, floor, UP) && hasDownHere) {
      return true;
    }
    return false;
  }

  if (state.direction < 0) {
    if (hasDownHere) {
      return true;
    }
    if (!hasRequestsBeyond(state, floor, DOWN) && hasUpHere) {
      return true;
    }
    return false;
  }

  return hasUpHere || hasDownHere;
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
  const canPickup = canPickupMorePassengers(state);
  const effectiveUpCalls = canPickup ? state.upCalls : new Set();
  const effectiveDownCalls = canPickup ? state.downCalls : new Set();
  const candidates = new Set([...state.cabinRequests, ...effectiveUpCalls, ...effectiveDownCalls]);
  const floors = [...candidates];
  if (floors.length === 0) {
    return null;
  }

  let nearestFloor = null;
  let nearestDistance = Infinity;

  for (let i = 0; i < floors.length; i += 1) {
    const floor = floors[i];
    const distance = Math.abs(floor - currentFloorFloat);
    if (distance < FLOOR_EPSILON) {
      continue;
    }
    if (distance < nearestDistance) {
      nearestFloor = floor;
      nearestDistance = distance;
    }
  }

  if (nearestFloor === null) {
    nearestFloor = floors[0];
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

  const canPickup = canPickupMorePassengers(state);
  const effectiveUpCalls = canPickup ? state.upCalls : new Set();
  const effectiveDownCalls = canPickup ? state.downCalls : new Set();

  if (currentDirection === 0) {
    return chooseNearestTarget(state, currentFloorFloat);
  }

  const upServiceFloors = [...new Set([...state.cabinRequests, ...effectiveUpCalls])].sort((a, b) => a - b);
  const downServiceFloors = [...new Set([...state.cabinRequests, ...effectiveDownCalls])].sort((a, b) => a - b);
  const pureUpFloors = [...effectiveUpCalls].sort((a, b) => a - b);
  const pureDownFloors = [...effectiveDownCalls].sort((a, b) => a - b);

  if (currentDirection > 0) {
    const upAhead = upServiceFloors.filter((floor) => floor > currentFloorFloat + FLOOR_EPSILON);
    if (upAhead.length > 0) {
      return buildTargetForFloor(state, upAhead[0], UP);
    }

    const downBelow = downServiceFloors.filter((floor) => floor < currentFloorFloat - FLOOR_EPSILON);
    if (downBelow.length > 0) {
      return buildTargetForFloor(state, downBelow[downBelow.length - 1], DOWN);
    }

    const deferredDownAbove = pureDownFloors.filter((floor) => floor > currentFloorFloat + FLOOR_EPSILON);
    if (deferredDownAbove.length > 0) {
      return buildTargetForFloor(state, deferredDownAbove[0], DOWN);
    }

    return chooseNearestTarget(state, currentFloorFloat);
  }

  const downAhead = downServiceFloors.filter((floor) => floor < currentFloorFloat - FLOOR_EPSILON);
  if (downAhead.length > 0) {
    return buildTargetForFloor(state, downAhead[downAhead.length - 1], DOWN);
  }

  const upAbove = upServiceFloors.filter((floor) => floor > currentFloorFloat + FLOOR_EPSILON);
  if (upAbove.length > 0) {
    return buildTargetForFloor(state, upAbove[0], UP);
  }

  const deferredUpBelow = pureUpFloors.filter((floor) => floor < currentFloorFloat - FLOOR_EPSILON);
  if (deferredUpBelow.length > 0) {
    return buildTargetForFloor(state, deferredUpBelow[deferredUpBelow.length - 1], UP);
  }

  return chooseNearestTarget(state, currentFloorFloat);
}

export function sameTarget(a, b) {
  if (a === null || b === null) {
    return false;
  }
  return a.floor === b.floor && a.source === b.source && a.callDir === b.callDir;
}

export function determineBoardDirection(state, floor, queue) {
  const hasUp = queue.some((p) => p.direction === UP);
  const hasDown = queue.some((p) => p.direction === DOWN);

  if (!hasUp && !hasDown) {
    return 0;
  }

  if (state.direction > 0) {
    if (hasUp) {
      return UP;
    }
    if (!hasRequestsBeyond(state, floor, UP) && hasDown) {
      return DOWN;
    }
    return 0;
  }

  if (state.direction < 0) {
    if (hasDown) {
      return DOWN;
    }
    if (!hasRequestsBeyond(state, floor, DOWN) && hasUp) {
      return UP;
    }
    return 0;
  }

  if (state.activeTarget !== null && state.activeTarget.source === "hall") {
    if (state.activeTarget.callDir === UP && hasUp) {
      return UP;
    }
    if (state.activeTarget.callDir === DOWN && hasDown) {
      return DOWN;
    }
  }

  if (hasUp && !hasDown) {
    return UP;
  }
  if (hasDown && !hasUp) {
    return DOWN;
  }

  return UP;
}

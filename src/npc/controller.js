import {
  DOOR_CLOSE_MS,
  DOOR_OPEN_MS,
  DOWN,
  FLOOR_DWELL_MS,
  FLOOR_EPSILON,
  MAX_CAPACITY,
  MAX_TOTAL_PASSENGERS,
  SPAWN_MAX_MS,
  SPAWN_MIN_MS,
  SPEED_FLOORS_PER_SEC,
  TOTAL_FLOORS,
  UP,
} from "./constants.js";
import {
  Passenger,
  chooseNextTarget,
  determineBoardDirection,
  hasServiceableRequestAtCurrentFloor,
  randomDestination,
  randomFloor,
  randInt,
  sameTarget,
  syncCabinRequests,
  syncRequestSets,
  buildTargetForFloor,
} from "./model.js";
import {
  createDomRefs,
  getCurrentCarY,
  getDoorBoardingPosition,
  getFloorCenterY,
  getFloorFloatFromY,
  getYFromFloor,
  getCarSlotPosition,
  getWaitingSlotPosition,
  layoutWaitRows,
  layoutWaitingFloor,
  makeFloorLines,
  makeIndicators,
  makeWaitRows,
  movePassengerTo,
  refreshUi,
  updateRidingPassengerPositions,
} from "./view.js";

export function initNpcSim() {
  const dom = createDomRefs();
  const state = {
    waitingByFloor: new Map(),
    waitRowMap: new Map(),
    waitCountMap: new Map(),
    cabinLampMap: new Map(),
    hallLampMap: new Map(),
    cabinRequests: new Set(),
    upCalls: new Set(),
    downCalls: new Set(),
    allPassengers: new Map(),
    ridingPassengers: [],
    nextPassengerId: 1,
    currentFloor: 1,
    activeTarget: null,
    direction: 0,
    moving: false,
    doorCycle: false,
    animationFrameId: null,
    dwellTimerId: null,
    spawnTimerId: null,
  };

  function createPassenger(origin, destination) {
    const passenger = new Passenger(state.nextPassengerId, origin, destination);
    state.nextPassengerId += 1;
    return passenger;
  }

  function removePassenger(passenger) {
    state.allPassengers.delete(passenger.id);
    passenger.el.remove();
    scheduleSpawnIfNeeded();
  }

  function addPassengerToWaiting(passenger) {
    const queue = state.waitingByFloor.get(passenger.origin);
    if (!queue) {
      return;
    }

    queue.push(passenger);
    dom.passengerLayerEl.appendChild(passenger.el);
    state.allPassengers.set(passenger.id, passenger);

    const queuePos = getWaitingSlotPosition(dom, passenger.origin, queue.length - 1);
    movePassengerTo(passenger, queuePos.x + randInt(-20, 20), queuePos.y + randInt(-10, 10), {
      duration: 0,
      scale: 0.25,
      opacity: 0,
    });

    requestAnimationFrame(() => {
      layoutWaitingFloor(dom, state, passenger.origin);
    });
  }

  function spawnPassenger() {
    if (state.allPassengers.size >= MAX_TOTAL_PASSENGERS) {
      return;
    }

    const origin = randomFloor();
    const destination = randomDestination(origin);
    const passenger = createPassenger(origin, destination);
    addPassengerToWaiting(passenger);

    syncRequestSets(state);
    refreshUi(dom, state);

    if (state.moving) {
      maybePreemptTarget(getFloorFloatFromY(dom, getCurrentCarY(dom, state.currentFloor)));
    } else if (!state.doorCycle) {
      dispatchNextMove();
    }
  }

  function scheduleSpawnIfNeeded() {
    if (state.spawnTimerId !== null) {
      return;
    }

    if (state.allPassengers.size >= MAX_TOTAL_PASSENGERS) {
      return;
    }

    const delay = randInt(SPAWN_MIN_MS, SPAWN_MAX_MS);
    state.spawnTimerId = window.setTimeout(() => {
      state.spawnTimerId = null;

      if (state.allPassengers.size < MAX_TOTAL_PASSENGERS) {
        spawnPassenger();
      }

      scheduleSpawnIfNeeded();
    }, delay);
  }

  function clearAnimation() {
    if (state.animationFrameId !== null) {
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
  }

  function maybePreemptTarget(positionFloorFloat) {
    if (!state.moving || state.activeTarget === null || state.direction === 0) {
      return false;
    }

    const nextTarget = chooseNextTarget(state, positionFloorFloat, state.direction);
    if (nextTarget === null || sameTarget(nextTarget, state.activeTarget)) {
      return false;
    }

    if (state.direction > 0) {
      if (
        nextTarget.floor > positionFloorFloat + FLOOR_EPSILON &&
        nextTarget.floor < state.activeTarget.floor - FLOOR_EPSILON
      ) {
        startMoveTo(nextTarget);
        return true;
      }
      return false;
    }

    if (
      nextTarget.floor < positionFloorFloat - FLOOR_EPSILON &&
      nextTarget.floor > state.activeTarget.floor + FLOOR_EPSILON
    ) {
      startMoveTo(nextTarget);
      return true;
    }

    return false;
  }

  function unloadPassengersAtFloor(floor) {
    const leaving = state.ridingPassengers.filter((p) => p.destination === floor);
    if (leaving.length === 0) {
      return 0;
    }

    state.ridingPassengers = state.ridingPassengers.filter((p) => p.destination !== floor);
    syncCabinRequests(state);
    updateRidingPassengerPositions(dom, state, true);
    refreshUi(dom, state);

    for (let i = 0; i < leaving.length; i += 1) {
      const passenger = leaving[i];
      passenger.state = "exiting";
      passenger.el.classList.remove("waiting");

      const exitX = dom.waitAreasEl.offsetLeft + dom.waitAreasEl.clientWidth + 16 + (i % 3) * 9;
      const exitY = getFloorCenterY(dom, floor) - 7 + (i % 2) * 8;
      const delay = i * 100;

      window.setTimeout(() => {
        movePassengerTo(passenger, exitX, exitY, { duration: 190, scale: 1, opacity: 1 });
        window.setTimeout(() => {
          movePassengerTo(passenger, exitX + 42, exitY - 8, { duration: 220, scale: 0.25, opacity: 0 });
        }, 120);
        window.setTimeout(() => {
          removePassenger(passenger);
        }, 360);
      }, delay);
    }

    return leaving.length * 100 + 360;
  }

  function boardPassengersAtFloor(floor) {
    const queue = state.waitingByFloor.get(floor) || [];
    if (queue.length === 0) {
      return 0;
    }

    const capacityLeft = MAX_CAPACITY - state.ridingPassengers.length;
    if (capacityLeft <= 0) {
      return 220;
    }

    const boardDir = determineBoardDirection(state, floor, queue);
    if (boardDir === 0) {
      return 200;
    }

    const selected = [];
    for (let i = 0; i < queue.length; i += 1) {
      if (queue[i].direction === boardDir) {
        selected.push(queue[i]);
      }
      if (selected.length >= capacityLeft) {
        break;
      }
    }

    if (selected.length === 0) {
      return 160;
    }

    const remaining = queue.filter((p) => !selected.includes(p));
    state.waitingByFloor.set(floor, remaining);
    layoutWaitingFloor(dom, state, floor);

    for (let i = 0; i < selected.length; i += 1) {
      const passenger = selected[i];
      passenger.state = "boarding";
      passenger.el.classList.remove("waiting");

      const slotIndex = state.ridingPassengers.length;
      state.ridingPassengers.push(passenger);

      const doorPos = getDoorBoardingPosition(dom, floor, slotIndex);
      const carY = getCurrentCarY(dom, state.currentFloor);
      const slotPos = getCarSlotPosition(dom, slotIndex, carY);
      const delay = i * 120;

      window.setTimeout(() => {
        movePassengerTo(passenger, doorPos.x, doorPos.y, { duration: 180, scale: 1, opacity: 1 });
        window.setTimeout(() => {
          movePassengerTo(passenger, slotPos.x, slotPos.y, { duration: 220, scale: 1, opacity: 1 });
          passenger.state = "riding";
        }, 120);
      }, delay);
    }

    if (state.direction === 0 && selected.length > 0) {
      state.direction = selected[0].direction;
    }

    syncRequestSets(state);
    refreshUi(dom, state);

    return selected.length * 120 + 300;
  }

  function beginStopSequence(floor) {
    if (state.doorCycle) {
      return;
    }

    state.doorCycle = true;
    state.currentFloor = floor;
    state.moving = false;
    dom.carEl.classList.add("door-open");
    refreshUi(dom, state);

    const unloadDuration = unloadPassengersAtFloor(floor);
    const boardStartDelay = Math.max(DOOR_OPEN_MS, unloadDuration);

    window.setTimeout(() => {
      const boardDuration = boardPassengersAtFloor(floor);
      const holdDuration = Math.max(FLOOR_DWELL_MS, boardDuration);

      window.setTimeout(() => {
        dom.carEl.classList.remove("door-open");

        state.dwellTimerId = window.setTimeout(() => {
          state.dwellTimerId = null;
          state.doorCycle = false;
          syncRequestSets(state);
          refreshUi(dom, state);
          dispatchNextMove();
        }, DOOR_CLOSE_MS);
      }, holdDuration);
    }, boardStartDelay);
  }

  function startMoveTo(target) {
    clearAnimation();

    const startY = getCurrentCarY(dom, state.currentFloor);
    const startFloorFloat = getFloorFloatFromY(dom, startY);

    if (Math.abs(target.floor - startFloorFloat) <= FLOOR_EPSILON) {
      state.activeTarget = target;
      refreshUi(dom, state);
      beginStopSequence(Math.round(startFloorFloat));
      return;
    }

    const endY = getYFromFloor(dom, target.floor);
    state.activeTarget = target;
    state.moving = true;

    if (target.floor > startFloorFloat) {
      state.direction = UP;
    } else {
      state.direction = DOWN;
    }

    const floorDistance = Math.abs(target.floor - startFloorFloat);
    const durationMs = Math.max(360, (floorDistance / SPEED_FLOORS_PER_SEC) * 1000);
    const startTime = performance.now();

    refreshUi(dom, state);

    function tick(now) {
      const t = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const y = startY + (endY - startY) * eased;

      dom.carEl.style.transform = `translateY(${y}px)`;
      updateRidingPassengerPositions(dom, state, true);
      refreshUi(dom, state);

      const floorFloat = getFloorFloatFromY(dom, y);
      const preempted = maybePreemptTarget(floorFloat);
      if (preempted || !state.moving) {
        return;
      }

      if (t < 1) {
        state.animationFrameId = requestAnimationFrame(tick);
        return;
      }

      state.moving = false;
      state.currentFloor = target.floor;
      dom.carEl.style.transform = `translateY(${getYFromFloor(dom, state.currentFloor)}px)`;
      updateRidingPassengerPositions(dom, state, true);
      beginStopSequence(target.floor);
    }

    state.animationFrameId = requestAnimationFrame(tick);
  }

  function dispatchNextMove() {
    if (state.moving || state.doorCycle) {
      return;
    }

    syncRequestSets(state);

    const currentFloorFloat = getFloorFloatFromY(dom, getCurrentCarY(dom, state.currentFloor));
    const floorAtPosition = Math.round(currentFloorFloat);

    if (hasServiceableRequestAtCurrentFloor(state, floorAtPosition)) {
      state.activeTarget = buildTargetForFloor(state, floorAtPosition, state.direction);
      refreshUi(dom, state);
      beginStopSequence(floorAtPosition);
      return;
    }

    const nextTarget = chooseNextTarget(state, currentFloorFloat, state.direction);
    if (nextTarget === null) {
      state.direction = 0;
      state.activeTarget = null;
      refreshUi(dom, state);
      return;
    }

    startMoveTo(nextTarget);
  }

  function warmUpPassengers() {
    for (let i = 0; i < 5; i += 1) {
      spawnPassenger();
    }
  }

  function handleResize() {
    makeFloorLines(dom);
    layoutWaitRows(dom, state);

    for (let floor = 1; floor <= TOTAL_FLOORS; floor += 1) {
      layoutWaitingFloor(dom, state, floor);
    }

    if (!state.moving) {
      dom.carEl.style.transform = `translateY(${getYFromFloor(dom, state.currentFloor)}px)`;
      updateRidingPassengerPositions(dom, state, true);
    }

    refreshUi(dom, state);
  }

  function initState() {
    for (let floor = 1; floor <= TOTAL_FLOORS; floor += 1) {
      state.waitingByFloor.set(floor, []);
    }
  }

  initState();
  makeFloorLines(dom);
  makeWaitRows(dom, state);
  makeIndicators(dom, state);
  layoutWaitRows(dom, state);

  dom.carEl.style.transform = `translateY(${getYFromFloor(dom, state.currentFloor)}px)`;
  refreshUi(dom, state);

  warmUpPassengers();
  dispatchNextMove();
  scheduleSpawnIfNeeded();

  window.addEventListener("resize", handleResize);
}

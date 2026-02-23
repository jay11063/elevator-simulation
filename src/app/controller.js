import {
  DOWN,
  FLOOR_DWELL_MS,
  FLOOR_EPSILON,
  SPEED_FLOORS_PER_SEC,
  TOTAL_FLOORS,
  UP,
} from "./constants.js";
import {
  chooseNextTarget,
  getCallSet,
  hasAnyRequests,
  isValidCall,
  sameTarget,
} from "./model.js";
import {
  createDomRefs,
  getCurrentCarY,
  getFloorFloatFromY,
  makeCabinButtons,
  makeFloorLines,
  makeHallButtons,
  placeCarAtFloor,
  refreshUi,
  getYFromFloor,
} from "./view.js";

export function initApp() {
  const dom = createDomRefs();
  const state = {
    cabinRequests: new Set(),
    upCalls: new Set(),
    downCalls: new Set(),
    currentFloor: 1,
    activeTarget: null,
    direction: 0,
    moving: false,
    animationFrameId: null,
    dwellTimerId: null,
  };

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

  function finishArrival(target) {
    state.moving = false;
    state.currentFloor = target.floor;
    state.activeTarget = null;

    // One stop serves all requests currently pending at this floor.
    state.cabinRequests.delete(target.floor);
    state.upCalls.delete(target.floor);
    state.downCalls.delete(target.floor);

    placeCarAtFloor(dom, state.currentFloor);
    refreshUi(dom, state);

    state.dwellTimerId = window.setTimeout(() => {
      state.dwellTimerId = null;
      dispatchNextMove();
    }, FLOOR_DWELL_MS);
  }

  function startMoveTo(target) {
    clearAnimation();

    const startY = getCurrentCarY(dom, state.currentFloor);
    const startFloorFloat = getFloorFloatFromY(dom, startY);
    const endY = getYFromFloor(dom, target.floor);

    state.activeTarget = target;
    state.moving = true;

    if (target.floor > startFloorFloat + FLOOR_EPSILON) {
      state.direction = UP;
    } else if (target.floor < startFloorFloat - FLOOR_EPSILON) {
      state.direction = DOWN;
    }

    const floorDistance = Math.abs(target.floor - startFloorFloat);
    const durationMs = Math.max(350, (floorDistance / SPEED_FLOORS_PER_SEC) * 1000);
    const startTime = performance.now();

    refreshUi(dom, state);

    function tick(now) {
      const t = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const y = startY + (endY - startY) * eased;

      dom.carEl.style.transform = `translateY(${y}px)`;

      const floorFloat = getFloorFloatFromY(dom, y);
      refreshUi(dom, state);

      const preempted = maybePreemptTarget(floorFloat);
      if (preempted || !state.moving) {
        return;
      }

      if (t < 1) {
        state.animationFrameId = requestAnimationFrame(tick);
        return;
      }

      finishArrival(target);
    }

    state.animationFrameId = requestAnimationFrame(tick);
  }

  function dispatchNextMove() {
    if (state.moving) {
      return;
    }

    const currentFloorFloat = getFloorFloatFromY(dom, getCurrentCarY(dom, state.currentFloor));
    const nextTarget = chooseNextTarget(state, currentFloorFloat, state.direction);

    if (nextTarget === null) {
      state.direction = 0;
      refreshUi(dom, state);
      return;
    }

    startMoveTo(nextTarget);
  }

  function requestCabinFloor(floor) {
    const currentFloorFloat = getFloorFloatFromY(dom, getCurrentCarY(dom, state.currentFloor));

    if (state.moving && state.activeTarget !== null && state.activeTarget.floor === floor) {
      return;
    }

    if (state.cabinRequests.has(floor)) {
      state.cabinRequests.delete(floor);
      refreshUi(dom, state);

      if (!state.moving && !hasAnyRequests(state)) {
        state.direction = 0;
        refreshUi(dom, state);
      }
      return;
    }

    if (!state.moving && Math.abs(floor - currentFloorFloat) <= FLOOR_EPSILON) {
      return;
    }

    state.cabinRequests.add(floor);
    refreshUi(dom, state);

    if (state.moving) {
      maybePreemptTarget(currentFloorFloat);
      return;
    }

    if (state.dwellTimerId !== null) {
      return;
    }

    dispatchNextMove();
  }

  function requestHallCall(floor, callDir) {
    if (!isValidCall(floor, callDir, TOTAL_FLOORS)) {
      return;
    }

    const currentFloorFloat = getFloorFloatFromY(dom, getCurrentCarY(dom, state.currentFloor));
    const set = getCallSet(state, callDir);

    if (set.has(floor)) {
      return;
    }

    if (!state.moving && Math.abs(floor - currentFloorFloat) <= FLOOR_EPSILON) {
      return;
    }

    set.add(floor);
    refreshUi(dom, state);

    if (state.moving) {
      maybePreemptTarget(currentFloorFloat);
      return;
    }

    if (state.dwellTimerId !== null) {
      return;
    }

    dispatchNextMove();
  }

  function handleResize() {
    makeFloorLines(dom);

    if (!state.moving) {
      placeCarAtFloor(dom, state.currentFloor);
      refreshUi(dom, state);
    }
  }

  makeFloorLines(dom);
  makeCabinButtons(dom, requestCabinFloor);
  makeHallButtons(dom, requestHallCall, (floor, callDir) => isValidCall(floor, callDir, TOTAL_FLOORS));
  placeCarAtFloor(dom, state.currentFloor);
  refreshUi(dom, state);

  window.addEventListener("resize", handleResize);
}

const TOTAL_FLOORS = 10;
const FLOOR_DWELL_MS = 700;
const SPEED_FLOORS_PER_SEC = 0.95;
const CAR_HEIGHT = 54;
const FLOOR_EPSILON = 0.001;

const shaftEl = document.getElementById("shaft");
const floorsEl = document.getElementById("floors");
const carEl = document.getElementById("car");
const carDisplayEl = document.getElementById("car-display");
const floorButtonsEl = document.getElementById("floor-buttons");

const currentFloorEl = document.getElementById("current-floor");
const targetFloorEl = document.getElementById("target-floor");
const directionEl = document.getElementById("direction");

const floorButtons = new Map();
const requestedFloors = new Set();

let currentFloor = 1;
let activeTargetFloor = null;
let direction = 0;
let moving = false;
let animationFrameId = null;
let dwellTimerId = null;

function getTravelHeight() {
  return Math.max(shaftEl.clientHeight - CAR_HEIGHT, 0);
}

function getYFromFloor(floor) {
  const travelHeight = getTravelHeight();
  const ratio = (floor - 1) / (TOTAL_FLOORS - 1);
  return travelHeight - travelHeight * ratio;
}

function getFloorFloatFromY(y) {
  const travelHeight = getTravelHeight();
  if (travelHeight === 0) {
    return 1;
  }

  const ratio = (travelHeight - y) / travelHeight;
  const raw = ratio * (TOTAL_FLOORS - 1) + 1;
  return Math.min(TOTAL_FLOORS, Math.max(1, raw));
}

function getFloorFromY(y) {
  return Math.round(getFloorFloatFromY(y));
}

function getCurrentCarY() {
  const transform = getComputedStyle(carEl).transform;
  if (transform && transform !== "none") {
    const values = transform.match(/matrix\((.+)\)/);
    if (values && values[1]) {
      const parts = values[1].split(",").map(Number);
      return parts[5] || 0;
    }
  }
  return getYFromFloor(currentFloor);
}

function placeCarAtFloor(floor) {
  carEl.style.transform = `translateY(${getYFromFloor(floor)}px)`;
}

function makeFloorLines() {
  floorsEl.innerHTML = "";

  for (let floor = TOTAL_FLOORS; floor >= 1; floor -= 1) {
    const line = document.createElement("div");
    line.className = "floor-line";
    line.style.top = `${Math.max(0, getYFromFloor(floor) + CAR_HEIGHT / 2)}px`;

    const label = document.createElement("span");
    label.className = "floor-label";
    label.textContent = `F${floor}`;

    line.appendChild(label);
    floorsEl.appendChild(line);
  }
}

function makeFloorButtons() {
  floorButtonsEl.innerHTML = "";
  floorButtons.clear();

  for (let floor = TOTAL_FLOORS; floor >= 1; floor -= 1) {
    const button = document.createElement("button");
    button.className = "floor-btn";
    button.type = "button";
    button.textContent = `F${floor}`;
    button.addEventListener("click", () => requestFloor(floor));

    floorButtons.set(floor, button);
    floorButtonsEl.appendChild(button);
  }
}

function getDirectionLabel(value) {
  if (value > 0) {
    return "Up";
  }
  if (value < 0) {
    return "Down";
  }
  return "Idle";
}

function updateStatus() {
  const liveFloor = getFloorFromY(getCurrentCarY());
  currentFloorEl.textContent = String(liveFloor);
  carDisplayEl.textContent = String(liveFloor);
  targetFloorEl.textContent = activeTargetFloor === null ? "-" : String(activeTargetFloor);
  directionEl.textContent = getDirectionLabel(direction);
}

function updateButtons() {
  const liveFloor = getFloorFromY(getCurrentCarY());

  for (let floor = 1; floor <= TOTAL_FLOORS; floor += 1) {
    const button = floorButtons.get(floor);
    if (!button) {
      continue;
    }

    button.classList.toggle("is-queued", requestedFloors.has(floor));
    button.classList.toggle("is-target", activeTargetFloor === floor);
    button.classList.toggle("is-current", liveFloor === floor);
    button.disabled = moving && activeTargetFloor === floor;
  }
}

function chooseNextFloor(currentFloorFloat, currentDirection) {
  if (requestedFloors.size === 0) {
    return null;
  }

  const floors = [...requestedFloors].sort((a, b) => a - b);
  const above = floors.filter((floor) => floor > currentFloorFloat + FLOOR_EPSILON);
  const below = floors.filter((floor) => floor < currentFloorFloat - FLOOR_EPSILON);

  if (currentDirection > 0) {
    if (above.length > 0) {
      return above[0];
    }
    if (below.length > 0) {
      return below[below.length - 1];
    }
  } else if (currentDirection < 0) {
    if (below.length > 0) {
      return below[below.length - 1];
    }
    if (above.length > 0) {
      return above[0];
    }
  } else {
    let nearestFloor = floors[0];
    let nearestDistance = Math.abs(floors[0] - currentFloorFloat);

    for (let i = 1; i < floors.length; i += 1) {
      const floor = floors[i];
      const distance = Math.abs(floor - currentFloorFloat);

      if (distance < nearestDistance) {
        nearestFloor = floor;
        nearestDistance = distance;
      }
    }

    return nearestFloor;
  }

  return floors[0];
}

function clearAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function maybePreemptTarget(positionFloorFloat) {
  if (!moving || activeTargetFloor === null || direction === 0) {
    return false;
  }

  const nextPreferred = chooseNextFloor(positionFloorFloat, direction);
  if (nextPreferred === null || nextPreferred === activeTargetFloor) {
    return false;
  }

  if (direction > 0) {
    if (nextPreferred > positionFloorFloat + FLOOR_EPSILON && nextPreferred < activeTargetFloor) {
      startMoveTo(nextPreferred);
      return true;
    }
    return false;
  }

  if (nextPreferred < positionFloorFloat - FLOOR_EPSILON && nextPreferred > activeTargetFloor) {
    startMoveTo(nextPreferred);
    return true;
  }

  return false;
}

function startMoveTo(targetFloor) {
  clearAnimation();

  const startY = getCurrentCarY();
  const startFloorFloat = getFloorFloatFromY(startY);
  const endY = getYFromFloor(targetFloor);

  activeTargetFloor = targetFloor;
  moving = true;
  direction = targetFloor > startFloorFloat ? 1 : -1;

  const floorDistance = Math.abs(targetFloor - startFloorFloat);
  const durationMs = Math.max(350, (floorDistance / SPEED_FLOORS_PER_SEC) * 1000);
  const startTime = performance.now();

  updateStatus();
  updateButtons();

  function tick(now) {
    const t = Math.min((now - startTime) / durationMs, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const y = startY + (endY - startY) * eased;

    carEl.style.transform = `translateY(${y}px)`;

    const floorFloat = getFloorFloatFromY(y);
    updateStatus();
    updateButtons();
    const preempted = maybePreemptTarget(floorFloat);
    if (preempted || !moving) {
      return;
    }

    if (t < 1) {
      animationFrameId = requestAnimationFrame(tick);
      return;
    }

    moving = false;
    currentFloor = targetFloor;
    requestedFloors.delete(targetFloor);
    activeTargetFloor = null;
    carEl.style.transform = `translateY(${getYFromFloor(currentFloor)}px)`;

    updateStatus();
    updateButtons();

    dwellTimerId = window.setTimeout(() => {
      dwellTimerId = null;
      dispatchNextMove();
    }, FLOOR_DWELL_MS);
  }

  animationFrameId = requestAnimationFrame(tick);
}

function dispatchNextMove() {
  if (moving) {
    return;
  }

  const currentFloorFloat = getFloorFloatFromY(getCurrentCarY());
  const nextFloor = chooseNextFloor(currentFloorFloat, direction);

  if (nextFloor === null) {
    direction = 0;
    updateStatus();
    updateButtons();
    return;
  }

  startMoveTo(nextFloor);
}

function requestFloor(floor) {
  const currentFloorFloat = getFloorFloatFromY(getCurrentCarY());

  if (requestedFloors.has(floor)) {
    // Active target cannot be canceled while the car is already moving to it.
    if (floor === activeTargetFloor) {
      return;
    }

    requestedFloors.delete(floor);
    updateButtons();

    if (!moving && requestedFloors.size === 0) {
      direction = 0;
      updateStatus();
    }
    return;
  }

  if (Math.abs(floor - currentFloorFloat) <= FLOOR_EPSILON && !moving) {
    return;
  }

  requestedFloors.add(floor);
  updateButtons();

  if (moving) {
    maybePreemptTarget(currentFloorFloat);
    return;
  }

  if (dwellTimerId !== null) {
    return;
  }

  dispatchNextMove();
}

function handleResize() {
  makeFloorLines();

  if (!moving) {
    placeCarAtFloor(currentFloor);
    updateStatus();
    updateButtons();
  }
}

function init() {
  makeFloorLines();
  makeFloorButtons();
  placeCarAtFloor(currentFloor);
  direction = 0;
  updateStatus();
  updateButtons();

  window.addEventListener("resize", handleResize);
}

init();



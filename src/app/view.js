import { CAR_HEIGHT, TOTAL_FLOORS } from "./constants.js";
import { callKey } from "./model.js";

export function createDomRefs() {
  return {
    shaftEl: document.getElementById("shaft"),
    floorsEl: document.getElementById("floors"),
    carEl: document.getElementById("car"),
    carDisplayEl: document.getElementById("car-display"),
    cabinButtonsEl: document.getElementById("cabin-buttons"),
    hallButtonsEl: document.getElementById("hall-buttons"),
    currentFloorEl: document.getElementById("current-floor"),
    targetFloorEl: document.getElementById("target-floor"),
    directionEl: document.getElementById("direction"),
    cabinButtons: new Map(),
    hallButtons: new Map(),
    hallRows: new Map(),
  };
}

export function getTravelHeight(dom) {
  return Math.max(dom.shaftEl.clientHeight - CAR_HEIGHT, 0);
}

export function getYFromFloor(dom, floor) {
  const travelHeight = getTravelHeight(dom);
  const ratio = (floor - 1) / (TOTAL_FLOORS - 1);
  return travelHeight - travelHeight * ratio;
}

export function getFloorFloatFromY(dom, y) {
  const travelHeight = getTravelHeight(dom);
  if (travelHeight === 0) {
    return 1;
  }

  const ratio = (travelHeight - y) / travelHeight;
  const raw = ratio * (TOTAL_FLOORS - 1) + 1;
  return Math.min(TOTAL_FLOORS, Math.max(1, raw));
}

export function getFloorFromY(dom, y) {
  return Math.round(getFloorFloatFromY(dom, y));
}

export function getCurrentCarY(dom, currentFloor) {
  const transform = getComputedStyle(dom.carEl).transform;
  if (transform && transform !== "none") {
    const values = transform.match(/matrix\((.+)\)/);
    if (values && values[1]) {
      const parts = values[1].split(",").map(Number);
      return parts[5] || 0;
    }
  }
  return getYFromFloor(dom, currentFloor);
}

export function placeCarAtFloor(dom, floor) {
  dom.carEl.style.transform = `translateY(${getYFromFloor(dom, floor)}px)`;
}

export function makeFloorLines(dom) {
  dom.floorsEl.innerHTML = "";

  for (let floor = TOTAL_FLOORS; floor >= 1; floor -= 1) {
    const line = document.createElement("div");
    line.className = "floor-line";
    line.style.top = `${Math.max(0, getYFromFloor(dom, floor) + CAR_HEIGHT / 2)}px`;

    const label = document.createElement("span");
    label.className = "floor-label";
    label.textContent = `F${floor}`;

    line.appendChild(label);
    dom.floorsEl.appendChild(line);
  }
}

export function makeCabinButtons(dom, onCabinRequest) {
  dom.cabinButtonsEl.innerHTML = "";
  dom.cabinButtons.clear();

  for (let floor = TOTAL_FLOORS; floor >= 1; floor -= 1) {
    const button = document.createElement("button");
    button.className = "cabin-btn";
    button.type = "button";
    button.textContent = `F${floor}`;
    button.addEventListener("click", () => onCabinRequest(floor));

    dom.cabinButtons.set(floor, button);
    dom.cabinButtonsEl.appendChild(button);
  }
}

export function makeHallButtons(dom, onHallRequest, isValidCall) {
  dom.hallButtonsEl.innerHTML = "";
  dom.hallButtons.clear();
  dom.hallRows.clear();

  for (let floor = TOTAL_FLOORS; floor >= 1; floor -= 1) {
    const row = document.createElement("div");
    row.className = "hall-row";

    const floorLabel = document.createElement("span");
    floorLabel.className = "hall-floor";
    floorLabel.textContent = `F${floor}`;

    const actions = document.createElement("div");
    actions.className = "hall-actions";

    const downButton = document.createElement("button");
    downButton.className = "hall-btn";
    downButton.type = "button";
    downButton.textContent = "Down";

    if (isValidCall(floor, -1)) {
      downButton.addEventListener("click", () => onHallRequest(floor, -1));
      dom.hallButtons.set(callKey(floor, -1), { button: downButton, floor, callDir: -1 });
    } else {
      downButton.disabled = true;
    }

    const upButton = document.createElement("button");
    upButton.className = "hall-btn";
    upButton.type = "button";
    upButton.textContent = "Up";

    if (isValidCall(floor, 1)) {
      upButton.addEventListener("click", () => onHallRequest(floor, 1));
      dom.hallButtons.set(callKey(floor, 1), { button: upButton, floor, callDir: 1 });
    } else {
      upButton.disabled = true;
    }

    actions.appendChild(downButton);
    actions.appendChild(upButton);
    row.appendChild(floorLabel);
    row.appendChild(actions);
    dom.hallButtonsEl.appendChild(row);

    dom.hallRows.set(floor, row);
  }
}

function getDirectionLabel(direction) {
  if (direction > 0) {
    return "Up";
  }
  if (direction < 0) {
    return "Down";
  }
  return "Idle";
}

function getTargetLabel(target) {
  if (target === null) {
    return "-";
  }

  if (target.source === "cabin") {
    return `F${target.floor} Cabin`;
  }

  return `F${target.floor} Hall ${target.callDir > 0 ? "Up" : "Down"}`;
}

export function updateStatus(dom, state) {
  const liveFloor = getFloorFromY(dom, getCurrentCarY(dom, state.currentFloor));
  dom.currentFloorEl.textContent = String(liveFloor);
  dom.carDisplayEl.textContent = String(liveFloor);
  dom.targetFloorEl.textContent = getTargetLabel(state.activeTarget);
  dom.directionEl.textContent = getDirectionLabel(state.direction);
}

export function updateButtons(dom, state) {
  const liveFloor = getFloorFromY(dom, getCurrentCarY(dom, state.currentFloor));

  for (let floor = 1; floor <= TOTAL_FLOORS; floor += 1) {
    const button = dom.cabinButtons.get(floor);
    if (!button) {
      continue;
    }

    const isQueued = state.cabinRequests.has(floor);
    const isTarget = state.activeTarget !== null && state.activeTarget.floor === floor;

    button.classList.toggle("is-queued", isQueued);
    button.classList.toggle("is-target", isTarget);
    button.classList.toggle("is-current", liveFloor === floor);
    button.disabled = state.moving && isTarget;
  }

  for (let floor = 1; floor <= TOTAL_FLOORS; floor += 1) {
    const row = dom.hallRows.get(floor);
    if (!row) {
      continue;
    }
    row.classList.toggle("is-current", floor === liveFloor);
  }

  for (const item of dom.hallButtons.values()) {
    const set = item.callDir > 0 ? state.upCalls : state.downCalls;
    const isQueued = set.has(item.floor);
    const isTarget =
      state.activeTarget !== null &&
      state.activeTarget.source === "hall" &&
      state.activeTarget.floor === item.floor &&
      state.activeTarget.callDir === item.callDir;

    item.button.classList.toggle("is-queued", isQueued);
    item.button.classList.toggle("is-target", isTarget);
  }
}

export function refreshUi(dom, state) {
  updateStatus(dom, state);
  updateButtons(dom, state);
}

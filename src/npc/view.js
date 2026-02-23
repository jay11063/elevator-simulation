import { CAR_HEIGHT, MAX_CAPACITY, TOTAL_FLOORS } from "./constants.js";
import { getDirectionLabel } from "./model.js";

export function createDomRefs() {
  return {
    towerEl: document.getElementById("tower"),
    waitAreasEl: document.getElementById("wait-areas"),
    shaftEl: document.getElementById("shaft"),
    floorsEl: document.getElementById("floors"),
    carEl: document.getElementById("car"),
    carDisplayEl: document.getElementById("car-display"),
    passengerLayerEl: document.getElementById("passenger-layer"),
    metricFloorEl: document.getElementById("metric-floor"),
    metricDirectionEl: document.getElementById("metric-direction"),
    metricTargetEl: document.getElementById("metric-target"),
    metricLoadEl: document.getElementById("metric-load"),
    cabinIndicatorEl: document.getElementById("cabin-indicator"),
    hallIndicatorEl: document.getElementById("hall-indicator"),
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

export function getFloorCenterY(dom, floor) {
  return getYFromFloor(dom, floor) + CAR_HEIGHT / 2;
}

export function movePassengerTo(passenger, x, y, options = {}) {
  const duration = options.duration ?? 260;
  const scale = options.scale ?? 1;
  const opacity = options.opacity ?? 1;

  passenger.el.style.transitionDuration = `${duration}ms`;
  passenger.el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  passenger.el.style.opacity = String(opacity);
}

export function getWaitingSlotPosition(dom, floor, index) {
  const perRow = 7;
  const col = index % perRow;
  const row = Math.floor(index / perRow);

  const rightX = dom.waitAreasEl.offsetLeft + dom.waitAreasEl.clientWidth - 18;
  const x = rightX - col * 18 - row * 6;
  const y = getFloorCenterY(dom, floor) - 7 - row * 14;

  return { x, y };
}

export function getCarSlotPosition(dom, index, carY) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  const x = dom.shaftEl.offsetLeft + dom.carEl.offsetLeft + 18 + col * 27;
  const y = carY + 12 + row * 20;
  return { x, y };
}

export function getDoorBoardingPosition(dom, floor, index) {
  const laneOffset = (index % 3) * 8;
  const x = dom.shaftEl.offsetLeft + 14 - laneOffset;
  const y = getFloorCenterY(dom, floor) - 7 + (index % 2) * 7;
  return { x, y };
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

export function makeWaitRows(dom, state) {
  dom.waitAreasEl.innerHTML = "";
  state.waitRowMap.clear();
  state.waitCountMap.clear();

  for (let floor = TOTAL_FLOORS; floor >= 1; floor -= 1) {
    const row = document.createElement("div");
    row.className = "wait-row";

    const floorLabel = document.createElement("span");
    floorLabel.textContent = `F${floor} queue`;

    const count = document.createElement("strong");
    count.textContent = "0";

    row.appendChild(floorLabel);
    row.appendChild(count);
    dom.waitAreasEl.appendChild(row);

    state.waitRowMap.set(floor, row);
    state.waitCountMap.set(floor, count);
  }
}

export function layoutWaitRows(dom, state) {
  for (let floor = 1; floor <= TOTAL_FLOORS; floor += 1) {
    const row = state.waitRowMap.get(floor);
    if (!row) {
      continue;
    }
    row.style.top = `${getFloorCenterY(dom, floor) - 19}px`;
  }
}

export function makeIndicators(dom, state) {
  dom.cabinIndicatorEl.innerHTML = "";
  dom.hallIndicatorEl.innerHTML = "";
  state.cabinLampMap.clear();
  state.hallLampMap.clear();

  for (let floor = TOTAL_FLOORS; floor >= 1; floor -= 1) {
    const cabinRow = document.createElement("div");
    cabinRow.className = "light-row";
    cabinRow.innerHTML = `<span class="label">F${floor}</span>`;
    const cabinLamp = document.createElement("span");
    cabinLamp.className = "lamp";
    cabinRow.appendChild(cabinLamp);
    dom.cabinIndicatorEl.appendChild(cabinRow);
    state.cabinLampMap.set(floor, cabinLamp);

    const hallRow = document.createElement("div");
    hallRow.className = "light-row";
    hallRow.innerHTML = `<span class="label">F${floor}</span>`;

    const hallLamps = document.createElement("span");
    hallLamps.className = "hall-lamps";

    const downLamp = document.createElement("span");
    downLamp.className = "lamp-mini";
    if (floor === 1) {
      downLamp.classList.add("is-disabled");
    }

    const upLamp = document.createElement("span");
    upLamp.className = "lamp-mini";
    if (floor === TOTAL_FLOORS) {
      upLamp.classList.add("is-disabled");
    }

    hallLamps.appendChild(downLamp);
    hallLamps.appendChild(upLamp);
    hallRow.appendChild(hallLamps);
    dom.hallIndicatorEl.appendChild(hallRow);

    state.hallLampMap.set(`${floor}:down`, downLamp);
    state.hallLampMap.set(`${floor}:up`, upLamp);
  }
}

export function updateStatus(dom, state) {
  const liveFloor = getFloorFromY(dom, getCurrentCarY(dom, state.currentFloor));
  dom.metricFloorEl.textContent = String(liveFloor);
  dom.carDisplayEl.textContent = String(liveFloor);
  dom.metricDirectionEl.textContent = getDirectionLabel(state.direction);

  if (state.activeTarget === null) {
    dom.metricTargetEl.textContent = "-";
  } else if (state.activeTarget.source === "cabin") {
    dom.metricTargetEl.textContent = `F${state.activeTarget.floor} cabin`;
  } else {
    dom.metricTargetEl.textContent = `F${state.activeTarget.floor} hall ${state.activeTarget.callDir > 0 ? "up" : "down"}`;
  }

  dom.metricLoadEl.textContent = `${state.ridingPassengers.length} / ${MAX_CAPACITY}`;
}

export function updateWaitRows(state) {
  for (let floor = 1; floor <= TOTAL_FLOORS; floor += 1) {
    const row = state.waitRowMap.get(floor);
    const count = state.waitCountMap.get(floor);
    const queue = state.waitingByFloor.get(floor) || [];
    if (!row || !count) {
      continue;
    }

    count.textContent = String(queue.length);

    const hasUp = queue.some((p) => p.direction > 0);
    const hasDown = queue.some((p) => p.direction < 0);
    row.classList.toggle("call-up", hasUp);
    row.classList.toggle("call-down", hasDown);
  }
}

export function updateIndicators(state) {
  for (let floor = 1; floor <= TOTAL_FLOORS; floor += 1) {
    const cabinLamp = state.cabinLampMap.get(floor);
    if (cabinLamp) {
      cabinLamp.classList.toggle("is-on", state.cabinRequests.has(floor));
      cabinLamp.classList.toggle(
        "is-target",
        state.activeTarget !== null && state.activeTarget.floor === floor && state.activeTarget.source === "cabin",
      );
    }

    const downLamp = state.hallLampMap.get(`${floor}:down`);
    if (downLamp) {
      downLamp.classList.toggle("is-on", state.downCalls.has(floor));
      downLamp.classList.toggle(
        "is-target",
        state.activeTarget !== null &&
          state.activeTarget.floor === floor &&
          state.activeTarget.source === "hall" &&
          state.activeTarget.callDir < 0,
      );
    }

    const upLamp = state.hallLampMap.get(`${floor}:up`);
    if (upLamp) {
      upLamp.classList.toggle("is-on", state.upCalls.has(floor));
      upLamp.classList.toggle(
        "is-target",
        state.activeTarget !== null &&
          state.activeTarget.floor === floor &&
          state.activeTarget.source === "hall" &&
          state.activeTarget.callDir > 0,
      );
    }
  }
}

export function refreshUi(dom, state) {
  updateStatus(dom, state);
  updateWaitRows(state);
  updateIndicators(state);
}

export function layoutWaitingFloor(dom, state, floor) {
  const queue = state.waitingByFloor.get(floor) || [];

  for (let i = 0; i < queue.length; i += 1) {
    const passenger = queue[i];
    passenger.state = "waiting";
    passenger.el.classList.add("waiting");
    const pos = getWaitingSlotPosition(dom, floor, i);
    movePassengerTo(passenger, pos.x, pos.y, { duration: 280, scale: 1, opacity: 1 });
  }
}

export function updateRidingPassengerPositions(dom, state, instant = false) {
  const carY = getCurrentCarY(dom, state.currentFloor);

  for (let i = 0; i < state.ridingPassengers.length; i += 1) {
    const passenger = state.ridingPassengers[i];
    if (passenger.state === "exiting") {
      continue;
    }

    const slot = getCarSlotPosition(dom, i, carY);
    movePassengerTo(passenger, slot.x, slot.y, {
      duration: instant ? 0 : 80,
      scale: 1,
      opacity: 1,
    });
  }
}

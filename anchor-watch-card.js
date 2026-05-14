class AnchorWatchCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.initialized = false;

    this.currentLat = null;
    this.currentLon = null;
    this.currentDepth = NaN;
    this.currentHeading = 0;
    this.lastGpsUpdate = 0;
    this.gpsLost = true;

    this.anchorLat = null;
    this.anchorLon = null;
    this.swingRadius = null;
    this.alarmRadius = null;

    this.followBoat = true;
    this.boatScale = 1;
    this.anchorScale = 1;
    this.anchorLocked = false;
    this.anchorIsSet = false;

    this.breadcrumbs = [];
    this.lastBreadcrumbTime = 0;
    this.breadcrumbLine = null;

    this.lastPublished = {};
    this.helperSyncInProgress = false;
    this.anchorDragging = false;
    this.ignoreHelperSyncUntil = 0;
    this.localAnchorEditUntil = 0;
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Invalid configuration");
    }

    this.config = config;
    this.defaultScope = Number(config.default_scope ?? 3);
    this.radiusStep = Number(config.radius_step ?? 1);
    this.alarmMargin = Number(config.alarm_margin ?? 1.25);
    this.boatType = config.boat_type || "monohull";
    this.cardHeight = config.card_height || "500px";
    this.breadcrumbInterval = Number(config.breadcrumb_interval_seconds ?? 20) * 1000;
    this.breadcrumbMaxPoints = Number(config.breadcrumb_max_points ?? 90);
    this.gpsTimeout = Number(config.gps_timeout_seconds ?? 30) * 1000;

    this.helpers = {
      anchorSet: config.anchor_set_helper || config.helpers?.anchor_set,
      anchorLocked: config.anchor_locked_helper || config.helpers?.anchor_locked,
      gpsOk: config.gps_ok_helper || config.helpers?.gps_ok,
      anchorLat: config.anchor_lat_helper || config.helpers?.anchor_latitude,
      anchorLon: config.anchor_lon_helper || config.helpers?.anchor_longitude,
      swingRadius: config.swing_radius_helper || config.helpers?.swing_radius,
      alarmRadius: config.alarm_radius_helper || config.helpers?.alarm_radius,
      distance: config.distance_helper || config.helpers?.distance,
      alarmState: config.alarm_state_helper || config.helpers?.alarm_state
    };
  }

  getCardSize() {
    return 6;
  }

  async connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;

    if (!window.L) {
      await this.loadLeaflet();
    }

    this.renderShell();
    await this.waitForSize();
    this.initMap();
    this.attachEvents();
  }

  renderShell() {
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css">
      <style>
        :host {
          --edge: 10px;

          --rim-1: #465666;
          --rim-2: #273340;
          --rim-3: #334150;
          --rim-4: #24303b;
          --rim-5: #42505f;

          --face-1: rgba(33,54,80,.96);
          --face-2: rgba(19,37,58,.96);
          --face-3: rgba(11,21,32,.96);

          --panel-border: rgba(180,195,210,.24);
          --panel-shadow: 0 4px 13px rgba(0,0,0,.42);

          --label-size: 10px;
          --label-spacing: .18em;
          --value-size: 18px;
        }

        ha-card {
          display: block;
          overflow: hidden;
          border-radius: 12px;
          background: #07131f;
        }

        #root {
          position: relative;
          width: 100%;
          height: ${this.cardHeight};
          background: #07131f;
          overflow: hidden;
          border: 1px solid rgba(180,210,230,0.35);
          box-shadow:
            inset 0 0 0 1px rgba(0,0,0,0.65);
        }

        #map {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
        }

        .panel {
          position: absolute;
          z-index: 1000;
          color: #ffffff;
          border: 1px solid var(--panel-border);
          border-radius: 8px;
          font-family: Arial, Helvetica, sans-serif;
          box-shadow: var(--panel-shadow);
          backdrop-filter: blur(3px);
          background:
            linear-gradient(135deg,
              var(--rim-1) 0%,
              var(--rim-2) 20%,
              var(--rim-3) 50%,
              var(--rim-4) 80%,
              var(--rim-5) 100%);
        }

        #top-info-panel {
          left: var(--edge);
          right: var(--edge);
          top: var(--edge);
          height: 48px;
          padding: 6px 10px;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: 132px 1fr 112px;
          align-items: center;
          gap: 10px;
          background:
            radial-gradient(circle at 50% 15%,
              var(--face-1) 0%,
              var(--face-2) 55%,
              var(--face-3) 100%);
        }

        #top-info-panel .panel {
          position: static;
        }

        #anchor-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .icon-btn {
          width: 62px;
          height: 36px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 23px;
          line-height: 1;
          cursor: pointer;
          box-sizing: border-box;
          user-select: none;
          touch-action: manipulation;
          white-space: nowrap;
          overflow: hidden;
        }

        #raise-anchor {
          display: none;
          font-size: 22px;
        }

        #center-boat {
          justify-self: center;
          width: 38px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 44px;
          line-height: 1;
          cursor: pointer;
          padding: 0 0 3px 0;
          box-sizing: border-box;
        }

        #depth-readout {
          min-width: 112px;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 9px;
          padding-right: 8px;
          padding-left: 0;
          border-left: none;
          box-sizing: border-box;
        }

        .label,
        .small-title {
          display: block;
          width: auto;
          text-align: center;
          font-size: var(--label-size);
          letter-spacing: var(--label-spacing);
          opacity: .72;
          font-weight: 800;
        }

        .big {
          display: block;
          width: auto;
          text-align: center;
          font-size: var(--value-size);
          line-height: 1.05;
          font-weight: 700;
          margin-top: 2px;
          white-space: nowrap;
        }

        #anchor-info-panel {
          left: var(--edge);
          right: var(--edge);
          bottom: var(--edge);
          display: none;
          height: 48px;
          padding: 6px 10px;
          box-sizing: border-box;
          background:
            radial-gradient(circle at 50% 15%,
              var(--face-1) 0%,
              var(--face-2) 55%,
              var(--face-3) 100%);
        }

        #anchor-info-content {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: center;
          gap: 0;
          height: 100%;
        }

        .info-cell {
          min-width: 0;
          height: 100%;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: flex-end;
          gap: 9px;
          padding: 0 16px;
          border-right: none;
        }

        .info-cell:first-child {
          padding-left: 4px;
          justify-content: flex-start;
        }

        .info-cell:nth-child(2) {
          justify-content: flex-end;
          padding-right: 4px;
        }

        .info-cell .info-label {
          font-size: 10px;
          line-height: 1;
          letter-spacing: .15em;
          opacity: .68;
          font-weight: 900;
          white-space: nowrap;
        }

        .info-cell .info-value {
          font-size: 25px;
          line-height: 1;
          font-weight: 900;
          white-space: nowrap;
        }

        #swing-adjust-panel {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }

        .adjust-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .round-btn {
          width: 34px;
          height: 34px;
          border-radius: 7px;
          border: 1px solid rgba(180,200,215,.28);
          background:
            linear-gradient(135deg,
              rgba(70,86,102,.96) 0%,
              rgba(39,51,64,.96) 45%,
              rgba(24,38,52,.96) 100%);
          color: white;
          font-size: 23px;
          line-height: 28px;
          cursor: pointer;
          user-select: none;
          touch-action: none;
        }

        .round-btn:active,
        #center-boat:active,
        .icon-btn:active {
          filter: brightness(1.25);
        }

        @media (max-width: 520px) {
          #top-info-panel {
            grid-template-columns: 122px 1fr 96px;
          }
          :host {
            --edge: 8px;
            --value-size: 18px;
          }

          #top-info-panel {
            height: 46px;
            padding: 5px 8px;
            gap: 8px;
          }

          #anchor-controls {
            gap: 6px;
          }

          .icon-btn {
            width: 58px;
            height: 34px;
            font-size: 21px;
          }

          #raise-anchor {
            font-size: 20px;
          }

          #center-boat {
            width: 36px;
            height: 34px;
            font-size: 40px;
          }

          #depth-readout {
            min-width: 96px;
            gap: 6px;
            padding-right: 6px;
            padding-left: 0;
          }

          #anchor-info-panel {
            height: 46px;
            padding: 5px 8px;
          }

          #anchor-info-content {
            grid-template-columns: 1fr 1fr;
          }

          .info-cell {
            gap: 6px;
            padding: 0 8px;
          }

          .info-cell:first-child {
            padding-left: 2px;
          }

          .info-cell .info-label {
            font-size: 8px;
            letter-spacing: .13em;
          }

          .info-cell .info-value {
            font-size: 21px;
          }

          #swing-adjust-panel {
            padding-left: 8px;
          }

          .round-btn {
            width: 32px;
            height: 32px;
          }
        }
      </style>

      <ha-card>
        <div id="root">
          <div id="map"></div>

          <div id="top-info-panel" class="panel">
            <div id="anchor-controls">
              <button id="anchor-action" class="panel icon-btn" type="button" title="Anchor action">⚓↓</button>
              <button id="raise-anchor" class="panel icon-btn" type="button" title="Raise anchor">⚓↑</button>
            </div>

            <button id="center-boat" class="panel" type="button">⌖</button>

            <div id="depth-readout">
              <span class="label">DEPTH</span>
              <span id="depth" class="big">--.- m</span>
            </div>
          </div>

          <div id="anchor-info-panel" class="panel">
            <div id="anchor-info-content">
              <div class="info-cell">
                <span class="info-label">DIST</span>
                <span id="distance" class="info-value">-- m</span>
              </div>
              <div class="info-cell">
                <span class="info-label">SWING</span>
                <span id="swing-value" class="info-value">-- m</span>
              </div>
              <div id="swing-adjust-panel">
                <div class="adjust-row">
                  <button id="swing-minus" class="round-btn" type="button">−</button>
                  <button id="swing-plus" class="round-btn" type="button">+</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    this.root = this.shadowRoot.querySelector("#root");
    this.mapDiv = this.shadowRoot.querySelector("#map");
  }

  async waitForSize() {
    return new Promise(resolve => {
      const check = () => {
        const rect = this.root.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }

  initMap() {
    const startPos = this.getLastPosition();

    this.map = L.map(this.mapDiv, {
      zoomControl: false,
      attributionControl: false
    }).setView(startPos, 18);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(this.map);

    L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
      opacity: 0.85
    }).addTo(this.map);

    this.boatIcon = this.createBoatIcon(this.boatType);

    this.boatMarker = L.marker(startPos, {
      icon: this.boatIcon
    }).addTo(this.map);

    this.currentLat = startPos[0];
    this.currentLon = startPos[1];

    this.loadAnchorState();

    this.map.on("dragstart", () => {
      this.followBoat = false;
    });

    this.map.on("zoomend", () => {
      this.updateIconScale();
    });

    this.updateIconScale();

    if (this.anchorLat !== null && this.anchorLon !== null) {
      this.createAnchorMarker([this.anchorLat, this.anchorLon]);
      this.redrawAnchorGraphics();
      this.updatePanels();
      this.followBoat = false;
      setTimeout(() => this.centerOnAnchor(), 150);
    }

    this.updateAnchorUi();

    setTimeout(() => this.map.invalidateSize(true), 100);
    setTimeout(() => this.map.invalidateSize(true), 600);
  }

  createBoatIcon(type) {
    const svg = this.getBoatSvg(type);

    return L.divIcon({
      html: `
        <div id="boat-icon" style="
          width:48px;
          height:72px;
          display:flex;
          align-items:center;
          justify-content:center;
          transform-origin:center center;
        ">
          ${svg}
        </div>
      `,
      className: "",
      iconSize: [48, 72],
      iconAnchor: [24, 36]
    });
  }

  createAnchorIcon() {
    return L.divIcon({
      html: `
        <div id="anchor-icon" style="
          width:30px;
          height:30px;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:26px;
          color:#00aaff;
          transform-origin:center center;
          user-select:none;
        ">
          ⚓
        </div>
      `,
      className: "",
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  createAnchorMarker(pos) {
    if (this.anchorMarker) {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = null;
    }

    this.anchorMarker = L.marker(pos, {
      icon: this.createAnchorIcon(),
      draggable: true
    }).addTo(this.map);

    this.anchorMarker.on("dragstart", () => {
      this.anchorDragging = true;
    });

    this.anchorMarker.on("drag", () => {
      this.updateAnchorFromMarker(false);
    });

    this.anchorMarker.on("dragend", () => {
      this.updateAnchorFromMarker(true);
      this.anchorDragging = false;
      this.ignoreHelperSyncUntil = Date.now() + 10000;
      this.localAnchorEditUntil = Date.now() + 10000;
    });

    this.updateAnchorTransform();
    this.updateAnchorUi();
  }

  updateIconScale() {
    if (!this.map) return;

    const zoom = this.map.getZoom();

    let scale = (zoom - 12) / 6;
    scale = Math.max(0.45, Math.min(1.0, scale));

    this.boatScale = scale;
    this.anchorScale = scale;

    this.updateBoatTransform();
    this.updateAnchorTransform();
  }

  updateBoatTransform() {
    const boat = this.shadowRoot.querySelector("#boat-icon");
    if (!boat) return;

    const heading = !isNaN(this.currentHeading) ? this.currentHeading : 0;
    const scale = this.boatScale || 1;

    boat.style.transform = `rotate(${heading}deg) scale(${scale})`;
  }

  updateAnchorTransform() {
    const anchor = this.shadowRoot.querySelector("#anchor-icon");
    if (!anchor) return;

    anchor.style.transform = `scale(${this.anchorScale || 1})`;
  }

  getBoatSvg(type) {
    const common = `
      width="48"
      height="48"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    `;

    if (type === "monohull") {
      return `
        <svg ${common.replace('64 64', '64 96')}>
          <defs>
            <linearGradient id="boatGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#0A4A7A"/>
              <stop offset="45%" stop-color="#2F9CFF"/>
              <stop offset="100%" stop-color="#8FD8FF"/>
            </linearGradient>
          </defs>

          <line
            x1="32"
            y1="8"
            x2="32"
            y2="88"
            stroke="rgba(222,232,242,0.22)"
            stroke-width="1.2"
            stroke-linecap="round"
          />

          <path
            d="
              M32 6
              C24 14, 16 36, 16 62
              L16 82
              Q16 88, 22 88
              L42 88
              Q48 88, 48 82
              L48 62
              C48 36, 40 14, 32 6
              Z
            "
            fill="url(#boatGrad)"
            stroke="#0b1520"
            stroke-width="2.8"
            stroke-linejoin="round"
          />

          <path
            d="M27 22 C23 38, 23 54, 23 82"
            fill="none"
            stroke="rgba(0,24,38,0.45)"
            stroke-width="1.4"
            stroke-linecap="round"
          />

          <path
            d="M37 22 C41 38, 41 54, 41 82"
            fill="none"
            stroke="rgba(0,24,38,0.45)"
            stroke-width="1.4"
            stroke-linecap="round"
          />
        </svg>
      `;
    }

    return `
      <svg ${common}>
        <path d="M17 5 L28 30 L24 58 L12 58 L8 30 Z"
          fill="#ffffff" stroke="#001826" stroke-width="3" stroke-linejoin="round"/>
        <path d="M47 5 L56 30 L52 58 L40 58 L36 30 Z"
          fill="#ffffff" stroke="#001826" stroke-width="3" stroke-linejoin="round"/>
        <path d="M20 29 L44 29 L44 42 L20 42 Z"
          fill="#ffffff" stroke="#001826" stroke-width="3" stroke-linejoin="round"/>
        <path d="M26 18 L38 18 L42 29 L22 29 Z"
          fill="#8fd8ff" stroke="#001826" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    `;
  }

  attachEvents() {
    this.shadowRoot.querySelector("#anchor-action").onclick = () => {
      this.handleAnchorAction();
    };

    this.shadowRoot.querySelector("#raise-anchor").onclick = () => {
      this.raiseAnchor();
    };

    this.shadowRoot.querySelector("#center-boat").onclick = () => {
      this.centerOnBoat();
    };

    this.setupHoldButton(
      this.shadowRoot.querySelector("#swing-plus"),
      () => this.adjustSwingRadius(this.radiusStep, false),
      () => this.saveAnchorState()
    );

    this.setupHoldButton(
      this.shadowRoot.querySelector("#swing-minus"),
      () => this.adjustSwingRadius(-this.radiusStep, false),
      () => this.saveAnchorState()
    );
  }

  handleAnchorAction() {
    if (this.anchorLat === null || this.anchorLon === null) {
      this.dropAnchor();
      return;
    }

    if (!this.anchorIsSet) {
      this.anchorSet();
      return;
    }

    this.toggleAnchorLock();
  }

  toggleAnchorLock() {
    this.anchorLocked = !this.anchorLocked;
    this.updateAnchorUi();
    this.saveAnchorState();
  }

  updateAnchorUi() {
    const actionBtn = this.shadowRoot.querySelector("#anchor-action");
    const raiseBtn = this.shadowRoot.querySelector("#raise-anchor");
    const infoPanel = this.shadowRoot.querySelector("#anchor-info-panel");
    const adjustPanel = this.shadowRoot.querySelector("#swing-adjust-panel");

    if (!actionBtn || !raiseBtn || !infoPanel || !adjustPanel) return;

    const hasAnchor = this.anchorLat !== null && this.anchorLon !== null;

    if (this.gpsLost) {
      actionBtn.innerText = "GPS";
      actionBtn.title = "GPS lost / waiting for valid position";
      actionBtn.style.background = this.buttonBg("neutral");

      if (!hasAnchor) {
        raiseBtn.style.display = "none";
        infoPanel.style.display = "none";
        adjustPanel.style.display = "none";
        return;
      }

      raiseBtn.style.display = "flex";
      raiseBtn.style.opacity = this.anchorLocked ? "0.42" : "1";
      raiseBtn.style.pointerEvents = this.anchorLocked ? "none" : "auto";
      raiseBtn.title = this.anchorLocked ? "Unlock before raising" : "Raise anchor";
      raiseBtn.style.background = this.buttonBg("neutral");

      infoPanel.style.display = "block";
      adjustPanel.style.display = this.anchorLocked ? "none" : "block";

      if (this.anchorMarker?.dragging) {
        if (this.anchorLocked) {
          this.anchorMarker.dragging.disable();
        } else {
          this.anchorMarker.dragging.enable();
        }
      }

      return;
    }

    if (!hasAnchor) {
      actionBtn.innerText = "⚓↓";
      actionBtn.title = "Drop anchor";
      actionBtn.style.background = this.buttonBg("neutral");

      raiseBtn.style.display = "none";
      infoPanel.style.display = "none";
      adjustPanel.style.display = "none";
    } else if (!this.anchorIsSet) {
      actionBtn.innerText = "⚓✓";
      actionBtn.title = "Set anchor";
      actionBtn.style.background = this.buttonBg("neutral");

      raiseBtn.style.display = "flex";
      raiseBtn.style.opacity = "1";
      raiseBtn.style.pointerEvents = "auto";
      raiseBtn.title = "Raise anchor";
      raiseBtn.style.background = this.buttonBg("neutral");

      infoPanel.style.display = "block";
      adjustPanel.style.display = "block";
    } else if (this.anchorLocked) {
      actionBtn.innerText = "⚓🔒";
      actionBtn.title = "Unlock anchor";
      actionBtn.style.background = this.buttonBg("neutral");

      raiseBtn.style.display = "flex";
      raiseBtn.style.opacity = "0.42";
      raiseBtn.style.pointerEvents = "none";
      raiseBtn.title = "Unlock before raising";
      raiseBtn.style.background = this.buttonBg("neutral");

      infoPanel.style.display = "block";
      adjustPanel.style.display = "none";
    } else {
      actionBtn.innerText = "⚓✎";
      actionBtn.title = "Lock anchor";
      actionBtn.style.background = this.buttonBg("neutral");

      raiseBtn.style.display = "flex";
      raiseBtn.style.opacity = "1";
      raiseBtn.style.pointerEvents = "auto";
      raiseBtn.title = "Raise anchor";
      raiseBtn.style.background = this.buttonBg("neutral");

      infoPanel.style.display = "block";
      adjustPanel.style.display = "block";
    }

    if (this.anchorMarker?.dragging) {
      if (this.anchorLocked) {
        this.anchorMarker.dragging.disable();
      } else {
        this.anchorMarker.dragging.enable();
      }
    }
  }

  buttonBg(kind) {
    return "linear-gradient(135deg, rgba(70,86,102,.96) 0%, rgba(39,51,64,.96) 45%, rgba(24,38,52,.96) 100%)";
  }

  setupHoldButton(button, callback, onEnd = null) {
    if (!button) return;

    let holdTimer = null;
    let repeatTimer = null;
    let didHold = false;
    let isDown = false;

    const clearTimers = () => {
      clearTimeout(holdTimer);
      clearInterval(repeatTimer);
      holdTimer = null;
      repeatTimer = null;
    };

    const start = (e) => {
      e.preventDefault();
      if (isDown) return;

      isDown = true;
      didHold = false;
      clearTimers();

      holdTimer = setTimeout(() => {
        if (!isDown) return;

        didHold = true;
        callback();

        repeatTimer = setInterval(() => {
          callback();
        }, 120);
      }, 350);
    };

    const stop = (e) => {
      if (e) e.preventDefault();
      if (!isDown) return;

      isDown = false;
      clearTimers();

      if (!didHold) {
        callback();
      }

      if (onEnd) {
        onEnd();
      }

      didHold = false;
    };

    const cancel = (e) => {
      if (e) e.preventDefault();

      isDown = false;
      didHold = false;
      clearTimers();
    };

    button.addEventListener("mousedown", start);
    button.addEventListener("mouseup", stop);
    button.addEventListener("mouseleave", cancel);

    button.addEventListener("touchstart", start, { passive: false });
    button.addEventListener("touchend", stop, { passive: false });
    button.addEventListener("touchcancel", cancel, { passive: false });

    button.addEventListener("contextmenu", e => e.preventDefault());
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.map) return;

    this.syncAnchorStateFromHelpers();

    const lat = this.readNumber(hass, this.config.latitude_entity);
    const lon = this.readNumber(hass, this.config.longitude_entity);
    const hdg = this.readNumber(hass, this.config.heading_entity);
    const depth = this.readNumber(hass, this.config.depth_entity);

    const gpsValid = this.validPosition(lat, lon);

    if (gpsValid) {
      this.gpsLost = false;
      this.lastGpsUpdate = Date.now();
      this.currentLat = lat;
      this.currentLon = lon;

      const pos = [lat, lon];
      this.saveLastPosition(pos);
      this.boatMarker.setLatLng(pos);
      this.updateBreadcrumbs(pos);

      if (this.anchorLat !== null) {
        this.redrawAnchorGraphics();
      }

      if (this.followBoat) {
        this.centerVisibleOn(this.currentLat, this.currentLon, false);
      }
    } else if (this.lastGpsUpdate && Date.now() - this.lastGpsUpdate > this.gpsTimeout) {
      this.gpsLost = true;
    } else if (!this.lastGpsUpdate) {
      this.gpsLost = true;
    }

    if (!isNaN(hdg)) {
      this.currentHeading = hdg;
      this.updateBoatTransform();
    }

    if (!isNaN(depth)) {
      this.currentDepth = depth;
    }

    const depthBox = this.shadowRoot.querySelector("#depth");
    if (depthBox) {
      depthBox.innerHTML = !isNaN(this.currentDepth)
        ? `${this.currentDepth.toFixed(1)} m`
        : "--.- m";
    }

    this.updateDistance();
    this.updateAlarmState();
    this.updateAnchorUi();
  }

  updateBreadcrumbs(pos) {
    if (!this.validPosition(pos[0], pos[1]) || this.gpsLost) return;

    const now = Date.now();

    if (
      this.lastBreadcrumbTime &&
      now - this.lastBreadcrumbTime < this.breadcrumbInterval
    ) {
      return;
    }

    this.lastBreadcrumbTime = now;

    this.breadcrumbs.push(pos);

    while (this.breadcrumbs.length > this.breadcrumbMaxPoints) {
      this.breadcrumbs.shift();
    }

    if (this.breadcrumbLine) {
      this.breadcrumbLine.setLatLngs(this.breadcrumbs);
    } else {
      this.breadcrumbLine = L.polyline(this.breadcrumbs, {
        color: "#d7ecff",
        weight: 2,
        opacity: 0.45,
        dashArray: "2,8"
      }).addTo(this.map);
    }
  }

  centerOnBoat() {
    const hasAnchor =
      this.anchorLat !== null &&
      this.anchorLon !== null &&
      this.validPosition(this.anchorLat, this.anchorLon);

    if (hasAnchor) {
      this.followBoat = false;
      this.centerOnAnchor();
      return;
    }

    if (!this.validPosition(this.currentLat, this.currentLon)) return;

    this.followBoat = true;
    this.centerVisibleOn(this.currentLat, this.currentLon, true);
  }

  centerOnAnchor() {
    if (!this.validPosition(this.anchorLat, this.anchorLon)) return;

    this.followBoat = false;

    if (this.validPosition(this.currentLat, this.currentLon)) {
      this.fitAnchorWatchView(true);
      return;
    }

    this.centerVisibleOn(this.anchorLat, this.anchorLon, true);
  }

  fitAnchorWatchView(animate = true) {
    if (
      !this.map ||
      !this.validPosition(this.anchorLat, this.anchorLon) ||
      !this.validPosition(this.currentLat, this.currentLon)
    ) {
      return;
    }

    const points = [
      [this.anchorLat, this.anchorLon],
      [this.currentLat, this.currentLon]
    ];

    const radius = Math.max(
      Number(this.alarmRadius || 0),
      Number(this.swingRadius || 0),
      10
    );

    const north = this.destinationPoint(this.anchorLat, this.anchorLon, 0, radius);
    const east = this.destinationPoint(this.anchorLat, this.anchorLon, 90, radius);
    const south = this.destinationPoint(this.anchorLat, this.anchorLon, 180, radius);
    const west = this.destinationPoint(this.anchorLat, this.anchorLon, 270, radius);

    points.push(north, east, south, west);

    const bounds = L.latLngBounds(points);
    const padding = this.getVisibleFitPadding();

    this.map.fitBounds(bounds, {
      animate,
      paddingTopLeft: padding.topLeft,
      paddingBottomRight: padding.bottomRight,
      maxZoom: 19
    });
  }

  getVisibleFitPadding() {
    const rootRect = this.root.getBoundingClientRect();
    const topPanel = this.shadowRoot.querySelector("#top-info-panel");
    const bottomPanel = this.shadowRoot.querySelector("#anchor-info-panel");

    let top = 20;
    let bottom = 20;

    if (topPanel) {
      const r = topPanel.getBoundingClientRect();
      top += Math.max(0, r.bottom - rootRect.top) + 12;
    }

    if (bottomPanel && bottomPanel.style.display !== "none") {
      const r = bottomPanel.getBoundingClientRect();
      bottom += Math.max(0, rootRect.bottom - r.top) + 12;
    }

    return {
      topLeft: L.point(20, top),
      bottomRight: L.point(20, bottom)
    };
  }

  destinationPoint(lat, lon, bearingDeg, distanceMeters) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;

    const bearing = toRad(bearingDeg);
    const angularDistance = distanceMeters / R;
    const lat1 = toRad(lat);
    const lon1 = toRad(lon);

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const lon2 = lon1 + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

    return [toDeg(lat2), toDeg(lon2)];
  }

  centerVisibleOn(lat, lon, animate = true) {
    if (!this.map || !this.validPosition(lat, lon)) return;

    const zoom = this.map.getZoom();
    const targetPoint = this.map.project([lat, lon], zoom);
    const offset = this.getVisibleCenterOffset();

    const correctedCenterPoint = L.point(
      targetPoint.x - offset.x,
      targetPoint.y - offset.y
    );

    const correctedCenter = this.map.unproject(correctedCenterPoint, zoom);

    this.map.setView(correctedCenter, zoom, { animate });
  }

  getVisibleCenterOffset() {
    const size = this.map.getSize();
    const rootRect = this.root.getBoundingClientRect();
    const topPanel = this.shadowRoot.querySelector("#top-info-panel");
    const bottomPanel = this.shadowRoot.querySelector("#anchor-info-panel");

    let topObscured = 0;
    let bottomObscured = 0;

    if (topPanel) {
      const r = topPanel.getBoundingClientRect();
      topObscured = Math.max(0, r.bottom - rootRect.top);
    }

    if (bottomPanel && bottomPanel.style.display !== "none") {
      const r = bottomPanel.getBoundingClientRect();
      bottomObscured = Math.max(0, rootRect.bottom - r.top);
    }

    const rawCenterY = size.y / 2;
    const visibleCenterY = topObscured + ((size.y - topObscured - bottomObscured) / 2);

    return L.point(0, visibleCenterY - rawCenterY);
  }

  dropAnchor() {
    if (this.gpsLost || !this.validPosition(this.currentLat, this.currentLon)) {
      const actionBtn = this.shadowRoot.querySelector("#anchor-action");
      if (actionBtn) actionBtn.innerText = "GPS";
      this.updateAlarmState("gps_lost");
      return;
    }

    const p = this.boatMarker?.getLatLng() || this.map?.getCenter();

    if (!p || !this.validPosition(p.lat, p.lng)) {
      const actionBtn = this.shadowRoot.querySelector("#anchor-action");
      if (actionBtn) actionBtn.innerText = "GPS";
      this.updateAlarmState("gps_lost");
      return;
    }

    this.currentLat = p.lat;
    this.currentLon = p.lng;

    this.anchorLat = this.currentLat;
    this.anchorLon = this.currentLon;

    this.swingRadius = this.getDefaultSwingRadius();
    this.alarmRadius = this.swingRadius * this.alarmMargin;
    this.anchorIsSet = false;
    this.anchorLocked = false;

    this.createAnchorMarker([this.anchorLat, this.anchorLon]);
    this.redrawAnchorGraphics();
    this.updatePanels();
    this.updateAnchorUi();
    this.localAnchorEditUntil = Date.now() + 10000;
    this.saveAnchorState("dropped");
    this.centerOnAnchor();
  }

  anchorSet() {
    if (
      this.gpsLost ||
      !this.validPosition(this.currentLat, this.currentLon) ||
      !this.validPosition(this.anchorLat, this.anchorLon)
    ) {
      this.updateAlarmState("gps_lost");
      return;
    }

    const distance = this.distanceMeters(
      this.currentLat,
      this.currentLon,
      this.anchorLat,
      this.anchorLon
    );

    this.swingRadius = Math.max(1, distance);
    this.alarmRadius = this.swingRadius * this.alarmMargin;
    this.anchorIsSet = true;
    this.anchorLocked = true;

    this.redrawAnchorGraphics();
    this.updatePanels();
    this.updateAnchorUi();
    this.localAnchorEditUntil = Date.now() + 10000;
    this.saveAnchorState("armed");
    this.centerOnAnchor();
  }

  raiseAnchor() {
    localStorage.removeItem("anchor-watch-state");

    this.anchorLat = null;
    this.anchorLon = null;
    this.swingRadius = null;
    this.alarmRadius = null;
    this.anchorLocked = false;
    this.anchorIsSet = false;

    if (this.anchorMarker) {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = null;
    }

    if (this.swingCircle) {
      this.map.removeLayer(this.swingCircle);
      this.swingCircle = null;
    }

    if (this.alarmCircle) {
      this.map.removeLayer(this.alarmCircle);
      this.alarmCircle = null;
    }

    if (this.anchorLine) {
      this.map.removeLayer(this.anchorLine);
      this.anchorLine = null;
    }

    if (this.breadcrumbLine) {
      this.map.removeLayer(this.breadcrumbLine);
      this.breadcrumbLine = null;
    }

    this.breadcrumbs = [];
    this.lastBreadcrumbTime = 0;

    this.updatePanels();
    this.updateAnchorUi();
    this.clearAnchorHelpers();
  }

  adjustSwingRadius(delta, save = true) {
    if (this.swingRadius === null || this.anchorLocked) return;

    this.swingRadius = Math.max(1, this.swingRadius + delta);
    this.alarmRadius = this.swingRadius * this.alarmMargin;

    this.ignoreHelperSyncUntil = Date.now() + 10000;
    this.localAnchorEditUntil = Date.now() + 10000;

    this.redrawAnchorGraphics();
    this.updatePanels();

    if (save) {
      this.saveAnchorState();
    }
  }

  getDefaultSwingRadius() {
    const depth = !isNaN(this.currentDepth) && this.currentDepth > 0
      ? this.currentDepth
      : 5;

    const scope = !isNaN(this.defaultScope) && this.defaultScope > 0
      ? this.defaultScope
      : 3;

    return Math.max(1, depth * scope);
  }

  updateAnchorFromMarker(save = true) {
    if (!this.anchorMarker || this.anchorLocked) return;

    const p = this.anchorMarker.getLatLng();

    if (!this.validPosition(p.lat, p.lng)) return;

    this.anchorLat = p.lat;
    this.anchorLon = p.lng;

    this.redrawAnchorGraphics();
    this.updatePanels();

    if (save) {
      this.ignoreHelperSyncUntil = Date.now() + 10000;
      this.localAnchorEditUntil = Date.now() + 10000;
      this.saveAnchorState();
    }
  }

  redrawAnchorGraphics() {
    if (
      !this.validPosition(this.anchorLat, this.anchorLon) ||
      !this.validPosition(this.currentLat, this.currentLon)
    ) {
      return;
    }

    const center = [this.anchorLat, this.anchorLon];

    if (this.swingCircle) {
      this.swingCircle.setLatLng(center);
      this.swingCircle.setRadius(this.swingRadius);
    } else {
      this.swingCircle = L.circle(center, {
        radius: this.swingRadius,
        dashArray: "8,8",
        color: "#d7ea00",
        weight: 3,
        fill: true,
        fillColor: "#d7ea00",
        fillOpacity: 0.14,
        opacity: 0.95
      }).addTo(this.map);
    }

    if (this.alarmCircle) {
      this.alarmCircle.setLatLng(center);
      this.alarmCircle.setRadius(this.alarmRadius);
    } else {
      this.alarmCircle = L.circle(center, {
        radius: this.alarmRadius,
        color: "#00d060",
        weight: 3,
        fill: true,
        fillColor: "#00d060",
        fillOpacity: 0.10,
        opacity: 0.95
      }).addTo(this.map);
    }

    const linePoints = [
      [this.anchorLat, this.anchorLon],
      [this.currentLat, this.currentLon]
    ];

    if (this.anchorLine) {
      this.anchorLine.setLatLngs(linePoints);
    } else {
      this.anchorLine = L.polyline(linePoints, {
        color: "#00d4ff",
        weight: 2,
        opacity: 0.9
      }).addTo(this.map);
    }

    this.updateDistance();
    this.updateAlarmState();
  }

  updatePanels() {
    const swingValue = this.shadowRoot.querySelector("#swing-value");

    if (swingValue) {
      swingValue.innerHTML = this.swingRadius !== null
        ? `${this.formatMeters(this.swingRadius)}`
        : "-- m";
    }

    this.updateDistance();
  }

  updateDistance() {
    const box = this.shadowRoot.querySelector("#distance");

    if (
      !this.validPosition(this.currentLat, this.currentLon) ||
      !this.validPosition(this.anchorLat, this.anchorLon)
    ) {
      if (box) box.innerHTML = "-- m";
      return;
    }

    const distance = this.distanceMeters(
      this.currentLat,
      this.currentLon,
      this.anchorLat,
      this.anchorLon
    );

    if (box) {
      box.innerHTML = this.formatMeters(distance);
    }
  }

  updateAlarmState(forceState = null) {
    const h = this.helpers || {};

    const publishAllowed = !this.anchorDragging && Date.now() >= this.ignoreHelperSyncUntil;

    const gpsTimedOut = this.lastGpsUpdate && Date.now() - this.lastGpsUpdate > this.gpsTimeout;
    const gpsOk = !this.gpsLost && !gpsTimedOut && this.validPosition(this.currentLat, this.currentLon);

    if (!gpsOk) {
      this.gpsLost = true;
      if (publishAllowed) {
        this.publishGpsOk(false);
        this.publishAlarmState("gps_lost");
      }
      this.setAlarmGraphics("#808080", 0.14);
      return;
    }

    if (publishAllowed) {
      this.publishGpsOk(true);
    }

    if (forceState) {
      this.publishAlarmState(forceState);
      return;
    }

    if (this.alarmRadius === null || this.anchorLat === null || this.anchorLon === null) {
      if (publishAllowed) {
        this.publishAlarmState("idle");
      }
      return;
    }

    if (!this.validPosition(this.anchorLat, this.anchorLon)) {
      if (publishAllowed) {
        this.publishAlarmState("sensor_fault");
      }
      this.setAlarmGraphics("#808080", 0.14);
      return;
    }

    const distance = this.distanceMeters(
      this.currentLat,
      this.currentLon,
      this.anchorLat,
      this.anchorLon
    );

    if (publishAllowed) {
      this.publishHelperNumber(h.distance, Math.round(distance));
    }

    let state = "safe";
    let color = "#00d060";

    if (!this.anchorIsSet) {
      state = "dropped";
      color = "#d7ea00";
    } else if (distance >= this.alarmRadius) {
      state = "alarm";
      color = "#ff3030";
    } else if (distance >= this.alarmRadius * 0.9) {
      state = "warning";
      color = "#ffb000";
    } else if (this.anchorIsSet) {
      state = "armed";
      color = "#00d060";
    }

    if (publishAllowed) {
      this.publishAlarmState(state);
    }
    this.setAlarmGraphics(color, 0.10);
  }

  setAlarmGraphics(color, fillOpacity = 0.10) {
    if (this.alarmCircle) {
      this.alarmCircle.setStyle({
        color,
        fillColor: color,
        fillOpacity
      });
    }

    if (this.anchorLine) {
      this.anchorLine.setStyle({ color });
    }
  }

  formatMeters(value) {
    if (value === null || value === undefined || isNaN(value)) return "-- m";
    return `${Math.round(value)} m`;
  }

  distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  readNumber(hass, entity) {
    if (!entity) return NaN;

    const state = hass.states[entity]?.state;
    const value = Number(state);

    if (
      state === "unknown" ||
      state === "unavailable" ||
      state === undefined ||
      state === null ||
      isNaN(value)
    ) {
      return NaN;
    }

    return value;
  }

  validPosition(lat, lon) {
    return (
      !isNaN(lat) &&
      !isNaN(lon) &&
      lat !== 0 &&
      lon !== 0 &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    );
  }

  loadAnchorState() {
    if (this.loadAnchorStateFromHelpers()) return;

    try {
      const saved = JSON.parse(
        localStorage.getItem("anchor-watch-state")
      );

      if (
        saved &&
        this.validPosition(saved.anchorLat, saved.anchorLon)
      ) {
        this.anchorLat = saved.anchorLat;
        this.anchorLon = saved.anchorLon;
        this.swingRadius = Number(saved.swingRadius);
        this.alarmRadius = Number(saved.alarmRadius);
        this.anchorIsSet = saved.anchorIsSet !== undefined ? Boolean(saved.anchorIsSet) : true;
        this.anchorLocked = saved.anchorLocked !== undefined ? Boolean(saved.anchorLocked) : true;
      }
    } catch (e) {}
  }

  saveAnchorState(extraState = null) {
    localStorage.setItem(
      "anchor-watch-state",
      JSON.stringify({
        anchorLat: this.anchorLat,
        anchorLon: this.anchorLon,
        swingRadius: this.swingRadius,
        alarmRadius: this.alarmRadius,
        anchorIsSet: this.anchorIsSet,
        anchorLocked: this.anchorLocked
      })
    );

    this.ignoreHelperSyncUntil = Date.now() + 10000;
    this.localAnchorEditUntil = Date.now() + 10000;
    this.publishAnchorState(extraState);
  }

  loadAnchorStateFromHelpers() {
    if (!this._hass || !this.helpers) return false;

    const h = this.helpers;
    const helperAlarmState = this._hass.states[h.alarmState]?.state;
    const helperAnchorSet = this.getHelperBoolean(h.anchorSet);

    if (!helperAnchorSet && helperAlarmState === "idle") {
      return false;
    }
    const lat = this.readNumber(this._hass, h.anchorLat);
    const lon = this.readNumber(this._hass, h.anchorLon);
    const swing = this.readNumber(this._hass, h.swingRadius);
    const alarm = this.readNumber(this._hass, h.alarmRadius);

    if (!this.validPosition(lat, lon)) return false;

    this.anchorLat = lat;
    this.anchorLon = lon;
    this.swingRadius = !isNaN(swing) && swing > 0 ? swing : this.getDefaultSwingRadius();
    this.alarmRadius = !isNaN(alarm) && alarm > 0 ? alarm : this.swingRadius * this.alarmMargin;
    this.anchorIsSet = this.getHelperBoolean(h.anchorSet);
    this.anchorLocked = this.getHelperBoolean(h.anchorLocked);

    return true;
  }

  syncAnchorStateFromHelpers() {
    if (
      !this._hass ||
      !this.helpers ||
      this.helperSyncInProgress ||
      this.anchorDragging ||
      Date.now() < this.ignoreHelperSyncUntil ||
      Date.now() < this.localAnchorEditUntil
    ) return;

    const h = this.helpers;
    const helperAlarmState = this._hass.states[h.alarmState]?.state;
    const helperAnchorSet = this.getHelperBoolean(h.anchorSet);

    if (!helperAnchorSet && helperAlarmState === "idle") {
      if (this.anchorLat !== null || this.anchorLon !== null || this.anchorMarker) {
        this.clearLocalAnchorOnly();
        this.updatePanels();
        this.updateAnchorUi();
      }
      return;
    }
    const lat = this.readNumber(this._hass, h.anchorLat);
    const lon = this.readNumber(this._hass, h.anchorLon);
    const swing = this.readNumber(this._hass, h.swingRadius);
    const alarm = this.readNumber(this._hass, h.alarmRadius);
    const anchorSet = helperAnchorSet;
    const anchorLocked = this.getHelperBoolean(h.anchorLocked);

    if (!this.validPosition(lat, lon)) return;

    const changed =
      this.anchorLat !== lat ||
      this.anchorLon !== lon ||
      this.swingRadius !== swing ||
      this.alarmRadius !== alarm ||
      this.anchorIsSet !== anchorSet ||
      this.anchorLocked !== anchorLocked;

    if (!changed) return;

    this.anchorLat = lat;
    this.anchorLon = lon;
    this.swingRadius = !isNaN(swing) && swing > 0 ? swing : this.swingRadius;
    this.alarmRadius = !isNaN(alarm) && alarm > 0 ? alarm : this.alarmRadius;
    this.anchorIsSet = anchorSet;
    this.anchorLocked = anchorLocked;

    if (this.anchorMarker) {
      this.anchorMarker.setLatLng([this.anchorLat, this.anchorLon]);
    } else {
      this.createAnchorMarker([this.anchorLat, this.anchorLon]);
    }

    this.redrawAnchorGraphics();
    this.updatePanels();
    this.updateAnchorUi();
  }

  getHelperBoolean(entity) {
    if (!this._hass || !entity) return false;
    return this._hass.states[entity]?.state === "on";
  }

  async publishAnchorState(extraState = null) {
    if (!this._hass || !this.helpers) return;

    this.ignoreHelperSyncUntil = Date.now() + 10000;
    this.localAnchorEditUntil = Date.now() + 10000;

    const h = this.helpers;
    this.helperSyncInProgress = true;

    try {
      await this.publishHelperBoolean(h.anchorSet, this.anchorIsSet);
      await this.publishHelperBoolean(h.anchorLocked, this.anchorLocked);

      if (this.validPosition(this.anchorLat, this.anchorLon)) {
        await this.publishHelperNumber(h.anchorLat, this.anchorLat);
        await this.publishHelperNumber(h.anchorLon, this.anchorLon);
      }

      await this.publishHelperNumber(h.swingRadius, this.swingRadius);
      await this.publishHelperNumber(h.alarmRadius, this.alarmRadius);

      if (extraState) {
        await this.publishAlarmState(extraState);
      }
    } finally {
      this.helperSyncInProgress = false;
    }
  }

  clearLocalAnchorOnly() {
    this.anchorLat = null;
    this.anchorLon = null;
    this.swingRadius = null;
    this.alarmRadius = null;
    this.anchorLocked = false;
    this.anchorIsSet = false;

    if (this.anchorMarker) {
      this.map.removeLayer(this.anchorMarker);
      this.anchorMarker = null;
    }

    if (this.swingCircle) {
      this.map.removeLayer(this.swingCircle);
      this.swingCircle = null;
    }

    if (this.alarmCircle) {
      this.map.removeLayer(this.alarmCircle);
      this.alarmCircle = null;
    }

    if (this.anchorLine) {
      this.map.removeLayer(this.anchorLine);
      this.anchorLine = null;
    }
  }

  async clearAnchorHelpers() {
    if (!this._hass || !this.helpers) return;

    const h = this.helpers;
    this.helperSyncInProgress = true;

    try {
      await this.publishHelperBoolean(h.anchorSet, false);
      await this.publishHelperBoolean(h.anchorLocked, false);
      await this.publishHelperNumber(h.distance, 0);
      await this.publishAlarmState("idle");
    } finally {
      this.helperSyncInProgress = false;
    }
  }

  async publishGpsOk(ok) {
    const entity = this.helpers?.gpsOk;
    await this.publishHelperBoolean(entity, ok);
  }

  async publishAlarmState(state) {
    const entity = this.helpers?.alarmState;
    if (!entity || !state || this.lastPublished[entity] === state) return;

    this.lastPublished[entity] = state;

    try {
      await this._hass.callService("input_select", "select_option", {
        entity_id: entity,
        option: state
      });
    } catch (e) {
      console.warn("Anchor Watch Card: failed to publish alarm state", entity, state, e);
    }
  }

  async publishHelperNumber(entity, value) {
    if (!this._hass || !entity || value === null || value === undefined || isNaN(value)) return;

    const rounded = Number(value);

    if ((entity === this.helpers?.distance || entity === this.helpers?.swingRadius || entity === this.helpers?.alarmRadius) && rounded > 50000) {
      console.warn("Anchor Watch Card: blocked unrealistic helper value", entity, rounded);
      return;
    }
    if (this.lastPublished[entity] === rounded) return;

    this.lastPublished[entity] = rounded;

    try {
      await this._hass.callService("input_number", "set_value", {
        entity_id: entity,
        value: rounded
      });
    } catch (e) {
      console.warn("Anchor Watch Card: failed to publish number", entity, rounded, e);
    }
  }

  async publishHelperBoolean(entity, value) {
    if (!this._hass || !entity) return;

    const boolValue = Boolean(value);
    if (this.lastPublished[entity] === boolValue) return;

    this.lastPublished[entity] = boolValue;

    try {
      await this._hass.callService(
        "input_boolean",
        boolValue ? "turn_on" : "turn_off",
        { entity_id: entity }
      );
    } catch (e) {
      console.warn("Anchor Watch Card: failed to publish boolean", entity, boolValue, e);
    }
  }

  getLastPosition() {
    try {
      const saved = JSON.parse(
        localStorage.getItem("anchor-watch-last-position")
      );

      if (saved && this.validPosition(saved[0], saved[1])) {
        return saved;
      }
    } catch (e) {}

    return [42.4304, 18.6907];
  }

  saveLastPosition(pos) {
    localStorage.setItem(
      "anchor-watch-last-position",
      JSON.stringify(pos)
    );
  }

  async loadLeaflet() {
    await this.loadJS("https://unpkg.com/leaflet/dist/leaflet.js");
  }

  loadJS(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  loadCSS(src) {
    return new Promise(resolve => {
      const s = document.createElement("link");
      s.rel = "stylesheet";
      s.href = src;
      s.onload = resolve;
      document.head.appendChild(s);
    });
  }
}

if (!customElements.get("anchor-watch-card")) {
  customElements.define("anchor-watch-card", AnchorWatchCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "anchor-watch-card",
  name: "Anchor Watch Card",
  description: "Marine anchor watch dashboard card"
});

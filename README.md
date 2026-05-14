# Anchor Watch Card

I built this because I got fed up with traditional anchor watch systems.

Even premium marine systems often felt like they needed way too many button presses—and a degree in rocket science—just to find the anchor watch, let alone use it in the dark, in bad weather, or when things actually matter.

Anchor Watch Card was built by sailors, for sailors, around one simple idea:

**Drop anchor with chain-length suggestions, set your actual scope, and you're done. Know immediately if you're dragging via alerts and notifications—whether onboard or remotely.**

No buried menus.
No hunting through multifunction displays.
No guessing what state the system is in.
No nonsense.

## Features

* ⚓ One-touch drop / set / lock / raise workflow
* 📍 Live vessel GPS tracking
* 🗺 OpenSeaMap + OpenStreetMap overlays
* ⭕ Swing radius visualization
* 🚨 Warning + alarm zones
* 📏 Real-time anchor distance
* 🌊 Depth-aware scope suggestions
* 🧭 Heading-aware vessel icon
* 🪝 Drag-to-adjust anchor placement
* 🔄 Home Assistant helper sync
* 📱 Touch-first mobile interface
* 🛥 Monohull + catamaran support

---

## Installation

### HACS

Add this repository as a **Custom Repository** in HACS.

**Category:** `Dashboard`

Then install **Anchor Watch Card**.

---

## Helper Setup

Create these Home Assistant helpers before using the card.

### `configuration.yaml`

```yaml
input_boolean:
  anchor_watch_set:
    name: Anchor Watch Set

  anchor_watch_locked:
    name: Anchor Watch Locked

  anchor_watch_gps_ok:
    name: Anchor Watch GPS OK


input_number:
  anchor_watch_latitude:
    name: Anchor Watch Latitude
    min: -90
    max: 90
    step: 0.000001
    mode: box

  anchor_watch_longitude:
    name: Anchor Watch Longitude
    min: -180
    max: 180
    step: 0.000001
    mode: box

  anchor_watch_swing_radius:
    name: Anchor Watch Swing Radius
    min: 0
    max: 1000
    step: 1
    unit_of_measurement: m
    mode: box

  anchor_watch_alarm_radius:
    name: Anchor Watch Alarm Radius
    min: 0
    max: 1500
    step: 1
    unit_of_measurement: m
    mode: box

  anchor_watch_distance:
    name: Anchor Watch Distance
    min: 0
    max: 1500
    step: 1
    unit_of_measurement: m
    mode: box


input_select:
  anchor_watch_alarm_state:
    name: Anchor Watch Alarm State
    options:
      - idle
      - dropped
      - armed
      - safe
      - warning
      - alarm
      - gps_lost
      - sensor_fault
    initial: idle
```

Restart Home Assistant after adding the helpers.

---

## Lovelace Example

```yaml
type: custom:anchor-watch-card

latitude_entity: sensor.gps_latitude
longitude_entity: sensor.gps_longitude
heading_entity: sensor.gps_heading
depth_entity: sensor.depth

card_height: 500px

default_scope: 3
radius_step: 1
alarm_margin: 1.25

breadcrumb_interval_seconds: 20
breadcrumb_max_points: 90
gps_timeout_seconds: 30

helpers:
  anchor_set: input_boolean.anchor_watch_set
  anchor_locked: input_boolean.anchor_watch_locked
  gps_ok: input_boolean.anchor_watch_gps_ok
  anchor_latitude: input_number.anchor_watch_latitude
  anchor_longitude: input_number.anchor_watch_longitude
  swing_radius: input_number.anchor_watch_swing_radius
  alarm_radius: input_number.anchor_watch_alarm_radius
  distance: input_number.anchor_watch_distance
  alarm_state: input_select.anchor_watch_alarm_state
```

> Helper entities in lovelace are optional, but highly recommended for debugging.

---

> [!WARNING]
>
> ## Safety Disclaimer
>
> Anchor Watch Card is an **aid to situational awareness only**.
>
> It is **not certified marine navigation equipment**, is **not a replacement for a proper anchor watch**, and must **never be relied upon as the sole means of vessel safety, navigation, collision avoidance, grounding prevention, or alarm monitoring**.
>
> GPS signals may be inaccurate, delayed, degraded, or unavailable. Sensor data, network connectivity, Home Assistant services, power systems, mobile devices, charts, and third-party integrations may fail without warning.
>
> **The skipper remains solely responsible for the safe operation of the vessel at all times.**
>
> By installing or using this software, you acknowledge that you do so **entirely at your own risk.** The authors, contributors, and OpenMarineSystems accept **no liability for loss, damage, injury, grounding, collision, environmental damage, equipment failure, or any direct or indirect consequences arising from its use.**

---

## Status

Early public release.

Built by **[OpenMarineSystems](https://github.com/OpenMarineSystems?utm_source=chatgpt.com)**

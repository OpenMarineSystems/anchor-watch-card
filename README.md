# Anchor Watch Card

I built this because I got fed up with traditional anchor watch systems.

Even premium systems from spelaized marine brands often felt like they needed way too many button presses and a degree in rocket science just to find the anchor watch, let alone use it in the dark, in bad weather, or when things actually matter.

Anchor Watch Card was built by sailors for sailors around one idea:

**Drop anchor. Confirm position. Know immediately if you're dragging, either on board or remotely.**

No buried menus.  
No hunting through multifunction displays.  
No guessing what state the system is in.  
No nonsense.

## Features

- ⚓ One-touch drop / set / lock / raise workflow
- 📍 Live vessel GPS tracking
- 🗺 OpenSeaMap + OpenStreetMap overlays
- ⭕ Swing radius visualization
- 🚨 Warning + alarm zones
- 📏 Real-time anchor distance
- 🌊 Depth-aware scope suggestions
- 🧭 Heading-aware vessel icon
- 🪝 Drag-to-adjust anchor placement
- 🔄 Home Assistant helper sync
- 📱 Touch-first mobile interface

## Installation

### HACS

Add this repository as a custom repository in HACS:

`Dashboard`

Then install **Anchor Watch Card**.

## Lovelace Example

```yaml
type: custom:anchor-watch-card
latitude_entity: sensor.gps_latitude
longitude_entity: sensor.gps_longitude
heading_entity: sensor.gps_heading
depth_entity: sensor.depth
boat_type: catamaran
```

**[!WARNING]**
## Safety Disclaimer

Anchor Watch Card is an **aid to situational awareness only**.

It is **not certified marine navigation equipment**, is **not a replacement for a proper anchor watch**, and must **never be relied upon as the sole means of vessel safety, navigation, collision avoidance, grounding prevention, or alarm monitoring**.

GPS signals may be inaccurate, delayed, degraded, or unavailable. Sensor data, network connectivity, Home Assistant services, power systems, mobile devices, charts, and third-party integrations may fail without warning.

**The skipper remains solely responsible for the safe operation of the vessel at all times.**

By installing or using this software, you acknowledge that you do so **entirely at your own risk.** The authors, contributors, and OpenMarineSystems accept **no liability for loss, damage, injury, grounding, collision, environmental damage, equipment failure, or any direct or indirect consequences arising from its use.**

## Status

Early public release.

Built by **[OpenMarineSystems](https://github.com/OpenMarineSystems?utm_source=chatgpt.com)**

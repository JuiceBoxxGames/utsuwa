---
title: Scene and Photo Mode
description: Frame the camera, change or upload a background, tune hair and clothing physics, take photos in photo mode, and use touch and AR.
---

# Scene and Photo Mode

This page covers everything about the space she stands in: the camera, the background, physics, photo mode, touch reactions, and AR.

## Camera

Drag on the scene to orbit around her. Scroll or pinch to zoom, and right-drag or two-finger drag to pan. These moves are temporary. The camera re-fits to her when you change a camera setting, switch models, or leave photo mode.

For a framing that sticks, open **Controls** (sliders icon, top right) and click **Camera** (the video icon). The panel has four sliders:

| Slider | Range | Default |
|---|---|---|
| Zoom | 0.50× to 2.50× | 1.00× |
| Height | -50 cm to +50 cm | 0 cm |
| Horizontal pan | -150 cm to +150 cm | 0 cm |
| Field of view | 20° to 60° | 35° |

**Reset camera** returns all four to their defaults. The camera always fits itself to your model first, so these settings adjust that fitted view rather than replacing it.

The desktop overlay has its own camera settings. Changing one does not change the other.

## Background

The **Background** row in the Camera panel sets the backdrop behind her. Your pick is saved.

- **Default** follows your light or dark theme
- **Solids**: White, Black
- **Gradients**: Mist, Blossom, Lagoon, Sakura, Peach, Lavender
- **Patterns**: Dots, Hearts, Sparkles, Stripes, Gingham

### Your own image

1. Click **Upload image** (the upload icon under the presets).
2. Pick a JPEG, PNG, or WebP file.

The image appears behind her right away and a thumbnail joins the row. Details:

- **One slot.** A new upload replaces the previous image.
- **Size.** There is no file size limit. An image longer than 2560 pixels on its longest side is scaled down before it is saved. PNG and WebP keep their transparency.
- **Switching.** Pick a preset to use it instead. The thumbnail stays, so you can switch back.
- **Removing.** Click **Remove image** (the x next to the thumbnail). She goes back to the default backdrop.
- **Storage.** The image stays on this device. It is not part of the save file from Settings > Data.
- **Photos.** Photos taken with the **Room** background include it.

Other formats show "Pick a JPEG, PNG, or WebP image." A file the browser cannot open shows "That image couldn't be opened. Try a different file."

The overlay window is always transparent, so it has no background setting.

## Physics

The **Physics** section in the Camera panel has one slider, **Movement intensity**. It scales how much her hair, skirt, and other spring bones respond to motion, from **Subtle** (0.5×) to **Lively** (1.6×). At 1.0× the value reads **Default**. The slider works on top of each model's own tuning, and it applies to both the main window and the desktop overlay.

## Photo mode

Click the **camera** button (top left) to open photo mode. The chat, the top buttons, and the speech bubble hide. A **Photo Mode** panel opens in the top-left corner with five tabs.

- The chevron collapses the panel to a small camera button. Click it to bring the panel back.
- The **X** or the `Esc` key closes photo mode.
- Everything you set in photo mode resets when you close it. Your saved camera and background stay as they were.
- A typed chat draft survives. An event that comes up while you pose waits until you close photo mode.

While posing, the camera orbits more smoothly, zooms from close portraits to full body, and stays above the floor.

### Camera tab

| Control | What it does | Default |
|---|---|---|
| Lens | Field of view for this session, 20° to 60°. | Your camera's field of view |
| Look at camera | Head tracking. She turns her head toward the camera while she holds the pose. | Off |
| Thirds grid | Shows a rule-of-thirds grid. The grid is not in the photo. | Off |
| Reset framing | Clears the lens and re-fits the camera to her. | |

### Pose tab

**Natural** keeps her regular idle motion. The poses are **Present**, **Wave**, **Peace**, **Point**, **Rest**, and **Sway**. She holds the pose you pick.

### Face tab

**Mood** is the default and holds no expression. Photo mode turns off her automatic mood face, so with **Mood** selected she looks neutral. The other buttons are the expressions your model has, minus the vowel mouth shapes, blinks, look directions, and `neutral`. A model with few expressions shows few buttons.

### Scene tab

- **Background**: **Room** (the scene as it is, including your saved background), **Clear** (transparent, for cutouts), and every preset from the Background section above.
- **Filter**: None, Warm, Cool, Mono, Sepia, or Film. The filter covers her and the background.
- **Frame**: None, Polaroid, or Film.
- **Vignette**: darkens the corners.

### Sticker tab

Click **Utsuwa logo** to add a sticker. Drag it to move it and scroll over it to resize it. Double-click it or use the x in the **On the shot** list to remove it. Stickers and frames sit on top of the filter, so they keep their colors.

### Taking the photo

| Button | What it does |
|---|---|
| 3s | Turns on a 3 second self-timer. A countdown shows before each shot. |
| Snap | Takes a photo at screen resolution. |
| Capture | Takes a photo at twice the screen resolution, or as close as your graphics card allows. |

The panel shows **Saved** when the photo is done. The photo matches the preview. It is a PNG named `utsuwa-photo-` followed by a timestamp. In a browser it downloads like any other file. The desktop app writes it straight to your Downloads folder.

Photos from photo mode do not appear on the photoboard. The photoboard is for images you show her in chat.

## Touch reactions

Tap her and she reacts with an expression and a small ripple through her hair and clothes. A tap is a quick press that barely moves. Dragging orbits the camera and never triggers her.

- **Where you tap** matters. The head, face, shoulders, torso, and hips each have their own reactions.
- **Your relationship** matters. In Dating sim mode she is startled or flustered as a stranger or acquaintance, warmer as a friend, and warmest in the romantic stages, with a bigger ripple. Companion mode uses one friendly set.
- **Repeat taps** on the same spot within 4 seconds build up the reaction, up to three steps.
- **While she talks** the ripple is half as strong.

Tap reactions work in the main window and in photo mode. They do not work in the desktop overlay, where clicking and dragging moves the window, or during AR.

## AR mode

AR places her in your real room through your camera. Open **Controls** and click the cube button (**View in AR**).

**Requirements**

- A browser with WebXR augmented reality and floor detection: Chrome on an Android phone or tablet, or the Meta Quest browser
- A secure page (HTTPS). The hosted app qualifies.

On devices without support, including iPhones and desktop computers, the cube button opens a short explainer instead.

**In AR**

- She appears on the first floor spot the camera finds at the center of the screen.
- Drag with one finger to move her across the floor.
- Pinch with two fingers to resize her, from 0.3× to 2.5×.
- Click the cube button again (**Exit AR**) to leave.

Opening photo mode ends the AR session first. Photos always use the regular scene.

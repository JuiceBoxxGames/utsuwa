---
title: Animations
description: Upload your own VRMA motions, describe them so she can use them in chat, and choose her idle and thinking motions.
---

# Animations

Your companion moves in three ways. She cycles through **idle** motions when nothing is happening. She plays a **talking** motion while she speaks. She can perform **emotes**, short one-off motions, when a reply calls for one. Settings > Animations controls the idle, thinking, and emote parts.

## The animation library

Settings > Animations lists every motion she knows in two sections: **Your animations** and **Built-in emotes**.

### Built-in emotes

Seven emotes ship with the app. Each comes with a description she reads:

| Emote | Description |
|---|---|
| Show Full Body | Step back and present the full avatar body |
| Greeting | Greet with a polite bowing motion |
| Peace Sign | Make a peace sign with the fingers |
| Shoot | Point finger forward like shooting |
| Spin | Spin around once |
| Model Pose | Strike a confident model pose |
| Squat | Squat down briefly |

You can rewrite a built-in description and turn **Companion can use** off. You cannot rename or delete a built-in.

### Uploading your own

1. Click **Upload** in the **Your animations** section.
2. Pick a `.vrma` file. The button reads **Checking...** while Utsuwa reads it.
3. The new row appears with the file name and the clip length in seconds.

An upload must meet these limits:

- The file is a VRM animation (`.vrma`)
- It is 25 MB or smaller
- It runs 60 seconds or less

If a file fails, the reason shows under the section header. [Troubleshooting](/docs/guides/troubleshooting#animation-upload-rejected) lists each message.

### Describing a motion

Each row has a description field that holds up to 300 characters. Write what the motion looks like, for example "Waves with the right hand, friendly and quick." She reads the description to decide when a motion fits. An upload with no description is offered to her by its name, which tells her much less.

Custom names can be up to 60 characters. Edit the name field on the row to rename an upload.

### Companion can use

This switch decides whether she may trigger the motion during chat.

- Built-in emotes start **on**.
- Uploads start **off**. Write a description first, then turn it on.

### Play and Delete

**Play** switches to the main screen and plays the motion once, so you can check how it looks on your model. **Delete** removes an upload after you confirm. Deleting cannot be undone. If the motion is playing, it stops.

## How she uses emotes in chat

When at least one motion has **Companion can use** on, her instructions include the list of those motions with their descriptions. With each reply she may pick one motion that fits what she is saying, or none. She is told to use at most one per reply, and only when it feels natural.

Two cooldowns keep her from overdoing it:

- **Same motion**: she will not repeat a motion within 20 seconds of the last time it played.
- **Any motion**: she will not play a new emote within 8 seconds of the previous one.

A request that lands inside a cooldown is skipped. Cooldowns reset when you reload the app.

## Idle and thinking motions

The **Base behavior** section sets what she does between replies.

### Idle pool

She cycles through the checked motions at random. The pool lists the five built-in idles (Idle 1 to Idle 5) and your uploads. All five built-in idles are checked at first. At least one motion must stay checked. An upload works in the pool too; whether it loops cleanly depends on the clip.

If every motion you checked is later deleted, she falls back to the five built-in idles.

### Thinking

**Thinking** picks a motion that loops while she works on a reply, before the first words arrive. When she starts talking, it hands over to the talking motion. The default is **None**, which keeps her idle while she thinks.

### Talking

Talking always uses the built-in talking motion. It is not configurable.

## What takes priority

- **Photo mode** wins over everything. While it is open, she ignores emote requests, the thinking motion does not start, and speech does not replace the pose you set.
- **A running emote** wins over a new one. She skips a new request until the current emote finishes.
- **Emotes** pause her blinking while they play.

## Where your animations are stored

Uploaded files and their names, descriptions, and switches are stored on this device, in this browser or in the desktop app. The main window and the desktop overlay share them.

They are **not** part of the save file from Settings > Data, and **Clear All Data** does not remove them. To move them to another device, upload the same files there. To remove them, delete each upload.

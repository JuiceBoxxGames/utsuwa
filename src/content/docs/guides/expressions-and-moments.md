---
title: Expressions and Moments
description: How her face follows her mood, how she reacts with a brief expression, how event moments are written for you, and what your VRM model needs for them.
---

# Expressions and Moments

Her face and her story scenes both respond to what happens between you. This page covers mood expressions, brief reactions, personalized event moments, and what a VRM model needs for the face features to work.

## Mood expressions

Her resting face follows her tracked mood. When she is content she wears a soft, relaxed look. When she is frustrated she frowns. How strong the face is depends on the mood's intensity: a mild mood shows a faint expression, a strong one shows more.

Each mood maps to an expression on your model. The strength is the weight at full intensity, and it scales down with lower intensity.

| Mood | Expression it uses | Strength at full intensity |
|---|---|---|
| Happy | happy | 60% |
| Excited | happy | 80% |
| Playful | happy | 50% |
| Affectionate | happy | 50% |
| Content | relaxed | 50% |
| Sad | sad | 60% |
| Melancholy | sad | 45% |
| Anxious | sad | 30% |
| Frustrated | angry | 50% |
| Curious | surprised | 30% |
| Flustered | surprised | 40% |
| Neutral | none | |

The strengths are kept low on purpose. Faces read strong quickly.

### Turning it off

Settings > Display > **Mood expressions** is on by default. Turn it off if your model's expressions look too strong. Off stops both the resting face and brief reactions. Tap reactions keep working.

Two things pause the resting face. While an emote plays, the resting face fades out and comes back after. While photo mode is open, the Face tab decides her expression.

## Brief reactions on request

Besides her mood, she can flash a short expression when a moment calls for it. With each reply the model may name one emotion as a visible reaction. It is told to use this for things like being asked to smile, being surprised, laughing at a line, or a sad moment, and to leave it empty most of the time.

A reaction:

- Uses the same mood-to-expression mapping as the table above
- Is stronger than the resting face, up to 90%
- Rises over a quarter second, holds for about 2.5 seconds, then fades
- Holds longer while she is speaking, up to 8 seconds
- Sits on top of her resting face and never dips it

You can ask for one directly:

- "Smile for me."
- "Can you look surprised?"
- "Show me your angry face."

The model decides whether to react, so an ask is a suggestion, not a command. Reactions follow the **Mood expressions** switch.

## Personalized event moments

In Dating sim mode, milestones, anniversaries, and other story events open as a scene. With **Personalized moments** on, she writes the words of each scene herself.

### What changes

She rewrites the scene's text:

- The opening and closing narration
- Her dialogue
- The text of each choice and her answer to it

She writes from her personality, your relationship stage, her mood, how long you have known each other, and up to 8 of your saved memories, with shared experiences and relationship facts first. She is told to mention only facts from that list and to never invent past events, names, places, or dates.

### What never changes

- The scene's shape: the same beats and the same number of choices, in the same order
- What each choice does
- Every effect on your relationship. State changes always come from the built-in scene.

A personalized moment reads differently, but it cannot change the outcome.

### Language

She writes in the language of your most recent messages. If there are none yet, she writes in English.

### Waiting and fallback

While she writes, the scene shows her name, a typing indicator, and a disabled **Continue** button. She gets 15 seconds. The built-in scene plays instead when:

- **Personalized moments** is off
- Chat is off, or no provider and model are set up, or the provider needs a key you have not entered
- The request fails or runs past 15 seconds
- The reply is unusable, for example missing a part the scene needs, too long, or with the wrong number of choices

If you close a scene and the event comes back later in the same session, she reuses what she already wrote.

### The switch and privacy

Settings > Display > **Personalized moments** is on by default. Each moment is one extra request to your chat provider, using the same connection as chat. The request includes her personality, the memories listed above, and your last few messages. With a local model, nothing leaves your machine.

## What your model needs

Mood expressions and reactions look for standard expression names. The match ignores capitalization, and the first name your model has wins.

| Used for | VRM 1.0 name | VRM 0.x name |
|---|---|---|
| Happy, Excited | `happy` | `joy` |
| Playful | `happy` | `fun`, then `joy` |
| Affectionate | `happy`, then `relaxed` | `joy` |
| Content | `relaxed` | `fun` |
| Sad, Melancholy, Anxious | `sad` | `sorrow` |
| Frustrated | `angry` | `angry` |
| Curious, Flustered | `surprised` | `surprised` |

If your model has none of the names for a mood, her face stays neutral for that mood. Nothing breaks.

Other face features use their own names:

- **Tap reactions** try `happy`, `relaxed`, `surprised`, `shy`, `neutral`, `angry`, and `sad`, and use the first one your model has for that reaction.
- **Lip sync** drives `aa`, `ee`, `ih`, `oh`, and `ou` (VRM 1.0), `a`, `i`, `u`, `e`, and `o` (VRM 0.x), and `jawOpen`.

To see which expressions your model has, open Settings > Developer and look at **Available Expressions**. The photo mode Face tab shows the same list without the vowel mouth shapes, blinks, look directions, and `neutral`.

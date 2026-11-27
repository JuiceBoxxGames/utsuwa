---
title: Utsuwa is Moving to the AGPL
description: Starting with 0.12.1, Utsuwa is licensed AGPL-3.0-or-later instead of MIT. What changed, what did not, and why.
date: '2026-07-19'
image: /blog/moving-to-agpl-abstract.jpg
tag: DevLog
---

# Utsuwa is Moving to the AGPL

Short one today, but an important one. Starting with 0.12.1, Utsuwa is licensed under AGPL-3.0-or-later instead of MIT.

## Why

Utsuwa started under MIT because MIT is the least amount of ceremony a license can be, and ceremony was the last thing on my mind while I was figuring out what this project even was. That reasoning made sense when the only person affected by the license was me.

It is different now. People contribute real work to this project. And Utsuwa lives in the AI companion space, which attracts a certain kind of attention. If you have seen the warning at the top of the repo about crypto scams using our name, you know the kind I mean.

MIT means someone can take everything, the engine, the memory system, the years of small decisions, run it as a paid closed-source service, and never share a line back. Nobody has done that yet as far as I know. I would rather close that door before someone walks through it than after.

## What changes for you

If you use Utsuwa, self-host it, fork it for yourself, tinker with it privately, or contribute to it: nothing. Genuinely nothing. Everything you could do last week you can still do.

The AGPL has exactly one new rule, and it is aimed at one situation. If someone offers a modified Utsuwa to other people, including as a hosted service over the network, their modifications have to be published under the same license. That last part is why AGPL and not plain GPL. A hosted clone never technically distributes anything, so regular GPL would not touch it. AGPL does.

Work given to this project stays in the open. That is the whole idea.

## What does not change

Every release up to and including 0.12.0 stays MIT permanently. Nothing is retroactive.

Contributors keep the copyright to their work, exactly as before. The only difference for future pull requests is a line in the contributing guide confirming contributions come in under the new license.

I did not want to spring this on the people who have actually built parts of Utsuwa, so I reached out before making the change. The response made me glad this community is what it is.

If you are building something on Utsuwa and are not sure what this means for you, open a discussion and ask. I would rather answer questions than have anyone quietly worried.

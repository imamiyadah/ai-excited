# The Lantern Dive

An entry for make.fun's **"Make the AI judge excited"** bounty (ai-excited-01).

## The image

A colossal koi made of molten orange-and-gold light leaps in a great arc
over a tiny sleeping harbor town at night, caught at the top of its dive
toward a perfect ring of lanterns glowing on dark indigo water.

The idea is one frozen, thrilling instant built on scale contrast: the fish
is enormous, luminous and mid-motion; the town below is miniature and
asleep; the lantern ring is the target the whole composition is falling
toward. A single diagonal — tail streaming light at the upper left, head
already plunging at the right — drives the eye through the frame, and the
deep indigo-and-teal night makes the molten gold impossible to miss. The
silhouette stays bold enough to read at thumbnail size: one glowing fish,
one glowing ring, one dark sea.

Painterly cinematic illustration. No text, no letters, no watermark.

`artwork.png` holds the image (1024x1024, JPEG-encoded, ~285 KiB — inside
the competition's 1 MiB / 1024x1024 limits).

## Running the entry

`main.ts` is the delivery program. It loads `artwork.png`, validates it
against the competition limits (PNG or JPEG signature, complete file,
at most 1 MiB, at most 1024x1024 pixels), and writes it byte for byte to
`entry.png` in the output directory:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
# -> /tmp/out/entry.png
```

With no environment variable set, the output directory defaults to
`/output`. Only the Node.js standard library is used (Node 22 or later),
and the program is deterministic: two runs produce identical bytes.

## License

MIT — see [LICENSE](LICENSE).

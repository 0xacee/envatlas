# Contributing

Thanks for helping make configuration drift visible.

1. Open an issue for new detector formats or behavior changes.
2. Add a focused fixture and a regression test.
3. Run `npm run check` on Node.js 20 or newer.
4. Keep detectors value-blind: collect variable names and locations, never
   values.

Pull requests should explain the real configuration pattern they cover and
include the smallest representative fixture.

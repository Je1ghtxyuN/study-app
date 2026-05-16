# Remove Home Button from Navbar

## Problem

The Study Chrome navbar has 3 buttons on the left (Home, Todo, Music) and 2 on the right (Statistics, Settings). The Home button links to `/`, which is the current page — it's redundant and causes visual asymmetry.

## Solution

Remove the Home `<a>` element from `StudyChromeWidget.jsx` and its CSS from `App.css`. This makes the navbar symmetric: 2 buttons left (Todo, Music) + 2 buttons right (Statistics, Settings).

## Changes

### `client/src/app/StudyChromeWidget.jsx`
- Remove the `<a href="/" className="scene-chrome__button scene-chrome__home-btn">` element (lines 29-36)

### `client/src/App.css`
- Remove `.scene-chrome__home-btn` rule block (lines 320-328)

## Before / After

```
Before: [🏠] [To] [Mu]    ● Study Room    [St] [Se]   (3 + 2)
After:       [To] [Mu]    ● Study Room    [St] [Se]   (2 + 2)
```
